/*
 * ジン在庫カタログ：検索・絞り込み・一覧描画。
 * CSP（script-src 'self'）下で動くよう、すべて外部ファイル。インラインJSは使わない。
 */
(function () {
  "use strict";

  var GINS = [];          // 全データ
  var els = {};           // DOM参照

  // ---- ユーティリティ ----
  function $(id) { return document.getElementById(id); }

  // XSS対策：外部由来テキストは必ずエスケープして描画
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function abvLabel(g) {
    return g.abv == null ? "—" : (String(g.abv).replace(/\.0$/, "") + "%");
  }

  // 度数帯フィルタの判定
  function inAbvBand(abv, band) {
    if (!band) return true;
    if (abv == null) return false;
    if (band === "lt40") return abv < 40;
    if (band === "40-44") return abv >= 40 && abv < 45;
    if (band === "45-49") return abv >= 45 && abv < 50;
    if (band === "ge50") return abv >= 50;
    return true;
  }

  // ---- フィルタ用セレクトの中身を作る ----
  function buildOptions() {
    // 国（大分類）を件数つきで
    var byCountry = {};
    GINS.forEach(function (g) {
      byCountry[g.country_main] = (byCountry[g.country_main] || 0) + 1;
    });

    var countries = Object.keys(byCountry).sort(function (a, b) {
      return byCountry[b] - byCountry[a]; // 多い順
    });
    var optsC = ['<option value="">すべての国（' + GINS.length + "）</option>"];
    countries.forEach(function (c) {
      optsC.push('<option value="' + esc(c) + '">' + esc(c) + "（" + byCountry[c] + "）</option>");
    });
    els.country.innerHTML = optsC.join("");
  }

  // ---- 現在の条件で絞り込み＋並び替え ----
  function currentList() {
    var q = els.q.value.trim().toLowerCase();
    var fc = els.country.value;
    var fa = els.abv.value;
    var sort = els.sort.value;

    var out = GINS.filter(function (g) {
      if (fc && g.country_main !== fc) return false;
      if (!inAbvBand(g.abv, fa)) return false;
      if (q) {
        var hay = (g.name + " " + g.kana + " " + g.country + " " +
                   g.botanicals + " " + g.note).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    out.sort(function (a, b) {
      if (sort === "abv-desc") return (b.abv || -1) - (a.abv || -1);
      if (sort === "abv-asc")  return (a.abv == null ? 999 : a.abv) - (b.abv == null ? 999 : b.abv);
      if (sort === "country") {
        var c = (a.country_main).localeCompare(b.country_main, "ja");
        return c !== 0 ? c : (a.kana || a.name).localeCompare(b.kana || b.name, "ja");
      }
      return (a.kana || a.name).localeCompare(b.kana || b.name, "ja"); // kana
    });
    return out;
  }

  // ---- 1件のカードHTML ----
  function cardHTML(g, idx) {
    var badges =
      '<span class="badge badge-country">' + esc(g.country_main) + "</span>" +
      '<span class="badge badge-abv">' + abvLabel(g) + "</span>";

    var sub = g.country && g.country !== g.country_main
      ? '<p class="gin-sub">' + esc(g.country) + "</p>" : "";

    var bot = g.botanicals
      ? '<div class="detail-block"><span class="detail-label">ボタニカル</span><p>' + esc(g.botanicals) + "</p></div>"
      : "";
    var note = g.note
      ? '<div class="detail-block"><span class="detail-label">メモ</span><p>' + esc(g.note) + "</p></div>"
      : '<div class="detail-block"><p class="muted-text">（説明メモは未登録）</p></div>';

    return (
      '<article class="gin-card" data-idx="' + idx + '">' +
        '<button type="button" class="gin-head" aria-expanded="false">' +
          '<div class="gin-title">' +
            "<h2>" + esc(g.name) + "</h2>" +
            (g.kana ? '<p class="gin-kana">' + esc(g.kana) + "</p>" : "") +
            sub +
          "</div>" +
          '<div class="gin-badges">' + badges + "</div>" +
        "</button>" +
        '<div class="gin-detail" hidden>' + bot + note + "</div>" +
      "</article>"
    );
  }

  // ---- 一覧を描画 ----
  function render() {
    var list = currentList();
    els.count.textContent = "全" + GINS.length + "銘柄中　" + list.length + "件を表示";

    if (!list.length) {
      els.list.innerHTML = '<div class="empty">該当する銘柄がありません。条件を変えるか「条件をクリア」を押してください。</div>';
      return;
    }
    var html = "";
    for (var i = 0; i < list.length; i++) html += cardHTML(list[i], i);
    els.list.innerHTML = html;
  }

  // ---- カード開閉（イベント委譲）----
  function onListClick(e) {
    var head = e.target.closest(".gin-head");
    if (!head) return;
    var card = head.closest(".gin-card");
    var detail = card.querySelector(".gin-detail");
    var open = head.getAttribute("aria-expanded") === "true";
    head.setAttribute("aria-expanded", open ? "false" : "true");
    detail.hidden = open;
    card.classList.toggle("open", !open);
  }

  function resetAll() {
    els.q.value = "";
    els.country.value = "";
    els.abv.value = "";
    els.sort.value = "kana";
    render();
  }

  // ---- 起動 ----
  function init() {
    els = {
      q: $("q"), country: $("f-country"),
      abv: $("f-abv"), sort: $("f-sort"), count: $("result-count"),
      list: $("list"), reset: $("reset"), meta: $("data-meta"),
    };

    fetch("gins.json", { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        GINS = (data && data.gins) || [];
        if (els.meta && data.updated) {
          els.meta.textContent = "在庫 " + GINS.length + "銘柄／更新 " + data.updated;
        }
        buildOptions();
        render();

        ["input", "change"].forEach(function (ev) {
          els.q.addEventListener(ev, render);
        });
        [els.country, els.abv, els.sort].forEach(function (s) {
          s.addEventListener("change", render);
        });
        els.reset.addEventListener("click", resetAll);
        els.list.addEventListener("click", onListClick);
      })
      .catch(function (err) {
        els.count.textContent = "";
        els.list.innerHTML =
          '<div class="empty">データの読み込みに失敗しました（' + esc(err.message) +
          "）。<br />ファイルを直接開いた場合は、ローカルサーバー経由で開いてください。</div>";
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
