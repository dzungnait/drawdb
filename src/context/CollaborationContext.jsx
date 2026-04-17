import { createContext, useState, useEffect, useCallback, useRef } from "react";
import {
  getSocket,
  connectToRoom,
  disconnectFromRoom,
  sendCursorMove,
  sendSelectionChange,
  sendOperation,
} from "../services/collaboration";
import { onOperation } from "../utils/operationEmitter";

export const CollaborationContext = createContext(null);

export default function CollaborationProvider({
  designId,
  sessionId,
  children,
  onRemoteOperation,
  onFullStateUpdate,
  setReadOnly,
}) {
  const [connected, setConnected] = useState(false);
  const [myRole, setMyRole] = useState(null); // 'editor' | 'viewer'
  const [myNickname, setMyNickname] = useState("");
  const [myColor, setMyColor] = useState("");
  const [users, setUsers] = useState([]); // PresenceInfo[]
  const [remoteCursors, setRemoteCursors] = useState({}); // socketId -> { x, y, nickname, color }
  const [remoteSelections, setRemoteSelections] = useState({}); // socketId -> { type, id, nickname, color }
  const isConnectedRef = useRef(false);

  // Throttle cursor broadcasts
  const cursorThrottleRef = useRef(null);

  const broadcastOperation = useCallback(
    (op) => {
      if (myRole === "editor") {
        sendOperation(op);
      }
    },
    [myRole],
  );

  const broadcastCursor = useCallback((cursor) => {
    if (cursorThrottleRef.current) return;
    cursorThrottleRef.current = setTimeout(() => {
      cursorThrottleRef.current = null;
    }, 50); // throttle to 20fps
    sendCursorMove(cursor);
  }, []);

  const broadcastSelection = useCallback((selection) => {
    sendSelectionChange(selection);
  }, []);

  // Connect/disconnect effect
  useEffect(() => {
    if (!designId || !sessionId) return;
    // Don't connect for local designs
    if (designId.startsWith?.("local_")) return;

    const socket = getSocket();

    const onConnect = () => {
      setConnected(true);
      isConnectedRef.current = true;
      connectToRoom(designId, sessionId);
    };

    const onDisconnect = () => {
      setConnected(false);
      isConnectedRef.current = false;
    };

    const onRoomJoined = ({ role, users: roomUsers, nickname, color }) => {
      setMyRole(role);
      setMyNickname(nickname);
      setMyColor(color);
      setUsers(roomUsers);
      if (role === "viewer") {
        setReadOnly(true);
      }
    };

    const onUserJoined = (user) => {
      setUsers((prev) => {
        const existing = prev.find((u) => u.socketId === user.socketId);
        if (existing) {
          return prev.map((u) =>
            u.socketId === user.socketId ? { ...u, ...user } : u,
          );
        }
        return [...prev, user];
      });
    };

    const onUserLeft = ({ socketId }) => {
      setUsers((prev) => prev.filter((u) => u.socketId !== socketId));
      setRemoteCursors((prev) => {
        const next = { ...prev };
        delete next[socketId];
        return next;
      });
      setRemoteSelections((prev) => {
        const next = { ...prev };
        delete next[socketId];
        return next;
      });
    };

    const onRemoteOp = (op) => {
      if (onRemoteOperation) {
        onRemoteOperation(op);
      }
    };

    const onCursorUpdated = ({ socketId, cursor, nickname, color }) => {
      setRemoteCursors((prev) => ({
        ...prev,
        [socketId]: {
          ...cursor,
          nickname: nickname || "Unknown",
          color: color || "#999",
        },
      }));
    };

    const onSelectionUpdated = ({ socketId, selection, nickname, color }) => {
      setRemoteSelections((prev) => ({
        ...prev,
        [socketId]: {
          ...selection,
          nickname: nickname || "Unknown",
          color: color || "#999",
        },
      }));
    };

    const onRoleChanged = ({ role, message }) => {
      setMyRole(role);
      if (role === "editor") {
        setReadOnly(false);
      } else {
        setReadOnly(true);
      }
      console.log(`🔄 Role changed: ${message}`);
    };

    const onFullState = (data) => {
      if (onFullStateUpdate && data.tables) {
        onFullStateUpdate(data);
      }
    };

    const onError = ({ message }) => {
      console.warn("Collaboration error:", message);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("room-joined", onRoomJoined);
    socket.on("user-joined", onUserJoined);
    socket.on("user-left", onUserLeft);
    socket.on("remote-operation", onRemoteOp);
    socket.on("cursor-updated", onCursorUpdated);
    socket.on("selection-updated", onSelectionUpdated);
    socket.on("role-changed", onRoleChanged);
    socket.on("full-state-update", onFullState);
    socket.on("error", onError);

    socket.connect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("room-joined", onRoomJoined);
      socket.off("user-joined", onUserJoined);
      socket.off("user-left", onUserLeft);
      socket.off("remote-operation", onRemoteOp);
      socket.off("cursor-updated", onCursorUpdated);
      socket.off("selection-updated", onSelectionUpdated);
      socket.off("role-changed", onRoleChanged);
      socket.off("full-state-update", onFullState);
      socket.off("error", onError);
      disconnectFromRoom();
    };
  }, [designId, sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update cursor user info when users list changes
  useEffect(() => {
    setRemoteCursors((prev) => {
      const next = { ...prev };
      for (const socketId of Object.keys(next)) {
        const user = users.find((u) => u.socketId === socketId);
        if (user) {
          next[socketId] = {
            ...next[socketId],
            nickname: user.nickname,
            color: user.color,
          };
        }
      }
      return next;
    });
  }, [users]);

  // Subscribe to local operation emitter and broadcast
  useEffect(() => {
    return onOperation((op) => {
      if (isConnectedRef.current && myRole === "editor") {
        sendOperation(op);
      }
    });
  }, [myRole]);

  return (
    <CollaborationContext.Provider
      value={{
        connected,
        myRole,
        myNickname,
        myColor,
        users,
        remoteCursors,
        remoteSelections,
        broadcastOperation,
        broadcastCursor,
        broadcastSelection,
      }}
    >
      {children}
    </CollaborationContext.Provider>
  );
}
