import { DB } from "../../data/constants";
import { toMariaDB } from "./mariadb";
import { toMSSQL } from "./mssql";
import { toMySQL } from "./mysql";
import { toOracleSQL } from "./oraclesql";
import { toPostgres } from "./postgres";
import { toSqlite } from "./sqlite";
import { exportNotesHeader, prepareForExport } from "./prepare";

const exporters = {
  [DB.SQLITE]: toSqlite,
  [DB.MYSQL]: toMySQL,
  [DB.POSTGRES]: toPostgres,
  [DB.MARIADB]: toMariaDB,
  [DB.MSSQL]: toMSSQL,
  [DB.ORACLESQL]: toOracleSQL,
};

export function exportSQL(input) {
  const exporter = exporters[input.database];
  if (!exporter) return "";
  // Exporters get a copy cleaned of anything the database would reject
  const { diagram, notes } = prepareForExport(input);
  return exportNotesHeader(notes) + exporter(diagram);
}
