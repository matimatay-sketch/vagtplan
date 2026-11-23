// Writes the app's local pages (www/) with the server address, before `cap sync`.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const url = process.env.TURNUS_APP_URL ?? "https://app.turnus.dk";
if (!/^https:\/\/[^/]+$/.test(url)) {
  console.error("TURNUS_APP_URL skal være en https-adresse uden sti, fx https://app.turnus.dk");
  process.exit(1);
}
mkdirSync("www", { recursive: true });
for (const page of ["index.html", "offline.html"]) {
  const html = readFileSync(`src/${page}`, "utf8").replaceAll("__TURNUS_APP_URL__", url);
  writeFileSync(`www/${page}`, html);
}
console.log(`www/ skrevet til ${url}`);
