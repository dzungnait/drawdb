const runtime =
  (typeof window !== "undefined" && window.__DRAWDB_CONFIG__) || {};

const trimSlash = (url) => url.replace(/\/+$/, "");

export const backendUrl = trimSlash(
  runtime.backendUrl ||
    import.meta.env.VITE_BACKEND_URL ||
    "http://localhost:5000",
);

export const gistBackendUrl = trimSlash(
  runtime.gistBackendUrl ||
    runtime.backendUrl ||
    import.meta.env.VITE_GIST_BACKEND_URL ||
    import.meta.env.VITE_BACKEND_URL ||
    "http://localhost:5000",
);

// Links to the upstream drawDB community (Discord, X, GitHub, sponsor, bug
// report). Off unless explicitly enabled, since this fork doesn't use them.
export const showCommunityLinks =
  String(
    runtime.showCommunityLinks ??
      import.meta.env.VITE_SHOW_COMMUNITY_LINKS ??
      "false",
  ) === "true";
