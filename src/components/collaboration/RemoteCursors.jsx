import { useCollaboration, useTransform } from "../../hooks";

export default function RemoteCursors() {
  const { remoteCursors } = useCollaboration() || {};
  const { transform } = useTransform();

  if (!remoteCursors || Object.keys(remoteCursors).length === 0) return null;

  return (
    <>
      {Object.entries(remoteCursors).map(([socketId, cursor]) => {
        // Convert from canvas coords to screen coords
        const screenX = (cursor.x - transform.pan.x) * transform.zoom;
        const screenY = (cursor.y - transform.pan.y) * transform.zoom;

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
