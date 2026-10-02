import { api } from "./api";

export const teamsApi = {
  /** [{ id, name, role, memberCount }] */
  list: () => api.get("/teams").then((r) => r.data.teams),
  create: (name) => api.post("/teams", { name }).then((r) => r.data.team),
  /** The team with members (and invitations, for admins). */
  get: (id) => api.get(`/teams/${id}`).then((r) => r.data.team),
  rename: (id, name) =>
    api.patch(`/teams/${id}`, { name }).then((r) => r.data.team),
  remove: (id) => api.delete(`/teams/${id}`),
  /** Returns the team plus status: "added" | "invited". */
  addMember: (id, email, role) =>
    api.post(`/teams/${id}/members`, { email, role }).then((r) => r.data),
  changeRole: (id, userId, role) =>
    api
      .patch(`/teams/${id}/members/${userId}`, { role })
      .then((r) => r.data.team),
  removeMember: (id, userId) => api.delete(`/teams/${id}/members/${userId}`),
  cancelInvite: (id, inviteId) =>
    api.delete(`/teams/${id}/invites/${inviteId}`).then((r) => r.data.team),
};

/** Sharing a diagram with whole teams (owner only). */
export const teamSharesApi = {
  share: (diagramId, teamId, role) =>
    api.post(`/diagrams/${diagramId}/teams`, { teamId, role }),
  changeRole: (diagramId, teamId, role) =>
    api.patch(`/diagrams/${diagramId}/teams/${teamId}`, { role }),
  remove: (diagramId, teamId) =>
    api.delete(`/diagrams/${diagramId}/teams/${teamId}`),
};
