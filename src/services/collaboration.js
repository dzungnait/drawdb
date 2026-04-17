import { io } from "socket.io-client";

const baseUrl =
  import.meta.env.VITE_BACKEND_URL ??
  "https://drawdb-server-production-524b.up.railway.app";

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(baseUrl, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      transports: ["websocket", "polling"],
    });
  }
  return socket;
}

export function connectToRoom(designId, sessionId) {
  const s = getSocket();
  if (!s.connected) {
    s.connect();
  }
  s.emit("join-room", { designId, sessionId });
}

export function disconnectFromRoom() {
  const s = getSocket();
  if (s.connected) {
    s.emit("leave-room");
    s.disconnect();
  }
}

export function sendOperation(op) {
  const s = getSocket();
  if (s.connected) {
    s.emit("operation", op);
  }
}

export function sendCursorMove(cursor) {
  const s = getSocket();
  if (s.connected) {
    s.emit("cursor-move", cursor);
  }
}

export function sendSelectionChange(selection) {
  const s = getSocket();
  if (s.connected) {
    s.emit("selection-change", selection);
  }
}

export function requestEditSlot() {
  const s = getSocket();
  if (s.connected) {
    s.emit("request-edit-slot");
  }
}

export function sendFullStateSync(data) {
  const s = getSocket();
  if (s.connected) {
    s.emit("full-state-sync", data);
  }
}
