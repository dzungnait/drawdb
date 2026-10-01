import { useTranslation } from "react-i18next";
import { Toast } from "@douyinfe/semi-ui";
import { Action, ObjectType } from "../data/constants";
import {
  collectDeletion,
  countSelection,
  preparePaste,
  toBulkElements,
} from "../utils/bulkClipboard";
import useDiagram from "./useDiagram";
import useNotes from "./useNotes";
import useAreas from "./useAreas";
import useViews from "./useViews";
import useUndoRedo from "./useUndoRedo";
import useSelect from "./useSelect";
import useCollab from "./useCollab";

const COLLECTIONS = ["tables", "relationships", "notes", "areas", "views"];
const DELTA_TARGET = {
  tables: "table",
  relationships: "relationship",
  notes: "note",
  areas: "area",
  views: "view",
};
// Notes and areas use their array index as id and get renumbered on removal
const INDEXED = new Set(["notes", "areas"]);

const reindex = (list) => list.map((item, i) => ({ ...item, id: i }));

/**
 * Add/remove a whole selection with one state update per collection and one
 * undo entry. Undo entries carry `selection: true` and the affected items
 * with their original indices, so undo/redo restore them exactly in place.
 */
export default function useBulkActions() {
  const { t } = useTranslation();
  const diagram = useDiagram();
  const { notes, setNotes } = useNotes();
  const { areas, setAreas } = useAreas();
  const { views, setViews } = useViews();
  const { setUndoStack, setRedoStack } = useUndoRedo();
  const { setSelectedElement, setBulkSelectedElements } = useSelect();
  const { emitDelta, isApplyingRemoteRef } = useCollab();

  const setters = {
    tables: diagram.setTables,
    relationships: diagram.setRelationships,
    notes: setNotes,
    areas: setAreas,
    views: setViews,
  };

  const emit = (key, action, item) => {
    if (isApplyingRemoteRef?.current) return;
    emitDelta({
      target: DELTA_TARGET[key],
      action,
      entityId: item.id,
      data: [action === "create" ? item : item.id],
    });
  };

  const insert = (data) => {
    for (const key of COLLECTIONS) {
      const entries = data[key];
      if (!entries?.length) continue;
      const sorted = [...entries].sort((a, b) => a.index - b.index);
      setters[key]((prev) => {
        const next = prev.slice();
        for (const { item, index } of sorted) next.splice(index, 0, item);
        return INDEXED.has(key) ? reindex(next) : next;
      });
      sorted.forEach(({ item }) => emit(key, "create", item));
    }
  };

  const remove = (data) => {
    for (const key of COLLECTIONS) {
      const entries = data[key];
      if (!entries?.length) continue;
      const ids = new Set(entries.map(({ item }) => item.id));
      setters[key]((prev) => {
        const next = prev.filter((item) => !ids.has(item.id));
        return INDEXED.has(key) ? reindex(next) : next;
      });
      // Highest index first, so each id is still valid for a peer applying
      // the deletions one by one
      [...entries]
        .sort((a, b) => b.index - a.index)
        .forEach(({ item }) => emit(key, "delete", item));
    }
  };

  const clearSelection = () => {
    setBulkSelectedElements([]);
    setSelectedElement((prev) => ({
      ...prev,
      element: ObjectType.NONE,
      id: null,
      open: false,
    }));
  };

  const record = (action, data, message) => {
    setUndoStack((prev) => [
      ...prev,
      { action, selection: true, element: ObjectType.NONE, data, message },
    ]);
    setRedoStack([]);
  };

  const deleteElements = (elements) => {
    const data = collectDeletion(elements, {
      tables: diagram.tables,
      relationships: diagram.relationships,
      notes,
      areas,
      views,
    });
    const count = countSelection(data);
    if (count === 0) return;
    remove(data);
    clearSelection();
    record(Action.DELETE, data, t("bulk_delete", { count }));
    Toast.success(t("bulk_deleted", { count }));
  };

  const pasteElements = (payload, offset) => {
    const data = preparePaste(payload, {
      offset,
      notesCount: notes.length,
      areasCount: areas.length,
    });
    const count = countSelection(data);
    if (count === 0) return;
    insert(data);
    setSelectedElement((prev) => ({
      ...prev,
      element: ObjectType.NONE,
      id: null,
      open: false,
    }));
    setBulkSelectedElements(toBulkElements(data));
    record(Action.ADD, data, t("bulk_paste", { count }));
  };

  // For undo/redo of entries recorded above
  const applyHistory = (entry, direction) => {
    const reAdd =
      (entry.action === Action.DELETE) === (direction === "undo");
    if (reAdd) insert(entry.data);
    else remove(entry.data);
    clearSelection();
  };

  return { deleteElements, pasteElements, applyHistory };
}
