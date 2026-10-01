import { useCallback } from "react";
import {
  useAreas,
  useDiagram,
  useEnums,
  useNotes,
  useSelect,
  useTypes,
  useUndoRedo,
  useViews,
} from "../hooks";
import { DB, ObjectType } from "../data/constants";

/**
 * Reads and replaces what's in the editor, in the server's diagram shape
 * ({ name, database, tables, references, ... }). The title lives in the
 * Workspace, so it's passed in.
 */
export default function useEditorState(title, setTitle) {
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
  const { undoStack, redoStack, setUndoStack, setRedoStack } = useUndoRedo();
  const { setSelectedElement, setBulkSelectedElements } = useSelect();

  const capture = () => ({
    name: title,
    database,
    tables,
    references: relationships,
    notes,
    areas,
    views,
    types,
    enums,
    undoStack,
    redoStack,
  });

  // Only state setters inside, so it's safe to call after the panel closes
  const apply = useCallback(
    (diagram) => {
      // What was selected may not exist in the other state
      setSelectedElement((prev) => ({
        ...prev,
        element: ObjectType.NONE,
        id: -1,
        open: false,
      }));
      setBulkSelectedElements([]);
      setDatabase(diagram.database || DB.GENERIC);
      setTitle(diagram.name);
      setTables(diagram.tables ?? []);
      setRelationships(diagram.references ?? []);
      setNotes(diagram.notes ?? []);
      setAreas(diagram.areas ?? []);
      setViews(diagram.views ?? []);
      setTypes(diagram.types ?? []);
      setEnums(diagram.enums ?? []);
      setUndoStack(diagram.undoStack ?? []);
      setRedoStack(diagram.redoStack ?? []);
    },
    [
      setSelectedElement,
      setBulkSelectedElements,
      setDatabase,
      setTitle,
      setTables,
      setRelationships,
      setNotes,
      setAreas,
      setViews,
      setTypes,
      setEnums,
      setUndoStack,
      setRedoStack,
    ],
  );

  return { capture, apply };
}
