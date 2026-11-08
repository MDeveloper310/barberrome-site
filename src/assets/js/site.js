/* BarberRome — progressive enhancement. Site works without this file:
   links go to track pages / anchors, forms post natively to Netlify. */
(function () {
  "use strict";
  var d = document, w = window;
  var CFG = w.BR_CONFIG || {};

  /* ---------- analytics placeholder ---------- */
  w.dataLayer = w.dataLayer || [];
  function track(name, props) {
    var evt = Object.assign({ event: name, ts: Date.now(), path: location.pathname }, props || {});
    w.dataLayer.push(evt);
    try { d.dispatchEvent(new CustomEvent("br:track", { detail: evt })); } catch (e) {}
    if (/[?&]debug\b/.test(location.search)) console.info("[track]", evt);
  }
  w.brTrack = track;

  d.addEventListener("click", function (e) {
    var a = e.target.closest("[data-track]");
    if (!a) return;
    track(a.getAttribute("data-track"), {
      platform: a.getAttribute("data-platform") || undefined,
      track: a.getAttribute("data-track-slug") || undefined,
      placement: a.getAttribute("data-placement") || undefined,
      href: a.href || undefined
    });
  });

  /* ---------- YouTube (privacy-enhanced, loaded on tap only) ---------- */
  var YT_ORIGINS = /^https:\/\/www\.youtube(-nocookie)?\.com$/;
  function ytFrame(id, title) {
    var f = d.createElement("iframe");
    var origin = /^https?:/.test(location.protocol) ? "&origin=" + encodeURIComponent(location.origin) : "";
    f.src = "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(id) +
      "?autoplay=1&playsinline=1&rel=0&modestbranding=1&enablejsapi=1" + origin;
    f.title = title || "YouTube video player";
    f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    f.allowFullscreen = true;
    f.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    f.addEventListener("load", function () {
      try { f.contentWindow.postMessage(JSON.stringify({ event: "listening", id: id }), "*"); } catch (e) {}
    });
    return f;
  }
  function ytCmd(frame, func) {
    try { frame.contentWindow.postMessage(JSON.stringify({ event: "command", func: func, args: [] }), "*"); } catch (e) {}
  }
  // Player state → waveform pulse / hero contrast shift (only when actually playing).
  w.addEventListener("message", function (e) {
    if (!YT_ORIGINS.test(e.origin) || typeof e.data !== "string") return;
    var msg; try { msg = JSON.parse(e.data); } catch (x) { return; }
    var state = msg && msg.info && typeof msg.info.playerState === "number" ? msg.info.playerState : null;
    if (state === null) return;
    d.querySelectorAll("iframe").forEach(function (f) {
      if (f.contentWindow !== e.source) return;
      var root = f.closest("[data-player-root]");
      if (!root) return;
      var playing = state === 1;
      root.classList.toggle("is-playing", playing);
      root.setAttribute("data-state", playing ? "playing" : "paused");
      var hero = root.closest(".hero");
      if (hero) hero.classList.toggle("is-playing", playing);
      var btn = root.querySelector("[data-play]");
      if (btn) setPlayLabel(btn, playing);
    });
  });
  var PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 4.5v15l13-7.5z"/></svg>';
  var PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true" style="margin:0"><path fill="currentColor" d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';
  function setPlayLabel(btn, playing) {
    var t = btn.getAttribute("data-title") || "track";
    btn.innerHTML = playing ? PAUSE : PLAY;
    btn.setAttribute("aria-label", (playing ? "Pause " : "Play ") + t);
  }

  /* hero player + any [data-player-root] with [data-play] */
  d.querySelectorAll("[data-player-root]").forEach(function (root) {
    var btn = root.querySelector("[data-play]");
    var screen = root.querySelector("[data-screen]");
    if (!btn || !screen) return;
    if (btn.tagName === "A") {
      btn.setAttribute("role", "button");
      btn.addEventListener("keydown", function (e) { if (e.key === " ") { e.preventDefault(); btn.click(); } });
    }
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      var frame = screen.querySelector("iframe");
      if (!frame) {
        screen.appendChild(ytFrame(btn.getAttribute("data-video"), btn.getAttribute("data-title")));
        root.classList.add("is-open");
        track("play_click", { track: btn.getAttribute("data-track-slug"), placement: btn.getAttribute("data-placement") });
        return;
      }
      ytCmd(frame, root.classList.contains("is-playing") ? "pauseVideo" : "playVideo");
    });
  });

  /* facades on track pages */
  d.querySelectorAll("[data-facade]").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      var box = btn.parentNode;
      var f = ytFrame(btn.getAttribute("data-video"), btn.getAttribute("data-title"));
      box.replaceChild(f, btn);
      f.focus();
      track("play_click", { track: btn.getAttribute("data-track-slug"), placement: btn.getAttribute("data-placement") || "track_page" });
    });
  });

  /* ---------- track grid: expand in place ---------- */
  var tiles = Array.prototype.slice.call(d.querySelectorAll("[data-tile]"));
  function closeTile(li, focusBtn) {
    if (!li.classList.contains("is-open")) return;
    li.classList.remove("is-open", "is-playing");
    var btn = li.querySelector("[data-expand]");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-label", "Play " + btn.getAttribute("data-title") + " here");
    btn.innerHTML = PLAY;
    var scr = li.querySelector("[data-screen]");
    if (scr) scr.innerHTML = "";
    var panel = d.getElementById(btn.getAttribute("aria-controls"));
    if (panel) panel.hidden = true;
    if (focusBtn) btn.focus();
  }
  tiles.forEach(function (li) {
    var btn = li.querySelector("[data-expand]");
    var panel = d.getElementById(btn.getAttribute("aria-controls"));
    btn.hidden = false;
    btn.addEventListener("click", function () {
      if (li.classList.contains("is-open")) { closeTile(li, false); return; }
      tiles.forEach(function (o) { if (o !== li) closeTile(o, false); });
      li.classList.add("is-open");
      panel.hidden = false;
      btn.setAttribute("aria-expanded", "true");
      btn.setAttribute("aria-label", "Close " + btn.getAttribute("data-title") + " player");
      btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" style="margin:0"><path fill="currentColor" d="M5.6 4.2 12 10.6l6.4-6.4 1.4 1.4-6.4 6.4 6.4 6.4-1.4 1.4-6.4-6.4-6.4 6.4-1.4-1.4 6.4-6.4-6.4-6.4z"/></svg>';
      var scr = li.querySelector("[data-screen]");
      scr.appendChild(ytFrame(btn.getAttribute("data-video"), btn.getAttribute("data-title")));
      track("tile_expand", { track: btn.getAttribute("data-track-slug"), placement: "grid" });
      var reduce = w.matchMedia && w.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setTimeout(function () { li.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" }); }, 30);
    });
    var close = li.querySelector("[data-close]");
    if (close) close.addEventListener("click", function () { closeTile(li, true); });
    li.addEventListener("keydown", function (e) { if (e.key === "Escape") closeTile(li, true); });
  });

  /* ---------- stream chooser sheet ---------- */
  var sheet = d.getElementById("stream-sheet"), scrim = d.querySelector(".scrim"), lastFocus = null;
  function openSheet(trigger) {
    if (!sheet) return false;
    lastFocus = trigger;
    sheet.hidden = false;
    // force reflow so the transition runs
    void sheet.offsetWidth;
    sheet.classList.add("is-open"); scrim.classList.add("is-open");
    d.querySelectorAll("[data-stream-open]").forEach(function (b) { b.setAttribute("aria-expanded", "true"); });
    var first = sheet.querySelector("a,button"); if (first) first.focus();
    track("stream_open", { placement: trigger.getAttribute("data-placement") });
    return true;
  }
  function closeSheet() {
    if (!sheet || !sheet.classList.contains("is-open")) return;
    sheet.classList.remove("is-open"); scrim.classList.remove("is-open");
    d.querySelectorAll("[data-stream-open]").forEach(function (b) { b.setAttribute("aria-expanded", "false"); });
    setTimeout(function () { if (!sheet.classList.contains("is-open")) sheet.hidden = true; }, 300);
    if (lastFocus) lastFocus.focus();
  }
  d.querySelectorAll("[data-stream-open]").forEach(function (b) {
    b.setAttribute("aria-haspopup", "dialog"); b.setAttribute("aria-expanded", "false");
    b.setAttribute("aria-controls", "stream-sheet");
    b.addEventListener("click", function (e) { if (openSheet(b)) e.preventDefault(); });
  });
  if (sheet) {
    sheet.querySelector("[data-sheet-close]").addEventListener("click", closeSheet);
    scrim.addEventListener("click", closeSheet);
    d.addEventListener("keydown", function (e) {
      if (!sheet.classList.contains("is-open")) return;
      if (e.key === "Escape") closeSheet();
      if (e.key === "Tab") { // simple focus trap
        var f = sheet.querySelectorAll("a,button"), a = f[0], z = f[f.length - 1];
        if (e.shiftKey && d.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && d.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    });
  }

  /* ---------- hero quick-join toggle ---------- */
  d.querySelectorAll("[data-join-open]").forEach(function (b) {
    var box = d.getElementById(b.getAttribute("data-join-open"));
    if (!box) return;
    b.setAttribute("aria-expanded", "false"); b.setAttribute("aria-controls", box.id);
    b.addEventListener("click", function (e) {
      e.preventDefault();
      var open = box.hidden;
      box.hidden = !open;
      b.setAttribute("aria-expanded", String(open));
      if (open) { var i = box.querySelector("input[type=email]"); if (i) i.focus(); track("join_open", { placement: "hero" }); }
    });
  });

  /* ---------- forms: honest status, no fake success ---------- */
  function encode(fd) {
    var out = [];
    fd.forEach(function (v, k) { out.push(encodeURIComponent(k) + "=" + encodeURIComponent(v)); });
    return out.join("&");
  }
  function setStatus(form, state, html) {
    var s = form.querySelector("[data-status]");
    if (!s) return;
    s.setAttribute("data-state", state);
    s.innerHTML = html;
  }
  d.querySelectorAll("form[data-form]").forEach(function (form) {
    var kind = form.getAttribute("data-form"); // join | booking
    var check = function () {};
    var email = form.querySelector("input[name=email]");
    var phone = form.querySelector("input[name=phone]");
    if (kind === "join" && email && phone) {
      email.required = false; // with JS: email OR phone
      check = function () {
        var ok = email.value.trim() || phone.value.trim();
        email.setCustomValidity(ok ? "" : "Add an email or a phone number.");
        var digits = phone.value.replace(/\D/g, "");
        phone.setCustomValidity(phone.value.trim() && (digits.length < 10 || digits.length > 15) ? "Enter a full phone number with area code." : "");
      };
      ["input", "change"].forEach(function (ev) { email.addEventListener(ev, check); phone.addEventListener(ev, check); }); check();
    }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      check();
      if (!form.reportValidity()) return;
      var btn = form.querySelector("button[type=submit]");
      var fd = new FormData(form);
      if (fd.get("bot-field")) return; // honeypot
      btn.disabled = true;
      setStatus(form, "busy", "Sending…");
      var mode = CFG.formsMode || "netlify";
      var req;
      if (mode === "function") {
        var obj = {}; fd.forEach(function (v, k) { obj[k] = v; });
        req = fetch(kind === "join" ? CFG.joinFunction : CFG.bookingFunction, {
          method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(obj)
        });
      } else {
        req = fetch("/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: encode(fd) });
      }
      req.then(function (res) {
        if (res.ok) return res;
        var err = new Error("HTTP " + res.status); err.status = res.status; throw err;
      }).then(function () {
        track(kind + "_submit", { result: "ok", placement: fd.get("placement") || undefined });
        form.reset();
        if (kind === "join") {
          setStatus(form, "ok", CFG.rewardUrl
            ? 'You\u2019re on the list. <a href="' + CFG.rewardUrl + '" data-track="reward_open">Here\u2019s ' + CFG.rewardLabel + "</a>."
            : "You\u2019re on the list. The unreleased drop isn\u2019t posted yet \u2014 it goes to this list first.");
        } else {
          setStatus(form, "ok", "Got it. I\u2019ll get back to you.");
        }
      }).catch(function (err) {
        track(kind + "_submit", { result: "error", status: err.status || 0 });
        var local = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname) || location.protocol === "file:";
        var msg = local || err.status === 404 || err.status === 405 || err.status === 501
          ? "Not sent. The form backend isn\u2019t connected on this host (local preview or non-Netlify host)."
          : "Not sent \u2014 something went wrong. Try again, or DM " + (CFG.instagramHandle || "on Instagram") + ".";
        setStatus(form, "err", msg);
      }).then(function () { btn.disabled = false; });
    });
  });

  /* ---------- chair-to-mic rail controls ---------- */
  d.querySelectorAll("[data-rail]").forEach(function (rail) {
    var ctl = d.querySelector('[data-rail-ctl="' + rail.id + '"]');
    if (!ctl) return;
    ctl.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-dir]"); if (!b) return;
      var card = rail.querySelector(".card");
      var step = card ? card.getBoundingClientRect().width + 12 : 300;
      rail.scrollBy({ left: step * Number(b.getAttribute("data-dir")), behavior: "smooth" });
    });
  });
})();
