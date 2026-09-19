// Testy czystych funkcji mostka /get/ (v2, 2026-09-19). Uruchom: node --test get/bridge.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const B = require("./bridge.js");

// Prawdziwe ksztalty UA przegladarek wbudowanych Meta (Android WebView + iOS WKWebView).
const UA = {
  fb4a: "Mozilla/5.0 (Linux; Android 14; SM-S911B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.6613.127 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0.0.40.109;]",
  messengerAndroid: "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/AP2A.240805.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.6613.127 Mobile Safari/537.36 [FB_IAB/Orca-Android;FBAV/475.0.0.43.109;]",
  instagramAndroid: "Mozilla/5.0 (Linux; Android 14; SM-A546B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.6613.127 Mobile Safari/537.36 Instagram 349.0.0.39.106 Android (34/14; 450dpi; 1080x2340; samsung; SM-A546B; a54x; s5e8835; en_US; 638396842)",
  threadsAndroid: "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240805.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.6613.127 Mobile Safari/537.36 Barcelona 349.0.0.29.109 Android (34/14; 420dpi; 1080x2400; Google/google; Pixel 8; shiba; shiba; en_US; 638336532)",
  chromeAndroid: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36",
  samsung: "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1",
  iphoneFacebook: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0.0.35.108;FBBV/650000000;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/17.6;FBSS/3;FBID/phone;FBLC/en_US;FBOP/5]",
  iphoneMessenger: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/MessengerForiOS;FBAV/475.0.0.37.106;FBBV/640000000;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/17.6;FBSS/3;FBID/phone;FBLC/en_US;FBOP/5]",
  desktop: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  fbCrawler: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
};

test("classify: przegladarki wbudowane Meta na Androidzie", () => {
  assert.deepEqual(B.classify(UA.fb4a), { os: "android", browser: "facebook", inApp: true, bot: false });
  assert.deepEqual(B.classify(UA.messengerAndroid), { os: "android", browser: "messenger", inApp: true, bot: false });
  assert.deepEqual(B.classify(UA.instagramAndroid), { os: "android", browser: "instagram", inApp: true, bot: false });
  assert.deepEqual(B.classify(UA.threadsAndroid), { os: "android", browser: "threads", inApp: true, bot: false });
});

test("classify: zwykle przegladarki i iOS", () => {
  assert.deepEqual(B.classify(UA.chromeAndroid), { os: "android", browser: "chrome", inApp: false, bot: false });
  assert.deepEqual(B.classify(UA.samsung), { os: "android", browser: "samsung", inApp: false, bot: false });
  assert.deepEqual(B.classify(UA.iphoneSafari), { os: "ios", browser: "safari", inApp: false, bot: false });
  assert.deepEqual(B.classify(UA.iphoneFacebook), { os: "ios", browser: "facebook", inApp: true, bot: false });
  assert.deepEqual(B.classify(UA.iphoneMessenger), { os: "ios", browser: "messenger", inApp: true, bot: false });
  assert.deepEqual(B.classify(UA.desktop), { os: "other", browser: "chrome", inApp: false, bot: false });
});

test("classify: crawler podgladu Meta to bot, przegladarki Meta nie", () => {
  assert.equal(B.classify(UA.fbCrawler).bot, true);
  for (const k of ["fb4a", "messengerAndroid", "instagramAndroid", "threadsAndroid", "iphoneFacebook"]) {
    assert.equal(B.classify(UA[k]).bot, false, k);
  }
});

test("parseParams: kampania, zrodlo, fbclid tylko jako flaga", () => {
  assert.deepEqual(B.parseParams("?c=EN_K1&fbclid=IwAR0abc"), { c: "EN_K1", s: "meta", hasFbclid: true });
  assert.deepEqual(B.parseParams(""), { c: "meta", s: "meta", hasFbclid: false });
  assert.deepEqual(B.parseParams("?c=%3Cscript%3E&s=x%20y"), { c: "script", s: "xy", hasFbclid: false });
  assert.equal(B.parseParams("?c=" + "A".repeat(100)).c.length, 60);
});

test("targets: Android — Play https z referrerem jak w v1 + market:// zapasowo", () => {
  const t = B.targets("android", { c: "EN_K1", s: "meta" });
  const ref = "utm_source%3Dmeta%26utm_medium%3Dpaid%26utm_campaign%3DEN_K1";
  assert.equal(t.primary, "https://play.google.com/store/apps/details?id=com.ktomaracje.app&referrer=" + ref);
  assert.equal(t.auto, t.primary);
  assert.equal(t.secondary, "market://details?id=com.ktomaracje.app&referrer=" + ref);
  assert.equal(t.store, "play");
});

test("targets: iOS — App Store; desktop — bez automatycznego przekierowania", () => {
  const ios = B.targets("ios", { c: "EN_K1", s: "meta" });
  assert.equal(ios.primary, "https://apps.apple.com/app/id6769119268");
  assert.equal(ios.auto, ios.primary);
  assert.equal(ios.store, "appstore");
  assert.equal(ios.secondary, null);
  const other = B.targets("other", { c: "EN_K1", s: "meta" });
  assert.equal(other.auto, null);
  assert.equal(other.secondary, "https://apps.apple.com/app/id6769119268");
});

test("buildEvent: anonimowe, bez profilu osoby, bez fbclid i pelnego URL", () => {
  const ctx = { c: "EN_K1", s: "meta", hasFbclid: true, os: "android", browser: "facebook", inApp: true, bot: false, lang: "en-US", tz: "America/Chicago" };
  const ev = B.buildEvent("bridge_view", { step: 1 }, ctx, "did-123", new Date("2026-09-19T12:00:00Z"));
  assert.match(ev.api_key, /^phc_/);
  assert.equal(ev.event, "bridge_view");
  assert.equal(ev.distinct_id, "did-123");
  assert.equal(ev.timestamp, "2026-09-19T12:00:00.000Z");
  assert.equal(ev.properties.$process_person_profile, false);
  assert.equal(ev.properties.bridge_version, 2);
  assert.equal(ev.properties.c, "EN_K1");
  assert.equal(ev.properties.browser, "facebook");
  assert.equal(ev.properties.has_fbclid, true);
  assert.equal(ev.properties.step, 1);
  const json = JSON.stringify(ev);
  assert.ok(!json.includes("IwAR"), "wartosc fbclid nie moze trafic do zdarzenia");
  assert.ok(!("$current_url" in ev.properties), "bez pelnego URL (fbclid w query)");
});
