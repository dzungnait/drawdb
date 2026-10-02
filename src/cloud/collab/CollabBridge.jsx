import { useEffect, useRef, useSyncExternalStore } from "react";
import { useParams } from "react-router-dom";
import {
  useAreas,
  useDiagram,
  useEnums,
  useLayout,
  useNotes,
  useTypes,
  useViews,
} from "../../hooks";
import { markLiveSaved, markNoAccess, setOpenedRole } from "../diagrams";
import { usePreview } from "../preview";
import { activeSession, onActiveChange } from "./session";

/** The live session for this diagram, if any (re-renders on change). */
export function useSession(diagramId) {
  const session = useSyncExternalStore(onActiveChange, activeSession);
  return session && session.diagramId === diagramId && !session.closed
    ? session
    : null;
}

/** Re-renders when the session's presence or status changes. */
export function useSessionState(session) {
  useSyncExternalStore(
    session?.subscribe ?? noopSubscribe,
    session?.getRevision ?? zero,
  );
  return session;
}
const noopSubscribe = () => () => {};
const zero = () => 0;

/**
 * Connects the editor to the live session: what the editor changes is sent,
 * what others change is shown. Lives over the canvas, inside the editor.
 */
export default function CollabBridge({ title, setTitle }) {
  const { id } = useParams();
  const session = useSession(id);
  const preview = usePreview();
  const { setLayout } = useLayout();
  const {
    database,
    setDatabase,
    tables,
    setTables,
    relationships,
    setRelationships,
  } = useDiagram();
  const { areas, setAreas } = useAreas();
  const { notes, setNotes } = useNotes();
  const { types, setTypes } = useTypes();
  const { enums, setEnums } = useEnums();
  const { views, setViews } = useViews();

  const local = {
    name: title,
    database,
    tables,
    references: relationships,
    notes,
    areas,
    views,
    types,
    enums,
  };
  const localRef = useRef(local);
  localRef.current = local;

  // Setters and the latest state, read by the session at any time
  const setters = useRef(null);
  setters.current = {
    name: setTitle,
    database: setDatabase,
    tables: setTables,
    references: setRelationships,
    notes: setNotes,
    areas: setAreas,
    views: setViews,
    types: setTypes,
    enums: setEnums,
  };

  useEffect(() => {
    if (!session) return;
    session.attach({
      getLocal: () => localRef.current,
      // Only what changed, so unrelated parts of the canvas don't re-render
      setLocal: (state) => {
        for (const [key, set] of Object.entries(setters.current)) {
          if (state[key] !== localRef.current[key]) set(state[key]);
        }
      },
      onRole: (role, canWrite) => {
        setOpenedRole(session.diagramId, role);
        setLayout((prev) => ({ ...prev, readOnly: !canWrite }));
      },
      onKicked: () => {
        markNoAccess(session.diagramId);
        setLayout((prev) => ({ ...prev, readOnly: true }));
      },
      onSaved: (version) => markLiveSaved(session.diagramId, version),
    });
    // Leaving the diagram (or the editor) ends the session
    return () => {
      if (activeSession() === session) session.close();
    };
  }, [session, setLayout]);

  useEffect(() => {
    session?.localChanged();
  });

  // An old version shown from the history isn't an edit
  const previewing = preview?.diagramId === id;
  useEffect(() => {
    if (!session) return;
    if (previewing) session.pause();
    else session.resume();
  }, [session, previewing]);

  return null;
}
