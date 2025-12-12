const API_BASE_URL = import.meta.env.VITE_BACKEND_URL ?? "https://drawdb-server-production.up.railway.app";
const API_GISTS_URL = `${API_BASE_URL}/gists`;

/**
 * Acquire lock on design
 */
export const lock = async (designId, sessionId) => {
  const response = await fetch(`${API_GISTS_URL}/${designId}/lock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to acquire lock");
  }

  return response.json();
};

/**
 * Release lock on design
 */
export const unlock = async (designId, sessionId) => {
  const response = await fetch(`${API_GISTS_URL}/${designId}/unlock`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to release lock");
  }

  return response.json();
};

/**
 * Heartbeat - keep lock alive
 */
export const heartbeat = async (designId, sessionId) => {
  const response = await fetch(`${API_GISTS_URL}/${designId}/heartbeat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to heartbeat");
  }

  return response.json();
};
