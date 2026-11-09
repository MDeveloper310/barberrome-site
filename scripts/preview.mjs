#!/usr/bin/env node
// Local static preview of dist/. Form POSTs get an honest 501 (no backend here),
// so the site shows "Not sent" instead of a fake success.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", process.env.OUT_DIR || "dist");
const PORT = Number(process.env.PORT || 8080);
const BASE = (process.env.BASE_PATH || "").replace(/\/+$/, ""); // e.g. /barberrome-site to mimic GitHub Pages
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".xml": "application/xml", ".txt": "text/plain", ".mp4": "video/mp4", ".m4a": "audio/mp4", ".png": "image/png" };
http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(501, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: false, error: "No form backend in local preview. Deploy to Netlify (or set forms.mode=function with a webhook) to receive submissions." }));
  }
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (BASE) {
    if (p === BASE) { res.writeHead(301, { Location: BASE + "/" }); return res.end(); }
    if (!p.startsWith(BASE + "/")) { res.writeHead(404); return res.end("Not under " + BASE); }
    p = p.slice(BASE.length);
  }
  let file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!fs.existsSync(file)) { res.writeHead(404, { "Content-Type": TYPES[".html"] }); return fs.createReadStream(path.join(ROOT, "404.html")).pipe(res); }
  const type = TYPES[path.extname(file)] || "application/octet-stream";
  const size = fs.statSync(file).size;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
  if (range && (range[1] || range[2])) {   // byte ranges (audio/video seeking; Safari requires them)
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start < 0) start = 0;
    if (start >= size || start > end) { res.writeHead(416, { "Content-Range": `bytes */${size}` }); return res.end(); }
    res.writeHead(206, { "Content-Type": type, "Accept-Ranges": "bytes", "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1 });
    return req.method === "HEAD" ? res.end() : fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { "Content-Type": type, "Accept-Ranges": "bytes", "Content-Length": size });
  if (req.method === "HEAD") return res.end();
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Preview: http://localhost:${PORT}${BASE}/  (forms return 501 here — nothing is sent)`));
