import { escapeQuotes, parseDefault, buildForeignKeyStatements } from "./shared";
import { dbToTypes } from "../../data/datatypes";
import { DB } from "../../data/constants";

function parseType(field) {
  let res = field.type;

  if (field.type === "SET" || field.type === "ENUM") {
    res += `${field.values ? "(" + field.values.map((v) => `'${v}'`).join(", ") + ")" : ""}`;
  }

  if (dbToTypes[DB.MARIADB][field.type].isSized) {
    res += `${field.size && field.size !== "" ? "(" + field.size + ")" : ""}`;
  }

  return res;
}

function exportField(field, database) {
  const parts = [`\t\`${field.name}\` ${parseType(field)}`];

  if (field.unsigned) parts.push(" UNSIGNED");
  if (field.notNull) parts.push(" NOT NULL");
  if (field.increment) parts.push(" AUTO_INCREMENT");
  if (field.unique) parts.push(" UNIQUE");
  if (field.default !== "") {
    parts.push(` DEFAULT ${parseDefault(field, database)}`);
  }
  if (field.check && dbToTypes[database][field.type].hasCheck) {
    parts.push(` CHECK(${field.check})`);
  }
  if (field.comment) {
    parts.push(` COMMENT '${escapeQuotes(field.comment)}'`);
  }

  return parts.join("");
}

function exportTable(table, database) {
  const fieldsSql = table.fields.map((f) => exportField(f, database)).join(",\n");

  const primaryKeys = table.fields.filter((f) => f.primary);
  const pkSql =
    primaryKeys.length > 0
      ? `,\n\tPRIMARY KEY(${primaryKeys.map((f) => `\`${f.name}\``).join(", ")})`
      : "";

  const commentSql = table.comment
    ? ` COMMENT='${escapeQuotes(table.comment)}'`
    : "";

  const indicesSql = table.indices
    .map(
      (i) =>
        `\nCREATE ${i.unique ? "UNIQUE " : ""}INDEX \`${i.name}\`\nON \`${table.name}\` (${i.fields.map((f) => `\`${f}\``).join(", ")});`,
    )
    .join("");

  return `CREATE OR REPLACE TABLE \`${table.name}\` (\n${fieldsSql}${pkSql}\n)${commentSql};\n${indicesSql}`;
}

export function toMariaDB(diagram) {
  const tablesSql = diagram.tables.map((t) => exportTable(t, diagram.database)).join("\n\n");

  const fkSql = buildForeignKeyStatements(
    diagram.references,
    diagram.tables,
    "`",
    "`",
  );

  return [tablesSql, fkSql].filter(Boolean).join("\n\n");
}
