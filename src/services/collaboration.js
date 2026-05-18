import { io } from "socket.io-client";

const baseUrl =
  import.meta.env.VITE_BACKEND_URL;

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

// Offline operation queue
const offlineQueue = [];

export function sendOperation(op) {
  const s = getSocket();
  if (s.connected) {
    s.emit("operation", op);
  } else {
    // Queue operations while offline
    offlineQueue.push(op);
  }
}

export function flushOfflineQueue() {
  const s = getSocket();
  if (!s.connected || offlineQueue.length === 0) return;
  const ops = offlineQueue.splice(0);
  for (const op of ops) {
    s.emit("operation", op);
  }
}

export function getOfflineQueueSize() {
  return offlineQueue.length;
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

export function sendLockEntity(entityKey) {
  const s = getSocket();
  if (s.connected) {
    s.emit("lock-entity", { entityKey });
  }
}

export function sendUnlockEntity(entityKey) {
  const s = getSocket();
  if (s.connected) {
    s.emit("unlock-entity", { entityKey });
  }
}

export function requestFullState() {
  const s = getSocket();
  if (s.connected) {
    s.emit("request-full-state");
  }
}

export function sendFullStateForPeer(targetSocketId, data) {
  const s = getSocket();
  if (s.connected) {
    s.emit("full-state-for-peer", { targetSocketId, data });
  }
}

export function sendFullStateSync(data) {
  const s = getSocket();
  if (s.connected) {
    s.emit("full-state-sync", data);
  }
}
