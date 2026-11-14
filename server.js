import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyze } from "./analyze.js";
import { store, start, getStatus } from "./sync.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUB = __dirname;
const PORT = process.env.PORT || 3000;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };

// Never let anything that looks like the token leave the server.
const scrub = (s) => (process.env.AQ_TOKEN ? s.split(process.env.AQ_TOKEN).join("[redacted]") : s);
const json = (res, code, obj) => {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(scrub(JSON.stringify(obj)));
};

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    try {
      if (url.pathname === "/healthz") return json(res, 200, { ok: true });
      if (url.pathname === "/api/state") {
        const hasData = !!store.fetched.get_my_accounts?.data;
        return json(res, 200, { ready: hasData, status: getStatus(), result: hasData ? analyze(store) : null });
      }
      if (url.pathname.startsWith("/api/raw/")) {
        const name = decodeURIComponent(url.pathname.slice(9));
        const v = store.fetched[name];
        return v ? json(res, 200, v) : json(res, 404, { error: "not fetched yet", have: Object.keys(store.fetched) });
      }
      if (url.pathname !== "/" && url.pathname !== "/index.html") return json(res, 404, { error: "not found" });
      let f = "/index.html";
      const full = path.normalize(path.join(PUB, f));
      if (!full.startsWith(PUB) || !fs.existsSync(full)) return json(res, 404, { error: "not found" });
      res.writeHead(200, { "content-type": TYPES[path.extname(full)] || "application/octet-stream" });
      fs.createReadStream(full).pipe(res);
    } catch (e) {
      json(res, 500, { error: String(e.message) });
    }
  })
  .listen(PORT, () => {
    console.log(`CRM on :${PORT}`);
    start();
  });
