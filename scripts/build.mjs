#!/usr/bin/env node
// BarberRome static site builder. Zero dependencies (Node 18+).
//   node scripts/build.mjs            -> dist/
//   SITE_URL=https://yourdomain.com node scripts/build.mjs
//   DRAFT=1 node scripts/build.mjs    -> shows "missing content" notes on the pages
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const OUT = path.join(ROOT, process.env.OUT_DIR || "dist");
const site = JSON.parse(fs.readFileSync(path.join(SRC, "data/site.json"), "utf8"));
const tracks = JSON.parse(fs.readFileSync(path.join(SRC, "data/tracks.json"), "utf8"));
const DRAFT = !!process.env.DRAFT;

// ---- site URL: never invent a domain --------------------------------------
let SITE_URL = (process.env.SITE_URL || site.siteUrl || process.env.URL || "http://localhost:8080").replace(/\/+$/, "");
if (/localhost/.test(SITE_URL)) console.warn("⚠  SITE_URL not set — canonical/OG/sitemap URLs use " + SITE_URL + ". Set SITE_URL or site.json siteUrl before launch.");
const abs = (p) => SITE_URL + p;                       // absolute URL (canonical, OG, sitemap)
const B = new URL(SITE_URL).pathname.replace(/\/+$/, ""); // base path, e.g. "/barberrome-site" on GitHub Pages, "" at a domain root
// Forms: "netlify" (default) | "function" | "disabled" (static hosts with no backend, e.g. GitHub Pages)
const FORMS = process.env.FORMS_MODE || site.forms.mode;
const FORMS_ON = FORMS !== "disabled";

// ---- helpers ----------------------------------------------------------------
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtDate = (iso) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const year = (iso) => iso.slice(0, 4);
const L = site.links;
const ytWatch = (id) => `https://www.youtube.com/watch?v=${id}`;
const ytMusic = (id) => `https://music.youtube.com/watch?v=${id}`;
const lead = tracks.find((t) => t.slug === site.leadTrack) || tracks[0];
const featLine = (t) => (t.feat ? `feat. ${t.feat}` : "");
const metaLine = (t) => [featLine(t), year(t.released)].filter(Boolean).join(" · ");
const hookLine = (t) => t.hook || null;
const draft = (msg) => (DRAFT ? `<p class="draft-note">DRAFT · ${esc(msg)}</p>` : "");

function hashFile(rel) {
  const buf = fs.readFileSync(path.join(SRC, rel));
  return crypto.createHash("sha1").update(buf).digest("hex").slice(0, 8);
}
const CSS_V = hashFile("assets/css/site.css");
const JS_V = hashFile("assets/js/site.js");
const analytics = fs.readFileSync(path.join(SRC, "partials/analytics.html"), "utf8").trim();

const ICON = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 4.5v15l13-7.5z"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.2 5.3 19.9 12l-6.7 6.7-1.4-1.4 4.3-4.3H4v-2h12.1l-4.3-4.3z"/></svg>',
  ext: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M14 4h6v6h-2V7.4l-7.3 7.3-1.4-1.4L16.6 6H14zM5 6h6v2H6v10h10v-5h2v7H4V6z"/></svg>'
};

// <picture> with webp + jpg fallback
function pic(base, widths, alt, { sizes = "100vw", lazy = true, cls = "", w, h, priority = false } = {}) {
  const set = (ext) => widths.map((x) => `${B}/assets/img/${base}-${x}.${ext} ${x}w`).join(", ");
  const largest = widths[widths.length - 1];
  return `<picture><source type="image/webp" srcset="${set("webp")}" sizes="${sizes}"><img src="${B}/assets/img/${base}-${largest}.jpg" srcset="${set("jpg")}" sizes="${sizes}" alt="${esc(alt)}"${cls ? ` class="${cls}"` : ""}${w ? ` width="${w}" height="${h}"` : ""}${lazy ? ' loading="lazy" decoding="async"' : ""}${priority ? ' fetchpriority="high"' : ""}></picture>`;
}
const tileWidths = [360, 720];
const posterWidths = (t) => (t.poster.w === 960 ? [640, 960] : [640]);

// streaming link list. Per-track Spotify/Tidal URLs aren't supplied yet, so those
// buttons go to the artist page and say so ("artist page").
function streamItems(t) {
  return [
    { label: "Spotify", p: "spotify", href: t && t.spotify ? t.spotify : L.spotify, artist: !(t && t.spotify) },
    { label: "Apple Music", p: "apple_music", href: t ? t.appleMusic : L.appleMusic, artist: !t },
    { label: "Tidal", p: "tidal", href: t && t.tidal ? t.tidal : L.tidal, artist: !(t && t.tidal) },
    { label: "YouTube", p: "youtube", href: t ? ytWatch(t.video.id) : L.youtube, artist: !t },
    { label: "YouTube Music", p: "youtube_music", href: t ? ytMusic(t.youtubeMusicId) : L.youtubeMusic, artist: !t }
  ].filter((i) => i.href);
}
function streamLinks(t, placement, cls = "", { sub = "fallback" } = {}) {
  return streamItems(t).map((i) => {
    // sub: "fallback" = mark only artist-page fallbacks on track links; "always" = label every destination; "none"
    let note = "";
    if (sub === "always") note = i.artist ? "Artist page" : esc(t.title);
    else if (sub === "fallback" && t && i.artist) note = "artist page";
    const noteHtml = note ? ` <small class="dest">${note}</small>` : "";
    const aria = t && i.artist ? ` aria-label="${i.label}: BarberRome artist page"` : "";
    return `<a${cls ? ` class="${cls}"` : ""} href="${esc(i.href)}" target="_blank" rel="noopener"${aria} data-track="stream_click" data-platform="${i.p}"${t ? ` data-track-slug="${t.slug}"` : ""}${i.artist ? ' data-dest="artist"' : ""} data-placement="${placement}">${i.label}${noteHtml}${cls.includes("btn") ? ICON.ext : ""}</a>`;
  });
}

// ---- forms -----------------------------------------------------------------
// Shown instead of a form when FORMS_MODE=disabled. No form element, so nothing can
// "submit" and nothing pretends to be captured.
function formsOff(kind) {
  const ig = `<a class="btn btn--ghost" href="${esc(L.instagram)}" target="_blank" rel="noopener" data-track="social_click" data-platform="instagram" data-placement="${kind}_fallback">DM ${esc(L.instagramHandle)} on Instagram ${ICON.ext}</a>`;
  const subject = kind === "join" ? "Add me to the BarberRome list" : "Booking inquiry: BarberRome";
  const mail = site.contact.email
    ? `<a class="btn btn--ghost" href="mailto:${esc(site.contact.email)}?subject=${encodeURIComponent(subject)}" data-track="email_click" data-placement="${kind}_fallback">Email ${esc(site.contact.email)}</a>`
    : "";
  const msg = kind === "join"
    ? `Signups aren’t open on this site yet. ${site.contact.email ? "Email me to get on the list, or follow" : "Follow"} me on Instagram for new drops.`
    : `Booking requests aren’t taken through this site yet. ${site.contact.email ? "Email me or send" : "Send"} a DM on Instagram with what you need.`;
  return `<div class="form form--card forms-off" data-forms-off="${kind}"><p style="margin:0">${msg}</p>${mail}${ig}</div>`;
}

function joinForm(placement, { compact = false, idp = placement } = {}) {
  if (!FORMS_ON) return formsOff("join");
  return `<form class="form${compact ? " form--card" : ""}" name="join" method="POST" action="${B}/join/thanks/" data-netlify="true" netlify-honeypot="bot-field" data-form="join" aria-label="Join the BarberRome list">
  <input type="hidden" name="form-name" value="join">
  <input type="hidden" name="placement" value="${esc(placement)}">
  <p class="hp"><label>Leave this empty <input name="bot-field" tabindex="-1" autocomplete="off"></label></p>
  <div class="row2">
    <div class="field"><label for="${idp}-email">Email</label><input id="${idp}-email" type="email" name="email" autocomplete="email" inputmode="email" placeholder="you@email.com" required></div>
    <div class="field"><label for="${idp}-phone">Phone <span class="muted">(for texts)</span></label><input id="${idp}-phone" type="tel" name="phone" autocomplete="tel" inputmode="tel" placeholder="(707) 555-0123"></div>
  </div>
  <label class="check"><input type="checkbox" name="consent" value="yes" required> <span>Yes — send me BarberRome updates by email, and by text if I added a number. Msg &amp; data rates may apply. Reply STOP to stop texts, unsubscribe any time. <a href="${B}/privacy/">Privacy</a></span></label>
  <button class="btn btn--solid-gold" type="submit">Join the list</button>
  <p class="status small" data-status role="status" aria-live="polite"></p>
</form>`;
}

function bookingForm() {
  if (!FORMS_ON) return formsOff("booking");
  return `<form class="form form--card" name="booking" method="POST" action="${B}/booking/thanks/" data-netlify="true" netlify-honeypot="bot-field" data-form="booking" aria-label="Booking inquiry">
  <input type="hidden" name="form-name" value="booking">
  <p class="hp"><label>Leave this empty <input name="bot-field" tabindex="-1" autocomplete="off"></label></p>
  <div class="row2">
    <div class="field"><label for="bk-name">Name</label><input id="bk-name" name="name" autocomplete="name" required></div>
    <div class="field"><label for="bk-type">What for</label><select id="bk-type" name="inquiry" required><option value="">Pick one</option><option>Show / performance</option><option>Feature or studio session</option><option>Haircut</option><option>Press / interview</option><option>Other</option></select></div>
  </div>
  <div class="row2">
    <div class="field"><label for="bk-email">Email</label><input id="bk-email" type="email" name="email" autocomplete="email" required></div>
    <div class="field"><label for="bk-phone">Phone <span class="muted">(optional)</span></label><input id="bk-phone" type="tel" name="phone" autocomplete="tel"></div>
  </div>
  <div class="field"><label for="bk-date">Date <span class="muted">(if there is one)</span></label><input id="bk-date" type="date" name="date"></div>
  <div class="field"><label for="bk-msg">Details</label><textarea id="bk-msg" name="message" required placeholder="Where, when, what you need."></textarea></div>
  <button class="btn" type="submit">Send inquiry</button>
  <p class="status small" data-status role="status" aria-live="polite"></p>
</form>`;
}

// ---- layout ------------------------------------------------------------------
function layout({ pathName, title, description, body, ogImage, ogType = "website", jsonld = [], noindex = false, preload = "", active = "" }) {
  const canonical = abs(pathName);
  const img = ogImage || { url: "/assets/img/og-barberrome.jpg", w: 1200, h: 630, alt: "BarberRome sitting on the hood of a red convertible in front of a mural wall, cloudy sky overhead." };
  const cfg = {
    formsMode: FORMS, basePath: B, joinFunction: site.forms.joinFunction, bookingFunction: site.forms.bookingFunction,
    rewardUrl: site.reward.url, rewardLabel: site.reward.label, instagramHandle: L.instagramHandle
  };
  const nav = [["Music", "/#music"], ["Chair to Mic", "/#chair-to-mic"], ["Join", "/#join"], ["Book", "/#book"]];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
${noindex ? '<meta name="robots" content="noindex, follow">\n' : ""}<meta name="theme-color" content="#171717">
<meta property="og:site_name" content="BarberRome">
<meta property="og:type" content="${ogType}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${abs(img.url)}">
<meta property="og:image:width" content="${img.w}">
<meta property="og:image:height" content="${img.h}">
<meta property="og:image:alt" content="${esc(img.alt)}">
<meta property="og:locale" content="en_US">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${abs(img.url)}">
<meta name="twitter:image:alt" content="${esc(img.alt)}">
<link rel="icon" href="${B}/assets/favicon.svg" type="image/svg+xml">
<link rel="preload" href="${B}/assets/fonts/barlow-condensed-800.woff2" as="font" type="font/woff2" crossorigin>
${preload}<link rel="stylesheet" href="${B}/assets/css/site.css?v=${CSS_V}">
<script>document.documentElement.className+=" js";window.BR_CONFIG=${JSON.stringify(cfg)};</script>
${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join("\n")}
${analytics}
</head>
<body${DRAFT ? ' class="draft"' : ""}>
<a class="skip" href="#main">Skip to content</a>
<header class="top">
  <div class="wrap top__in">
    <a class="mark" href="${B}/" aria-label="BarberRome home">Barber<b>Rome</b></a>
    <nav class="nav" aria-label="Main">
      ${nav.map(([l, h], i) => `<a href="${B}${h}"${i > 1 ? ' class="hide-sm"' : ""}${active === l ? ' aria-current="page"' : ""}>${l}</a>`).join("\n      ")}
    </nav>
    <a class="btn btn--sm" href="${B}/#listen" data-stream-open data-placement="header">Stream</a>
  </div>
</header>
<main id="main">
${body}
</main>
${footer()}
${streamSheet()}
<script src="${B}/assets/js/site.js?v=${JS_V}" defer></script>
</body>
</html>
`;
}

function streamSheet() {
  return `<div class="scrim" aria-hidden="true"></div>
<div class="sheet" id="stream-sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" hidden>
  <button class="sheet__close" type="button" data-sheet-close>Close</button>
  <p class="eyebrow">Stream</p>
  <h2 id="sheet-title">${esc(lead.title)}</h2>
  <p class="muted small">Pick where you listen. Opens in the app if you have it.</p>
  <ul class="sheet__list">
    ${streamLinks(lead, "stream_sheet", "", { sub: "always" }).map((a) => `<li>${a}</li>`).join("\n    ")}
  </ul>
  <p class="small muted" style="margin:1rem 0 0">Full catalog: ${streamItems(null).filter((i) => i.p !== "youtube").map((i) => `<a href="${esc(i.href)}" target="_blank" rel="noopener" data-track="stream_click" data-platform="${i.p}" data-placement="stream_sheet_artist">${i.label}</a>`).join(" · ")}</p>
</div>`;
}

function footer() {
  return `<footer class="foot" id="listen">
  <div class="wrap foot__grid">
    <div>
      <p class="eyebrow">SF → Vallejo</p>
      <h2>Bay made.</h2>
      <div class="route">
        <figure>${pic("loc-sf", [320], "A man in a black cap reaches a hand toward the camera at the corner of Taylor and Market in San Francisco, street signs and a traffic light overhead.", { sizes: "40vw", w: 320, h: 400 })}<figcaption>SF<small>Taylor &amp; Market</small></figcaption></figure>
        <span class="route__arrow" aria-hidden="true">→</span>
        <figure>${pic("loc-vallejo", [320], "A barber in an SF cap and pink shirt trims a young client's hair in a sunlit shop.", { sizes: "40vw", w: 320, h: 400 })}<figcaption>Vallejo<small>In the shop</small></figcaption></figure>
      </div>
      <div class="linkcols">
        <div><h3>Listen</h3><ul>${streamLinks(null, "footer").map((a) => `<li>${a}</li>`).join("")}</ul></div>
        <div><h3>Follow</h3><ul>
          <li><a href="${esc(L.instagram)}" target="_blank" rel="noopener" data-track="social_click" data-platform="instagram" data-placement="footer">Instagram ${esc(L.instagramHandle)}</a></li>
          <li><a href="${esc(L.youtube)}" target="_blank" rel="noopener" data-track="social_click" data-platform="youtube" data-placement="footer">YouTube</a></li>
        </ul></div>
      </div>
    </div>
    <div id="book">
      <p class="eyebrow">Booking</p>
      <h2>Shows, features, cuts.</h2>
      <p class="muted" style="margin:.7rem 0 1rem">${!FORMS_ON ? "Shows, features, haircuts." : `Tell me what you need. ${site.contact.email ? `Or email <a href="mailto:${esc(site.contact.email)}">${esc(site.contact.email)}</a>.` : `Or DM <a href="${esc(L.instagram)}" target="_blank" rel="noopener">${esc(L.instagramHandle)}</a>.`}`}</p>
      ${draft("contact.email / shop name not set in site.json — booking form + Instagram only.")}
      ${bookingForm()}
    </div>
  </div>
  <div class="wrap legal">
    <span>© ${new Date().getFullYear()} BarberRome</span>
    <a href="${B}/privacy/">Privacy</a>
    <span>Images: stills from BarberROME's own videos and release covers.</span>
  </div>
</footer>`;
}

// ---- JSON-LD -------------------------------------------------------------------
const sameAs = [L.instagram, L.spotify, L.appleMusic, L.tidal, L.youtube, L.youtubeMusic].filter(Boolean);
const placeVallejo = { "@type": "Place", name: "Vallejo, CA", address: { "@type": "PostalAddress", addressLocality: "Vallejo", addressRegion: "CA", addressCountry: "US" } };
const placeSF = { "@type": "Place", name: "San Francisco, CA", address: { "@type": "PostalAddress", addressLocality: "San Francisco", addressRegion: "CA", addressCountry: "US" } };
const recording = (t) => ({
  "@type": "MusicRecording", "@id": abs(`/tracks/${t.slug}/#recording`), name: t.title, url: abs(`/tracks/${t.slug}/`),
  datePublished: t.released, byArtist: { "@id": abs("/#artist") }, genre: site.genre[0],
  sameAs: [t.appleMusic, ytWatch(t.video.id), t.spotify, t.tidal].filter(Boolean)
});
const artistLd = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebSite", "@id": abs("/#website"), url: abs("/"), name: "BarberRome", inLanguage: "en-US" },
    {
      "@type": "MusicGroup", "@id": abs("/#artist"), name: site.artistName, alternateName: site.alternateNames,
      url: abs("/"), image: abs("/assets/img/og-barberrome.jpg"), description: site.description,
      genre: site.genre, foundingLocation: placeSF, location: [placeVallejo, placeSF], sameAs,
      member: { "@id": abs("/#person") }, track: tracks.map(recording)
    },
    {
      "@type": "Person", "@id": abs("/#person"), name: site.artistName, alternateName: site.alternateNames,
      jobTitle: ["Rapper", "Barber"], homeLocation: placeVallejo, url: abs("/"), sameAs
    }
  ]
};

// ---- home page ------------------------------------------------------------------
function heroPlayer() {
  return `<div class="player" data-player-root>
  <div class="player__head">
    ${pic(`tile-${lead.slug}`, [360], "", { sizes: "64px", lazy: false, cls: "player__art", w: 64, h: 64 })}
    <div class="player__meta">
      <p class="player__label">Lead track</p>
      <p class="player__title">${esc(lead.title)}</p>
      <p class="player__sub">${esc(metaLine(lead))}${lead.credits[0] ? " · " + esc(lead.credits[0]) : ""}</p>
    </div>
    <a class="playbtn" href="${B}/tracks/${lead.slug}/" data-play data-video="${lead.video.id}" data-title="${esc(lead.title)}" data-track-slug="${lead.slug}" data-placement="hero" aria-label="Play ${esc(lead.title)}">${ICON.play}</a>
  </div>
  <div class="player__screen" data-screen></div>
  <div class="player__foot">
    <span class="wave" aria-hidden="true">${"<i></i>".repeat(10)}</span>
    <span class="small muted" data-state-label>Tap play — sound starts when you do.</span>
  </div>
</div>`;
}

function tile(t, i) {
  const hook = hookLine(t);
  const sub = [featLine(t), t.credits[0]].filter(Boolean)[0] || `Out ${fmtDate(t.released)}`;
  return `<li data-tile id="tile-${t.slug}">
  <article class="tile" data-player-root aria-labelledby="t-${t.slug}">
    <div class="tile__top">
    <figure class="tile__fig">${pic(t.tile.img, tileWidths, t.tile.alt, { sizes: i === 0 ? "(min-width:900px) 50vw, 100vw" : "(min-width:900px) 33vw, 50vw", w: 720, h: 720, lazy: i > 1 })}</figure>
    ${t.slug === lead.slug ? '<span class="tile__badge">Lead track</span>' : ""}
    <div class="tile__body">
      <div class="tile__txt">
        <h3 class="tile__title" id="t-${t.slug}"><a href="${B}/tracks/${t.slug}/" style="text-decoration:none">${esc(t.title)}</a></h3>
        <p class="tile__meta">${esc(metaLine(t))}</p>
        <p class="tile__hook">${hook ? `“${esc(hook)}”` : esc(sub)}</p>
      </div>
      <button class="playbtn" type="button" hidden data-expand aria-expanded="false" aria-controls="panel-${t.slug}" data-video="${t.video.id}" data-title="${esc(t.title)}" data-track-slug="${t.slug}" aria-label="Play ${esc(t.title)} here">${ICON.play}</button>
    </div>
    </div>
    <div class="tile__panel" id="panel-${t.slug}" hidden>
      <div class="tile__screen" data-screen></div>
      ${hook ? `<p class="tile__hook" style="max-height:none;opacity:1">“${esc(hook)}”</p>` : ""}
      <div class="tile__actions">
        <span class="wave" aria-hidden="true">${"<i></i>".repeat(10)}</span>
        <span class="links">${streamLinks(t, "grid").join("")}</span>
        <a class="btn btn--sm btn--ghost tile__deep" href="${B}/tracks/${t.slug}/" data-track="track_page_open" data-track-slug="${t.slug}">Track page ${ICON.arrow}</a>
      </div>
    </div>
  </article>
</li>`;
}

const CARDS = [
  { step: "01", h: "The chair", p: "I picked up clippers at 12. Been cutting ever since.", img: "card-chair", widths: [405], alt: "A barber with a tattooed forearm lines up a client's hairline with gold clippers in a bright shop.", cap: "From “The IV experience”" },
  { step: "02", h: "SF → Vallejo", p: "San Francisco raised me. Vallejo is home now.", img: "card-roots", widths: [400, 640], alt: "A man in a black cap reaches a hand toward the camera at the corner of Taylor and Market in San Francisco, street signs and a traffic light overhead.", cap: "Taylor & Market, SF" },
  { step: "03", h: "First releases", p: "TOP DOWN came out August 2025. BAY PLAY followed that November.", img: "card-releases", widths: [400, 576], alt: "A man in a white hoodie and black bucket hat stands under pink neon tube lights on a video set.", cap: "BAY PLAY video shoot" },
  { step: "04", h: "Opened for 4-Tay", p: "I opened for Rappin’ 4-Tay.", img: "card-stage", widths: [400, 568], alt: "A rapper in a red cap and red-and-black jacket performs into a microphone on a red-lit stage.", cap: "Pictured: ALL I KNOW live at Noble Studios" },
  { step: "05", h: "Now", p: "PLAYAH WAY, FUNKY FLOW, DOMINAMOR. Still cutting. Still recording.", img: "card-now", widths: [400, 640], alt: "Two performers on a small stage: one in a red cap and patterned jacket raps into a mic, the other in a white tee stands at a mic stand.", cap: "NorthStar Studio, Vallejo" }
];

function home() {
  const preload = `<link rel="preload" as="image" type="image/webp" media="(max-width: 699px)" imagesrcset="${B}/assets/img/hero-tall-480.webp 480w, ${B}/assets/img/hero-tall-720.webp 720w" imagesizes="100vw">
<link rel="preload" as="image" type="image/webp" media="(min-width: 700px)" imagesrcset="${B}/assets/img/hero-wide-960.webp 960w, ${B}/assets/img/hero-wide-1280.webp 1280w" imagesizes="100vw">
`;
  const heroMedia = site.hero.loopVideo
    ? `<video autoplay muted loop playsinline preload="metadata" poster="${B}/assets/img/hero-wide-1280.jpg" aria-hidden="true"><source src="${esc(site.hero.loopVideo)}" type="video/mp4"></video>`
    : `<picture>
      <source media="(max-width: 699px)" type="image/webp" srcset="${B}/assets/img/hero-tall-480.webp 480w, ${B}/assets/img/hero-tall-720.webp 720w" sizes="100vw">
      <source media="(max-width: 699px)" srcset="${B}/assets/img/hero-tall-480.jpg 480w, ${B}/assets/img/hero-tall-720.jpg 720w" sizes="100vw">
      <source type="image/webp" srcset="${B}/assets/img/hero-wide-640.webp 640w, ${B}/assets/img/hero-wide-960.webp 960w, ${B}/assets/img/hero-wide-1280.webp 1280w" sizes="100vw">
      <img src="${B}/assets/img/hero-wide-1280.jpg" srcset="${B}/assets/img/hero-wide-640.jpg 640w, ${B}/assets/img/hero-wide-960.jpg 960w, ${B}/assets/img/hero-wide-1280.jpg 1280w" sizes="100vw" width="1280" height="720" fetchpriority="high" alt="BarberRome sits on the hood of a red convertible in front of a mural-covered wall while a friend stands by, clouds overhead.">
    </picture>`;
  const body = `
<section class="hero" aria-labelledby="h1">
  <div class="hero__media">${heroMedia}</div>
  <p class="hero__cap" aria-hidden="true"><span class="cap-wide">${esc(site.hero.stillCaption)}</span><span class="cap-tall">${esc(site.hero.stillCaptionMobile)}</span></p>
  <div class="wrap hero__in">
    <div class="hero__grid">
      <div>
        <p class="eyebrow">Bay Area hip-hop</p>
        <h1 class="wordmark" id="h1"><span>Barber</span><span class="rome">Rome</span></h1>
        <ul class="ident" aria-label="About">
          <li>Barber since 12</li><li>Rapper</li><li>SF <span class="arrow" aria-hidden="true">→</span><span class="visually-hidden">to</span> Vallejo</li>
        </ul>
        <div class="ctas">
          <a class="btn" href="#listen" data-stream-open data-placement="hero">${ICON.play} Stream</a>
          <a class="btn btn--gold" href="#join" data-join-open="hero-join" data-track="join_cta" data-placement="hero">Join the list</a>
        </div>
        <div class="quickjoin" id="hero-join" hidden>
          ${joinForm("hero", { compact: true })}
        </div>
      </div>
      ${heroPlayer()}
    </div>
  </div>
</section>

<section class="dual" aria-label="Barber and rapper">
  <div class="dual__item dual__item--chair">
    ${pic("id-chair", [405], "A barber in an SF cap and pink shirt trims a young client's hair in a sunlit shop.", { sizes: "(min-width:800px) 21vw, 50vw", w: 405, h: 506, lazy: false })}
    <div class="dual__txt"><p class="eyebrow">The chair</p><h2>Barber</h2><p>Cutting hair since I was 12. Still in the shop.</p></div>
  </div>
  <div class="dual__item">
    ${pic("card-stage", [400], "A rapper in a red cap and red-and-black jacket performs into a microphone on a red-lit stage.", { sizes: "(min-width:800px) 21vw, 50vw", w: 400, h: 500, lazy: false })}
    <div class="dual__txt"><p class="eyebrow">The mic</p><h2>Rapper</h2><p>Bay player music. ${tracks.slice(0, 3).map((t) => esc(t.title)).join(", ")} out now.</p></div>
  </div>
</section>

<section class="sec" id="music" aria-labelledby="music-h">
  <div class="wrap">
    <div class="sec__head">
      <div><p class="eyebrow">Music</p><h2 id="music-h">Tracks</h2></div>
      <p>Tap a track to play it right here. Open the track page for the video and every link.</p>
    </div>
    <ul class="grid">
      ${[lead, ...tracks.filter((t) => t !== lead)].map(tile).join("\n")}
    </ul>
    <p class="more">Also out: ALL I KNOW (feat. ChrisCash, PrimoLeone &amp; 3xCrenshaw), 14 MI$$ON — on <a href="${esc(L.appleMusic)}" target="_blank" rel="noopener" data-track="stream_click" data-platform="apple_music" data-placement="grid_more">Apple Music</a> and <a href="${esc(L.youtubeMusic)}" target="_blank" rel="noopener" data-track="stream_click" data-platform="youtube_music" data-placement="grid_more">YouTube Music</a>.</p>
  </div>
</section>

<section class="join sec" id="join" aria-labelledby="join-h">
  <div class="wrap join__in">
    <div>
      <p class="eyebrow">${FORMS_ON ? "Unreleased" : "The list"}</p>
      <h2 id="join-h">Join the list</h2>
      <p class="join__lede">${FORMS_ON ? `Drop your email or number and I’ll send you ${esc(site.reward.label)}. New tracks and shows hit this list first.` : "The list isn’t open yet. New tracks and shows go on Instagram first for now."}</p>
      ${!FORMS_ON ? "" : draft(site.reward.url ? "reward.url set: " + site.reward.url : "reward.url not set — success message says the drop isn't posted yet.")}
    </div>
    ${joinForm("after_grid", { compact: true })}
  </div>
</section>

<section class="sec ctm" id="chair-to-mic" aria-labelledby="ctm-h">
  <div class="wrap sec__head">
    <div><p class="eyebrow">Chair to mic</p><h2 id="ctm-h">How I got here</h2></div>
    <div class="rail-ctl" data-rail-ctl="rail"><button type="button" data-dir="-1" aria-label="Previous card">←</button><button type="button" data-dir="1" aria-label="Next card">→</button></div>
  </div>
  <ol class="rail" id="rail" data-rail tabindex="0" aria-label="Chair to mic, five steps. Scroll sideways.">
    ${CARDS.map((c) => `<li class="card">
      <figure>${pic(c.img, c.widths, c.alt, { sizes: "300px", w: 400, h: 500 })}<figcaption>${esc(c.cap)}</figcaption></figure>
      <div class="card__body"><span class="card__step">${c.step}</span><h3>${esc(c.h)}</h3><p>${esc(c.p)}</p></div>
    </li>`).join("\n    ")}
  </ol>
</section>
`;
  return layout({ pathName: "/", title: site.title, description: site.description, body, jsonld: [artistLd], preload });
}

// ---- track pages ----------------------------------------------------------------
function trackPage(t, idx) {
  const prev = tracks[(idx - 1 + tracks.length) % tracks.length];
  const next = tracks[(idx + 1) % tracks.length];
  const title = `${t.title}${t.feat ? ` (feat. ${t.feat})` : ""} — BarberRome | Bay Area Rapper`;
  const description = `Watch and stream ${t.title}${t.feat ? ` feat. ${t.feat}` : ""} by BarberRome, Bay Area rapper from San Francisco living in Vallejo. Released ${fmtDate(t.released)}.`;
  const pw = posterWidths(t);
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      { ...recording(t), "@context": undefined, image: abs(`/assets/img/${t.tile.img}-720.jpg`), byArtist: { "@type": "MusicGroup", "@id": abs("/#artist"), name: site.artistName, url: abs("/") } },
      { "@type": "VideoObject", name: t.video.label, thumbnailUrl: abs(`/assets/img/${t.poster.img}-${pw[pw.length - 1]}.jpg`), embedUrl: `https://www.youtube-nocookie.com/embed/${t.video.id}`, contentUrl: ytWatch(t.video.id), description: `${t.video.label} by BarberRome.` },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "BarberRome", item: abs("/") },
        { "@type": "ListItem", position: 2, name: "Tracks", item: abs("/#music") },
        { "@type": "ListItem", position: 3, name: t.title, item: abs(`/tracks/${t.slug}/`) }
      ] }
    ]
  };
  // VideoObject wants uploadDate; we only know the YouTube publish date for some — omit rather than guess.
  const body = `
<div class="wrap">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="${B}/">BarberRome</a> / <a href="${B}/#music">Tracks</a> / <span aria-current="page">${esc(t.title)}</span></nav>
  <section class="track-hero" aria-labelledby="h1">
    <div class="track-hero__grid">
      <div data-player-root>
        <div class="facade-box">
          <button class="facade" type="button" data-facade data-video="${t.video.id}" data-title="${esc(t.video.label)}" data-track-slug="${t.slug}" aria-label="Play video: ${esc(t.video.label)}">
            ${pic(t.poster.img, pw, t.poster.alt, { sizes: "(min-width:900px) 58vw, 100vw", lazy: false, w: 640, h: 360, priority: true })}
            <span class="facade__btn" aria-hidden="true">${ICON.play}</span>
            <span class="facade__lbl">${esc(t.video.label)}</span>
          </button>
        </div>
        <noscript><p class="small"><a href="${ytWatch(t.video.id)}">Watch on YouTube</a></p></noscript>
      </div>
      <div>
        <p class="eyebrow">BarberRome${t.feat ? ` feat. ${esc(t.feat)}` : ""}</p>
        <h1 class="track-title" id="h1">${esc(t.title)}</h1>
        <ul class="credits">
          <li>Released ${fmtDate(t.released)}</li>
          ${t.credits.map((c) => `<li>${esc(c)}</li>`).join("")}
        </ul>
        <div class="stream-row">${streamLinks(t, "track_page", "btn btn--ghost").join("")}</div>
      </div>
    </div>
  </section>
  ${t.extraVideos.length ? `<section aria-labelledby="more-v" style="margin-top:2rem"><h2 id="more-v" style="font-size:2rem">More from ${esc(t.title)}</h2><div class="extras">${t.extraVideos.map((v) => `<a class="btn btn--ghost" href="${ytWatch(v.id)}" target="_blank" rel="noopener" data-track="stream_click" data-platform="youtube" data-track-slug="${t.slug}" data-placement="track_extra">${esc(v.label)} ${ICON.ext}</a>`).join("")}</div></section>` : ""}
  <section class="sec" aria-labelledby="tj-h" style="padding-bottom:0">
    <div class="join__in" style="display:grid;gap:1rem">
      <div><p class="eyebrow">${FORMS_ON ? "Unreleased" : "The list"}</p><h2 id="tj-h">Join the list</h2><p class="muted" style="margin-top:.6rem">${FORMS_ON ? `Email or number. I’ll send you ${esc(site.reward.label)}.` : "Not open yet. Follow along on Instagram."}</p></div>
      ${joinForm(`track_${t.slug}`, { compact: true })}
    </div>
  </section>
  <nav class="pn" aria-label="More tracks">
    <a href="${B}/tracks/${prev.slug}/"><small>← Previous</small><b>${esc(prev.title)}</b></a>
    <a class="next" href="${B}/tracks/${next.slug}/"><small>Next →</small><b>${esc(next.title)}</b></a>
  </nav>
  <p style="margin:1.5rem 0 3rem"><a href="${B}/#music">All tracks</a></p>
</div>`;
  return layout({
    pathName: `/tracks/${t.slug}/`, title, description, body, ogType: "music.song", jsonld: [ld], active: "Music",
    ogImage: { url: `/assets/img/${t.tile.img}-720.jpg`, w: 720, h: 720, alt: t.tile.alt }
  });
}

// ---- simple pages -------------------------------------------------------------
function simple(pathName, title, h1, html, { noindex = false } = {}) {
  return layout({ pathName, title: `${title} | BarberRome`, description: site.description, noindex, body: `<div class="wrap page"><h1>${h1}</h1>${html}</div>` });
}
const joinThanks = simple("/join/thanks/", "You're on the list", "You’re on the list", `
<p>Thanks for joining.</p>
${site.reward.url ? `<p class="reward">Here’s ${esc(site.reward.label)}: <a href="${esc(site.reward.url)}" data-track="reward_open">open it</a>.</p>` : `<p class="reward">The unreleased drop isn’t posted yet. It goes to this list first.</p>`}
<p><a class="btn" href="${B}/#music">Back to the music</a></p>`, { noindex: true });
const bookingThanks = simple("/booking/thanks/", "Inquiry sent", "Inquiry sent", `<p>Got it. I’ll get back to you.</p><p><a class="btn" href="${B}/">Back home</a></p>`, { noindex: true });
const privacy = simple("/privacy/", "Privacy", "Privacy", `
${FORMS_ON ? "" : "<p><strong>Right now this site doesn’t collect anything:</strong> signups and booking requests aren’t open here yet. The notes below apply once they are.</p>"}
<p>If you join the list, I keep your email and/or phone number to send you BarberRome music, show news and the unreleased drop. That’s it. I don’t sell it.</p>
<h2>Texts</h2><p>If you add a number and check the box, you agree to get texts from BarberRome. Message frequency varies. Msg &amp; data rates may apply. Reply STOP to stop, HELP for help.</p>
<h2>Booking</h2><p>Booking inquiries are only used to answer you.</p>
<h2>Removal</h2><p>To get removed, reply STOP to a text, use the unsubscribe link in any email, or DM <a href="${esc(L.instagram)}">${esc(L.instagramHandle)}</a>.</p>
<h2>Videos</h2><p>Videos play through YouTube’s privacy-enhanced embed and only load after you tap play.</p>`);
const notFound = layout({ pathName: "/404.html", title: "Not found | BarberRome", description: site.description, noindex: true,
  body: `<div class="wrap page"><h1>Wrong turn</h1><p>That page isn’t here.</p><p><a class="btn" href="${B}/#music">Go to the music</a></p></div>` });

// ---- write -------------------------------------------------------------------
fs.rmSync(OUT, { recursive: true, force: true });
const write = (rel, content) => { const p = path.join(OUT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content); };
fs.cpSync(path.join(SRC, "assets"), path.join(OUT, "assets"), { recursive: true });
write("index.html", home());
tracks.forEach((t, i) => write(`tracks/${t.slug}/index.html`, trackPage(t, i)));
if (FORMS_ON) {
  write("join/thanks/index.html", joinThanks);
  write("booking/thanks/index.html", bookingThanks);
}
write("privacy/index.html", privacy);
write("404.html", notFound);
const today = new Date().toISOString().slice(0, 10);
const urls = ["/", ...tracks.map((t) => `/tracks/${t.slug}/`), "/privacy/"];
write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${abs(u)}</loc><lastmod>${today}</lastmod></url>`).join("\n")}
</urlset>
`);
write("robots.txt", `User-agent: *
Allow: /
${FORMS_ON ? `Disallow: ${B}/join/thanks/\nDisallow: ${B}/booking/thanks/\n` : ""}
Sitemap: ${abs("/sitemap.xml")}
`);
console.log(`Built ${urls.length + (FORMS_ON ? 3 : 1)} pages → ${path.relative(ROOT, OUT)}/  (SITE_URL=${SITE_URL}, base="${B}", forms=${FORMS}${DRAFT ? ", DRAFT" : ""})`);
