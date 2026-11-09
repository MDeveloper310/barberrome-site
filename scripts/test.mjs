#!/usr/bin/env node
// Static checks on dist/: SEO tags, one H1, heading order, alt text, internal links,
// JSON-LD validity, forms wiring, sitemap/robots, JS syntax, no secrets.
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, process.env.OUT_DIR || "dist");
const site = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/site.json"), "utf8"));
const SITE_URL = (process.env.SITE_URL || site.siteUrl || process.env.URL || "http://localhost:8080")  // same order as build.mjs
  .replace(/\/+$/, "");
const BASE = new URL(SITE_URL).pathname.replace(/\/+$/, "");   // "" or e.g. "/barberrome-site"
const FORMS_ON = (process.env.FORMS_MODE || "netlify") !== "disabled";
const FS = process.env.FORMS_MODE === "formsubmit";
let fails = 0, passes = 0;
const ok = (cond, msg) => { if (cond) passes++; else { fails++; console.error("✗ " + msg); } };

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const files = walk(DIST);
const pages = files.filter((f) => f.endsWith(".html"));
const strip = (s) => s.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<!--[\s\S]*?-->/g, "");
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`)); return m ? decode(m[1]) : null; };

const resolveLocal = (href) => {
  const u = new URL(href, "http://x/");
  if (BASE && !(u.pathname === BASE || u.pathname.startsWith(BASE + "/"))) return null; // must live under the base path
  let p = path.join(DIST, decodeURIComponent(u.pathname.slice(BASE.length) || "/"));
  if (u.pathname.endsWith("/")) p = path.join(p, "index.html");
  return fs.existsSync(p) ? { p, hash: u.hash.slice(1) } : null;
};

for (const f of pages) {
  const rel = "/" + path.relative(DIST, f);
  const html = fs.readFileSync(f, "utf8");
  const body = strip(html);
  const h1s = body.match(/<h1[\s>]/g) || [];
  ok(h1s.length === 1, `${rel}: expected 1 <h1>, found ${h1s.length}`);
  // heading order: no jumps of more than one level
  const levels = [...body.matchAll(/<h([1-6])[\s>]/g)].map((m) => +m[1]);
  levels.forEach((l, i) => { if (i) ok(l <= levels[i - 1] + 1, `${rel}: heading jumps h${levels[i - 1]} → h${l}`); });
  ok(/<html lang="en">/.test(html), `${rel}: lang attr`);
  ok(/<meta name="viewport"/.test(html), `${rel}: viewport`);
  ok(/<link rel="canonical" href="[^"]+">/.test(html), `${rel}: canonical`);
  for (const p of ["og:title", "og:description", "og:image", "og:url", "og:type"]) ok(html.includes(`property="${p}"`), `${rel}: ${p}`);
  for (const p of ["twitter:card", "twitter:title", "twitter:description", "twitter:image"]) ok(html.includes(`name="${p}"`), `${rel}: ${p}`);
  // images
  for (const tag of body.match(/<img\b[^>]*>/g) || []) {
    const alt = attr(tag, "alt");
    ok(alt !== null, `${rel}: <img> without alt: ${tag.slice(0, 80)}`);
    const src = attr(tag, "src");
    ok(src && resolveLocal(src), `${rel}: missing image ${src}`);
    for (const s of (attr(tag, "srcset") || "").split(",").map((x) => x.trim().split(" ")[0]).filter(Boolean)) ok(resolveLocal(s), `${rel}: missing srcset ${s}`);
  }
  for (const tag of body.match(/<source\b[^>]*>/g) || []) for (const s of (attr(tag, "srcset") || "").split(",").map((x) => x.trim().split(" ")[0]).filter(Boolean)) ok(resolveLocal(s), `${rel}: missing source ${s}`);
  // internal links + anchors
  for (const m of body.matchAll(/\shref="([^"]+)"/g)) {
    const href = decode(m[1]);
    if (/^(https?:|mailto:|tel:)/.test(href)) { if (href.startsWith("http:") && !href.includes("localhost")) ok(false, `${rel}: insecure link ${href}`); continue; }
    const target = href.startsWith("#") ? { p: f, hash: href.slice(1) } : resolveLocal(href);
    ok(target, `${rel}: broken internal link ${href}`);
    if (target && target.hash) ok(fs.readFileSync(target.p, "utf8").includes(`id="${target.hash}"`), `${rel}: missing anchor ${href}`);
  }
  // JSON-LD
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(m[1]); passes++; } catch { ok(false, `${rel}: invalid JSON-LD`); }
  }
  // forms
  for (const form of body.match(/<form\b[^>]*>[\s\S]*?<\/form>/g) || []) {
    const name = attr(form.match(/<form\b[^>]*>/)[0], "name");
    const action = attr(form.match(/<form\b[^>]*>/)[0], "action");
    if (FS) {
      ok(/^https:\/\/formsubmit\.co\//.test(action) && /name="_honey"/.test(form) && /formsubmit\.co/.test(form.replace(/action="[^"]*"/, "")), `${rel}: FormSubmit action, _honey and disclosure`);
      const next = (form.match(/name="_next" value="([^"]+)"/) || [])[1];
      ok(next && next.startsWith(SITE_URL + "/") && resolveLocal(new URL(next).pathname), `${rel}: _next points at a built thank-you page (${next})`);
      ok(!/data-netlify/.test(form), `${rel}: no Netlify attrs in FormSubmit mode`);
    } else {
      ok(/data-netlify="true"/.test(form) && /netlify-honeypot="bot-field"/.test(form) && /name="bot-field"/.test(form), `${rel}: form missing Netlify/honeypot wiring`);
      ok(form.includes(`name="form-name" value="${name}"`), `${rel}: form-name hidden input for ${name}`);
      ok(action && resolveLocal(action), `${rel}: form action ${action} has no page`);
    }
    if (name === "join") ok(/name="consent"[^>]*required/.test(form), `${rel}: join form needs explicit consent checkbox`);
  }
  ok(html.includes(`<link rel="canonical" href="${SITE_URL}/`), `${rel}: canonical uses SITE_URL ${SITE_URL}`);
  if (!FORMS_ON) {
    ok(!/<form\b/.test(body), `${rel}: no <form> when forms are disabled`);
    ok(!/data-netlify|\/join\/thanks\//.test(body), `${rel}: no Netlify form/thank-you wiring when disabled`);
    ok(!/I’ll send you/.test(body), `${rel}: no reward promise when forms are disabled`);
  }
  // iframes must not be in static HTML (embeds load on tap only)
  ok(!/<iframe/.test(body), `${rel}: static iframe found (embeds must load on interaction)`);
  ok(!/\bautoplay\b(?![^<]*muted)/.test(body.replace(/<video[^>]*muted[^>]*>/g, "")), `${rel}: autoplay without muted`);
}

// home-specific exact SEO strings
const home = fs.readFileSync(path.join(DIST, "index.html"), "utf8");
ok(home.includes(`<title>BarberRome | Bay Area Rapper | Vallejo &amp; San Francisco</title>`), "home: exact <title>");
ok(home.includes(`<meta name="description" content="BarberRome is a Bay Area rapper from San Francisco living in Vallejo. Stream BAY PLAY, TOP DOWN, Funky Flow and more. Barber and rapper.">`), "home: exact meta description");
const ld = JSON.parse(home.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
const artist = ld["@graph"].find((n) => n["@type"] === "MusicGroup");
const person = ld["@graph"].find((n) => n["@type"] === "Person");
ok(artist && artist.name === "BarberRome" && artist.genre && artist.location.length === 2, "home: MusicGroup name/genre/location");
ok(artist.sameAs.includes("https://www.instagram.com/barberrome/"), "home: Instagram in sameAs");
ok(person && person.homeLocation.address.addressLocality === "Vallejo", "home: Person homeLocation Vallejo");
ok(artist.track.length === 5, "home: 5 tracks in schema");
// first scroll dual identity
ok(/Barber since 11/.test(home) && /class="dual"/.test(home), "home: barber + rapper identity in first scroll");
ok(!/(since|at|was) 12\b/.test(home), "home: no leftover 'since 12' (owner's bio says 11)");
{ // About section: owner-supplied bio, verbatim, after the story rail
  const sec = (home.match(/<section class="sec bio" id="about"[\s\S]*?<\/section>/) || [""])[0];
  const txt = [...sec.matchAll(/<(?:h2|p)[^>]*>([\s\S]*?)<\/(?:h2|p)>/g)].map((m) => decode(m[1].replace(/<[^>]+>/g, "")).trim()).filter((t) => t !== "About");
  const want = [site.bio.headline, ...site.bio.paragraphs, site.bio.tagline];
  ok(sec && JSON.stringify(txt) === JSON.stringify(want), `home: About bio renders verbatim (${txt.length}/${want.length} blocks)`);
  ok(home.indexOf('id="about"') > home.indexOf('id="chair-to-mic"') && home.indexOf('id="music"') < home.indexOf('id="about"'), "home: About sits after music and the story rail");
}
if (FORMS_ON) ok((home.match(/name="join"/g) || []).length >= 2, "home: join form in hero and after grid");
else ok((home.match(/data-forms-off="join"/g) || []).length >= 2 && home.includes('data-forms-off="booking"') && home.includes(site.links.instagram), "home: honest signup/booking notices with Instagram fallback");
ok((home.match(/data-tile/g) || []).length === 5, "home: 5 track tiles");

// streaming services (user-supplied artist URLs)
const SPOT = "https://open.spotify.com/artist/3fEpXcF21tC8AB0KfNWLZl", TIDAL = "https://tidal.com/artist/74383223/u", APPLE = "https://music.apple.com/us/artist/barberrome/1876771221";
for (const u of [SPOT, TIDAL, APPLE]) ok(artist.sameAs.includes(u), `home: ${u} in schema sameAs`);
ok(!artist.sameAs.some((u) => /[?&](si|utm_)/.test(u)), "schema sameAs has no tracking params");
for (const f of pages) {
  const h = fs.readFileSync(f, "utf8"), rel = path.relative(DIST, f);
  ok(!/open\.spotify\.com\/search/.test(h), `${rel}: no Spotify search links`);
  ok(!/si=kZyB|utm_source/.test(h), `${rel}: no tracking params in links`);
  ok(!/class="lyric"|lyricSnippet|Lyric/.test(strip(h)), `${rel}: no lyric section`);
  ok(h.includes(`href="${TIDAL}"`) && h.includes(`href="${SPOT}"`), `${rel}: Spotify + Tidal artist links present`);
}
for (const t of JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/tracks.json"), "utf8"))) {
  const h = fs.readFileSync(path.join(DIST, `tracks/${t.slug}/index.html`), "utf8");
  ok(h.includes(`href="${t.appleMusic.replace(/&/g, "&amp;")}"`), `${t.slug}: verified Apple track link kept`);
  ok((h.match(/data-platform="tidal"/g) || []).length >= 2, `${t.slug}: Tidal on track page + chooser`);
  if (!t.spotify) ok(/aria-label="Spotify: BarberRome artist page"/.test(h) && /artist page<\/small>/.test(h), `${t.slug}: Spotify fallback labeled as artist page`);
}

// sitemap + robots
const sm = fs.readFileSync(path.join(DIST, "sitemap.xml"), "utf8");
const smUrls = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
ok(smUrls.length === 7, `sitemap: 7 URLs (got ${smUrls.length})`);
for (const u of smUrls) ok(u.startsWith(SITE_URL + "/") && resolveLocal(new URL(u).pathname), `sitemap: ${u} has no page / wrong host`);
const robots = fs.readFileSync(path.join(DIST, "robots.txt"), "utf8");
ok(robots.includes(`Sitemap: ${SITE_URL}/sitemap.xml`), "robots: sitemap line");
for (const p of (FORMS_ON ? ["join/thanks/index.html", "booking/thanks/index.html", "404.html"] : ["404.html"])) ok(/noindex/.test(fs.readFileSync(path.join(DIST, p), "utf8")), `${p}: noindex`);

// JS syntax
for (const f of [...walk(path.join(ROOT, "src/assets/js")), ...walk(path.join(ROOT, "scripts")).filter((f) => f.endsWith(".mjs")), ...walk(path.join(ROOT, "netlify/functions"))]) {
  try { execFileSync(process.execPath, ["--check", f], { stdio: "pipe" }); passes++; } catch (e) { ok(false, `syntax: ${f}\n${e.stderr}`); }
}

// secrets scan (source + dist)
const SECRET = /(sk_live_|sk_test_|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|xox[abp]-|ghp_[0-9A-Za-z]{36}|-----BEGIN [A-Z ]*PRIVATE KEY|api[_-]?key\s*[:=]\s*["'][^"']{12,}|hooks\.zapier\.com\/hooks\/catch\/\d+)/i;
for (const f of [...walk(path.join(ROOT, "src")), ...walk(path.join(ROOT, "scripts")), ...walk(path.join(ROOT, "netlify")), ...files, path.join(ROOT, "netlify.toml")]) {
  if (/\.(jpg|webp|woff2|png|mp4)$/.test(f) || f.endsWith("test.mjs")) continue;
  ok(!SECRET.test(fs.readFileSync(f, "utf8")), `secret-like string in ${path.relative(ROOT, f)}`);
}

// image cache-busting: every image reference carries ?v=<first 8 hex of sha1(file)>
{
  const sha = (f) => crypto.createHash("sha1").update(fs.readFileSync(f)).digest("hex").slice(0, 8);
  let refs = 0, bad = [];
  for (const f of pages) {
    const html = fs.readFileSync(f, "utf8");
    for (const m of html.matchAll(/\/assets\/img\/([A-Za-z0-9._-]+\.(?:jpg|webp|png))(\?v=([0-9a-f]{8}))?/g)) {
      refs++;
      const file = path.join(DIST, "assets/img", m[1]);
      if (!m[3] || !fs.existsSync(file) || sha(file) !== m[3]) bad.push(`${path.relative(DIST, f)}: ${m[0]}`);
    }
  }
  ok(refs > 0 && bad.length === 0, `all ${refs} image refs are versioned with their content hash` + (bad.length ? ` — bad: ${bad.slice(0, 5).join(", ")}` : ""));
}

// page weight budget
const kb = (f) => fs.statSync(f).size / 1024;
ok(kb(path.join(DIST, "assets/js/site.js")) < 20, "site.js < 20 KB");
ok(kb(path.join(DIST, "assets/css/site.css")) < 40, "site.css < 40 KB");
const heroW = kb(path.join(DIST, "assets/img/hero-tall-640.webp"));
ok(heroW < 120, `hero mobile webp < 120 KB (${heroW.toFixed(0)} KB)`);

console.log(`\n${passes} checks passed, ${fails} failed.`);
if (site.siteUrl === null && !process.env.SITE_URL) console.log("note: siteUrl not configured — canonical URLs point at the fallback host (see RELEASE-CHECKLIST.md).");
process.exit(fails ? 1 : 0);
