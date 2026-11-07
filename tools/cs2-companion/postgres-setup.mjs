import { installPostgres } from "./postgresql.mjs";
console.log("TecMon · PostgreSQL einrichten\n");
console.log(
  "Vorhandene kompatible Installationen werden übernommen.\nDer offizielle PostgreSQL-Installer wird bei Bedarf über WinGet geöffnet.\nAdminfreigabe, Lizenzdialoge und das Datenbankpasswort bestätigst du selbst im Installer.\nBenötigt: PostgreSQL Server + Command Line Tools. Port normalerweise 5432.\n",
);
try {
  console.log((await installPostgres()).message);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
