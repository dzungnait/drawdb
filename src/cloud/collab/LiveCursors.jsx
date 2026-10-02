import { memo, useEffect, useSyncExternalStore } from "react";
import { useParams } from "react-router-dom";
import {
  useAreas,
  useCanvas,
  useDiagram,
  useNotes,
  useSelect,
  useSettings,
  useTransform,
} from "../../hooks";
import { ObjectType } from "../../data/constants";
import { getTableHeight, getTableWidth } from "../../utils/utils";
import { useSession, useSessionState } from "./CollabBridge";

// Someone whose cursor hasn't moved for this long is hidden
const IDLE = 60 * 1000;

const CURSORS_KEY = "drawdb:show-cursors";
const cursorListeners = new Set();

/** Whether to show other people's cursors (remembered in this browser). */
export function useShowCursors() {
  return useSyncExternalStore((fn) => {
    cursorListeners.add(fn);
    return () => cursorListeners.delete(fn);
  }, readShowCursors);
}

function readShowCursors() {
  try {
    return localStorage.getItem(CURSORS_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setShowCursors(show) {
  try {
    localStorage.setItem(CURSORS_KEY, show ? "on" : "off");
  } catch {
    // Not remembered, still applied below
  }
  cursorListeners.forEach((fn) => fn());
}

/**
 * Inside the diagram's SVG (so it pans and zooms with it): sends our
 * cursor and selection, draws everyone else's (and their linking lines).
 */
export default function LiveCursors() {
  const { id } = useParams();
  const session = useSessionState(useSession(id));
  const { pointer } = useCanvas();
  const { selectedElement } = useSelect();
  const showCursors = useShowCursors();

  const { x, y } = pointer.spaces.diagram;
  useEffect(() => {
    if (Number.isFinite(x) && Number.isFinite(y)) {
      session?.sendAwareness({ cursor: { x, y } });
    }
  }, [session, x, y]);

  const { element, id: selectedId } = selectedElement;
  useEffect(() => {
    session?.sendAwareness({
      selection:
        element !== ObjectType.NONE && selectedId !== null && selectedId !== -1
          ? { element, id: selectedId }
          : null,
    });
  }, [session, element, selectedId]);

  if (!session) return null;
  const now = Date.now();
  const peers = [...session.peers.values()].filter(
    (p) => p.seenAt && now - p.seenAt < IDLE,
  );

  return (
    <g className="pointer-events-none" data-export-ignore>
      {peers.map((p) => (
        <Selection key={`s-${p.sid}`} peer={p} />
      ))}
      {peers.map(
        (p) => p.linking && <LinkingLine key={`l-${p.sid}`} peer={p} />,
      )}
      {showCursors &&
        peers.map((p) => p.cursor && <Cursor key={`c-${p.sid}`} peer={p} />)}
    </g>
  );
}

const Cursor = memo(function Cursor({ peer }) {
  const { transform } = useTransform();
  const scale = 1 / transform.zoom;
  const label = peer.name || "Guest";
  return (
    <g
      transform={`translate(${peer.cursor.x} ${peer.cursor.y}) scale(${scale})`}
      style={{ transition: "transform 80ms linear" }}
    >
      <path
        d="M0 0 L0 16 L4.5 12 L7.5 19 L10 18 L7 11 L12.5 11 Z"
        fill={peer.color}
        stroke="white"
        strokeWidth="1.2"
      />
      <g transform="translate(12 18)">
        <rect
          rx="4"
          height="20"
          width={label.length * 7 + 12}
          fill={peer.color}
        />
        <text x="6" y="14" fontSize="12" fill="white" fontFamily="sans-serif">
          {label}
        </text>
      </g>
    </g>
  );
});

/** The relationship someone else is drawing, like our own red line. */
function LinkingLine({ peer }) {
  const { startX, startY, endX, endY } = peer.linking;
  return (
    <path
      d={`M ${startX} ${startY} L ${endX} ${endY}`}
      stroke={peer.color}
      strokeWidth="2"
      strokeDasharray="8,8"
    />
  );
}

/** A colored outline around what someone else has selected. */
function Selection({ peer }) {
  const { tables, relationships } = useDiagram();
  const { notes } = useNotes();
  const { areas } = useAreas();
  const { settings } = useSettings();
  const selection = peer.selection;
  if (!selection) return null;

  let box = null;
  if (selection.element === ObjectType.TABLE) {
    const table = tables.find((t) => t.id === selection.id);
    if (table) {
      box = {
        x: table.x,
        y: table.y,
        width: getTableWidth(table),
        height: getTableHeight(table, settings.showComments, relationships),
      };
    }
  } else if (selection.element === ObjectType.NOTE) {
    box = notes.find((n) => n.id === selection.id);
  } else if (selection.element === ObjectType.AREA) {
    box = areas.find((a) => a.id === selection.id);
  }
  if (!box) return null;

  const pad = 4;
  return (
    <g>
      <rect
        x={box.x - pad}
        y={box.y - pad}
        width={box.width + pad * 2}
        height={box.height + pad * 2}
        rx="8"
        fill="none"
        stroke={peer.color}
        strokeWidth="2"
        strokeDasharray="6 4"
      />
      <text
        x={box.x - pad}
        y={box.y - pad - 6}
        fontSize="12"
        fill={peer.color}
        fontFamily="sans-serif"
        fontWeight="600"
      >
        {peer.name || "Guest"}
      </text>
    </g>
  );
}
