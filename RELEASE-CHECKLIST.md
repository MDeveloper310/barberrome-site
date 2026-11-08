# Release checklist — what's missing or needs a yes

Run `npm run build:draft` and open `dist-draft/` to see the remaining gaps (reward, booking contact) marked on the pages.

Lyrics and hook lines are out for now at the owner's request; they are not a launch blocker.

## Must do before going live

The site is live on GitHub Pages (https://mdeveloper310.github.io/barberrome-site/) with signups and booking switched off there. Items below are what's left for a full launch.

- [ ] **Domain.** Set `SITE_URL` (Netlify env) or `siteUrl` in `src/data/site.json`. Until then canonical/OG/sitemap use the fallback host. Rebuild after.
- [ ] **Forms backend.** On GitHub Pages forms are disabled (email + Instagram buttons, nothing collected). Fastest path: activate the prepared FormSubmit mode — README "Email forwarding (FormSubmit)" — which needs the owner of iv.forthepeople@gmail.com to click FormSubmit's activation email after one live test submission. Other options: Deploy on Netlify (forms are auto-detected) and turn on form notifications, **or** switch `forms.mode` to `function` and set `SUBSCRIBE_WEBHOOK_URL` / `BOOKING_WEBHOOK_URL`. Send a real test submission from the live site.
- [ ] **Email/SMS list.** Decide where contacts end up (Laylo, Mailchimp, Community, a sheet). If you text people, use an SMS provider that handles STOP/HELP and consent records. The checkbox wording is on the forms and in `/privacy/`.
- [ ] **Unreleased reward.** `reward.url` is null. Upload the unreleased cut / shop voice note somewhere private (unlisted SoundCloud, Dropbox link, a hidden page) and set `reward.url`. Until then the thank-you message says it isn't posted yet. Note: a URL shown on the thank-you page can be shared; for a gated file, email it from your list tool instead.
- [ ] **Artist sign-off on the first-person copy**: hero line, "Barber / Rapper" strip, Chair to Mic cards, join/booking lines (all in `scripts/build.mjs`, `CARDS` and `home()`).

Done: Spotify, Apple Music and Tidal artist links supplied by the owner and wired into the chooser, track pages, grid, footer and schema.

## Content not supplied yet (kept out, not faked)
- [ ] Shop name/address (`contact.shopName`). Booking email is set: iv.forthepeople@gmail.com.
- [ ] Optional per-track **Spotify / Tidal URLs** (`spotify`, `tidal` in `tracks.json`). Until then those buttons open the artist pages and are labeled "artist page".
- [ ] Optional **muted hero loop**: 6–10 s top-down cruise clip, H.264 MP4 under 1.5 MB, `hero.loopVideo`.
- [ ] Optional **Rappin' 4-Tay show** still/date. The card uses the Noble Studios live still and says so in its caption.
- [ ] Optional: add ALL I KNOW / 14 MI$$ON as tiles (both verified on Apple + YouTube) — copy an entry in `tracks.json`, add images in `scripts/images.py`.

## Confirm image use
- [ ] The barbershop stills (from "The IV experience 💈" and "IV, Vallejo CA") show barbers at work; confirm who's pictured and that the clients are OK being on the site.
- [ ] DOMINAMOR cover shows a child — confirm OK as a tile.
- [ ] Card 03 uses a still from the Crenshaw Visuals upload (nEKHOoovPcQ); confirm with the videographer, or swap for a BarberROME-channel still.
- [ ] Better sources: the stills come from YouTube thumbnails (720p max). Original 1080p+ frame grabs from the TOP DOWN / BAY PLAY / ALL I KNOW footage will look sharper. Drop them in `source-media/`, adjust crops in `scripts/images.py`, run `npm run images`.
- [ ] Instagram @barberrome: the handle came from the owner; check it's the right account.

## Nice to have
- [ ] Analytics provider snippet in `src/partials/analytics.html` (events already fire to `dataLayer`).
- [ ] Submit `sitemap.xml` in Google Search Console after launch.
- [ ] Test the tap-to-play on a real iPhone (iOS sometimes needs a second tap inside the YouTube player to start sound).
