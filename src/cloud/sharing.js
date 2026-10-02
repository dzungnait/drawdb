import { api } from "./api";

const base = (id) => `/diagrams/${id}`;

/** Who has access to a diagram: { role, owner, members, invites }. */
export const membersApi = {
  list: (id) => api.get(`${base(id)}/members`).then((r) => r.data),
  /** Returns the updated list plus status: "added" | "invited". */
  share: (id, email, role) =>
    api.post(`${base(id)}/members`, { email, role }).then((r) => r.data),
  changeRole: (id, userId, role) =>
    api.patch(`${base(id)}/members/${userId}`, { role }).then((r) => r.data),
  remove: (id, userId) => api.delete(`${base(id)}/members/${userId}`),
  /** Makes a member the owner; returns the updated list. */
  transferOwnership: (id, userId) =>
    api.post(`${base(id)}/owner`, { userId }).then((r) => r.data),
  cancelInvite: (id, inviteId) =>
    api.delete(`${base(id)}/invites/${inviteId}`).then((r) => r.data),
};

/** View and edit links: [{ role, token, expiresAt, expired }]. */
export const linksApi = {
  list: (id) => api.get(`${base(id)}/links`).then((r) => r.data.links),
  /** Turns the link on, or changes its expiry (null: never). */
  set: (id, role, expiresAt) =>
    api
      .put(`${base(id)}/links/${role}`, { expiresAt })
      .then((r) => r.data.links),
  regenerate: (id, role) =>
    api.post(`${base(id)}/links/${role}/regenerate`).then((r) => r.data.links),
  remove: (id, role) =>
    api.delete(`${base(id)}/links/${role}`).then((r) => r.data.links),
};

export const shareLinkUrl = (id, token) =>
  `${window.location.origin}/editor/diagrams/${id}?link=${encodeURIComponent(token)}`;
