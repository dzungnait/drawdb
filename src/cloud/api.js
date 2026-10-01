import axios from "axios";
import { backendUrl } from "../config";

/** Client for the drawDB server; sends the session cookie. */
export const api = axios.create({
  baseURL: backendUrl,
  withCredentials: true,
  timeout: 20000,
});

/** Stable error code from a server response, e.g. "invalid_credentials". */
export function errorCode(error) {
  return (
    error?.response?.data?.error?.code ??
    (error?.response ? "unknown" : "network")
  );
}

/** Field errors from a 400 invalid_input response, keyed by field. */
export function fieldErrors(error) {
  const details = error?.response?.data?.error?.details;
  if (!Array.isArray(details)) return {};
  return Object.fromEntries(details.map((d) => [d.path, d.message]));
}

export const auth = {
  providers: () => api.get("/auth/providers").then((r) => r.data),
  me: () => api.get("/auth/me").then((r) => r.data.user),
  register: (body) => api.post("/auth/register", body).then((r) => r.data.user),
  login: (body) => api.post("/auth/login", body).then((r) => r.data.user),
  logout: () => api.post("/auth/logout"),
  updateProfile: (body) => api.patch("/auth/me", body).then((r) => r.data.user),
  changePassword: (body) => api.post("/auth/password", body),
  revokeOtherSessions: () => api.post("/auth/sessions/revoke-others"),
  forgotPassword: (email) => api.post("/auth/password/forgot", { email }),
  resetPassword: (body) =>
    api.post("/auth/password/reset", body).then((r) => r.data.user),
  verifyEmail: (token) => api.post("/auth/email/verify", { token }),
  resendVerification: () => api.post("/auth/email/resend"),
  deleteAccount: (body) => api.delete("/auth/me", { data: body }),
  oauthUrl: (provider, returnTo) =>
    `${backendUrl}/auth/oauth/${provider}?returnTo=${encodeURIComponent(returnTo)}`,
};
