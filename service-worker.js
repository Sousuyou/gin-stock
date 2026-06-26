// Bar Soutsu ジン在庫カタログ Service Worker
// 方針: ページ本体(HTML)とデータ(.json/.js)は「ネットワーク優先」で常に最新を取得し、
//   オフライン時のみキャッシュを使う。画像は「キャッシュ優先」で高速表示。
var CACHE = "gin-stock-v61";
var ASSETS = [
  "./",
  "./index.html",
  "./staff.html",
  "./cache-reset.html",
  "./styles.css",
  "./app.js",
  "./boot.js",
  "./submit.js",
  "./gins.json",
  "./data/bottle_price_estimates_20260625.json",
  "./top/botanical-table/botanical-data.js",
  "./manifest.json",
  "./assets/icon.svg",
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  var accept = req.headers.get("accept") || "";
  var fresh =
    req.mode === "navigate" ||
    accept.indexOf("text/html") !== -1 ||
    /\.(json|js|css)$/.test(url.pathname);

  if (fresh) {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (r) { return r || caches.match("./index.html"); });
      })
    );
  } else {
    e.respondWith(
      caches.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
          return res;
        });
      })
    );
  }
});
