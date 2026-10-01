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
  cancelInvite: (id, inviteId) =>
    api.delete(`${base(id)}/invites/${inviteId}`).then((r) => r.data),
};
