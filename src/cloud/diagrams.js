import { Toast } from "@douyinfe/semi-ui";
import { v4 as uuidv4 } from "uuid";
import { db } from "../data/db";
import i18n from "../i18n/i18n";
import { api, errorCode } from "./api";
import { errorMessage } from "./i18n";

export const diagramsApi = {
  list: () => api.get("/diagrams").then((r) => r.data.diagrams),
  trash: () => api.get("/diagrams/trash").then((r) => r.data.diagrams),
  get: (id) => api.get(`/diagrams/${id}`).then((r) => r.data.diagram),
  create: (body) => api.post("/diagrams", body).then((r) => r.data.diagram),
  update: (id, body) => api.put(`/diagrams/${id}`, body).then((r) => r.data),
  remove: (id) => api.delete(`/diagrams/${id}`),
  restore: (id) =>
    api.post(`/diagrams/${id}/restore`).then((r) => r.data.diagram),
  removeForever: (id) => api.delete(`/diagrams/${id}/permanent`),
};

// Wait this long after the last change before sending, so a burst of edits
// becomes one request
const SAVE_DELAY = 800;

/** Server version each open diagram is based on; sent with every save. */
const versions = new Map();
/** Fingerprint of the content last loaded from or saved to the server. */
const savedKeys = new Map();
/** Diagrams whose last save hit a conflict; saving pauses until resolved. */
const conflicts = new Map();
const queues = new Map();
const conflictListeners = new Set();

export function onConflict(listener) {
  conflictListeners.add(listener);
  return () => conflictListeners.delete(listener);
}

const notifyConflict = (conflict) =>
  conflictListeners.forEach((fn) => fn(conflict));

/**
 * What the server stores, from the editor's save payload. The viewport
 * (pan, zoom) is per viewer: kept in this browser, not on the server, so
 * looking around never counts as a change.
 */
function toBody(payload) {
  // eslint-disable-next-line no-unused-vars
  const { diagramId, lastModified, pan, zoom, ...rest } = payload;
  return rest;
}

const CONTENT_KEYS = [
  "name",
  "database",
  "tables",
  "references",
  "notes",
  "areas",
  "views",
  "types",
  "enums",
];

/** JSON with sorted keys: Postgres JSONB doesn't keep key order. */
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

const contentKey = (diagram) =>
  stableStringify(CONTENT_KEYS.map((k) => diagram[k] ?? null));

const VIEWPORT_KEY = (id) => `drawdb:viewport:${id}`;

function storeViewport(id, { pan, zoom }) {
  if (!pan || !zoom) return;
  try {
    localStorage.setItem(VIEWPORT_KEY(id), JSON.stringify({ pan, zoom }));
  } catch {
    // Storage full or blocked: the viewport just won't be remembered
  }
}

function readViewport(id) {
  try {
    return JSON.parse(localStorage.getItem(VIEWPORT_KEY(id))) ?? {};
  } catch {
    return {};
  }
}

class SaveQueue {
  constructor(id) {
    this.id = id;
    this.pending = null;
    this.waiters = [];
    this.timer = null;
    this.inflight = null;
    this.lastPayload = null;
  }

  get busy() {
    return Boolean(this.pending || this.inflight || this.timer);
  }

  /** Resolves once this payload, or a newer one, is stored. */
  save(payload, isNew) {
    this.pending = { payload, isNew };
    this.lastPayload = payload;
    return new Promise((resolve, reject) => {
      this.waiters.push({ resolve, reject });
      this.schedule();
    });
  }

  schedule() {
    if (this.timer || this.inflight) return;
    this.timer = setTimeout(() => this.flush(), SAVE_DELAY);
  }

  async flush() {
    this.timer = null;
    const { payload, isNew } = this.pending;
    const waiters = this.waiters;
    this.pending = null;
    this.waiters = [];
    this.inflight = this.send(payload, isNew);
    try {
      await this.inflight;
      waiters.forEach((w) => w.resolve());
    } catch (e) {
      waiters.forEach((w) => w.reject(e));
    } finally {
      this.inflight = null;
      if (this.pending) this.schedule();
    }
  }

  async send(payload, isNew) {
    if (conflicts.has(this.id)) throw conflicts.get(this.id).error;
    try {
      // The first save of a new diagram creates it; later ones (even if the
      // editor still flags them as new) update it
      if (isNew && !versions.has(this.id)) {
        const created = await diagramsApi.create({
          diagramId: this.id,
          ...toBody(payload),
        });
        versions.set(this.id, created.version);
        savedKeys.set(this.id, contentKey(payload));
        return;
      }
      const saved = await diagramsApi.update(this.id, {
        ...toBody(payload),
        baseVersion: versions.get(this.id),
      });
      versions.set(this.id, saved.version);
      savedKeys.set(this.id, contentKey(payload));
    } catch (e) {
      const code = errorCode(e);
      if (code === "version_conflict") {
        const conflict = {
          diagramId: this.id,
          error: e,
          serverVersion: e.response.data.error.details?.version,
        };
        conflicts.set(this.id, conflict);
        notifyConflict(conflict);
      } else if (code !== "network") {
        // Network errors are retried by the next edit; these won't fix
        // themselves, so say why
        Toast.error(
          e?.response?.status === 413
            ? i18n.t("cloud_diagram_too_large")
            : errorMessage(i18n.t, code),
        );
      }
      throw e;
    }
  }
}

const queueFor = (id) => {
  if (!queues.has(id)) queues.set(id, new SaveQueue(id));
  return queues.get(id);
};

/** Unsaved changes in any open diagram (for the before-unload prompt). */
export const hasUnsavedChanges = () =>
  conflicts.size > 0 || [...queues.values()].some((q) => q.busy);

const isLocal = async (id) =>
  Boolean(await db.diagrams.where("diagramId").equals(id).first());

/** The editor's cloud hooks (see ExtensionsContext usage upstream). */
export const cloudHooks = {
  async cloudSave(payload, { isNew } = {}) {
    const id = payload.diagramId;
    // Diagrams stored in this browser keep being saved here (e.g. Ctrl+S)
    if (!isNew && !versions.has(id) && (await isLocal(id))) {
      await db.diagrams
        .where("diagramId")
        .equals(id)
        .modify({ ...payload, lastModified: new Date() });
      return;
    }
    storeViewport(id, payload);
    const queue = queueFor(id);
    // The editor also saves right after loading and on every pan/zoom.
    // Nothing changed, so don't send it: a pointless save would bump the
    // version and make other open copies of the diagram conflict.
    if (!queue.busy && savedKeys.get(id) === contentKey(payload)) return;
    await queue.save(payload, isNew);
  },

  async cloudLoad(id) {
    try {
      const diagram = await diagramsApi.get(id);
      versions.set(id, diagram.version);
      savedKeys.set(id, contentKey(diagram));
      conflicts.delete(id);
      return { ...diagram, ...readViewport(id) };
    } catch {
      return null;
    }
  },

  cloudList: () => diagramsApi.list(),

  async cloudDelete(id) {
    if (await isLocal(id)) {
      await db.diagrams.where("diagramId").equals(id).delete();
      return;
    }
    await diagramsApi.remove(id);
    versions.delete(id);
    Toast.success(i18n.t("cloud_moved_to_trash"));
  },
};

// ---- Resolving a conflict

/** Keep my version: save it over whatever is on the server. */
export async function overwrite(id) {
  const queue = queueFor(id);
  const saved = await diagramsApi.update(id, {
    ...toBody(queue.lastPayload),
    force: true,
  });
  versions.set(id, saved.version);
  savedKeys.set(id, contentKey(queue.lastPayload));
  conflicts.delete(id);
}

/** Keep both: save my version as a new diagram; returns its id. */
export async function saveAsCopy(id) {
  const payload = queueFor(id).lastPayload;
  const newId = uuidv4();
  const created = await diagramsApi.create({
    ...toBody(payload),
    diagramId: newId,
    name: `${payload.name} (${i18n.t("cloud_copy")})`,
  });
  versions.set(newId, created.version);
  savedKeys.set(newId, contentKey({ ...payload, name: created.name }));
  storeViewport(newId, payload);
  conflicts.delete(id);
  return newId;
}

/** Drop my changes; the caller reloads the server version. */
export function discard(id) {
  conflicts.delete(id);
  versions.delete(id);
  savedKeys.delete(id);
}

/** Forget everything about the signed-in user's diagrams. */
export function resetCloudState() {
  versions.clear();
  savedKeys.clear();
  conflicts.clear();
  queues.clear();
}
