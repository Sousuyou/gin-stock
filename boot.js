/*
 * 起動スクリプト（CSP対応の手本）。
 * CSP（script-src 'self'）ではインライン<script>が動かないため、起動処理は必ず外部ファイルに置く。
 * アプリ独自の処理もこのファイル、または別の.jsに分けて読み込むこと。
 */
(function () {
  "use strict";

  var APP_BOOT_VERSION = "20260627-cache-reset-v2";
  var VERSION_KEY = "soutsu_gin_catalog_boot_version";
  var isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";

  function clearOldCaches() {
    if (!("caches" in window)) return Promise.resolve();
    return caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (key) {
        return /^gin-stock-v/.test(key);
      }).map(function (key) { return caches.delete(key); }));
    });
  }

  // Service Worker 登録（アプリ化・オフライン対応）
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      var seen = localStorage.getItem(VERSION_KEY);
      if (isLocal && seen !== APP_BOOT_VERSION) {
        Promise.all([
          navigator.serviceWorker.getRegistrations().then(function (registrations) {
            return Promise.all(registrations.map(function (registration) {
              return registration.unregister();
            }));
          }),
          clearOldCaches()
        ]).then(function () {
          localStorage.setItem(VERSION_KEY, APP_BOOT_VERSION);
          location.replace(location.pathname + "?v=" + encodeURIComponent(APP_BOOT_VERSION));
        }).catch(function () {
          localStorage.setItem(VERSION_KEY, APP_BOOT_VERSION);
        });
        return;
      }

      navigator.serviceWorker.register("service-worker.js?v=" + encodeURIComponent(APP_BOOT_VERSION)).catch(function () {});
    });
  }
})();
