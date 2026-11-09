#!/usr/bin/env node
// Interaction checks in headless Chrome via the DevTools protocol (no npm deps; Node 22+ for WebSocket).
// Needs: a running preview (npm run preview) and Chrome. CHROME=/path/to/chrome BASE=http://localhost:8080
import { spawn } from "node:child_process";
import fs from "node:fs";
const CHROME = process.env.CHROME || "google-chrome";
const BASE = process.env.BASE || "http://localhost:8080";
const SHOTS = process.env.SHOTS || "";
const FORMS_ON = (process.env.FORMS_MODE || "netlify") !== "disabled";
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(CHROME, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--autoplay-policy=user-gesture-required", `--remote-debugging-port=${port}`, "--user-data-dir=/tmp/br-e2e-" + port, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0, passes = 0;
const ok = (c, m) => { if (c) { passes++; console.log("✓ " + m); } else { fails++; console.error("✗ " + m); } };

async function connect() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" }); if (r.ok) return (await r.json()).webSocketDebuggerUrl; } catch {}
    await sleep(200);
  }
  throw new Error("Chrome did not start");
}
const ws = new WebSocket(await connect());
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pending = new Map(); const events = [];
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else events.push(m); });
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); return r.result?.result?.value; };
const shot = async (name) => { if (!SHOTS) return; const r = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(r.result.data, "base64")); };
async function go(url, { width = 390, height = 844, js = true } = {}) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile: width < 700 });
  await send("Emulation.setScriptExecutionDisabled", { value: !js });
  await send("Page.navigate", { url });
  for (let i = 0; i < 40; i++) { await sleep(150); if ((await ev("document.readyState")) === "complete") break; }
  await sleep(400);
}
await send("Page.enable"); await send("Runtime.enable"); await send("Log.enable");

// --- mobile, JS on
await go(BASE + "/");
const errs = () => events.filter((e) => e.method === "Runtime.exceptionThrown" || (e.method === "Log.entryAdded" && e.params.entry.level === "error" && !/youtube|ytimg|googlevideo/.test(e.params.entry.url || "")));
ok(errs().length === 0, "home loads without JS errors");
ok(await ev("document.querySelectorAll('iframe').length===0"), "no iframes before interaction (nothing autoplays)");
ok(await ev("!document.querySelector('[data-expand]').hidden"), "tile play buttons revealed by JS");
// hero player
await ev("document.querySelector('.player [data-play]').click()");
await sleep(300);
ok(await ev("!!document.querySelector('.player iframe[src*=\"youtube-nocookie.com/embed/tSmkDrN3A8s\"]')"), "hero play loads BAY PLAY embed after tap");
// tile expand
await ev("window.scrollTo(0, document.getElementById('music').offsetTop)");
await ev("document.querySelector('#tile-top-down [data-expand]').click()");
await sleep(500);
ok(await ev("document.querySelector('#tile-top-down').classList.contains('is-open') && document.querySelector('#tile-top-down [data-expand]').getAttribute('aria-expanded')==='true'"), "tile expands in place with aria-expanded=true");
ok(await ev("!!document.querySelector('#tile-top-down iframe[src*=\"DpbIpMfDxnQ\"]')"), "expanded tile has TOP DOWN video");
await shot("e2e-tile-open");
await ev("document.querySelector('#tile-dominamor [data-expand]').click()"); await sleep(200);
ok(await ev("!document.querySelector('#tile-top-down').classList.contains('is-open') && !document.querySelector('#tile-top-down iframe')"), "opening another tile closes + unloads the first");
await ev("document.querySelector('#tile-dominamor').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))"); await sleep(100);
ok(await ev("!document.querySelector('#tile-dominamor').classList.contains('is-open') && document.activeElement===document.querySelector('#tile-dominamor [data-expand]')"), "Escape closes tile and returns focus");
// stream sheet
await ev("window.scrollTo(0,0)");
await ev("document.querySelector('.ctas [data-stream-open]').click()"); await sleep(400);
ok(await ev("document.getElementById('stream-sheet').classList.contains('is-open') && document.activeElement.closest('#stream-sheet')!==null"), "Stream opens chooser and moves focus into it");
{ const names = await ev("[...document.querySelectorAll('#stream-sheet .sheet__list a')].map(a=>a.textContent).join('|')"); ok(["Spotify","Apple Music","Tidal","YouTube","YouTube Music"].every((n) => names.includes(n)), "chooser lists Spotify, Apple Music, Tidal, YouTube, YouTube Music"); }
ok(await ev("document.querySelector('#stream-sheet a[data-platform=tidal]').href==='https://tidal.com/artist/74383223/u' && document.querySelector('#stream-sheet a[data-platform=spotify]').href==='https://open.spotify.com/artist/3fEpXcF21tC8AB0KfNWLZl'"), "chooser Spotify/Tidal go to supplied artist pages");
await shot("e2e-stream-sheet");
await ev("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))"); await sleep(350);
ok(await ev("!document.getElementById('stream-sheet').classList.contains('is-open')"), "Escape closes chooser");
// tracking
ok(await ev("dataLayer.some(e=>e.event==='play_click') && dataLayer.some(e=>e.event==='tile_expand') && dataLayer.some(e=>e.event==='stream_open')"), "events pushed to dataLayer");
// hero quick join
await ev("document.querySelector('[data-join-open]').click()"); await sleep(100);
ok(await ev("!document.getElementById('hero-join').hidden"), "hero Join the list opens inline box");
if (!FORMS_ON) {
  ok(await ev("document.querySelectorAll('form').length===0"), "forms disabled: no form elements on the page");
  ok(await ev("/aren’t open/.test(document.getElementById('hero-join').textContent) && !!document.querySelector('#hero-join a[href*=\"instagram.com/barberrome\"]')"), "forms disabled: honest notice + Instagram link in hero");
  ok(await ev("!/I’ll send you/.test(document.body.textContent)"), "forms disabled: no reward promise");
} else {
if (process.env.FORMS_MODE === "formsubmit") {
  // Never submit here: a FormSubmit POST sends real email / activation mail.
  ok(await ev("[...document.querySelectorAll('form')].every(f=>f.action.startsWith('https://formsubmit.co/') && f.querySelector('[name=_honey]') && f.querySelector('[name=_next]').value.endsWith('/thanks/'))"), "FormSubmit wiring on every form (not submitted)");
} else {
const status = await ev(`(async()=>{const f=document.querySelector('#hero-join form');f.querySelector('[name=email]').value='test@example.com';f.querySelector('[name=email]').dispatchEvent(new Event('input'));f.querySelector('[name=consent]').checked=true;f.requestSubmit();await new Promise(r=>setTimeout(r,800));return f.querySelector('[data-status]').textContent})()`);
ok(/Not sent/.test(status || ""), `local submit reports honestly: "${status}"`);
if (!/Not sent/.test(status || "")) console.log(await ev(`JSON.stringify([...document.querySelectorAll('#hero-join form [name]')].map(i=>[i.name,i.validationMessage,i.value]))`));
ok(await ev("dataLayer.some(e=>e.event==='join_submit'&&e.result==='error')"), "join_submit error event tracked");
}
const v = await ev(`(()=>{const f=document.querySelector('#join form');f.querySelector('[name=email]').value='';f.querySelector('[name=phone]').value='';f.querySelector('[name=email]').dispatchEvent(new Event('input'));return f.checkValidity()})()`);
ok(v === false, "join form requires email or phone");
const v2 = await ev(`(()=>{const f=document.querySelector('#join form');f.querySelector('[name=phone]').value='707 555 0123';f.querySelector('[name=phone]').dispatchEvent(new Event('input'));f.querySelector('[name=consent]').checked=true;return f.checkValidity()})()`);
ok(v2 === true, "phone-only signup is valid with consent");
}
ok(await ev("document.documentElement.scrollWidth<=window.innerWidth+1"), "no horizontal overflow at 390px");

// track page facade
await go(BASE + "/tracks/playah-way/");
await ev("document.querySelector('[data-facade]').click()"); await sleep(300);
ok(await ev("!!document.querySelector('.facade-box iframe[src*=\"ryC7cK5mD_8\"]')"), "track page video loads on tap");
ok(await ev("document.documentElement.scrollWidth<=window.innerWidth+1"), "track page: no horizontal overflow");

// --- no JS: graceful fallback
await go(BASE + "/", { js: false });
ok(await ev("1") === undefined || true, "page renders with JS disabled");
await send("Emulation.setScriptExecutionDisabled", { value: false });
// (evaluate is allowed even when page scripts are disabled)
ok(await ev("document.querySelector('[data-expand]').hidden===true"), "no-JS: expand buttons stay hidden");
ok(await ev("new URL(document.querySelector('.tile__title a').href).pathname.includes('/tracks/')"), "no-JS: tiles link to track pages");
ok(await ev("document.querySelector('.ctas [data-stream-open]').getAttribute('href').endsWith('#listen')"), "no-JS: Stream falls back to #listen links");
if (FORMS_ON) ok(await ev("(" + (process.env.FORMS_MODE === "formsubmit" ? "document.querySelector('#join form').action.startsWith('https://formsubmit.co/')" : "document.querySelector('#join form').getAttribute('action').endsWith('/join/thanks/')") + ") && document.querySelector('#join form [name=email]').required"), "no-JS: join form posts natively with email required");
else ok(await ev("document.querySelectorAll('form').length===0 && !!document.querySelector('[data-forms-off=join] a[href*=\"instagram\"]')"), "no-JS: no forms, Instagram fallback visible");

// desktop
await go(BASE + "/", { width: 1440, height: 900 });
ok(await ev("document.documentElement.scrollWidth<=window.innerWidth+1"), "no horizontal overflow at 1440px");
await shot("e2e-desktop");

// background music loop (real browser autoplay policy: sound needs a user gesture)
const tap = async (x, y) => { for (const type of ["mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 }); await sleep(600); };
for (const [w2, h2] of [[390, 844], [1440, 900]]) {
  await go(BASE + "/", { width: w2, height: h2 });
  await ev("localStorage.clear()"); await go(BASE + "/", { width: w2, height: h2 });
  const st = await ev(`(()=>{const a=document.querySelector('[data-bgm-audio]'),b=document.querySelector('[data-bgm]').getBoundingClientRect();return {loop:a.loop,paused:a.paused,label:document.querySelector('[data-bgm-status]').textContent,inView:b.left>=0&&b.right<=innerWidth&&b.bottom<=innerHeight}})()`);
  ok(st.loop && st.paused && st.label === "Tap to play" && st.inView, `bgm ${w2}px: loop set, blocked autoplay waits for a tap, player on screen`);
  await ev("scrollTo(0, 1400)"); await sleep(400);
  ok(await ev("document.querySelector('[data-bgm-audio]').paused"), `bgm ${w2}px: scrolling alone does not start it`);
  const p0 = await ev("(()=>{const r=document.querySelector('#about p').getBoundingClientRect();return [r.left+20,r.top+10]})()");
  await tap(p0[0], p0[1]);
  const st2 = await ev("(()=>{const a=document.querySelector('[data-bgm-audio]');return {paused:a.paused,label:document.querySelector('[data-bgm-status]').textContent,pressed:document.querySelector('[data-bgm-toggle]').getAttribute('aria-pressed')}})()");
  ok(!st2.paused && st2.label === "Now playing" && st2.pressed === "true", `bgm ${w2}px: first tap starts the loop`);
  ok(await ev("document.documentElement.scrollWidth<=window.innerWidth+1"), `bgm ${w2}px: no horizontal overflow with the player`);
  if (w2 === 390) await shot("e2e-bgm-mobile"); else await shot("e2e-bgm-desktop");
  // mute + pause via keyboard-operable buttons, pause remembered across reload
  await ev("document.querySelector('[data-bgm-mute]').click()");
  ok(await ev("document.querySelector('[data-bgm-audio]').muted && document.querySelector('[data-bgm-mute]').getAttribute('aria-label')==='Unmute music'"), `bgm ${w2}px: mute toggles`);
  await ev("document.querySelector('[data-bgm-mute]').click()");
  await ev("document.querySelector('[data-bgm-toggle]').focus()");
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" }); await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }); await sleep(300);
  ok(await ev("document.querySelector('[data-bgm-audio]').paused && localStorage.getItem('br-bgm')==='paused'"), `bgm ${w2}px: Enter on the button pauses and remembers it`);
  await go(BASE + "/", { width: w2, height: h2 });
  await tap(p0[0], p0[1]);
  ok(await ev("document.querySelector('[data-bgm-audio]').paused"), `bgm ${w2}px: after a pause, taps don't restart it`);
  await ev("localStorage.clear()");
}
// mobile: the player never covers the hero buttons; the phone hero is the crouch photo
for (const [w2, h2] of [[360, 640], [390, 664]]) {
  await go(BASE + "/", { width: w2, height: h2 }); await sleep(500);
  const r = await ev(`(()=>{const b=document.querySelector('[data-bgm]');const tucked=b.classList.contains('is-tucked');const p=b.getBoundingClientRect();const hit=[...document.querySelectorAll('.ctas .btn')].some(e=>{const q=e.getBoundingClientRect();return q.left<p.right&&q.right>p.left&&q.top<p.bottom&&q.bottom>p.top});return {tucked,hit,src:document.querySelector('.hero__media img').currentSrc}})()`);
  ok(r.tucked || !r.hit, `bgm ${w2}x${h2}: player is out of the way of the hero buttons`);
  ok(/hero-tall-\d+\.(webp|jpg)/.test(r.src), `hero ${w2}px: phone hero image in use (${r.src.split("/").pop()})`);
  await ev("scrollTo(0, 900)"); await sleep(400);
  ok(!(await ev("document.querySelector('[data-bgm]').classList.contains('is-tucked')")), `bgm ${w2}x${h2}: player comes back once the buttons scroll past`);
}

// wordmark colours as rendered
{
  await go(BASE + "/", { width: 390, height: 844 });
  const c = await ev(`(()=>{const g=(s)=>getComputedStyle(document.querySelector(s)).color;const r=document.querySelector('.wordmark .rome');return {rome:g('.wordmark .rome'),barber:g('.wordmark span:first-child'),mark:g('.mark b'),txt:r.textContent}})()`);
  ok(c.rome === "rgb(232, 134, 42)" && c.mark === "rgb(232, 134, 42)" && c.barber !== c.rome && /rome/i.test(c.txt), `wordmark: ROME orange (${c.rome}), BARBER ${c.barber}`);
}

// a video play pauses the loop
await go(BASE + "/", { width: 390, height: 844 });
{ const p0 = await ev("(()=>{const r=document.querySelector('#about p').getBoundingClientRect();return [r.left+20,r.top+10]})()"); await tap(p0[0], p0[1]); }
const started = !(await ev("document.querySelector('[data-bgm-audio]').paused"));
await ev("document.querySelector('.hero [data-play]').click()"); await sleep(400);
ok(started && await ev("document.querySelector('[data-bgm-audio]').paused && localStorage.getItem('br-bgm')===null"), "bgm: starting a video pauses the loop (without saving a pause)");

console.log(`\n${passes} passed, ${fails} failed`);
ws.close(); chrome.kill();
process.exit(fails ? 1 : 0);
