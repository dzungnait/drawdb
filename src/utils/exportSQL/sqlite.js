import {
  exportFieldComment,
  getInlineFK,
  parseDefault,
  topoSortTables,
} from "./shared";
import { dbToTypes } from "../../data/datatypes";

function exportField(field, database) {
  const parts = [`\t"${field.name}" ${field.type}`];

  if (field.notNull) parts.push(" NOT NULL");
  if (field.unique) parts.push(" UNIQUE");
  if (field.default !== "") {
    parts.push(` DEFAULT ${parseDefault(field, database)}`);
  }
  if (field.check && dbToTypes[database][field.type].hasCheck) {
    parts.push(` CHECK(${field.check})`);
  }

  return `${exportFieldComment(field.comment)}${parts.join("")}`;
}

function exportTable(table, diagram) {
  const inlineFK = getInlineFK(table, diagram);
  const fieldsSql = table.fields
    .map((f) => exportField(f, diagram.database))
    .join(",\n");

  const primaryKeys = table.fields.filter((f) => f.primary);
  const pkSql =
    primaryKeys.length > 0
      ? `,\n\tPRIMARY KEY(${primaryKeys.map((f) => `"${f.name}"`).join(", ")})${inlineFK !== "" ? ",\n" : ""}`
      : "";

  const commentSql = table.comment ? `/* ${table.comment} */\n` : "";

  const indicesSql = table.indices
    .map(
      (i) =>
        `\nCREATE ${i.unique ? "UNIQUE " : ""}INDEX IF NOT EXISTS "${i.name}"\nON "${table.name}" (${i.fields.map((f) => `"${f}"`).join(", ")});`,
    )
    .join("");

  return `${commentSql}CREATE TABLE IF NOT EXISTS "${table.name}" (\n${fieldsSql}${pkSql}${inlineFK}\n);\n${indicesSql}`;
}

export function toSqlite(diagram) {
  // Topological sort ensures referenced tables are created before dependents
  const sortedTables = topoSortTables(diagram.tables, diagram.references);

  return sortedTables
    .map((table) => exportTable(table, diagram))
    .join("\n\n");
}