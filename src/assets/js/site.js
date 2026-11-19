/* BarberRome — progressive enhancement. Site works without this file:
   links go to track pages / anchors, forms post natively to Netlify. */
(function () {
  "use strict";
  var d = document, w = window;
  var BGM = null; // background loop controller (set below when the home page has one)
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
      if (playing && BGM) BGM.yield();
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
      check();
      if ((CFG.formsMode || "netlify") === "formsubmit") {
        // Native POST to FormSubmit (spam check + redirect to our thank-you page). Validate only.
        if (!form.reportValidity()) { e.preventDefault(); return; }
        track(kind + "_submit", { result: "sent_to_formsubmit", placement: form.querySelector("[name=placement]") ? form.querySelector("[name=placement]").value : undefined });
        return;
      }
      e.preventDefault();
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
        req = fetch((CFG.basePath || "") + "/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: encode(fd) });
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

  /* ---------- background music loop (home) ----------
     Autoplay with sound is blocked by most browsers until the visitor interacts, so: try play() on load;
     if that's refused, start on the first real gesture (tap/click/key). Scrolling is not a gesture.
     A visitor's pause/mute choice is remembered in localStorage. Video plays pause the loop. */
  (function () {
    var box = d.querySelector("[data-bgm]"); if (!box) return;
    var audio = box.querySelector("[data-bgm-audio]");
    var toggle = box.querySelector("[data-bgm-toggle]");
    var mute = box.querySelector("[data-bgm-mute]");
    var status = box.querySelector("[data-bgm-status]");
    var title = box.querySelector(".bgm__t").textContent;
    var KEY = "br-bgm", MKEY = "br-bgm-muted";
    function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function set(k, v) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }
    var GESTURES = ["pointerup", "pointerdown", "mousedown", "touchend", "keydown", "click"];
    var armed = false, yielded = false;
    var held = false, resumeAfter = false; // Game Tight handoff: mix paused for the intro video, resume after if it was on
    function ui() {
      var on = !audio.paused;
      box.classList.toggle("is-playing", on);
      toggle.setAttribute("aria-pressed", on ? "true" : "false");
      toggle.setAttribute("aria-label", (on ? "Pause " : "Play ") + title);
      status.textContent = on ? "Now playing" : (yielded ? "Paused for video" : "Tap to play");
      box.classList.toggle("is-muted", audio.muted);
      mute.setAttribute("aria-pressed", audio.muted ? "true" : "false");
      mute.setAttribute("aria-label", audio.muted ? "Unmute music" : "Mute music");
    }
    function start() {
      var p; try { p = audio.play(); } catch (e) { return Promise.reject(e); }
      return p && p.then ? p : Promise.resolve();
    }
    function disarm() { if (!armed) return; armed = false; GESTURES.forEach(function (t) { d.removeEventListener(t, onGesture, true); }); }
    function onGesture(e) {
      if (e.type === "keydown" && e.key === "Escape") return;
      if (box.contains(e.target)) { disarm(); return; }            // the player's own buttons handle themselves
      if (e.target.closest && e.target.closest("[data-play],[data-facade],[data-expand],[data-gt],iframe,video")) { if (!held) disarm(); return; } // they're starting a video
      if (held) { if (get(KEY) !== "paused") { resumeAfter = true; disarm(); } return; } // intro is playing: start the mix after it, not over it
      if (get(KEY) === "paused") { disarm(); return; }
      start().then(function () { disarm(); track("bgm_start", { via: "gesture" }); }).catch(function () {});
    }
    function arm() { if (armed) return; armed = true; GESTURES.forEach(function (t) { d.addEventListener(t, onGesture, { capture: true, passive: true }); }); }
    audio.muted = get(MKEY) === "1";
    if ("mediaSession" in navigator && w.MediaMetadata) {  // lock screen / control centre label
      try { navigator.mediaSession.metadata = new MediaMetadata({ title: title, artist: "BarberRome" }); } catch (e) {}
    }
    ["play", "pause", "volumechange"].forEach(function (t) { audio.addEventListener(t, ui); });
    audio.addEventListener("ended", function () { audio.currentTime = 0; start().catch(function () {}); }); // belt-and-braces for loop
    toggle.addEventListener("click", function () {
      yielded = false;
      if (audio.paused && held) { held = false; resumeAfter = false; try { d.dispatchEvent(new CustomEvent("br:bgm-userplay")); } catch (e) {} } // they chose the mix over the intro video
      else if (!audio.paused && held) { resumeAfter = false; }
      if (audio.paused) { set(KEY, null); disarm(); start().then(function () { track("bgm_start", { via: "button" }); }).catch(ui); }
      else { audio.pause(); set(KEY, "paused"); disarm(); track("bgm_pause", {}); }
    });
    mute.addEventListener("click", function () { audio.muted = !audio.muted; set(MKEY, audio.muted ? "1" : null); });
    // pause (without remembering it) when a video starts
    BGM = {
      yield: function () { if (!audio.paused) { yielded = true; audio.pause(); } disarm(); },
      // hold/release: the Game Tight intro takes over while it plays, then hands the mix back only if it was on before
      hold: function () {
        if (held) return; held = true;
        resumeAfter = !audio.paused;
        if (resumeAfter) { yielded = true; audio.pause(); }
        ui();
      },
      release: function () {
        if (!held) return; held = false;
        var again = resumeAfter; resumeAfter = false;
        if (again && get(KEY) !== "paused") {
          yielded = false;
          start().then(function () { track("bgm_start", { via: "after_intro" }); }).catch(function () { arm(); ui(); });
        } else ui();
      },
      isHeld: function () { return held; }
    };
    d.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest("[data-play],[data-facade]")) BGM.yield();
    }, true);
    // tuck away while typing on small screens so it never covers a field or submit button
    // never sit on top of a button or form field: slide out of the way while one is under it (or while typing on a phone)
    var AVOID = ".ctas .btn, [data-player-root] [data-play], [data-gt] .gt__frame, form input, form textarea, form select, form button";
    var typing = false, raf = 0;
    function place() {
      raf = 0;
      var x = box.offsetLeft - 8, y = box.offsetTop - 8, x2 = x + box.offsetWidth + 16, y2 = y + box.offsetHeight + 16; // offset* ignores the tuck transform
      var hit = typing;
      if (!hit) { var els = d.querySelectorAll(AVOID); for (var i = 0; i < els.length && !hit; i++) { var r = els[i].getBoundingClientRect(); hit = r.width > 0 && r.left < x2 && r.right > x && r.top < y2 && r.bottom > y; } }
      if (hit && box.contains(d.activeElement)) hit = typing;   // don't yank it away from a keyboard user mid-use
      box.classList.toggle("is-tucked", hit);
    }
    function queue() { if (!raf) raf = w.requestAnimationFrame(place); }
    w.addEventListener("scroll", queue, { passive: true }); w.addEventListener("resize", queue);
    d.addEventListener("focusin", function (e) { typing = w.innerWidth < 700 && e.target.matches("input,textarea,select"); queue(); });
    d.addEventListener("focusout", function () { typing = false; queue(); });
    w.addEventListener("load", queue); queue();
    ui();
    if (get(KEY) === "paused") return;              // they paused it before: leave it alone
    start().then(function () { track("bgm_start", { via: "autoplay" }); }).catch(function () { arm(); ui(); });
  })();

  /* ---------- Game Tight intro video (home, under the bio) ----------
     Scrolled into view -> pause the Show Mix and play the intro (with sound if the browser allows it; browsers
     only allow sound after the visitor has tapped/clicked the page, so otherwise it plays muted with a
     "Tap for sound" button). Finished, or scrolled out of view -> pause it and hand the Show Mix back, but only
     if the mix was playing before. Reduced motion: no autoplay; the native controls still work. */
  (function () {
    var fig = d.querySelector("[data-gt]"); if (!fig) return;
    var v = fig.querySelector("[data-gt-video]"), snd = fig.querySelector("[data-gt-sound]");
    var reduce = w.matchMedia && w.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var inView = false, done = false, userPaused = false, ours = false;
    function soundUI() { snd.hidden = !(v.muted && !v.paused); }
    function autoplay() {
      ours = true;
      v.muted = false;
      var p; try { p = v.play(); } catch (e) { p = Promise.reject(e); }
      return Promise.resolve(p).catch(function () {        // sound refused (no gesture yet): play muted instead
        v.muted = true;
        return v.play();
      }).then(function () { track("intro_play", { sound: !v.muted, via: "scroll" }); })
        .catch(function () { ours = false; soundUI(); });  // even muted autoplay refused: leave the poster + controls
    }
    function stop() { if (!v.paused) { ours = true; v.pause(); } }
    v.addEventListener("play", function () { if (BGM) BGM.hold(); soundUI(); });
    v.addEventListener("playing", function () { ours = false; });
    v.addEventListener("pause", function () {
      if (!v.ended && inView && !ours) userPaused = true;   // they paused it with the controls: don't fight them
      ours = false;
      if (BGM) BGM.release(); soundUI();
    });
    v.addEventListener("ended", function () { done = true; if (BGM) BGM.release(); soundUI(); track("intro_end", {}); });
    v.addEventListener("volumechange", soundUI);
    snd.addEventListener("click", function () {
      v.muted = false;
      if (v.paused) v.play().catch(function () {});
      soundUI(); track("intro_sound_on", {});
    });
    d.addEventListener("br:bgm-userplay", function () { userPaused = true; stop(); });
    w.brIntro = { video: v, state: function () { return { inView: inView, done: done, userPaused: userPaused }; } }; // for tests/debug
    if (!("IntersectionObserver" in w)) return;               // old browsers: plain video with controls
    new IntersectionObserver(function (entries) {
      var r = entries[entries.length - 1].intersectionRatio;
      if (r >= 0.5 && !inView) {
        inView = true;
        if (!done && !userPaused && !reduce) autoplay();
      } else if (r < 0.2 && inView) {
        inView = false; done = false; userPaused = false;   // next visit plays it again
        stop();
      }
    }, { threshold: [0, 0.2, 0.5, 0.75] }).observe(v);
  })();

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
