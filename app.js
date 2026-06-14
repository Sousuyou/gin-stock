/*
 * ジン在庫カタログ：検索・絞り込み・グリッド表示・頭文字ジャンプ・詳細モーダル。
 * CSP（script-src 'self'）下で動くよう、すべて外部ファイル。インラインJSは使わない。
 */
(function () {
  "use strict";

  var GINS = [];
  var els = {};
  var currentInitial = ""; // 頭文字フィルタ（""=すべて）

  // 申請箱（Supabase）から「仮登録」を読み込んで一緒に表示するための設定。
  // ここで使うのは公開してよい publishable(anon) キー。閲覧できるのは pending/approved の表示用列だけ（RLSで限定）。
  var SUPABASE_URL = "https://ypruajtzzfvfhgcirrsv.supabase.co";
  var SUPABASE_KEY = "sb_publishable_eP6BBO6u2M4iTNkK_jjULA_94qadrt1";
  var SUB_TABLE = "gin_submissions";

  // お気に入り（★）：この端末のブラウザに保存（localStorage）。銘柄名をキーにする。
  var FAV_KEY = "soutsu_gin_favs";
  var favs = loadFavs();   // 登録済み銘柄名のSet
  var favOnly = false;     // 「お気に入りだけ表示」中か
  var modalGin = null;     // 現在モーダルで開いている銘柄
  var STAR_SVG = '<svg class="star-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 17.3l-5.4 3 1.2-6L3.3 9.9l6.1-.7L12 3.6l2.6 5.6 6.1.7-4.5 4.4 1.2 6z"/></svg>';

  function $(id) { return document.getElementById(id); }

  // XSS対策：外部由来テキストは必ずエスケープ
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // 重複判定キー：全半角を揃え(NFKC)、連続空白を畳んで小文字化（submit.js / promote_pending.py と同方針）
  function normName(s) {
    return String(s == null ? "" : s).normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
  }

  // 検索用の正規化：全半角を揃え(NFKC)＋英字小文字化＋カタカナ→ひらがな統一（かな表記ゆれを吸収）
  function normSearch(s) {
    s = String(s == null ? "" : s).normalize("NFKC").toLowerCase();
    return s.replace(/[ァ-ヶ]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) - 0x60); // カタカナ→ひらがな
    });
  }
  // 検索対象テキスト（名前＋カナ＋産地＋ボタニカル＋メモ）を正規化してまとめる
  function buildHay(g) {
    return normSearch((g.name || "") + " " + (g.kana || "") + " " + (g.country || "") +
      " " + (g.botanicals || "") + " " + (g.note || ""));
  }

  // ---- お気に入り（localStorage。file://や無効化環境でも落ちないようtry-catch）----
  function loadFavs() {
    try {
      var raw = window.localStorage.getItem(FAV_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr : []);
    } catch (e) { return new Set(); }
  }
  function saveFavs() {
    try { window.localStorage.setItem(FAV_KEY, JSON.stringify(Array.from(favs))); } catch (e) {}
  }
  function isFav(g) { return favs.has(g.name); }
  function toggleFav(name) {
    if (!name) return;
    if (favs.has(name)) favs.delete(name); else favs.add(name);
    saveFavs();
  }

  function abvLabel(g) {
    return (g.abv == null || isNaN(g.abv)) ? "—" : (String(g.abv).replace(/\.0$/, "") + "%");
  }

  // 情報の確からしさタグ：仮登録＝店員申請の未確認／情報怪＝出典あいまいな既存銘柄
  function flagBadge(g) {
    if (g._provisional) return '<span class="badge badge-provisional">仮登録</span>';
    if (g.unverified) return '<span class="badge badge-unverified">情報怪</span>';
    return "";
  }
  function flagBanner(g) {
    if (g._provisional) return '<div class="prov-banner">店員による<b>仮登録</b>です。内容は未確認で、オーナーの確認後に正式登録されます。</div>';
    if (g.unverified) return '<div class="unverified-banner">情報が不透明な銘柄です。ボタニカル等が公式に確認できていません（メーカー非公開／要確認）。</div>';
    return "";
  }

  function inAbvBand(abv, band) {
    if (!band) return true;
    if (abv == null) return false;
    if (band === "lt40") return abv < 40;
    if (band === "40-44") return abv >= 40 && abv < 45;
    if (band === "45-49") return abv >= 45 && abv < 50;
    if (band === "ge50") return abv >= 50;
    return true;
  }

  // ---- ボタニカルの絞り込み用：表記ゆれを代表名にまとめる ----
  // 例：「ジュニパー」も「ジュニパーベリー」も同じ＝代表名「ジュニパー」に寄せる。
  var BOT_SYN = {
    "ジュニパー": ["ジュニパー", "ジュニパーベリー", "ねずの実", "ネズの実", "杜松"],
    "コリアンダー": ["コリアンダー", "コリアンダーシード", "コエンドロ"],
    "アンジェリカ": ["アンジェリカ", "アンジェリカルート", "アンジェリカシード", "セイヨウトウキ"],
    "リコリス": ["リコリス", "リコリスルート", "甘草", "カンゾウ"],
    "オリスルート": ["オリス", "オリスルート", "アイリスルート"],
    "レモンピール": ["レモンピール", "レモン", "レモンの皮", "レモン果皮"],
    "オレンジピール": ["オレンジピール", "オレンジ", "オレンジの皮", "ビターオレンジ", "スイートオレンジ", "ビターオレンジピール", "スイートオレンジピール", "ビターオレンジの皮"],
    "カルダモン": ["カルダモン", "カルダモンシード", "グリーンカルダモン"],
    "シナモン": ["シナモン", "シナモンバーク", "セイロンシナモン"],
    "カッシア": ["カッシア", "カッシアバーク", "カシア", "カシアバーク", "桂皮"],
    "アニス": ["アニス", "アニスシード"],
    "ジンジャー": ["ジンジャー", "生姜", "しょうが", "ショウガ"],
    "柚子": ["柚子", "ゆず", "ユズ", "木頭柚子"],
    "山椒": ["山椒", "サンショウ", "さんしょう"],
    "ナツメグ": ["ナツメグ", "ニクズク"],
    "クローブ": ["クローブ", "丁子", "チョウジ"],
    "フェンネル": ["フェンネル", "ウイキョウ"],
    "エルダーフラワー": ["エルダーフラワー", "エルダー", "ニワトコ"],
    "カモミール": ["カモミール", "カモマイル"],
    "グレープフルーツ": ["グレープフルーツ", "グレープフルーツピール", "グレープフルーツの皮"],
    "ライム": ["ライム", "ライムピール", "ライムの皮"],
    "ローズマリー": ["ローズマリー", "マンネンロウ"],
  };
  // 逆引き（表記→代表名）を作る
  var BOT_REV = {};
  Object.keys(BOT_SYN).forEach(function (canon) {
    BOT_SYN[canon].forEach(function (v) { BOT_REV[v] = canon; });
  });
  // プルダウンに出さないゴミ語
  var BOT_JUNK = {
    "不明": 1, "公式情報なし": 1, "非公開": 1, "情報なし": 1, "その他": 1,
    "スパイス": 1, "ハーブ": 1, "各種": 1, "数種": 1, "複数": 1, "各種ボタニカル": 1,
  };
  var BOT_MIN = 15; // この件数以上のボタニカルだけプルダウンに出す

  // ボタニカル文字列 → 代表名の配列（重複なし）
  function botTokens(text) {
    if (!text) return [];
    var parts = String(text).split(/[、,／/・\n]+/);
    var set = {}, out = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].replace(/（[^）]*）/g, "").replace(/\([^)]*\)/g, "").trim();
      p = p.replace(/(など|等|ほか|他)$/, "").trim();
      if (!p) continue;
      var canon = BOT_REV[p] || p;
      // 「ジュニパーベリーをはじめとした9種…」のように文章中に埋もれた表記も拾う
      // （ジュニパーは語頭一致でも誤判定がないので安全）
      if (p.indexOf("ジュニパー") >= 0) canon = "ジュニパー";
      if (BOT_JUNK[canon]) continue;
      if (!set[canon]) { set[canon] = 1; out.push(canon); }
    }
    return out;
  }

  // ---- 頭文字の行（あ/か/さ…/A-Z/#）を求める ----
  var KANA_ROWS = {
    "あ": "あいうえおぁぃぅぇぉ",
    "か": "かきくけこがぎぐげご",
    "さ": "さしすせそざじずぜぞ",
    "た": "たちつてとだぢづでどっ",
    "な": "なにぬねの",
    "は": "はひふへほばびぶべぼぱぴぷぺぽ",
    "ま": "まみむめも",
    "や": "やゆよゃゅょ",
    "ら": "らりるれろ",
    "わ": "わをんゎ",
  };
  var ROW_ORDER = ["あ", "か", "さ", "た", "な", "は", "ま", "や", "ら", "わ", "A-Z", "#"];

  function initialOf(g) {
    var s = (g.kana || g.name || "").trim();
    if (!s) return "#";
    var ch = s.charAt(0);
    var code = ch.charCodeAt(0);
    if (code >= 0x30a1 && code <= 0x30f6) ch = String.fromCharCode(code - 0x60); // カタカナ→ひらがな
    for (var k in KANA_ROWS) {
      if (KANA_ROWS[k].indexOf(ch) >= 0) return k;
    }
    if (/[A-Za-z]/.test(ch)) return "A-Z";
    return "#";
  }

  // ---- フィルタ用セレクト＋頭文字インデックスを作る ----
  function buildControls() {
    var byCountry = {};
    GINS.forEach(function (g) {
      byCountry[g.country_main] = (byCountry[g.country_main] || 0) + 1;
    });
    var countries = Object.keys(byCountry).sort(function (a, b) { return byCountry[b] - byCountry[a]; });
    var optsC = ['<option value="">すべての国（' + GINS.length + "）</option>"];
    countries.forEach(function (c) {
      optsC.push('<option value="' + esc(c) + '">' + esc(c) + "（" + byCountry[c] + "）</option>");
    });
    els.country.innerHTML = optsC.join("");

    // ボタニカルのプルダウン（代表名にまとめ、件数が多い順。BOT_MIN件以上だけ）
    var byBot = {};
    GINS.forEach(function (g) {
      (g._bot || []).forEach(function (t) { byBot[t] = (byBot[t] || 0) + 1; });
    });
    var bots = Object.keys(byBot)
      .filter(function (t) { return byBot[t] >= BOT_MIN; })
      .sort(function (a, b) { return byBot[b] - byBot[a]; });
    var optsB = ['<option value="">すべてのボタニカル</option>'];
    bots.forEach(function (t) {
      optsB.push('<option value="' + esc(t) + '">' + esc(t) + "（" + byBot[t] + "）</option>");
    });
    els.bot.innerHTML = optsB.join("");

    // 頭文字インデックス（存在する行だけ）
    var have = {};
    GINS.forEach(function (g) { have[initialOf(g)] = true; });
    var html = '<button type="button" class="kana-btn active" data-g="">全</button>';
    ROW_ORDER.forEach(function (r) {
      if (have[r]) html += '<button type="button" class="kana-btn" data-g="' + esc(r) + '">' + esc(r) + "</button>";
    });
    els.kana.innerHTML = html;
  }

  // ---- 絞り込み＋並び替え ----
  function currentList() {
    // 空白区切りで複数キーワード化（正規化済み）。全ての語を含む銘柄だけ＝AND・語順自由
    var qTokens = normSearch(els.q.value).split(/\s+/).filter(Boolean);
    var fc = els.country.value;
    var fb = els.bot.value;
    var fa = els.abv.value;
    var sort = els.sort.value;

    var out = GINS.filter(function (g) {
      if (favOnly && !isFav(g)) return false;
      if (fc && g.country_main !== fc) return false;
      if (fb && (g._bot || []).indexOf(fb) === -1) return false;
      if (!inAbvBand(g.abv, fa)) return false;
      if (currentInitial && initialOf(g) !== currentInitial) return false;
      if (qTokens.length) {
        var hay = g._hay || buildHay(g);
        for (var i = 0; i < qTokens.length; i++) {
          if (hay.indexOf(qTokens[i]) === -1) return false;
        }
      }
      return true;
    });

    out.sort(function (a, b) {
      if (sort === "abv-desc") return (b.abv || -1) - (a.abv || -1);
      if (sort === "abv-asc") return (a.abv == null ? 999 : a.abv) - (b.abv == null ? 999 : b.abv);
      if (sort === "country") {
        var c = a.country_main.localeCompare(b.country_main, "ja");
        return c !== 0 ? c : (a.kana || a.name).localeCompare(b.kana || b.name, "ja");
      }
      return (a.kana || a.name).localeCompare(b.kana || b.name, "ja");
    });
    return out;
  }

  // ---- カード（グリッド用・ボタニカルのさわりを表示）----
  function cardHTML(g, idx) {
    var badges =
      flagBadge(g) +
      '<span class="badge badge-country">' + esc(g.country_main) + "</span>" +
      '<span class="badge badge-abv">' + abvLabel(g) + "</span>";

    var bot = g.botanicals
      ? '<p class="gin-bot"><b>Botanical</b>' + esc(g.botanicals) + "</p>"
      : '<p class="gin-bot is-empty"><b>Botanical</b>（未登録）</p>';

    var warn = g.not_gin ? '<p class="not-gin-note">※当店にありますが、ジンではありません</p>' : "";

    var on = isFav(g);
    var fav =
      '<button type="button" class="fav-btn' + (on ? " is-on" : "") + '" data-name="' + esc(g.name) +
        '" aria-label="お気に入り" aria-pressed="' + (on ? "true" : "false") + '">' + STAR_SVG + "</button>";

    return (
      '<div class="gin-card-wrap">' +
        fav +
        '<button type="button" class="gin-card" data-idx="' + idx + '">' +
          '<h2 class="gin-name">' + esc(g.name) + "</h2>" +
          (g.kana ? '<p class="gin-kana">' + esc(g.kana) + "</p>" : "") +
          '<div class="gin-badges">' + badges + "</div>" +
          warn +
          bot +
        "</button>" +
      "</div>"
    );
  }

  // お気に入りトグルボタンの見た目・件数を更新
  function updateFavBtn() {
    if (!els.favFilter) return;
    els.favFilter.classList.toggle("is-on", favOnly);
    els.favFilter.setAttribute("aria-pressed", favOnly ? "true" : "false");
    els.favFilter.innerHTML = STAR_SVG + "<span>お気に入り" + (favs.size ? "（" + favs.size + "）" : "") + "</span>";
  }

  var lastList = [];
  function render() {
    var list = currentList();
    lastList = list;
    els.count.innerHTML = "全" + GINS.length + "銘柄中　<b>" + list.length + "</b>件を表示";
    updateFavBtn();

    if (!list.length) {
      var kw = els.q.value.trim();
      if (favOnly) {
        els.list.innerHTML = favs.size
          ? '<div class="empty">お気に入りの中に、今の条件に合う銘柄がありません。条件を変えてみてください。</div>'
          : '<div class="empty">お気に入りはまだありません。各カード右上の ☆ を押すと追加できます。</div>';
      } else if (kw) {
        // キーワード検索で0件＝在庫にないジンかも。スタッフ申請フォームへ誘導し、検索語を下書きとして渡す
        els.list.innerHTML =
          '<div class="empty">' +
            '「' + esc(kw) + '」に一致する銘柄は見つかりませんでした。' +
            '<span class="empty-sub">在庫にあるのにリストに無いジンは、スタッフが申請できます。</span>' +
            '<a class="empty-cta" href="staff.html?name=' + encodeURIComponent(kw) + '">' +
              '<svg class="cta-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>' +
              'このジンを申請する（スタッフ用）</a>' +
          "</div>";
      } else {
        els.list.innerHTML = '<div class="empty">該当する銘柄がありません。条件を変えるか「条件をクリア」を押してください。</div>';
      }
      return;
    }
    var html = "";
    for (var i = 0; i < list.length; i++) html += cardHTML(list[i], i);
    els.list.innerHTML = html;
  }

  // ---- 詳細モーダル ----
  function openModal(g) {
    modalGin = g;
    var sub = g.country && g.country !== g.country_main ? "（" + esc(g.country) + "）" : "";
    var bot = g.botanicals
      ? '<div class="detail-block"><span class="detail-label">ボタニカル</span><p>' + esc(g.botanicals) + "</p></div>"
      : '<div class="detail-block"><span class="detail-label">ボタニカル</span><p class="muted-text">（未登録）</p></div>';
    var note = g.note
      ? '<div class="detail-block"><span class="detail-label">メモ</span><p>' + esc(g.note) + "</p></div>"
      : '<div class="detail-block"><span class="detail-label">メモ</span><p class="muted-text">（説明メモは未登録）</p></div>';

    var warn = g.not_gin ? '<div class="not-gin-banner">※当店にありますが、ジンではありません</div>' : "";

    els.modal.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true" aria-label="' + esc(g.name) + '">' +
        '<button type="button" class="modal-close" aria-label="閉じる">×</button>' +
        "<h2>" + esc(g.name) + "</h2>" +
        (g.kana ? '<p class="modal-kana">' + esc(g.kana) + "</p>" : "") +
        '<div class="modal-badges">' +
          flagBadge(g) +
          '<span class="badge badge-country">' + esc(g.country_main) + "</span>" +
          '<span class="badge badge-abv">' + abvLabel(g) + "</span>" +
        "</div>" +
        '<button type="button" class="modal-fav' + (isFav(g) ? " is-on" : "") + '" data-name="' + esc(g.name) +
          '" aria-pressed="' + (isFav(g) ? "true" : "false") + '">' + STAR_SVG +
          "<span>" + (isFav(g) ? "お気に入り済み" : "お気に入りに追加") + "</span></button>" +
        flagBanner(g) +
        (sub ? '<p class="modal-kana">産地：' + esc(g.country) + "</p>" : "") +
        warn +
        bot + note +
      "</div>";
    els.modal.hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeModal() {
    els.modal.hidden = true;
    els.modal.innerHTML = "";
    document.body.style.overflow = "";
  }

  function resetAll() {
    els.q.value = "";
    els.country.value = "";
    els.bot.value = "";
    els.abv.value = "";
    els.sort.value = "kana";
    currentInitial = "";
    favOnly = false;
    [].forEach.call(els.kana.querySelectorAll(".kana-btn"), function (b) {
      b.classList.toggle("active", b.getAttribute("data-g") === "");
    });
    render();
  }

  // ---- 申請箱（Supabase）の「仮登録」を読み込んで一覧に合流させる ----
  function loadProvisional() {
    if (!SUPABASE_URL || SUPABASE_URL.indexOf("YOUR_PROJECT_REF") !== -1) return;
    var url = SUPABASE_URL + "/rest/v1/" + SUB_TABLE +
      "?status=in.(pending,approved)&select=name,kana,abv,country,country_main,note,botanicals,not_gin&order=created_at.desc";
    fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        if (!rows || !rows.length) return;
        var seen = {};
        GINS.forEach(function (g) { seen[normName(g.name)] = true; });
        var added = 0;
        rows.forEach(function (row) {
          var nm = (row.name || row.kana || "").trim();
          if (!nm) return;
          var key = normName(nm);
          if (seen[key]) return; // 既存（確定）や仮登録同士の重複は出さない
          seen[key] = true;
          var g = {
            name: row.name || row.kana || "",
            kana: row.kana || row.name || "",
            abv: (row.abv == null || row.abv === "" ? null : Number(row.abv)),
            country: row.country || row.country_main || "",
            country_main: row.country_main || "",
            note: row.note || "",
            botanicals: row.botanicals || "",
            _provisional: true
          };
          if (row.not_gin === true) g.not_gin = true;
          g._bot = botTokens(g.botanicals);
          g._hay = buildHay(g);
          GINS.push(g);
          added++;
        });
        if (added) { buildControls(); render(); }
      })
      .catch(function () { /* 申請箱が読めなくてもカタログは通常どおり表示 */ });
  }

  function init() {
    els = {
      q: $("q"), country: $("f-country"), bot: $("f-bot"), abv: $("f-abv"), sort: $("f-sort"),
      count: $("result-count"), list: $("list"), reset: $("reset"),
      meta: $("data-meta"), kana: $("kana-index"), modal: $("gin-modal"),
      favFilter: $("fav-filter"),
    };

    fetch("gins.json", { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (data) {
        GINS = (data && data.gins) || [];
        GINS.forEach(function (g) { g._bot = botTokens(g.botanicals); g._hay = buildHay(g); }); // ボタニカル代表名化＋検索用テキスト
        if (els.meta && data.updated) {
          els.meta.textContent = "在庫 " + GINS.length + "銘柄";
        }
        buildControls();

        // ?q= による直リンク（クイズ道場などから特定銘柄へ飛ぶ）
        var deepLink = "";
        try { deepLink = (new URLSearchParams(window.location.search).get("q") || "").trim(); } catch (e) {}
        if (deepLink) els.q.value = deepLink;
        render();
        if (deepLink) {
          // 名前またはカナが完全一致する銘柄が1つなら詳細を自動で開く
          var dl = deepLink.toLowerCase();
          var hit = lastList.filter(function (g) {
            return String(g.name || "").toLowerCase() === dl || String(g.kana || "").toLowerCase() === dl;
          });
          if (hit.length === 1) openModal(hit[0]);
          window.scrollTo({ top: els.list.offsetTop - 70, behavior: "smooth" });
        }

        els.q.addEventListener("input", render);
        [els.country, els.bot, els.abv, els.sort].forEach(function (s) { s.addEventListener("change", render); });
        els.reset.addEventListener("click", resetAll);
        if (els.favFilter) {
          els.favFilter.addEventListener("click", function () { favOnly = !favOnly; render(); });
        }

        // 頭文字インデックス
        els.kana.addEventListener("click", function (e) {
          var btn = e.target.closest(".kana-btn");
          if (!btn) return;
          currentInitial = btn.getAttribute("data-g");
          [].forEach.call(els.kana.querySelectorAll(".kana-btn"), function (b) { b.classList.remove("active"); });
          btn.classList.add("active");
          render();
          window.scrollTo({ top: els.list.offsetTop - 70, behavior: "smooth" });
        });

        // カードの★トグル／カードタップ → 詳細モーダル
        els.list.addEventListener("click", function (e) {
          var favBtn = e.target.closest(".fav-btn");
          if (favBtn) { toggleFav(favBtn.getAttribute("data-name")); render(); return; }
          var card = e.target.closest(".gin-card");
          if (!card) return;
          var idx = parseInt(card.getAttribute("data-idx"), 10);
          if (lastList[idx]) openModal(lastList[idx]);
        });

        // モーダル内の★トグル／閉じる（×・背景クリック・Esc）
        els.modal.addEventListener("click", function (e) {
          var favBtn = e.target.closest(".modal-fav");
          if (favBtn) {
            toggleFav(favBtn.getAttribute("data-name"));
            render();
            if (modalGin) openModal(modalGin); // モーダルの★表示を更新
            return;
          }
          if (e.target === els.modal || e.target.closest(".modal-close")) closeModal();
        });
        document.addEventListener("keydown", function (e) {
          if (e.key === "Escape" && !els.modal.hidden) closeModal();
        });

        // 申請箱の「仮登録」を後追いで読み込んで合流（失敗してもカタログは動く）
        loadProvisional();
      })
      .catch(function (err) {
        els.count.textContent = "";
        els.list.innerHTML =
          '<div class="empty">データの読み込みに失敗しました（' + esc(err.message) +
          "）。<br />ローカルで開いた場合は、サーバー経由で開いてください。</div>";
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
