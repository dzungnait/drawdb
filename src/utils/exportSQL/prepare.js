import { Constraint, DB } from "../../data/constants";
import { dbToTypes } from "../../data/datatypes";
import { getRelationshipFields } from "../utils";

/*
 * Makes a diagram safe to export: every statement in the generated script
 * should run on an empty database without errors. Anything the target
 * database would reject is either adjusted (when the intent is unambiguous)
 * or left out, and each change is reported as a note for the script header.
 *
 * The exporters themselves stay untouched; they receive the cleaned copy.
 */

// Index (and for these, constraint) names live in one namespace per schema
const SCHEMA_WIDE_INDEX_NAMES = new Set([DB.POSTGRES, DB.ORACLESQL, DB.SQLITE]);
const MYSQL_LIKE = new Set([DB.MYSQL, DB.MARIADB]);
const INTEGER_TYPES = new Set([
  "TINYINT",
  "SMALLINT",
  "MEDIUMINT",
  "INT",
  "INTEGER",
  "BIGINT",
]);
const CASCADING = new Set([
  Constraint.CASCADE,
  Constraint.SET_NULL,
  Constraint.SET_DEFAULT,
]);

const normalizeInt = (type) => (type === "INTEGER" ? "INT" : type);
const sameSet = (a, b) =>
  a.length === b.length && a.every((x) => b.includes(x));

/** Orders items so each comes after the ones it depends on (stable). */
function topoSort(items, keyOf, depsOf) {
  const byKey = new Map(items.map((item) => [keyOf(item), item]));
  const state = new Map(); // key -> "visiting" | "done"
  const out = [];
  const visit = (item) => {
    const key = keyOf(item);
    if (state.get(key)) return; // done, or a cycle: keep original order
    state.set(key, "visiting");
    for (const dep of depsOf(item)) {
      const target = byKey.get(dep);
      if (target && target !== item) visit(target);
    }
    state.set(key, "done");
    out.push(item);
  };
  items.forEach(visit);
  return out;
}

/**
 * Whether a FK may point at `columns` of `table`: they must be the primary
 * key or unique. MySQL/InnoDB is laxer and accepts the leading columns of
 * any index.
 */
function isReferenceable(database, table, columns) {
  const primary = table.fields.filter((f) => f.primary).map((f) => f.name);
  if (primary.length > 0 && sameSet(primary, columns)) return true;
  if (MYSQL_LIKE.has(database)) {
    const leads = (keyColumns) =>
      keyColumns.length >= columns.length &&
      sameSet(keyColumns.slice(0, columns.length), columns);
    const keys = [
      primary,
      ...(table.indices ?? []).map((i) => i.fields),
      ...(table.uniqueConstraints ?? []).map((uc) => uc.fields ?? []),
    ];
    if (keys.some(leads)) return true;
  }
  if (columns.length === 1) {
    const field = table.fields.find((f) => f.name === columns[0]);
    if (field?.unique) return true;
  }
  return (
    (table.indices ?? []).some((i) => i.unique && sameSet(i.fields, columns)) ||
    (table.uniqueConstraints ?? []).some(
      (uc) => Array.isArray(uc.fields) && sameSet(uc.fields, columns),
    )
  );
}

/** Returns a reason when the two column types can't be linked by a FK. */
function typeMismatch(database, from, to) {
  const types = dbToTypes[database] ?? {};
  // Custom types and enums: nothing reliable to compare against
  if (!types[from.type] || !types[to.type]) return null;

  if (MYSQL_LIKE.has(database)) {
    const a = normalizeInt(from.type);
    const b = normalizeInt(to.type);
    if (INTEGER_TYPES.has(a) || INTEGER_TYPES.has(b)) {
      return a === b ? null : `${from.type} vs ${to.type}`;
    }
  }

  const compatible =
    from.type === to.type ||
    types[from.type].compatibleWith?.includes(to.type) ||
    types[to.type].compatibleWith?.includes(from.type);
  return compatible ? null : `${from.type} vs ${to.type}`;
}

function uniqueName(name, taken) {
  let candidate = name;
  for (let i = 2; taken.has(candidate.toLowerCase()); i++) {
    candidate = `${name}_${i}`;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
}

/**
 * SQL Server refuses FKs that could make one delete/update cascade into the
 * same table along two paths (error 1785), including self-references.
 * Keeps the first cascading FKs that fit and downgrades the rest.
 */
function limitCascadePaths(references, kind, notes, describe) {
  const edges = new Map(); // parent table -> Set(child tables)

  const reaches = (from, to, seen = new Set()) => {
    if (from === to) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    for (const next of edges.get(from) ?? []) {
      if (reaches(next, to, seen)) return true;
    }
    return false;
  };
  const tablesInGraph = () => {
    const all = new Set(edges.keys());
    edges.forEach((children) => children.forEach((c) => all.add(c)));
    return [...all];
  };

  return references.map((r) => {
    if (!CASCADING.has(r[kind])) return r;
    const parent = r.endTableId;
    const child = r.startTableId;

    // The new edge adds a path from every ancestor of `parent` (itself
    // included) to every descendant of `child` (itself included). If any
    // of those pairs is already connected, there would be two paths.
    const nodes = tablesInGraph();
    const ancestors = [parent, ...nodes.filter((t) => reaches(t, parent))];
    const descendants = [child, ...nodes.filter((t) => reaches(child, t))];
    const conflict =
      parent === child ||
      reaches(child, parent) || // would close a cycle
      ancestors.some((a) => descendants.some((d) => reaches(a, d)));
    if (conflict) {
      notes.push(
        `${describe(r)}: ON ${
          kind === "deleteConstraint" ? "DELETE" : "UPDATE"
        } ${r[kind].toUpperCase()} changed to NO ACTION (SQL Server forbids multiple or cyclic cascade paths).`,
      );
      return { ...r, [kind]: Constraint.NONE };
    }
    if (!edges.has(parent)) edges.set(parent, new Set());
    edges.get(parent).add(child);
    return r;
  });
}

/**
 * @returns {{ diagram: object, notes: string[] }} a cleaned copy of the
 * diagram and the list of changes made to it
 */
export function prepareForExport(diagram) {
  const { database } = diagram;
  const notes = [];

  // 1. Tables. Most databases reject a table without columns.
  let tables = diagram.tables.filter((table) => {
    if (table.fields.length > 0 || database === DB.POSTGRES) return true;
    notes.push(`Table "${table.name}" skipped: it has no columns.`);
    return false;
  });
  if (database === DB.POSTGRES) {
    // INHERITS needs the parent tables to exist first
    tables = topoSort(
      tables,
      (t) => t.name,
      (t) => (Array.isArray(t.inherits) ? t.inherits : []),
    );
  }
  const tableById = new Map(tables.map((t) => [t.id, t]));
  const describe = (r) =>
    r.name?.trim()
      ? `Relationship "${r.name}"`
      : `Relationship ${tableById.get(r.startTableId)?.name ?? "?"} -> ${
          tableById.get(r.endTableId)?.name ?? "?"
        }`;

  // 2. Relationships
  const fkColumnPatches = new Map(); // tableId -> Map(fieldId -> patch)
  const constraintNames = new Set();
  let references = [];

  for (const r of diagram.references) {
    const startTable = tableById.get(r.startTableId);
    const endTable = tableById.get(r.endTableId);
    const label = describe(r);
    if (!startTable || !endTable) {
      notes.push(`${label} skipped: one of its tables is not exported.`);
      continue;
    }

    const pairs = getRelationshipFields(r).map((p) => ({
      from: startTable.fields.find((f) => f.id === p.startFieldId),
      to: endTable.fields.find((f) => f.id === p.endFieldId),
    }));
    if (pairs.length === 0 || pairs.some((p) => !p.from || !p.to)) {
      notes.push(`${label} skipped: one of its columns no longer exists.`);
      continue;
    }

    const targetColumns = pairs.map((p) => p.to.name);
    if (!isReferenceable(database, endTable, targetColumns)) {
      notes.push(
        `${label} skipped: "${endTable.name}"(${targetColumns.join(", ")}) is not a primary key or unique, so it can't be referenced.`,
      );
      continue;
    }

    const mismatch = pairs
      .map((p) => typeMismatch(database, p.from, p.to))
      .find(Boolean);
    if (mismatch) {
      notes.push(`${label} skipped: column types differ (${mismatch}).`);
      continue;
    }

    let ref = r;
    if (MYSQL_LIKE.has(database)) {
      // Integer FK columns must match the referenced column's sign
      for (const { from, to } of pairs) {
        if (
          INTEGER_TYPES.has(normalizeInt(from.type)) &&
          !!from.unsigned !== !!to.unsigned
        ) {
          if (!fkColumnPatches.has(startTable.id)) {
            fkColumnPatches.set(startTable.id, new Map());
          }
          fkColumnPatches
            .get(startTable.id)
            .set(from.id, { unsigned: !!to.unsigned });
          notes.push(
            `Column "${startTable.name}"."${from.name}" made ${
              to.unsigned ? "UNSIGNED" : "SIGNED"
            } to match "${endTable.name}"."${to.name}".`,
          );
        }
      }
      // InnoDB rejects SET DEFAULT, and SET NULL on a NOT NULL column
      for (const kind of ["deleteConstraint", "updateConstraint"]) {
        const action = ref[kind];
        const setNullOnNotNull =
          action === Constraint.SET_NULL && pairs.some((p) => p.from.notNull);
        if (action === Constraint.SET_DEFAULT || setNullOnNotNull) {
          notes.push(
            `${label}: ON ${kind === "deleteConstraint" ? "DELETE" : "UPDATE"} ${action.toUpperCase()} changed to NO ACTION (${
              setNullOnNotNull
                ? "the column is NOT NULL"
                : "not supported by InnoDB"
            }).`,
          );
          ref = { ...ref, [kind]: Constraint.NONE };
        }
      }
    }

    if (database === DB.MSSQL) {
      for (const kind of ["deleteConstraint", "updateConstraint"]) {
        // SQL Server has no RESTRICT; NO ACTION behaves the same
        if (ref[kind] === Constraint.RESTRICT) {
          ref = { ...ref, [kind]: Constraint.NONE };
        }
      }
    }

    if (database === DB.ORACLESQL) {
      // Oracle names every constraint, and the names are schema-wide
      const base =
        ref.name?.trim() || `fk_${startTable.name}_${endTable.name}`;
      const name = uniqueName(base, constraintNames);
      if (name !== ref.name) ref = { ...ref, name };
    }

    references.push(ref);
  }

  if (database === DB.MSSQL) {
    for (const kind of ["deleteConstraint", "updateConstraint"]) {
      references = limitCascadePaths(references, kind, notes, describe);
    }
  }

  // 3. Apply column patches and make index / constraint names unique
  const globalNames = new Set(
    database === DB.ORACLESQL ? constraintNames : [],
  );
  tables = tables.map((table) => {
    const patches = fkColumnPatches.get(table.id);
    const names = SCHEMA_WIDE_INDEX_NAMES.has(database)
      ? globalNames
      : new Set();

    const rename = (item, kind) => {
      const name = uniqueName(item.name, names);
      if (name === item.name) return item;
      notes.push(
        `${kind} "${item.name}" on "${table.name}" renamed to "${name}" (name already used).`,
      );
      return { ...item, name };
    };

    // SQLite keeps constraint names per table; elsewhere they share the
    // index namespace
    const uniqueConstraints =
      database === DB.SQLITE
        ? table.uniqueConstraints
        : table.uniqueConstraints?.map((uc) =>
            uc.name ? rename(uc, "Unique constraint") : uc,
          );

    return {
      ...table,
      fields: patches
        ? table.fields.map((f) =>
            patches.has(f.id) ? { ...f, ...patches.get(f.id) } : f,
          )
        : table.fields,
      indices: (table.indices ?? []).map((i) => rename(i, "Index")),
      uniqueConstraints,
    };
  });

  // 4. Postgres composite types may use one another
  const types =
    database === DB.POSTGRES
      ? topoSort(
          diagram.types ?? [],
          (t) => t.name,
          (t) => (t.fields ?? []).map((f) => f.type),
        )
      : diagram.types;

  return {
    diagram: { ...diagram, tables, references, types },
    notes: [...new Set(notes)],
  };
}

/** SQL comment block listing the changes, or "" when there are none. */
export function exportNotesHeader(notes) {
  if (notes.length === 0) return "";
  return `-- Adjusted by drawDB so the script runs without errors:\n${notes
    .map((note) => `--   * ${note.replace(/\n/g, " ")}`)
    .join("\n")}\n\n`;
}
