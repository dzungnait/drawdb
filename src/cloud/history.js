import { api } from "./api";

const base = (id) => `/diagrams/${id}/versions`;

export const historyApi = {
  /** { current, versions, hasMore }, newest first. */
  list: (id, params) => api.get(base(id), { params }).then((r) => r.data),
  get: (id, versionId) =>
    api.get(`${base(id)}/${versionId}`).then((r) => r.data.version),
  create: (id, label) =>
    api.post(base(id), { label }).then((r) => r.data.version),
  rename: (id, versionId, label) =>
    api
      .patch(`${base(id)}/${versionId}`, { label })
      .then((r) => r.data.version),
  remove: (id, versionId) => api.delete(`${base(id)}/${versionId}`),
  /** Returns the diagram as it is after the restore. */
  restore: (id, versionId) =>
    api.post(`${base(id)}/${versionId}/restore`).then((r) => r.data.diagram),
};
