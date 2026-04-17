import { useCollaboration, useCanvas } from "../../hooks";

export default function RemoteCursors() {
  const { remoteCursors } = useCollaboration() || {};
  const { coords } = useCanvas();

  if (!remoteCursors || Object.keys(remoteCursors).length === 0) return null;

  return (
    <>
      {Object.entries(remoteCursors).map(([socketId, cursor]) => {
        // Convert from diagram coords to screen coords using canvas context
        const screenCoords = coords.toScreenSpace({ x: cursor.x, y: cursor.y });
        const screenX = screenCoords.x;
        const screenY = screenCoords.y;

        return (
          <div
            key={socketId}
            className="absolute pointer-events-none z-50"
            style={{
              left: screenX,
              top: screenY,
              transition: "left 0.1s linear, top 0.1s linear",
            }}
          >
            {/* Cursor arrow SVG */}
            <svg
              width="16"
              height="20"
              viewBox="0 0 16 20"
              fill="none"
              style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))" }}
            >
              <path
                d="M0 0L16 12L8 12L4 20L0 0Z"
                fill={cursor.color || "#999"}
              />
            </svg>
            {/* Name label */}
            <div
              className="absolute left-4 top-4 px-1.5 py-0.5 rounded text-[10px] font-medium text-white whitespace-nowrap"
              style={{
                backgroundColor: cursor.color || "#999",
                boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              }}
            >
              {cursor.nickname || "Unknown"}
            </div>
          </div>
        );
      })}
    </>
  );
}
