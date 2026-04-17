import { dbToTypes } from "../../data/datatypes";
import { parseDefault, buildTableMap } from "./shared";

function exportField(field, database) {
  const parts = [
    `\t"${field.name}" ${field.type}${field.size !== undefined && field.size !== "" ? "(" + field.size + ")" : ""}`,
  ];

  if (field.notNull) parts.push(" NOT NULL");
  if (field.increment) parts.push(" GENERATED ALWAYS AS IDENTITY");
  if (field.unique) parts.push(" UNIQUE");
  if (field.default !== "") {
    parts.push(` DEFAULT ${parseDefault(field, database)}`);
  }
  if (field.check && dbToTypes[database][field.type].hasCheck) {
    parts.push(` CHECK(${field.check})`);
  }

  const commentPrefix = field.comment ? `\t-- ${field.comment}\n` : "";
  return `${commentPrefix}${parts.join("")}`;
}

function exportTable(table, database) {
  const fieldsSql = table.fields
    .map((f) => exportField(f, database))
    .join(",\n");

  const primaryKeys = table.fields.filter((f) => f.primary);
  const pkSql =
    primaryKeys.length > 0
      ? `,\n\tPRIMARY KEY(${primaryKeys.map((f) => `"${f.name}"`).join(", ")})`
      : "";

  const commentSql = table.comment ? `/* ${table.comment} */\n` : "";

  const indicesSql = table.indices
    .map(
      (i) =>
        `\nCREATE ${i.unique ? "UNIQUE " : ""}INDEX "${i.name}"\nON "${table.name}" (${i.fields.map((f) => `"${f}"`).join(", ")});`,
    )
    .join("");

  return `${commentSql}CREATE TABLE "${table.name}" (\n${fieldsSql}${pkSql}\n);\n${indicesSql}`;
}

export function toOracleSQL(diagram) {
  const tableMap = buildTableMap(diagram.tables);
  const tablesSql = diagram.tables
    .map((t) => exportTable(t, diagram.database))
    .join("\n\n");

  const fkSql = diagram.references
    .map((r) => {
      const startTable = tableMap.get(r.startTableId);
      const endTable = tableMap.get(r.endTableId);
      if (!startTable || !endTable) return "";

      const startField = startTable.fields.find(
        (f) => f.id === r.startFieldId,
      );
      const endField = endTable.fields.find((f) => f.id === r.endFieldId);
      if (!startField || !endField) return "";

      return `ALTER TABLE "${startTable.name}"\nADD CONSTRAINT "${r.name}" FOREIGN KEY ("${startField.name}") REFERENCES "${endTable.name}" ("${endField.name}")\nON UPDATE ${r.updateConstraint.toUpperCase()} ON DELETE ${r.deleteConstraint.toUpperCase()};`;
    })
    .filter(Boolean)
    .join("\n");

  return [tablesSql, fkSql].filter(Boolean).join("\n\n");
}
