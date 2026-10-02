import { useEffect, useSyncExternalStore } from "react";
import { api } from "./api";
import { onCommentsChanged } from "./collab/session";

const base = (id) => `/diagrams/${id}/comments`;
const threadsOf = (r) => r.data.threads;

/**
 * Comment threads on a diagram's tables and fields:
 * [{ id, tableId, fieldId, resolved: { at, by } | null, comments: [...] }].
 * Every call returns the diagram's threads after the change.
 */
export const commentsApi = {
  list: (id) => api.get(base(id)).then(threadsOf),
  start: (id, tableId, fieldId, body) =>
    api.post(base(id), { tableId, fieldId, body }).then(threadsOf),
  reply: (id, threadId, body) =>
    api.post(`${base(id)}/${threadId}/replies`, { body }).then(threadsOf),
  resolve: (id, threadId, resolved) =>
    api.post(`${base(id)}/${threadId}/resolve`, { resolved }).then(threadsOf),
  edit: (id, commentId, body) =>
    api.patch(`${base(id)}/${commentId}`, { body }).then(threadsOf),
  remove: (id, commentId) =>
    api.delete(`${base(id)}/${commentId}`).then(threadsOf),
};

// ---- the threads of each diagram, shared by everything showing them

const threads = new Map();
const listeners = new Map();

function setThreads(id, value) {
  threads.set(id, value);
  listeners.get(id)?.forEach((fn) => fn());
}

// One request at a time per diagram, shared by everything asking. Changed
// meanwhile (`changed`), it's fetched once more afterwards.
const loading = new Map();
const again = new Set();

function refresh(id, changed = false) {
  if (loading.has(id)) {
    if (changed) again.add(id);
    return loading.get(id);
  }
  const request = commentsApi
    .list(id)
    .then((value) => setThreads(id, value))
    .catch(() => setThreads(id, null))
    .finally(() => {
      loading.delete(id);
      if (again.delete(id)) refresh(id);
    });
  loading.set(id, request);
  return request;
}

// Someone with the diagram open changed its comments
onCommentsChanged((id) => {
  if (listeners.get(id)?.size) refresh(id, true);
});

/**
 * The diagram's threads, fetched while shown and kept up to date. Null
 * while loading, or when comments aren't available to this person.
 */
export function useThreads(id) {
  const value = useSyncExternalStore(
    (fn) => {
      if (!id) return () => {};
      if (!listeners.has(id)) listeners.set(id, new Set());
      listeners.get(id).add(fn);
      return () => listeners.get(id).delete(fn);
    },
    () => (id ? threads.get(id) ?? null : null),
  );
  useEffect(() => {
    if (id) refresh(id);
  }, [id]);
  return value;
}

/** Runs a change and shows the threads it returns. */
export async function changeThreads(id, request) {
  setThreads(id, await request);
}

// ---- the comments panel: open or not, and for which table

// `compose` changes each time a new comment is asked for (from a table or
// field on the canvas), so the form starts over, aimed at it
let panel = { open: false, tableId: null, fieldId: null, compose: 0 };
const panelListeners = new Set();

function setPanel(next) {
  panel = next;
  panelListeners.forEach((fn) => fn());
}

export const openComments = (tableId = null) =>
  setPanel({
    ...panel,
    open: true,
    tableId: tableId === null ? null : String(tableId),
    fieldId: null,
  });
/** Opens the panel ready to write about a table, or one of its fields. */
export const composeComment = (tableId, fieldId = null) =>
  setPanel({
    open: true,
    tableId: String(tableId),
    fieldId: fieldId === null ? null : String(fieldId),
    compose: panel.compose + 1,
  });
export const closeComments = () => setPanel({ ...panel, open: false });
export const showAllComments = () => setPanel({ ...panel, tableId: null });

export function useCommentsPanel() {
  return useSyncExternalStore(
    (fn) => {
      panelListeners.add(fn);
      return () => panelListeners.delete(fn);
    },
    () => panel,
  );
}
