const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

const userData = path.join(process.env.APPDATA || "", "local-anime-library");
const posterDir = path.join(userData, "cache", "posters");
const dbPath = path.join(userData, "library.sqlite");

let deleted = 0;
if (fs.existsSync(posterDir)) {
  for (const entry of fs.readdirSync(posterDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    fs.unlinkSync(path.join(posterDir, entry.name));
    deleted += 1;
  }
}

let cleared = 0;
if (fs.existsSync(dbPath)) {
  const db = new Database(dbPath);
  cleared = db.prepare("UPDATE media_items SET cover_path = NULL WHERE cover_path IS NOT NULL").run().changes;
  db.close();
}

console.log(JSON.stringify({ userData, posterDir, dbPath, deleted, cleared }));
process.exit(0);
