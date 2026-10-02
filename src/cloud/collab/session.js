import { io } from "socket.io-client";
import { nanoid } from "nanoid";
import { backendUrl } from "../../config";
import { applyAll, diff, equal } from "./ops";

// Edits and cursor moves are batched this long before sending
const SEND_DELAY = 80;
const AWARENESS_DELAY = 80;
// Waiting longer than this for the first join means no live editing
const JOIN_TIMEOUT = 5000;
// After loading, how long the editor may take to show the joined state
const READY_TIMEOUT = 5000;

const COLLECTIONS = [
  "tables",
  "references",
  "notes",
  "areas",
  "views",
  "types",
  "enums",
];

/** The parts of a diagram edited together, with every list present. */
export function normalize(state) {
  const out = { name: state.name ?? "", database: state.database ?? "generic" };
  for (const key of COLLECTIONS) out[key] = state[key] ?? [];
  return out;
}

const flat = (batches) => batches.flatMap((b) => b.ops);

// Numbers the states handed to the editor, across sessions on this page
let showRev = 0;

let socket = null;

/** One connection per page, opened on first use. */
function getSocket() {
  if (!socket) {
    const base = new URL(backendUrl || "/", window.location.origin);
    socket = io(base.origin, {
      path: `${base.pathname.replace(/\/$/, "")}/socket.io`,
      withCredentials: true,
      transports: ["websocket", "polling"],
    });
    socket.on("connect", () => active?.rejoin());
    socket.on("disconnect", () => active?.setStatus("offline"));
    socket.on("ops", (m) => active?.onOps(m));
    socket.on("reset", (m) => active?.onReset(m));
    socket.on("saved", (m) => active?.handlers.onSaved?.(m.version));
    socket.on("role", (m) => active?.onRole(m));
    socket.on("kicked", () => active?.onKicked());
    socket.on("peer-join", (p) => active?.setPeer(p));
    socket.on("peer-update", (p) => active?.setPeer(p));
    socket.on("peer-leave", ({ sid }) => active?.removePeer(sid));
    socket.on("awareness", (a) => active?.onAwareness(a));
    socket.on("comments", ({ diagramId }) =>
      commentListeners.forEach((fn) => fn(diagramId)),
    );
  }
  return socket;
}

const commentListeners = new Set();
/** Someone changed the comments of a diagram open here. */
export function onCommentsChanged(fn) {
  commentListeners.add(fn);
  return () => commentListeners.delete(fn);
}

/** The diagram being edited live on this page, if any. */
let active = null;
export const activeSession = () => active;

const activeListeners = new Set();
export function onActiveChange(fn) {
  activeListeners.add(fn);
  return () => activeListeners.delete(fn);
}
function setActive(session) {
  active = session;
  activeListeners.forEach((fn) => fn());
}

/**
 * Live editing of one diagram. The server orders everyone's edits;
 * `confirmed` is the state after the last edit it sent us. Our edits it
 * hasn't confirmed yet (`pending`) are reapplied on top of others' edits,
 * as the server will apply them after those.
 */
export class Session {
  constructor(diagramId, link) {
    this.diagramId = diagramId;
    this.link = link;
    this.clientId = nanoid();
    this.status = "connecting";
    this.role = null;
    this.canWrite = false;
    this.self = null;
    this.peers = new Map();
    this.confirmed = null;
    this.seq = 0;
    this.pending = [];
    // confirmed + pending: what the editor shows minus edits not sent yet
    this.shadow = null;
    this.joined = false;
    this.closed = false;
    // The editor shows something else (an old version): don't read it
    this.paused = null;
    // Whether the editor shows the joined state yet (see attach)
    this.ready = false;
    this.handlers = {};
    this.listeners = new Set();
    this.sendTimer = null;
    this.awarenessTimer = null;
    this.awarenessNext = null;
    this.revision = 0;
  }

  // ---- for React: re-render on presence and status changes
  subscribe = (fn) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getRevision = () => this.revision;
  notify() {
    this.revision++;
    this.listeners.forEach((fn) => fn());
  }
  setStatus(status) {
    if (this.status === status) return;
    this.status = status;
    this.notify();
  }

  /** Joins the room; resolves with the live state, or throws. */
  async open() {
    setActive(this);
    const s = getSocket();
    if (!s.connected) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("timeout")),
          JOIN_TIMEOUT,
        );
        s.once("connect", () => {
          clearTimeout(timer);
          resolve();
        });
        // No live editing on this server (or it's unreachable): don't wait
        s.once("connect_error", (e) => {
          clearTimeout(timer);
          reject(e);
        });
      });
    }
    const ack = await this.join();
    return { state: this.confirmed, version: ack.version, role: ack.role };
  }

  async join() {
    const ack = await getSocket().timeout(JOIN_TIMEOUT).emitWithAck("join", {
      diagramId: this.diagramId,
      clientId: this.clientId,
      link: this.link,
    });
    if (this.closed) throw new Error("closed");
    if (ack.error) {
      const error = new Error(ack.error);
      error.code = ack.error;
      throw error;
    }

    // Batches up to lastOp got there before we lost the connection
    if (ack.lastOp) {
      const i = this.pending.findIndex((b) => b.opId === ack.lastOp);
      if (i >= 0) this.pending.splice(0, i + 1);
    }
    const unsent = this.unsent();
    this.confirmed = normalize(ack.state);
    this.seq = ack.seq;
    this.shadow = applyAll(this.confirmed, flat(this.pending));
    for (const batch of this.pending) this.send(batch);
    if (this.ready) this.show(applyAll(this.shadow, unsent));

    this.role = ack.role;
    this.canWrite = ack.canWrite;
    this.self = ack.self;
    this.peers = new Map(ack.peers.map((p) => [p.sid, p]));
    this.joined = true;
    this.setStatus("live");
    this.notify();
    this.handlers.onRole?.(ack.role, ack.canWrite);
    return ack;
  }

  rejoin() {
    if (!this.joined || this.closed) return;
    this.setStatus("connecting");
    this.join().catch((e) => {
      if (e.code === "diagram_not_found") this.onKicked();
      else this.setStatus("offline");
    });
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.sendTimer);
    clearTimeout(this.awarenessTimer);
    clearTimeout(this.readyTimer);
    if (socket?.connected && this.joined) socket.emit("leave");
    if (active === this) setActive(null);
  }

  // ---- connecting the editor

  /**
   * The editor's side: getLocal() returns what it shows (normalized),
   * setLocal(state, rev, current) shows a state (current: what it shows
   * now, as far as we know) and returns whether anything changed; the
   * editor then calls localChanged(rev) once it rendered it.
   *
   * Until the editor shows the joined
   * state (it loads it like any diagram), nothing is read or sent.
   */
  attach(handlers) {
    this.handlers = handlers;
  }

  /**
   * What the editor shows. A state we asked it to show counts from then
   * on, even before it has rendered it: reading its older state meanwhile
   * would look like the user undoing what others just did.
   */
  local() {
    return this.showing?.state ?? this.handlers.getLocal();
  }

  /** Called after the editor rendered; `rev` is the last state it shows. */
  localChanged(rev = 0) {
    if (this.showing && rev >= this.showing.rev) this.showing = null;
    if (this.closed || !this.joined) return;
    if (!this.ready) {
      // Give up waiting after a while: the editor then shows the live state
      this.readyTimer ??= setTimeout(() => this.markReady(true), READY_TIMEOUT);
      if (equal(this.handlers.getLocal(), this.initialState)) this.markReady();
      return;
    }
    if (this.sendTimer || this.paused) return;
    this.sendTimer = setTimeout(() => {
      this.sendTimer = null;
      this.flush();
    }, SEND_DELAY);
  }

  markReady(force = false) {
    if (this.ready || !this.shadow || this.closed) return;
    clearTimeout(this.readyTimer);
    this.ready = true;
    // Edits that arrived while the editor was still loading
    if (force || this.shadow !== this.initialState) this.show(this.shadow);
  }

  /** Our edits the editor shows but we haven't sent yet. */
  unsent() {
    if (!this.ready || this.paused || !this.shadow) return [];
    return diff(this.shadow, this.local());
  }

  flush() {
    if (!this.ready || this.paused || this.closed || !this.canWrite) return;
    const local = this.local();
    const ops = diff(this.shadow, local);
    if (ops.length === 0) return;
    const batch = { opId: nanoid(), ops };
    this.pending.push(batch);
    this.shadow = local;
    if (this.status === "live") this.send(batch);
    this.notify();
  }

  send(batch) {
    getSocket().emit("ops", { diagramId: this.diagramId, ...batch }, (ack) => {
      // Rejected: start over from the server's state
      if (ack?.error && !this.closed) {
        console.warn("Live edit rejected:", ack.error);
        this.resync();
      }
    });
  }

  /** Throws away our unconfirmed edits and shows the server's state. */
  resync() {
    this.pending = [];
    this.shadow = this.confirmed;
    if (this.ready && !this.paused) this.show(this.confirmed);
    this.rejoin();
  }

  show(state) {
    const rev = ++showRev;
    if (this.handlers.setLocal?.(state, rev, this.local())) {
      this.showing = { state, rev };
    }
  }

  /** Whether some of our edits aren't on the server yet. */
  hasUnsynced() {
    return this.pending.length > 0 || this.unsent().length > 0;
  }

  // ---- from the server

  onOps({ seq, ops, opId, clientId }) {
    if (!this.joined || this.closed) return;
    if (seq !== this.seq + 1) {
      // Missed something: get the whole state again
      this.rejoin();
      return;
    }
    this.seq = seq;
    if (clientId === this.clientId) {
      this.confirmed = applyAll(this.confirmed, ops);
      const i = this.pending.findIndex((b) => b.opId === opId);
      if (i >= 0) this.pending.splice(0, i + 1);
      this.notify();
      return;
    }
    const unsent = this.unsent();
    this.confirmed = applyAll(this.confirmed, ops);
    this.shadow = applyAll(this.confirmed, flat(this.pending));
    if (this.ready && !this.paused) this.show(applyAll(this.shadow, unsent));
  }

  onReset({ seq, state }) {
    this.confirmed = normalize(state);
    this.seq = seq;
    this.pending = [];
    this.shadow = this.confirmed;
    if (this.paused) this.paused.unsent = [];
    if (this.ready && !this.paused) this.show(this.confirmed);
    this.notify();
  }

  onRole({ role, canWrite }) {
    this.role = role;
    this.canWrite = canWrite;
    if (!canWrite) {
      this.pending = [];
      this.shadow = this.confirmed;
      if (this.ready && !this.paused) this.show(this.confirmed);
    }
    this.handlers.onRole?.(role, canWrite);
    this.notify();
  }

  onKicked() {
    this.close();
    this.setStatus("closed");
    this.handlers.onKicked?.();
  }

  // ---- showing an old version instead (version history)

  pause() {
    if (this.paused) return;
    this.paused = { unsent: this.ready ? this.unsent() : [] };
    clearTimeout(this.sendTimer);
    this.sendTimer = null;
  }

  resume() {
    if (!this.paused) return;
    const { unsent } = this.paused;
    this.paused = null;
    if (this.ready) this.show(applyAll(this.shadow, unsent));
  }

  // ---- presence

  setPeer(peer) {
    this.peers.set(peer.sid, { ...this.peers.get(peer.sid), ...peer });
    this.notify();
  }

  removePeer(sid) {
    this.peers.delete(sid);
    this.notify();
  }

  onAwareness({ sid, cursor, selection, linking }) {
    const peer = this.peers.get(sid);
    if (!peer) return;
    this.peers.set(sid, {
      ...peer,
      cursor,
      selection,
      linking,
      seenAt: Date.now(),
    });
    this.notify();
  }

  /** Our cursor, selection and linking line, for the others (latest wins). */
  sendAwareness(update) {
    this.awarenessNext = { ...this.awarenessNext, ...update };
    if (this.awarenessTimer || !this.joined) return;
    this.awarenessTimer = setTimeout(() => {
      this.awarenessTimer = null;
      if (this.closed || this.status !== "live") return;
      getSocket().volatile.emit("awareness", this.awarenessNext);
    }, AWARENESS_DELAY);
  }
}

/**
 * Opens live editing of a diagram, replacing any other on this page.
 * Resolves with the live state, or null when it isn't available.
 */
export async function openSession(diagramId, link) {
  if (active?.diagramId === diagramId && active.joined && !active.closed) {
    return { session: active, state: active.confirmed };
  }
  active?.close();
  const session = new Session(diagramId, link);
  try {
    const { state, version } = await session.open();
    session.initialState = session.shadow;
    return { session, state, version };
  } catch {
    session.close();
    return null;
  }
}

/** Leaves live editing (signing out, another account). */
export function closeAllSessions() {
  active?.close();
  socket?.disconnect();
  socket = null;
}
