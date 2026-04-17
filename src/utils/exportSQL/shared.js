import { isFunction, isKeyword } from "../utils";

import { DB } from "../../data/constants";
import { dbToTypes } from "../../data/datatypes";

export function parseDefault(field, database = DB.GENERIC) {
  if (
    isFunction(field.default) ||
    isKeyword(field.default) ||
    !dbToTypes[database][field.type].hasQuotes
  ) {
    return field.default;
  }

  return `'${escapeQuotes(field.default)}'`;
}

export function escapeQuotes(str) {
  return str.replace(/[']/g, "'$&");
}

export function exportFieldComment(comment) {
  if (comment === "") {
    return "";
  }

  return comment
    .split("\n")
    .map((commentLine) => `\t-- ${commentLine}\n`)
    .join("");
}

/**
 * Build a Map of tableId -> table for O(1) lookups.
 */
export function buildTableMap(tables) {
  const map = new Map();
  for (const t of tables) {
    map.set(t.id, t);
  }
  return map;
}

/**
 * Topological sort of tables based on foreign key dependencies.
 * Tables referenced by others come first, so CREATE TABLE order is valid.
 * Falls back gracefully on cycles (appends remaining tables).
 */
export function topoSortTables(tables, references) {
  const tableMap = buildTableMap(tables);
  const ids = tables.map((t) => t.id);
  const idSet = new Set(ids);

  // Build adjacency: edge from endTableId -> startTableId (parent before child)
  const inDegree = new Map();
  const deps = new Map(); // parentId -> [childIds]
  for (const id of ids) {
    inDegree.set(id, 0);
    deps.set(id, []);
  }

  for (const r of references) {
    if (!idSet.has(r.startTableId) || !idSet.has(r.endTableId)) continue;
    // startTable depends on endTable (startTable has the FK column)
    if (r.startTableId === r.endTableId) continue; // self-referencing, skip
    deps.get(r.endTableId).push(r.startTableId);
    inDegree.set(r.startTableId, (inDegree.get(r.startTableId) || 0) + 1);
  }

  // Kahn's algorithm
  const queue = [];
  for (const id of ids) {
    if (inDegree.get(id) === 0) queue.push(id);
  }

  const sorted = [];
  while (queue.length > 0) {
    const id = queue.shift();
    sorted.push(id);
    for (const child of deps.get(id) || []) {
      const newDeg = inDegree.get(child) - 1;
      inDegree.set(child, newDeg);
      if (newDeg === 0) queue.push(child);
    }
  }

  // Append any remaining (cyclic) tables
  for (const id of ids) {
    if (!sorted.includes(id)) sorted.push(id);
  }

  return sorted.map((id) => tableMap.get(id));
}

/**
 * Generate ALTER TABLE ... ADD FOREIGN KEY statements with null safety.
 * @param {string} quoteChar - Quote character: "`" for MySQL/MariaDB, '"' for Postgres/Oracle, "[" for MSSQL
 * @param {string} closeChar - Closing quote: same as quoteChar except "]" for MSSQL
 * @param {string} suffix - Statement suffix, e.g. "" or "\nGO"
 */
export function buildForeignKeyStatements(
  references,
  tables,
  quoteChar = '"',
  closeChar = '"',
  suffix = "",
) {
  const tableMap = buildTableMap(tables);
  return references
    .map((r) => {
      const startTable = tableMap.get(r.startTableId);
      const endTable = tableMap.get(r.endTableId);
      if (!startTable || !endTable) return "";

      const startField = startTable.fields.find(
        (f) => f.id === r.startFieldId,
      );
      const endField = endTable.fields.find((f) => f.id === r.endFieldId);
      if (!startField || !endField) return "";

      const q = quoteChar;
      const c = closeChar;
      return `ALTER TABLE ${q}${startTable.name}${c}\nADD FOREIGN KEY(${q}${startField.name}${c}) REFERENCES ${q}${endTable.name}${c}(${q}${endField.name}${c})\nON UPDATE ${r.updateConstraint.toUpperCase()} ON DELETE ${r.deleteConstraint.toUpperCase()};${suffix}`;
    })
    .filter(Boolean)
    .join("\n");
}

export function getInlineFK(table, obj) {
  const tableMap = buildTableMap(obj.tables);
  let fks = [];
  obj.references.forEach((r) => {
    if (r.startTableId === table.id) {
      const endTable = tableMap.get(r.endTableId);
      if (!endTable) return;
      const startField = table.fields.find((f) => f.id === r.startFieldId);
      const endField = endTable.fields.find((f) => f.id === r.endFieldId);
      if (!startField || !endField) return;
      fks.push(
        `\tFOREIGN KEY ("${startField.name}") REFERENCES "${endTable.name}"("${endField.name}")\n\tON UPDATE ${r.updateConstraint.toUpperCase()} ON DELETE ${r.deleteConstraint.toUpperCase()}`,
      );
    }
  });
  return fks.join(",\n");
}
