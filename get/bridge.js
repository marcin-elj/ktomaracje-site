/* Mostek Meta Ads -> sklep, v2 (2026-09-19).
 *
 * v1 przekierowywal JS-em z timera i niczego nie mierzyl: 270 klikniec z reklam (14-18.09)
 * dalo zero instalacji, a nie dalo sie ustalic, na ktorym kroku ludzie odpadaja. Test na
 * telefonie pokazal, ze w przegladarce Messengera/Instagrama bez dotkniecia nic sie nie dzieje.
 *
 * v2 = te same adresy sklepu i ten sam referrer UTM co v1 + widoczny przycisk + anonimowy
 * pomiar krokow. Pomiar: PostHog (projekt z anonymize_ips = true), bez ciasteczek, bez zapisu
 * w przegladarce, bez profilu osoby ($process_person_profile: false), losowy identyfikator na
 * jedno wyswietlenie strony. Do zdarzen NIE trafia wartosc fbclid ani pelny adres strony.
 *
 * Kroki (zdarzenia): bridge_view -> bridge_auto_redirect | bridge_tap -> bridge_hidden
 * (przegladarka zeszla w tlo = sklep przejal ekran) | bridge_unload (strona WWW sklepu zaladowala
 * sie w tej samej przegladarce) | bridge_stuck (2,5 s widoczna bez postepu) -> bridge_return.
 *
 * Czyste funkcje sa testowane w bridge.test.mjs:  node --test get/bridge.test.mjs
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.KMRBridge = api;
})(typeof self !== "undefined" ? self : this, function () {
  var PKG = "com.ktomaracje.app";
  var APPSTORE = "https://apps.apple.com/app/id6769119268";
  var POSTHOG_KEY = "phc_mgCYkAF8CTPmuMZpNySShEqiGe2qZ4VKDjR2nevkwUPt";
  var POSTHOG_URL = "https://eu.i.posthog.com/i/v0/e/";
  var BOT_RE = /bot|crawl|facebookexternalhit|facebot|preview|spider/i;

  function clean(value, fallback, max) {
    var s = String(value == null ? "" : value).replace(/[^A-Za-z0-9_.-]/g, "").slice(0, max);
    return s || fallback;
  }

  function parseParams(search) {
    var q = new URLSearchParams(search || "");
    return { c: clean(q.get("c"), "meta", 60), s: clean(q.get("s"), "meta", 30), hasFbclid: q.has("fbclid") };
  }

  function classify(ua) {
    ua = String(ua || "");
    var os = /iPhone|iPad|iPod/i.test(ua) ? "ios" : /Android/i.test(ua) ? "android" : "other";
    var browser;
    if (/Orca-Android|MessengerForiOS|MessengerLiteForiOS/i.test(ua)) browser = "messenger";
    else if (/FB_IAB|FBAN\/|FBAV\//i.test(ua)) browser = "facebook";
    else if (/Instagram/i.test(ua)) browser = "instagram";
    else if (/Barcelona/i.test(ua)) browser = "threads";
    else if (/SamsungBrowser/i.test(ua)) browser = "samsung";
    else if (/CriOS|Chrome\//i.test(ua)) browser = "chrome";
    else if (/Safari\//i.test(ua)) browser = "safari";
    else browser = "other";
    var inApp = browser === "facebook" || browser === "messenger" || browser === "instagram" || browser === "threads";
    return { os: os, browser: browser, inApp: inApp, bot: BOT_RE.test(ua) };
  }

  function targets(os, p) {
    var ref = encodeURIComponent("utm_source=" + p.s + "&utm_medium=paid&utm_campaign=" + p.c);
    var play = "https://play.google.com/store/apps/details?id=" + PKG + "&referrer=" + ref;
    if (os === "ios") return { store: "appstore", primary: APPSTORE, auto: APPSTORE, secondary: null };
    if (os === "android") {
      return { store: "play", primary: play, auto: play, secondary: "market://details?id=" + PKG + "&referrer=" + ref };
    }
    return { store: "play", primary: play, auto: null, secondary: APPSTORE };
  }

  function buildEvent(name, props, ctx, distinctId, now) {
    var properties = {
      $process_person_profile: false,
      $lib: "kmr-bridge",
      bridge_version: 2,
      distinct_id: distinctId,
      c: ctx.c,
      s: ctx.s,
      has_fbclid: !!ctx.hasFbclid,
      os: ctx.os,
      browser: ctx.browser,
      in_app: !!ctx.inApp,
      bot: !!ctx.bot,
      lang: ctx.lang || null,
      tz: ctx.tz || null,
    };
    for (var k in props) {
      if (Object.prototype.hasOwnProperty.call(props, k)) properties[k] = props[k];
    }
    return {
      api_key: POSTHOG_KEY,
      event: name,
      distinct_id: distinctId,
      properties: properties,
      timestamp: (now || new Date()).toISOString(),
    };
  }

  function randomId() {
    try {
      if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    } catch (e) { /* stare WebView */ }
    return "b-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function timeZone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch (e) { return null; }
  }

  // Podpiecie do strony (przegladarka). Nie jest testowane jednostkowo — logika decyzji siedzi wyzej.
  function run(win) {
    var doc = win.document;
    var nav = win.navigator;
    var p = parseParams(win.location.search);
    var cls = classify(nav.userAgent);
    var ctx = {
      c: p.c, s: p.s, hasFbclid: p.hasFbclid,
      os: cls.os, browser: cls.browser, inApp: cls.inApp, bot: cls.bot,
      lang: nav.language || null, tz: timeZone(),
    };
    var t = targets(cls.os, p);
    var did = randomId();
    var t0 = Date.now();
    var state = { last: "none", tapped: false, hidden: false, returned: false };

    function send(name, extra) {
      var props = { ms: Date.now() - t0, after: state.last };
      for (var k in extra || {}) props[k] = extra[k];
      var body = JSON.stringify(buildEvent(name, props, ctx, did));
      try {
        if (nav.sendBeacon && nav.sendBeacon(POSTHOG_URL, body)) return;
      } catch (e) { /* przejdz do fetch */ }
      try {
        win.fetch(POSTHOG_URL, { method: "POST", body: body, keepalive: true, mode: "no-cors", headers: { "Content-Type": "text/plain" } });
      } catch (e) { /* pomiar nigdy nie blokuje przejscia do sklepu */ }
    }

    var primary = doc.getElementById("go");
    var secondary = doc.getElementById("alt");
    var status = doc.getElementById("status");

    primary.href = t.primary;
    primary.textContent = t.store === "appstore" ? "Download on the App Store" : "Open in Google Play";
    if (t.secondary) {
      secondary.href = t.secondary;
      secondary.textContent = cls.os === "android" ? "Store didn't open? Try the Play Store app" : "On iPhone? Get it on the App Store";
      secondary.hidden = false;
    }

    primary.addEventListener("click", function () {
      state.last = "tap_primary"; state.tapped = true;
      send("bridge_tap", { target: "primary", store: t.store });
    });
    secondary.addEventListener("click", function () {
      state.last = "tap_secondary"; state.tapped = true;
      send("bridge_tap", { target: "secondary" });
    });

    function welcomeBack(via) {
      if (state.returned) return;
      state.returned = true;
      send("bridge_return", { via: via });
      status.textContent = "Welcome back — tap the button to get the app.";
    }
    doc.addEventListener("visibilitychange", function () {
      if (doc.visibilityState === "hidden") {
        state.hidden = true;
        send("bridge_hidden");
      } else if (state.hidden) {
        welcomeBack("visibility");
      }
    });
    win.addEventListener("pagehide", function () { send("bridge_unload"); });
    win.addEventListener("pageshow", function (e) { if (e.persisted) welcomeBack("bfcache"); });

    send("bridge_view", { has_auto: !!t.auto });
    if (cls.bot) return; // podglad linku (crawler Meta): bez przekierowania, jak w v1

    if (t.auto) {
      status.textContent = t.store === "appstore" ? "Opening the App Store…" : "Opening Google Play…";
      win.setTimeout(function () {
        state.last = "auto";
        send("bridge_auto_redirect");
        win.location.replace(t.auto);
      }, 400);
    } else {
      status.textContent = "Get the app:";
    }

    win.setTimeout(function () {
      if (doc.visibilityState === "visible" && !state.tapped && !state.hidden) {
        status.textContent = "Nothing happened? Tap the button below.";
        primary.className += " pulse";
        send("bridge_stuck");
      }
    }, 2500);
  }

  return {
    classify: classify,
    parseParams: parseParams,
    targets: targets,
    buildEvent: buildEvent,
    run: run,
    POSTHOG_URL: POSTHOG_URL,
    APPSTORE: APPSTORE,
  };
});
