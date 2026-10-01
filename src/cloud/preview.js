import { useSyncExternalStore } from "react";

/**
 * The old version shown in the editor, if any:
 * { diagramId, version, exit(), restore() }. While set, the editor is
 * read-only and nothing is saved.
 */
let preview = null;
const listeners = new Set();

export const previewStore = {
  get: () => preview,
  set(next) {
    preview = next;
    listeners.forEach((fn) => fn());
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export const isPreviewing = (diagramId) => preview?.diagramId === diagramId;

export const usePreview = () =>
  useSyncExternalStore(previewStore.subscribe, previewStore.get);
