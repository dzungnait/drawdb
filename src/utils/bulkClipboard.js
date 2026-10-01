import { nanoid } from "nanoid";
import { Validator } from "jsonschema";
import { ObjectType } from "../data/constants";
import {
  areaSchema,
  noteSchema,
  tableSchema,
  viewSchema,
} from "../data/schemas";

export const BULK_CLIPBOARD_KIND = "drawdb/bulk";
const BULK_CLIPBOARD_VERSION = 1;

/**
 * Collects the selected elements plus every relationship whose both ends are
 * selected tables. Each item keeps its index so it can be restored in place.
 */
export function collectSelection(
  elements,
  { tables, relationships, notes, areas, views },
) {
  const ids = {
    [ObjectType.TABLE]: new Set(),
    [ObjectType.NOTE]: new Set(),
    [ObjectType.AREA]: new Set(),
    [ObjectType.VIEW]: new Set(),
  };
  for (const el of elements) ids[el.type]?.add(el.id);

  const pick = (list, set) =>
    list.reduce((acc, item, index) => {
      if (set.has(item.id)) acc.push({ item, index });
      return acc;
    }, []);

  const tableIds = ids[ObjectType.TABLE];
  return {
    tables: pick(tables, tableIds),
    relationships: relationships.reduce((acc, item, index) => {
      if (tableIds.has(item.startTableId) && tableIds.has(item.endTableId)) {
        acc.push({ item, index });
      }
      return acc;
    }, []),
    notes: pick(notes, ids[ObjectType.NOTE]),
    areas: pick(areas, ids[ObjectType.AREA]),
    views: pick(views, ids[ObjectType.VIEW]),
  };
}

/**
 * Like collectSelection, but for deletion: every relationship touching a
 * selected table goes with it, not only the ones inside the selection.
 */
export function collectDeletion(elements, diagram) {
  const selection = collectSelection(elements, diagram);
  const tableIds = new Set(selection.tables.map(({ item }) => item.id));
  selection.relationships = diagram.relationships.reduce(
    (acc, item, index) => {
      if (tableIds.has(item.startTableId) || tableIds.has(item.endTableId)) {
        acc.push({ item, index });
      }
      return acc;
    },
    [],
  );
  return selection;
}

export function countSelection(selection) {
  return (
    selection.tables.length +
    selection.notes.length +
    selection.areas.length +
    selection.views.length
  );
}

export function serializeSelection(selection) {
  const items = (list) => list.map(({ item }) => item);
  return JSON.stringify({
    kind: BULK_CLIPBOARD_KIND,
    version: BULK_CLIPBOARD_VERSION,
    tables: items(selection.tables),
    relationships: items(selection.relationships),
    notes: items(selection.notes),
    areas: items(selection.areas),
    views: items(selection.views),
  });
}

export function isBulkClipboard(obj) {
  return obj?.kind === BULK_CLIPBOARD_KIND && Array.isArray(obj.tables);
}

/**
 * Turns a clipboard payload into new elements ready to insert: fresh ids,
 * shifted by `offset`, with relationships and views re-pointed at the pasted
 * tables. Notes and areas use their array index as id, so they are numbered
 * from the current list lengths. Invalid items are dropped.
 */
export function preparePaste(payload, { offset, notesCount, areasCount }) {
  const v = new Validator();
  const valid = (list, schema) =>
    (Array.isArray(list) ? list : []).filter(
      (item) => v.validate(item, schema).valid,
    );
  const shift = (item) => ({ ...item, x: item.x + offset, y: item.y + offset });

  const tableIdMap = new Map();
  const tables = valid(payload.tables, tableSchema).map((table) => {
    const id = nanoid();
    tableIdMap.set(table.id, id);
    return { ...shift(table), id };
  });

  const relationships = (payload.relationships ?? [])
    .filter(
      (r) => tableIdMap.has(r.startTableId) && tableIdMap.has(r.endTableId),
    )
    .map((r) => ({
      ...r,
      id: nanoid(),
      startTableId: tableIdMap.get(r.startTableId),
      endTableId: tableIdMap.get(r.endTableId),
    }));

  // Only references to pasted tables move; the rest still point at the
  // original tables, which is what a copy of a view over them should do.
  const remap = (id) => (tableIdMap.has(id) ? tableIdMap.get(id) : id);
  const views = valid(payload.views, viewSchema).map((view) => ({
    ...shift(view),
    id: nanoid(),
    baseTableId: remap(view.baseTableId),
    joins: (view.joins ?? []).map((j) => ({
      ...j,
      id: nanoid(),
      tableId: remap(j.tableId),
      on: j.on ? { ...j.on, leftTableId: remap(j.on.leftTableId) } : j.on,
    })),
    columns: (view.columns ?? []).map((c) => ({
      ...c,
      id: nanoid(),
      tableId: remap(c.tableId),
    })),
    conditions: (view.conditions ?? []).map((c) => ({
      ...c,
      id: nanoid(),
      tableId: remap(c.tableId),
    })),
  }));

  const notes = valid(payload.notes, noteSchema).map((note, i) => ({
    ...shift(note),
    id: notesCount + i,
  }));
  const areas = valid(payload.areas, areaSchema).map((area, i) => ({
    ...shift(area),
    id: areasCount + i,
  }));

  const at = (start) => (item, i) => ({ item, index: start + i });
  return {
    tables: tables.map(at(Number.MAX_SAFE_INTEGER)),
    relationships: relationships.map(at(Number.MAX_SAFE_INTEGER)),
    notes: notes.map(at(notesCount)),
    areas: areas.map(at(areasCount)),
    views: views.map(at(Number.MAX_SAFE_INTEGER)),
  };
}

/** Bulk-selection entries for the given elements, so they can be dragged. */
export function toBulkElements(selection) {
  const entry = (type) => ({ item }) => ({
    id: item.id,
    type,
    currentCoords: { x: item.x, y: item.y },
    initialCoords: { x: item.x, y: item.y },
  });
  return [
    ...selection.tables.map(entry(ObjectType.TABLE)),
    ...selection.views.map(entry(ObjectType.VIEW)),
    ...selection.areas.map(entry(ObjectType.AREA)),
    ...selection.notes.map(entry(ObjectType.NOTE)),
  ];
}
