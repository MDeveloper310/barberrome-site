// Shared relay used by subscribe.mjs / booking.mjs (forms.mode = "function").
// Forwards a validated submission as JSON to a webhook you control
// (Zapier/Make, Laylo, Mailchimp via a proxy, Google Apps Script, etc.).
// No webhook configured → 503, so the site never shows a fake success.
export async function relay(req, { envVar, required, kind }) {
  if (req.method !== "POST") return json(405, { ok: false, error: "POST only" });
  let data;
  try { data = await req.json(); } catch { return json(400, { ok: false, error: "Invalid JSON" }); }
  if (data["bot-field"]) return json(200, { ok: true }); // honeypot: pretend OK to bots, store nothing
  const clean = {};
  for (const k of required.concat(["phone", "consent", "placement", "date", "inquiry", "message", "name", "email"])) {
    if (data[k] != null) clean[k] = String(data[k]).slice(0, 2000).trim();
  }
  for (const k of required) if (!clean[k]) return json(422, { ok: false, error: `Missing ${k}` });
  if (kind === "join") {
    if (!clean.email && !clean.phone) return json(422, { ok: false, error: "Email or phone required" });
    if (clean.consent !== "yes") return json(422, { ok: false, error: "Consent required" });
  }
  if (clean.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.email)) return json(422, { ok: false, error: "Bad email" });
  const url = process.env[envVar];
  if (!url) return json(503, { ok: false, error: `${envVar} is not configured` });
  const r = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: kind, receivedAt: new Date().toISOString(), ...clean })
  }).catch(() => null);
  if (!r || !r.ok) return json(502, { ok: false, error: "Upstream webhook failed" });
  return json(200, { ok: true });
}
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
