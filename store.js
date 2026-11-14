// Tiny JSON-file store. Survives restarts where the disk persists; otherwise we simply refetch.
import fs from "node:fs";
import path from "node:path";

const DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const FILE = path.join(DIR, "store.json");

const empty = () => ({
  fetched: {}, // name -> { at, data }
  signals: [], // latest get_signals payload (normalised to array)
  notesWritten: {}, // hash -> { at, account, kind }
  notes: null, // last list_notes payload
  log: [], // sync log
});

export function load() {
  try {
    return { ...empty(), ...JSON.parse(fs.readFileSync(FILE, "utf8")) };
  } catch {
    return empty();
  }
}

export function save(state) {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    const tmp = FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, FILE);
  } catch (e) {
    console.error("store save failed:", e.message);
  }
}
