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
  var MEMO_TABLE = "gin_memos";
  var BOTANICAL_TABLE_URL = "https://sousuyou.github.io/top/botanical-table/";
  // スタッフメモ投稿用PIN（申請ページと同じ。SHA-256で照合・平文は置かない。既定 soutsu2026）
  var MEMO_PIN_SHA256 = "694b39a1bfa7ff68a9dee1972d6323fbb797f368fad85b74429e0fa696529263";
  var MEMO_UNLOCK_KEY = "soutsu_staff_unlocked";
  var TAGS_TABLE = "gin_flavor_tags";
  var AROMA_TABLE = "gin_aroma_strengths";
  var RATING_TABLE = "gin_staff_ratings";
  var PRICE_TABLE = "gin_bottle_prices";
  var BOTTLE_PRICE_SEED_URL = "data/bottle_price_estimates_20260625.json";
  var SOURCE_TABLE = "gin_info_sources";
  var aromaStrengthState = "loading"; // loading / ready / unavailable
  var staffRatingState = "loading"; // loading / ready / unavailable
  var bottlePriceState = "loading"; // loading / ready / unavailable
  var DEFAULT_BOTTLE_ML = 700;
  // 風味タグ（スタッフが付与・全員閲覧・絞り込み可。2群×計28タグ。説明は選択時のヒント=title）
  var FLAVOR_GROUPS = [
    { group: "香り・風味", tags: ["ジュニパー", "フローラル", "フルーティー", "シトラス", "ウッディ", "スパイシー", "ペッパー", "ハーバル", "アーシー", "パフューミー", "ベジタル", "マリン", "ナッティ", "スモーキー", "クリーミー", "お茶系", "ビター系"] },
    { group: "種類・製法", tags: ["コンパウンドジン", "オールドトムジン系", "バレルドジン", "ジュネヴァ", "シュタインヘーガー", "スロージン", "ジンリキュール", "クラシック", "焼酎系", "個性派", "ノンアルコールジン"] }
  ];
  var TAG_DESC = {
    "ジュニパー": "浸漬時間や品種で細分化可。ウッディ・シトラスと重複あり",
    "フローラル": "薔薇・ラベンダーなど",
    "フルーティー": "ベリー・林檎・梨・葡萄など",
    "シトラス": "レモン・ライム・柚子など",
    "ウッディ": "ヒノキ・杉・黒文字など",
    "スパイシー": "シナモン・クローブ・スターアニスなど",
    "ペッパー": "ブラックペッパー・山椒・花椒など",
    "ハーバル": "タイム・ローズマリーなど",
    "アーシー": "根・土のようなウェッティな香り。スパイシーと類似",
    "パフューミー": "複雑でバランスの取れた香り高い銘柄。フローラルと類似",
    "ベジタル": "きゅうり・草・葉・セロリ・青いトマト・ピーマン・若い茎",
    "マリン": "海藻・塩気・牡蠣殻・昆布・海風・出汁っぽさ",
    "ナッティ": "胡麻・ナッツ・アーモンド・豆っぽさ",
    "スモーキー": "焙煎・焦げ・燻製・スモーク・炭。数は少ない",
    "クリーミー": "バニラ・ココナッツなど乳酸的な甘い香り",
    "お茶系": "玉露・煎茶など。ソーダ割り・水割りと好相性",
    "ビター系": "カカオ・珈琲・ビターズを浸漬添加など",
    "コンパウンドジン": "ボタニカルを再蒸留せず漬け込んだ銘柄",
    "オールドトムジン系": "加糖・甘みが強い銘柄（厳密な定義はなし）",
    "バレルドジン": "樽で熟成されたジン全般",
    "ジュネヴァ": "モルトワイン主体のオランダ生まれ。取扱少なめ",
    "シュタインヘーガー": "生のジュニパーを発酵後蒸留。コールドショットで",
    "スロージン": "西洋すもものリキュール。品揃え薄め",
    "ジンリキュール": "ジンベースのリキュール。スパイス感強めが多い",
    "クラシック": "ジュニパー・アンジェリカ・コリアンダー・リコリス等のクラシックなボタニカル中心",
    "焼酎系": "ベースに焼酎。芋・麦など個性を残す。水割り/ソーダ割りで",
    "個性派": "隕石・ピスコベース・サクラケムシの糞など…",
    "ノンアルコールジン": "厳密にはジンでない。フローラル・ウッディ系が多くソーダ割り向き"
  };

  // お気に入り（★）：この端末のブラウザに保存（localStorage）。銘柄名をキーにする。
  var FAV_KEY = "soutsu_gin_favs";
  var favs = loadFavs();   // 登録済み銘柄名のSet
  var favOnly = false;     // 「お気に入りだけ表示」中か
  var provOnly = false;    // 「スタッフ申請（未調査）だけ表示」中か
  var modalGin = null;     // 現在モーダルで開いている銘柄
  var memoEditId = "";     // 現在インライン編集しているメモID
  var STAR_SVG = '<svg class="star-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 17.3l-5.4 3 1.2-6L3.3 9.9l6.1-.7L12 3.6l2.6 5.6 6.1.7-4.5 4.4 1.2 6z"/></svg>';

  function $(id) { return document.getElementById(id); }

  // XSS対策：外部由来テキストは必ずエスケープ
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function normalizeSourceURL(raw, allowBareDomain) {
    var s = String(raw == null ? "" : raw).trim();
    if (!s) return "";
    if (allowBareDomain && !/^https?:\/\//i.test(s) && /^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}/i.test(s)) {
      s = "https://" + s;
    }
    try {
      var u = new URL(s);
      return (u.protocol === "http:" || u.protocol === "https:") ? u.href : "";
    } catch (e) {
      return "";
    }
  }

  function sourceHostLabel(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch (e) {
      return "情報ソース";
    }
  }

  // 重複判定キー：全半角を揃え(NFKC)、連続空白を畳んで小文字化（submit.js / promote_pending.py と同方針）
  function normName(s) {
    return String(s == null ? "" : s).normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
  }

  // 仮登録の自動非表示用の“ゆるい一致キー”：全半角・記号・空白・アクセント・カタカナ差を吸収。
  // 既存銘柄の name/kana/aliases のどれかと一致したら、その仮登録は出さない（登録後に自動で消える）。
  function dedupKey(s) {
    s = String(s == null ? "" : s).normalize("NFKC").toLowerCase();
    s = s.normalize("NFD").replace(/[̀-ͯ]/g, ""); // アクセント除去（á→a）
    s = s.replace(/[ァ-ヶ]/g, function (ch) { return String.fromCharCode(ch.charCodeAt(0) - 0x60); }); // カナ→ひらがな
    s = s.replace(/[^0-9a-z぀-ゟ一-龯]/g, ""); // 英数字・ひらがな・漢字以外（空白/記号/長音）を除去
    return s;
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
      " " + (g.botanicals || "") + " " + (g.note || "") + " " + ((g.aliases || []).join(" ")));
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

  // 「2026-06-19」→「2026年6月19日」。形式不明なら空文字（表示しない）。
  function fmtDate(s) {
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(s == null ? "" : s));
    return m ? (m[1] + "年" + Number(m[2]) + "月" + Number(m[3]) + "日") : "";
  }

  // 追加順ソート用：added（既存データ）または _added（仮登録のcreated_at）を数値化。
  // 無い銘柄は0（=最も古い扱い）＝初期登録分は下にまとまる。
  function addedTime(g) {
    var s = g.added || g._added || "";
    if (!s) return 0;
    var t = Date.parse(s);
    return isNaN(t) ? 0 : t;
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

  function normalizeSourceItem(item, fromDB) {
    var url = "", label = "";
    if (typeof item === "string") {
      url = item;
    } else if (item) {
      url = item.url || item.href || item.source_url || item.sourceUrl || item.info_url || item.infoUrl || "";
      label = item.label || item.title || item.name || "";
    }
    url = normalizeSourceURL(url, false);
    if (!url) return null;
    return {
      id: fromDB && item ? item.id : "",
      url: url,
      label: label || sourceHostLabel(url),
      _db: !!fromDB
    };
  }

  function staticInfoSources(g) {
    var raw = [];
    if (Array.isArray(g.sources)) raw = raw.concat(g.sources);
    if (Array.isArray(g.source_urls)) raw = raw.concat(g.source_urls);
    ["source_url", "sourceUrl", "info_url", "infoUrl", "official_url", "officialUrl", "product_url", "productUrl"].forEach(function (key) {
      if (g[key]) raw.push({ label: "情報ソース", url: g[key] });
    });
    if (g.source && /^https?:\/\//i.test(String(g.source))) raw.push({ label: "情報ソース", url: g.source });
    return raw.map(function (item) { return normalizeSourceItem(item, false); }).filter(Boolean);
  }

  function infoSources(g) {
    var seen = {}, out = [];
    function add(src) {
      if (!src || seen[src.url]) return;
      seen[src.url] = 1;
      out.push(src);
    }
    staticInfoSources(g).forEach(add);
    (g._infoSources || []).forEach(function (item) { add(normalizeSourceItem(item, true)); });
    return out;
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

  function inAromaBand(strength, isSet, band) {
    var v = Number(strength) || 0;
    if (!band) return true;
    if (band === "set") return !!isSet;
    if (band === "unset") return !isSet;
    if (!isSet) return false;
    if (band === "0-3" || band === "1-3") return v >= 0 && v <= 3;
    if (band === "4-6") return v >= 4 && v <= 6;
    if (band === "7-8") return v >= 7 && v <= 8;
    if (band === "9-10") return v >= 9 && v <= 10;
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
    "ローレル": ["ローレル", "ローリエ", "ベイリーフ", "月桂樹"],
    "レモングラス": ["レモングラス"],
    "ローズヒップ": ["ローズヒップ"],
    "オールスパイス": ["オールスパイス", "ピメント"],
    "紅茶": ["紅茶", "ブラックティー", "アールグレイ"],
    "ブルーベリー": ["ブルーベリー"],
    "ガランガル": ["ガランガル"],
    "ビルベリー": ["ビルベリー"],
    "エルダーベリー": ["エルダーベリー"],
    "チコリルート": ["チコリルート", "チコリ"],
    "リンゴンベリー": ["リンゴンベリー"],
    "カフィアライムリーフ": ["カフィアライムリーフ", "こぶみかんの葉", "コブミカンの葉", "マックルートライムリーフ"],
    "ハマナス": ["ハマナス", "浜茄子"],
    "ヘザー": ["ヘザー"],
    "メドウスイート": ["メドウスイート", "メドウスウィート"],
    "ユーカリ": ["ユーカリ"],
    "シーバックソーン": ["シーバックソーン", "シーベリー"],
    "ジャスミン": ["ジャスミン"],
    "レモンマートル": ["レモンマートル"],
    "ローワンベリー": ["ローワンベリー"],
    "梅": ["梅", "うめ", "ウメ"],
    "セイボリー": ["セイボリー"],
    "バタフライピー": ["バタフライピー"],
    "大和当帰": ["大和当帰", "当帰"],
    "ニガヨモギ": ["ニガヨモギ", "ワームウッド", "苦艾"],
    "パンダンリーフ": ["パンダンリーフ", "パンダン"],
    "ホーリーバジル": ["ホーリーバジル", "トゥルシー"],
    "ルバーブ": ["ルバーブ"],
    "ローズゼラニウム": ["ローズゼラニウム"],
    "大和橘": ["大和橘"],
    "苺": ["苺", "イチゴ", "いちご", "ストロベリー"],
    "杉": ["杉", "スギ"],
    "ヒバ": ["ヒバ"],
    "ヨモギ": ["ヨモギ", "蓬"],
    "海苔": ["海苔", "のり", "ノリ"],
    "金柑": ["金柑", "キンカン"],
    "唐辛子": ["唐辛子", "とうがらし", "チリ"],
    "仏手柑": ["仏手柑", "ブッシュカン", "ブッダハンド"],
    "蜂蜜": ["蜂蜜", "はちみつ", "ハチミツ", "ハニー"],
  };
  // 逆引き（表記→代表名）を作る
  var BOT_REV = {};
  Object.keys(BOT_SYN).forEach(function (canon) {
    BOT_SYN[canon].forEach(function (v) { BOT_REV[v] = canon; });
  });
  var BOTANICAL_ALIASES = {
    "ジュニパー": "ジュニパーベリー",
    "コリアンダー": "コリアンダーシード",
    "アンジェリカ": "アンジェリカルート",
    "リコリスルート": "リコリス",
    "オリス": "オリスルート",
    "レモン": "レモンピール",
    "オレンジ": "オレンジピール",
    "グレープフルーツ": "グレープフルーツピール",
    "ライム": "ライムピール",
    "ベルガモット": "ベルガモットピール",
    "アニス": "アニスシード",
    "フェンネル": "フェンネルシード",
    "キャラウェイ": "キャラウェイシード",
    "カッシア": "カシア",
    "カシアバーク": "カシア",
    "カッシアバーク": "カシア",
    "クベブ": "クベブペッパー",
    "キュベブ": "クベブペッパー",
    "黒胡椒": "ブラックペッパー",
    "グリーンカルダモン": "カルダモン",
    "カルダモンシード": "カルダモン",
    "ベイリーフ": "ローレル",
    "ローリエ": "ローレル",
    "緑茶": "煎茶",
    "アールグレイ": "紅茶",
    "メドウスウィート": "メドウスイート",
    "シーベリー": "シーバックソーン",
    "ストロベリー": "苺",
    "イチゴ": "苺",
    "紫蘇": "青紫蘇",
    "バラ": "ローズ",
    "ブルガリアンローズ": "ローズ",
    "クベバベリー": "クベブペッパー",
    "クベバ": "クベブペッパー",
    "コースタルタイム": "タイム",
    "柚子ピール": "柚子",
    "ゆず": "柚子"
  };
  // プルダウンに出さないゴミ語
  var BOT_JUNK = {
    "不明": 1, "公式情報なし": 1, "非公開": 1, "情報なし": 1, "その他": 1,
    "スパイス": 1, "ハーブ": 1, "各種": 1, "数種": 1, "複数": 1, "各種ボタニカル": 1,
    "シトラス": 1, "柑橘": 1, "柑橘ピール": 1, "核果": 1, "ストーンフルーツ": 1,
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

  function isBotanicalLinkable(name) {
    return name &&
      !/非公開|不明|要確認|公式情報なし|情報なし|メーカー非公開|各種|数種|複数/.test(name);
  }

  function botanicalTableUrl(name) {
    return BOTANICAL_TABLE_URL + "?q=" + encodeURIComponent(name);
  }

  function compactBotanicalName(name) {
    return normSearch(name).replace(/[ー\s・･]/g, "");
  }

  function botanicalData() {
    return window.SOUTSU_BOTANICAL_DATA || { components: {}, botanicals: [], families: {} };
  }

  function findBotanicalInfo(name) {
    var data = botanicalData();
    var botanicals = data.botanicals || [];
    var wanted = BOTANICAL_ALIASES[name] || name;
    var key = compactBotanicalName(wanted);
    var i, b;
    for (i = 0; i < botanicals.length; i++) {
      b = botanicals[i];
      if (compactBotanicalName(b.name) === key) return b;
    }
    for (i = 0; i < botanicals.length; i++) {
      b = botanicals[i];
      var bkey = compactBotanicalName(b.name);
      if (bkey.indexOf(key) >= 0 || key.indexOf(bkey) >= 0) return b;
    }
    return null;
  }

  function botanicalMiniHTML(requestedName, info) {
    var data = botanicalData();
    var components = data.components || {};
    if (!info) {
      return '<div class="bot-mini is-missing" role="status">' +
        '<button type="button" class="bot-mini-close" aria-label="閉じる">×</button>' +
        '<div class="bot-mini-top">' +
          '<div><p class="bot-mini-eyebrow">Unregistered candidate</p><h3>' + esc(requestedName) + '</h3></div>' +
          '<span class="bot-mini-family">未登録</span>' +
        '</div>' +
        '<p class="bot-mini-empty">在庫カタログから自動検出しましたが、ボタニカル表にはまだ詳細データがありません。</p>' +
        '<a class="bot-mini-open" href="' + botanicalTableUrl(requestedName) + '" target="_blank" rel="noopener">ボタニカル表で検索</a>' +
      "</div>";
    }
    var family = (data.families || {})[info.name] || "分類未設定";
    var compHTML = info.components.slice(0, 8).map(function (name) {
      var c = components[name] || {};
      return '<li><b>' + esc(name) + '</b>' +
        (c.family ? '<em>' + esc(c.family) + '</em>' : "") +
        '<span>' + esc(c.note || "代表成分") + '</span></li>';
    }).join("");
    return '<div class="bot-mini" role="status">' +
      '<button type="button" class="bot-mini-close" aria-label="閉じる">×</button>' +
      '<div class="bot-mini-top">' +
        '<div><p class="bot-mini-eyebrow">Botanical detail</p><h3>' + esc(info.name) + '</h3><p>' + esc(info.latin) + '</p></div>' +
        '<span class="bot-mini-family">' + esc(family) + '</span>' +
      '</div>' +
      '<div class="bot-mini-summary">' + esc(info.aroma) + '</div>' +
      '<dl class="bot-mini-facts">' +
        '<div><dt>分類</dt><dd>' + esc(info.group) + '</dd></div>' +
        '<div><dt>部位</dt><dd>' + esc(info.part) + '</dd></div>' +
      '</dl>' +
      '<p class="bot-mini-role">' + esc(info.role) + '</p>' +
      '<p class="bot-mini-subhead">主な香気成分</p>' +
      '<ul class="bot-mini-components">' + compHTML + '</ul>' +
      '<a class="bot-mini-open" href="' + botanicalTableUrl(info.name) + '" target="_blank" rel="noopener">ボタニカル表で開く</a>' +
    "</div>";
  }

  function showBotanicalInfo(name) {
    var panel = document.getElementById("botanical-popover");
    if (!panel) return;
    var info = findBotanicalInfo(name);
    panel.innerHTML = botanicalMiniHTML(name, info);
    panel.hidden = false;
    [].forEach.call(els.modal.querySelectorAll(".bot-link"), function (btn) {
      btn.classList.toggle("is-active", btn.getAttribute("data-botanical") === name);
    });
  }

  function closeBotanicalInfo() {
    var panel = document.getElementById("botanical-popover");
    if (panel) {
      panel.hidden = true;
      panel.innerHTML = "";
    }
    if (els.modal) {
      [].forEach.call(els.modal.querySelectorAll(".bot-link"), function (btn) {
        btn.classList.remove("is-active");
      });
    }
  }

  function botanicalLinksHTML(text) {
    var tokens = botTokens(text).filter(isBotanicalLinkable);
    if (!tokens.length) return '<p>' + esc(text) + "</p>";
    var listHTML = tokens.map(function (name) {
      var registered = !!findBotanicalInfo(name);
      return '<button type="button" class="bot-link' + (registered ? "" : " is-missing") +
        '" data-botanical="' + esc(name) + '" title="' + (registered ? "その場で詳細を見る" : "未登録候補を見る") + '">' +
        esc(name) + (registered ? "" : '<span class="bot-missing-mark">未登録</span>') + "</button>";
    }).join("");
    return '<div class="bot-link-list">' + listHTML + '</div>' +
      '<div id="botanical-popover" class="botanical-popover" hidden></div>';
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
    var keepSel = {
      c: els.country.value,
      b: els.bot.value,
      t: els.tag ? els.tag.value : "",
      a: els.aroma ? els.aroma.value : ""
    };
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

    // 風味タグのプルダウン（実際に使われているタグを群ごとに。0件のタグは出さない）
    if (els.tag) {
      var byTag = {};
      GINS.forEach(function (g) { (g._tags || []).forEach(function (t) { byTag[t] = (byTag[t] || 0) + 1; }); });
      var optsT = ['<option value="">すべての風味タグ</option>'];
      FLAVOR_GROUPS.forEach(function (grp) {
        var used = grp.tags.filter(function (t) { return byTag[t]; });
        if (!used.length) return;
        optsT.push('<optgroup label="' + esc(grp.group) + '">');
        used.forEach(function (t) { optsT.push('<option value="' + esc(t) + '">' + esc(t) + "（" + byTag[t] + "）</option>"); });
        optsT.push("</optgroup>");
      });
      els.tag.innerHTML = optsT.join("");
    }

    // 絞り込みの選択値を保つ（再構築でリセットされないように）
    els.country.value = keepSel.c;
    els.bot.value = keepSel.b;
    if (els.tag) els.tag.value = keepSel.t;
    if (els.aroma) els.aroma.value = keepSel.a;
  }

  // ---- 絞り込み＋並び替え ----
  function currentList() {
    // 空白区切りで複数キーワード化（正規化済み）。全ての語を含む銘柄だけ＝AND・語順自由
    var qTokens = normSearch(els.q.value).split(/\s+/).filter(Boolean);
    var fc = els.country.value;
    var fb = els.bot.value;
    var fa = els.abv.value;
    var ft = els.tag ? els.tag.value : "";
    var far = els.aroma ? els.aroma.value : "";
    var sort = els.sort.value;

    var out = GINS.filter(function (g) {
      if (favOnly && !isFav(g)) return false;
      if (provOnly && !g._provisional) return false;
      if (fc && g.country_main !== fc) return false;
      if (fb && (g._bot || []).indexOf(fb) === -1) return false;
      if (ft && (g._tags || []).indexOf(ft) === -1) return false;
      if (!inAbvBand(g.abv, fa)) return false;
      if (!inAromaBand(g._aromaStrength, g._aromaStrengthSet, far)) return false;
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
      if (sort === "added-desc") {
        var at = addedTime(a), bt = addedTime(b);
        if (at !== bt) return bt - at;
        return (a.kana || a.name).localeCompare(b.kana || b.name, "ja");
      }
      if (sort === "aroma-desc") {
        var ad = Number(a._aromaStrength) || 0;
        var bd = Number(b._aromaStrength) || 0;
        if (!!a._aromaStrengthSet !== !!b._aromaStrengthSet) return a._aromaStrengthSet ? -1 : 1;
        if (ad !== bd) return bd - ad;
        return (a.kana || a.name).localeCompare(b.kana || b.name, "ja");
      }
      if (sort === "aroma-asc") {
        var aa = Number(a._aromaStrength) || 0;
        var ba = Number(b._aromaStrength) || 0;
        if (!!a._aromaStrengthSet !== !!b._aromaStrengthSet) return a._aromaStrengthSet ? -1 : 1;
        if (aa !== ba) return aa - ba;
        return (a.kana || a.name).localeCompare(b.kana || b.name, "ja");
      }
      if (sort === "rating-desc") {
        var rdA = Number(a._staffRating) || 0;
        var rdB = Number(b._staffRating) || 0;
        if (!!a._staffRatingSet !== !!b._staffRatingSet) return a._staffRatingSet ? -1 : 1;
        if (rdA !== rdB) return rdB - rdA;
        return (a.kana || a.name).localeCompare(b.kana || b.name, "ja");
      }
      if (sort === "rating-asc") {
        var raA = Number(a._staffRating) || 0;
        var raB = Number(b._staffRating) || 0;
        if (!!a._staffRatingSet !== !!b._staffRatingSet) return a._staffRatingSet ? -1 : 1;
        if (raA !== raB) return raA - raB;
        return (a.kana || a.name).localeCompare(b.kana || b.name, "ja");
      }
      if (sort === "price-desc") {
        var pdA = Number(a._bottlePrice) || 0;
        var pdB = Number(b._bottlePrice) || 0;
        if (!!a._bottlePriceSet !== !!b._bottlePriceSet) return a._bottlePriceSet ? -1 : 1;
        if (pdA !== pdB) return pdB - pdA;
        return (a.kana || a.name).localeCompare(b.kana || b.name, "ja");
      }
      if (sort === "price-asc") {
        var paA = Number(a._bottlePrice) || 0;
        var paB = Number(b._bottlePrice) || 0;
        if (!!a._bottlePriceSet !== !!b._bottlePriceSet) return a._bottlePriceSet ? -1 : 1;
        if (paA !== paB) return paA - paB;
        return (a.kana || a.name).localeCompare(b.kana || b.name, "ja");
      }
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
  function aromaBadgeHTML(g) {
    var v = Number(g._aromaStrength) || 0;
    return g._aromaStrengthSet ? '<span class="badge badge-aroma">香り ' + v + "</span>" : "";
  }

  function staffRatingBadgeHTML(g) {
    var v = Number(g._staffRating) || 0;
    return g._staffRatingSet ? '<span class="badge badge-rating">評価 ' + v + "</span>" : "";
  }

  function yenLabel(v) {
    var n = Math.round(Number(v) || 0);
    return "¥" + n.toLocaleString("ja-JP");
  }

  function mlLabel(v) {
    var n = Math.round(Number(v) || 0);
    return n.toLocaleString("ja-JP") + "ml";
  }

  function bottleMlValue(g) {
    return g && g._bottleMlSet ? clampBottleMl(g._bottleMl) : DEFAULT_BOTTLE_ML;
  }

  function pourCost(g) {
    if (!g || !g._bottlePriceSet) return 0;
    var ml = bottleMlValue(g);
    if (!ml) return 0;
    return Math.round((Number(g._bottlePrice) || 0) * 30 / ml);
  }

  function bottlePriceBadgeHTML(g) {
    if (!g._bottlePriceSet) return "";
    return '<span class="badge badge-price">瓶 ' + esc(yenLabel(g._bottlePrice)) + " / " + esc(mlLabel(bottleMlValue(g))) + "</span>" +
      '<span class="badge badge-cost">30ml ' + esc(yenLabel(pourCost(g))) + "</span>";
  }

  function cardHTML(g, idx) {
    var metaBadges =
      flagBadge(g) +
      '<span class="badge badge-country">' + esc(g.country_main) + "</span>" +
      '<span class="badge badge-abv">' + abvLabel(g) + "</span>";
    var metricBadges =
      bottlePriceBadgeHTML(g) +
      staffRatingBadgeHTML(g) +
      aromaBadgeHTML(g);

    var bot = g.botanicals
      ? '<p class="gin-bot"><b>Botanical</b>' + esc(g.botanicals) + "</p>"
      : '<p class="gin-bot is-empty"><b>Botanical</b>（未登録）</p>';

    var warn = g.not_gin ? '<p class="not-gin-note">※当店にありますが、ジンではありません</p>' : "";

    var tags = (g._tags && g._tags.length)
      ? '<div class="gin-tags">' + g._tags.slice(0, 6).map(function (t) { return '<span class="gin-tag">' + esc(t) + "</span>"; }).join("") +
        (g._tags.length > 6 ? '<span class="gin-tag gin-tag-more">+' + (g._tags.length - 6) + "</span>" : "") + "</div>"
      : "";

    var on = isFav(g);
    var fav =
      '<button type="button" class="fav-btn' + (on ? " is-on" : "") + '" data-name="' + esc(g.name) +
        '" aria-label="お気に入り" aria-pressed="' + (on ? "true" : "false") + '">' + STAR_SVG + "</button>";

    return (
      '<div class="gin-card-wrap">' +
        fav +
        '<button type="button" class="gin-card" data-idx="' + idx + '">' +
          '<div class="gin-card-head">' +
            '<h2 class="gin-name">' + esc(g.name) + "</h2>" +
            (g.kana ? '<p class="gin-kana">' + esc(g.kana) + "</p>" : "") +
          "</div>" +
          '<div class="gin-badges gin-meta-badges">' + metaBadges + "</div>" +
          (metricBadges ? '<div class="gin-metrics">' + metricBadges + "</div>" : "") +
          warn +
          bot + tags +
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

  // スタッフ申請（未調査＝仮登録）の件数
  function provCount() {
    var n = 0;
    for (var i = 0; i < GINS.length; i++) if (GINS[i]._provisional) n++;
    return n;
  }
  // 「スタッフ申請（未調査）だけ」トグルの見た目・件数を更新
  function updateProvBtn() {
    if (!els.provFilter) return;
    var n = provCount();
    els.provFilter.classList.toggle("is-on", provOnly);
    els.provFilter.setAttribute("aria-pressed", provOnly ? "true" : "false");
    els.provFilter.innerHTML = "🆕 スタッフ申請（未調査）" + (n ? "（" + n + "）" : "");
  }

  var lastList = [];
  function render() {
    var list = currentList();
    lastList = list;
    if (provOnly) {
      els.count.innerHTML = "スタッフ申請（未調査）の銘柄：<b>" + list.length + "</b>件";
    } else {
      els.count.innerHTML = "全" + GINS.length + "銘柄中　<b>" + list.length + "</b>件を表示";
    }
    updateFavBtn();
    updateProvBtn();

    if (!list.length) {
      var kw = els.q.value.trim();
      if (provOnly) {
        els.list.innerHTML = provCount()
          ? '<div class="empty">今の条件に合うスタッフ申請の銘柄がありません。「条件をクリア」で、申請された未調査の銘柄をすべて表示します。</div>'
          : '<div class="empty">スタッフが申請した未調査の銘柄は、今のところありません。<span class="empty-sub">在庫にあるのにリストに無いジンは、スタッフが「在庫にないジンを申請」から追加できます。</span></div>';
      } else if (favOnly) {
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
    memoEditId = "";
    var sub = g.country && g.country !== g.country_main ? "（" + esc(g.country) + "）" : "";
    var bot = g.botanicals
      ? '<div class="detail-block"><span class="detail-label">ボタニカル</span>' + botanicalLinksHTML(g.botanicals) + "</div>"
      : '<div class="detail-block"><span class="detail-label">ボタニカル</span><p class="muted-text">（未登録）</p></div>';
    var note = g.note
      ? '<div class="detail-block"><span class="detail-label">メモ</span><p>' + esc(g.note) + "</p></div>"
      : '<div class="detail-block"><span class="detail-label">メモ</span><p class="muted-text">（説明メモは未登録）</p></div>';
    var sources = '<div class="source-section"><h3 class="memo-title">情報ソース</h3><div id="source-box" class="source-box"><p class="memo-empty">読み込み中…</p></div></div>';

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
          bottlePriceBadgeHTML(g) +
          staffRatingBadgeHTML(g) +
          aromaBadgeHTML(g) +
        "</div>" +
        '<button type="button" class="modal-fav' + (isFav(g) ? " is-on" : "") + '" data-name="' + esc(g.name) +
          '" aria-pressed="' + (isFav(g) ? "true" : "false") + '">' + STAR_SVG +
          "<span>" + (isFav(g) ? "お気に入り済み" : "お気に入りに追加") + "</span></button>" +
        flagBanner(g) +
        (sub ? '<p class="modal-kana">産地：' + esc(g.country) + "</p>" : "") +
        warn +
        bot + note +
        '<div class="modal-quick-grid">' +
          '<div class="price-section"><h3 class="memo-title">ボトル価格</h3><div id="price-box" class="price-box"></div></div>' +
          '<div class="aroma-section"><h3 class="memo-title">香りの強さ</h3><div id="aroma-box" class="aroma-box"></div></div>' +
          '<div class="rating-section"><h3 class="memo-title">スタッフ評価</h3><div id="rating-box" class="rating-box"></div></div>' +
        "</div>" +
        '<div class="tag-section"><h3 class="memo-title">風味タグ</h3><div id="tag-box" class="tag-box"></div></div>' +
        sources +
        '<div class="memo-section"><h3 class="memo-title">スタッフメモ</h3><div id="memo-box" class="memo-box"><p class="memo-empty">読み込み中…</p></div></div>' +
      "</div>";
    els.modal.hidden = false;
    document.body.style.overflow = "hidden";
    loadInfoSources(g);
    loadMemos(g);
    renderTagSection(g);
    renderBottlePriceSection(g);
    renderAromaSection(g);
    renderStaffRatingSection(g);
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
    if (els.tag) els.tag.value = "";
    if (els.aroma) els.aroma.value = "";
    els.sort.value = "kana";
    currentInitial = "";
    favOnly = false;
    provOnly = false;
    [].forEach.call(els.kana.querySelectorAll(".kana-btn"), function (b) {
      b.classList.toggle("active", b.getAttribute("data-g") === "");
    });
    render();
  }

  // ---- 申請箱（Supabase）の「仮登録」を読み込んで一覧に合流させる ----
  function loadProvisional() {
    if (!SUPABASE_URL || SUPABASE_URL.indexOf("YOUR_PROJECT_REF") !== -1) return;
    var url = SUPABASE_URL + "/rest/v1/" + SUB_TABLE +
      "?status=in.(pending,approved)&select=name,kana,abv,country,country_main,note,botanicals,not_gin,created_at&order=created_at.desc";
    fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        if (!rows || !rows.length) return;
        var seen = {};
        GINS.forEach(function (g) {
          if (g.name) seen[dedupKey(g.name)] = true;
          if (g.kana) seen[dedupKey(g.kana)] = true;
          (g.aliases || []).forEach(function (a) { if (a) seen[dedupKey(a)] = true; });
        });
        var added = 0;
        rows.forEach(function (row) {
          var nm = (row.name || row.kana || "").trim();
          if (!nm) return;
          var k1 = dedupKey(row.name || nm), k2 = dedupKey(row.kana || nm);
          if ((k1 && seen[k1]) || (k2 && seen[k2])) return; // 既存（確定）や仮登録同士の重複は出さない（登録済みは自動で消える）
          seen[k1] = true; if (k2) seen[k2] = true;
          var g = {
            name: row.name || row.kana || "",
            kana: row.kana || row.name || "",
            abv: (row.abv == null || row.abv === "" ? null : Number(row.abv)),
            country: row.country || row.country_main || "",
            country_main: row.country_main || "",
            note: row.note || "",
            botanicals: row.botanicals || "",
            _provisional: true,
            _added: row.created_at || ""
          };
          if (row.not_gin === true) g.not_gin = true;
          g._bot = botTokens(g.botanicals);
          g._tags = [];
          g._aromaStrength = 0;
          g._aromaStrengthSet = false;
          g._staffRating = 0;
          g._staffRatingSet = false;
          g._bottlePrice = 0;
          g._bottlePriceSet = false;
          g._bottleMl = DEFAULT_BOTTLE_ML;
          g._bottleMlSet = false;
          g._infoSources = [];
          g._hay = buildHay(g);
          GINS.push(g);
          added++;
        });
        if (added) { buildControls(); render(); }
      })
      .catch(function () { /* 申請箱が読めなくてもカタログは通常どおり表示 */ });
  }

  // ===== 情報ソースURL（各ジンごと・全員閲覧／スタッフのみPIN追加・削除）=====
  function sourceAddHTML() {
    if (memoUnlocked()) {
      return '<details class="source-add-wrap">' +
        '<summary>URLを追加</summary>' +
        '<div class="source-add">' +
          '<input id="source-url" class="source-input source-url-input" type="url" inputmode="url" autocomplete="off" placeholder="https://..." />' +
          '<input id="source-label" class="source-input source-label-input" type="text" maxlength="80" autocomplete="off" placeholder="公式 / 輸入元など" />' +
          '<button type="button" class="source-send">追加</button>' +
          '<p class="memo-hint" id="source-msg"></p>' +
        "</div>" +
      "</details>";
    }
    return '<div class="memo-add">' +
      '<button type="button" class="source-unlock">＋ URLを追加（スタッフ）</button>' +
      '<div class="memo-pin-row" id="source-pin-row" hidden>' +
        '<input id="source-pin" class="memo-pin" type="password" inputmode="numeric" autocomplete="off" placeholder="スタッフPIN" />' +
        '<button type="button" class="source-pin-ok">解錠</button>' +
        '<span class="memo-hint" id="source-pin-err"></span>' +
      "</div>" +
      "</div>";
  }

  function sourceListHTML(g) {
    var list = infoSources(g);
    if (!list.length) return '<p class="memo-empty">まだURLはありません。</p>';
    return '<ul class="source-list">' + list.map(function (src) {
      var remove = memoUnlocked() && src._db && src.id
        ? '<button type="button" class="source-remove" data-source-id="' + esc(src.id) + '" title="このURLを削除">削除</button>'
        : "";
      return '<li class="source-item">' +
        '<a class="source-link" href="' + esc(src.url) + '" target="_blank" rel="noopener noreferrer" title="' + esc(src.url) + '">' +
          '<b>' + esc(src.label) + '</b>' +
          '<span>' + esc(sourceHostLabel(src.url)) + '</span>' +
        '</a>' + remove +
      '</li>';
    }).join("") + "</ul>";
  }

  function renderSourceSection(g, errMsg) {
    var box = document.getElementById("source-box");
    if (!box || !g) return;
    var listHTML = sourceListHTML(g);
    if (errMsg) listHTML += '<p class="memo-empty">' + esc(errMsg) + "</p>";
    box.innerHTML = listHTML + sourceAddHTML();
  }

  function loadInfoSources(g) {
    var box = document.getElementById("source-box");
    if (!box || !g) return;
    if (!SUPABASE_URL || SUPABASE_URL.indexOf("YOUR_PROJECT_REF") !== -1) {
      g._infoSources = [];
      renderSourceSection(g);
      return;
    }
    var url = SUPABASE_URL + "/rest/v1/" + SOURCE_TABLE +
      "?gin_name=eq." + encodeURIComponent(g.name) +
      "&select=id,label,url,created_at&order=created_at.desc";
    fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY } })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (rows) {
        g._infoSources = rows || [];
        if (modalGin === g && els.modal && !els.modal.hidden) renderSourceSection(g);
      })
      .catch(function (e) {
        g._infoSources = [];
        renderSourceSection(g, memoUnlocked() && e && e.message === "HTTP 404"
          ? "保存先未設定です。supabase_info_sources_setup.sql を実行するとURLを共有保存できます。"
          : "");
      });
  }

  function submitInfoSource(g) {
    var urlInput = document.getElementById("source-url");
    var labelInput = document.getElementById("source-label");
    var msg = document.getElementById("source-msg");
    if (!urlInput || !g) return;
    var url = normalizeSourceURL(urlInput.value, true);
    if (!url) {
      if (msg) msg.textContent = "httpまたはhttpsのURLを入力してください。";
      return;
    }
    var label = (labelInput && labelInput.value ? labelInput.value : "").trim() || sourceHostLabel(url);
    if (msg) msg.textContent = "追加中…";
    fetch(SUPABASE_URL + "/rest/v1/" + SOURCE_TABLE, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY,
        "Content-Type": "application/json", Prefer: "return=minimal"
      },
      body: JSON.stringify({ gin_name: g.name, label: label, url: url })
    }).then(function (res) {
      if (res.status === 201) {
        urlInput.value = "";
        if (labelInput) labelInput.value = "";
        loadInfoSources(g);
      } else if (msg) {
        msg.textContent = res.status === 404
          ? "保存先未設定です。SQLを実行してください。"
          : "追加に失敗しました（" + res.status + "）。";
      }
    }).catch(function () { if (msg) msg.textContent = "追加に失敗しました（通信エラー）。"; });
  }

  function removeInfoSource(g, id) {
    if (!g || !id || !memoUnlocked()) return;
    var msg = document.getElementById("source-msg");
    if (msg) msg.textContent = "削除中…";
    fetch(SUPABASE_URL + "/rest/v1/" + SOURCE_TABLE + "?id=eq." + encodeURIComponent(id), {
      method: "DELETE",
      headers: {
        apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY,
        Prefer: "return=minimal"
      }
    }).then(function (res) {
      if (res.status === 204) {
        g._infoSources = (g._infoSources || []).filter(function (src) { return String(src.id) !== String(id); });
        renderSourceSection(g);
      } else if (msg) {
        msg.textContent = "削除に失敗しました（" + res.status + "）。";
      }
    }).catch(function () { if (msg) msg.textContent = "削除に失敗しました（通信エラー）。"; });
  }

  // ===== スタッフメモ（各ジンごと・全員閲覧／スタッフのみPIN投稿）=====
  function safeSGet(k) { try { return window.sessionStorage.getItem(k); } catch (e) { return null; } }
  function safeSSet(k, v) { try { window.sessionStorage.setItem(k, v); } catch (e) {} }
  function memoUnlocked() { return safeSGet(MEMO_UNLOCK_KEY) === "1"; }

  // SHA-256（PIN照合。https/localhost の安全コンテキストで動作）
  function sha256hex(str) {
    var data = new TextEncoder().encode(str);
    return crypto.subtle.digest("SHA-256", data).then(function (buf) {
      var b = new Uint8Array(buf), out = "";
      for (var i = 0; i < b.length; i++) out += b[i].toString(16).padStart(2, "0");
      return out;
    });
  }

  function fmtMemoTime(s) {
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(s == null ? "" : s));
    return m ? (Number(m[2]) + "/" + Number(m[3])) : "";
  }

  // メモ追加UI：解錠済みなら入力欄、未解錠ならPINゲート
  function memoAddHTML() {
    if (memoUnlocked()) {
      return '<div class="memo-add">' +
        '<textarea id="memo-input" class="memo-input" rows="2" maxlength="500" placeholder="例：ラスト1本／○○さん推し／次回入荷未定"></textarea>' +
        '<button type="button" class="memo-send">メモを追加</button>' +
        '<p class="memo-hint" id="memo-msg"></p>' +
        "</div>";
    }
    return '<div class="memo-add">' +
      '<button type="button" class="memo-unlock">＋ メモを追加（スタッフ）</button>' +
      '<div class="memo-pin-row" id="memo-pin-row" hidden>' +
        '<input id="memo-pin" class="memo-pin" type="password" inputmode="numeric" autocomplete="off" placeholder="スタッフPIN" />' +
        '<button type="button" class="memo-pin-ok">解錠</button>' +
        '<span class="memo-hint" id="memo-pin-err"></span>' +
      "</div>" +
      "</div>";
  }

  function renderMemoSection(g, memos, errMsg) {
    var box = document.getElementById("memo-box");
    if (!box) return;
    if (memos) g._memos = memos;
    memos = memos || g._memos || [];
    var canEdit = memoUnlocked();
    var listHTML;
    if (errMsg) {
      listHTML = '<p class="memo-empty">' + esc(errMsg) + "</p>";
    } else if (memos && memos.length) {
      var items = memos.map(function (m) {
        var id = String(m.id || "");
        var t = fmtMemoTime(m.created_at);
        if (canEdit && id && memoEditId === id) {
          return '<li class="memo-item memo-editing" data-memo-id="' + esc(id) + '">' +
            '<textarea id="memo-edit-input" class="memo-input memo-edit-input" rows="3" maxlength="500">' + esc(m.memo) + '</textarea>' +
            '<div class="memo-actions">' +
              '<button type="button" class="memo-update" data-memo-id="' + esc(id) + '">保存</button>' +
              '<button type="button" class="memo-cancel">キャンセル</button>' +
            '</div>' +
            '<p class="memo-hint" id="memo-edit-msg"></p>' +
          "</li>";
        }
        var actions = canEdit && id
          ? '<span class="memo-actions">' +
              '<button type="button" class="memo-edit" data-memo-id="' + esc(id) + '">編集</button>' +
              '<button type="button" class="memo-delete" data-memo-id="' + esc(id) + '">削除</button>' +
            "</span>"
          : "";
        return '<li class="memo-item" data-memo-id="' + esc(id) + '"><span class="memo-text">' + esc(m.memo) + "</span>" +
          '<span class="memo-meta">' + (t ? '<span class="memo-time">' + esc(t) + "</span>" : "") + actions + "</span></li>";
      }).join("");
      listHTML = '<ul class="memo-list">' + items + "</ul>";
    } else {
      listHTML = '<p class="memo-empty">まだメモはありません。</p>';
    }
    box.innerHTML = listHTML + memoAddHTML();
  }

  function loadMemos(g) {
    var box = document.getElementById("memo-box");
    if (!box || !g) return;
    if (!SUPABASE_URL || SUPABASE_URL.indexOf("YOUR_PROJECT_REF") !== -1) {
      renderMemoSection(g, []); return;
    }
    // status列はanonにGRANTしていないため絞り込みに使わない（RLSが既にactive行だけ返す）
    var url = SUPABASE_URL + "/rest/v1/" + MEMO_TABLE +
      "?gin_name=eq." + encodeURIComponent(g.name) +
      "&select=id,memo,created_at&order=created_at.desc";
    fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (rows) { renderMemoSection(g, rows || []); })
      .catch(function () { renderMemoSection(g, []); });
  }

  // スタッフPIN照合（メモ・タグ共通）。解錠成功でモーダルを再描画し両方の編集UIを出す。
  function verifyStaffPin(pinId, errId) {
    var inp = document.getElementById(pinId);
    var err = document.getElementById(errId);
    if (!inp) return;
    var val = (inp.value || "").trim();
    if (!val) return;
    if (err) err.textContent = "";
    if (!window.crypto || !crypto.subtle) { if (err) err.textContent = "httpsで開いてください。"; return; }
    sha256hex(val).then(function (h) {
      if (h === MEMO_PIN_SHA256) { safeSSet(MEMO_UNLOCK_KEY, "1"); if (modalGin) openModal(modalGin); }
      else if (err) { err.textContent = "PINが違います。"; inp.value = ""; }
    }).catch(function () { if (err) err.textContent = "PIN照合エラー。"; });
  }

  function submitMemo(g) {
    var inp = document.getElementById("memo-input");
    var msg = document.getElementById("memo-msg");
    if (!inp || !g) return;
    var text = (inp.value || "").trim();
    if (!text) { if (msg) msg.textContent = "メモを入力してください。"; return; }
    if (msg) msg.textContent = "送信中…";
    fetch(SUPABASE_URL + "/rest/v1/" + MEMO_TABLE, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY,
        "Content-Type": "application/json", Prefer: "return=minimal"
      },
      body: JSON.stringify({ gin_name: g.name, memo: text })
    }).then(function (res) {
      if (res.status === 201) { inp.value = ""; loadMemos(g); }
      else if (msg) msg.textContent = "送信に失敗しました（" + res.status + "）。オーナーにご連絡ください。";
    }).catch(function () { if (msg) msg.textContent = "送信に失敗しました（通信エラー）。"; });
  }

  function beginMemoEdit(g, id) {
    if (!g || !id || !memoUnlocked()) return;
    memoEditId = String(id);
    renderMemoSection(g);
    var inp = document.getElementById("memo-edit-input");
    if (inp) { inp.focus(); inp.select(); }
  }

  function cancelMemoEdit(g) {
    memoEditId = "";
    renderMemoSection(g);
  }

  function updateMemo(g, id) {
    var inp = document.getElementById("memo-edit-input");
    var msg = document.getElementById("memo-edit-msg");
    if (!g || !id || !inp || !memoUnlocked()) return;
    var text = (inp.value || "").trim();
    if (!text) { if (msg) msg.textContent = "メモを入力してください。"; return; }
    if (msg) msg.textContent = "保存中…";
    fetch(SUPABASE_URL + "/rest/v1/" + MEMO_TABLE + "?id=eq." + encodeURIComponent(id), {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY,
        "Content-Type": "application/json", Prefer: "return=minimal"
      },
      body: JSON.stringify({ memo: text })
    }).then(function (res) {
      if (res.status === 204) {
        memoEditId = "";
        loadMemos(g);
      } else if (msg) {
        msg.textContent = "保存に失敗しました（" + res.status + "）。SQLの編集権限を確認してください。";
      }
    }).catch(function () { if (msg) msg.textContent = "保存に失敗しました（通信エラー）。"; });
  }

  function deleteMemo(g, id) {
    if (!g || !id || !memoUnlocked()) return;
    var msg = document.getElementById("memo-msg");
    if (msg) msg.textContent = "削除中…";
    fetch(SUPABASE_URL + "/rest/v1/" + MEMO_TABLE + "?id=eq." + encodeURIComponent(id), {
      method: "DELETE",
      headers: {
        apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY,
        Prefer: "return=minimal"
      }
    }).then(function (res) {
      if (res.status === 204) {
        if (memoEditId === String(id)) memoEditId = "";
        loadMemos(g);
      } else if (msg) {
        msg.textContent = "削除に失敗しました（" + res.status + "）。SQLの削除権限を確認してください。";
      }
    }).catch(function () { if (msg) msg.textContent = "削除に失敗しました（通信エラー）。"; });
  }

  // ===== 風味タグ（各ジンごと・全員閲覧／スタッフのみPIN編集。PINはメモと共通）=====
  function uniqArr(a) {
    var seen = {}, out = [];
    (a || []).forEach(function (x) { if (x && !seen[x]) { seen[x] = 1; out.push(x); } });
    return out;
  }

  // 全銘柄ぶんの風味タグをSupabaseから読み込み、各 g._tags に付与＋フィルタ再構築
  function loadAllTags() {
    if (!SUPABASE_URL || SUPABASE_URL.indexOf("YOUR_PROJECT_REF") !== -1) return;
    // status列はanonにGRANTしていないため絞り込みに使わない（RLSが既にactive行だけ返す）
    var url = SUPABASE_URL + "/rest/v1/" + TAGS_TABLE + "?select=gin_name,tag";
    fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (rows) {
        if (!rows) return;
        var byGin = {};
        rows.forEach(function (row) {
          var k = normName(row.gin_name);
          (byGin[k] = byGin[k] || []).push(row.tag);
        });
        GINS.forEach(function (g) {
          var arr = uniqArr(byGin[normName(g.name)] || []);
          g._tags = arr;
          g._hay = buildHay(g) + " " + normSearch(arr.join(" "));
        });
        buildControls();
        render();
        if (modalGin && els.modal && !els.modal.hidden) renderTagSection(modalGin);
      })
      .catch(function () { /* タグが読めなくてもカタログは通常どおり */ });
  }

  // 付与パレット（解錠スタッフ用・群ごとにタグを並べる）
  function tagPaletteHTML(g) {
    var applied = g._tags || [];
    var html = '<div class="tag-palette">';
    FLAVOR_GROUPS.forEach(function (grp) {
      html += '<div class="tag-grp-label">' + esc(grp.group) + '</div><div class="tag-grp">';
      grp.tags.forEach(function (t) {
        var on = applied.indexOf(t) >= 0;
        html += '<button type="button" class="tag-pick' + (on ? " is-on" : "") + '" data-tag="' + esc(t) +
          '" title="' + esc(TAG_DESC[t] || "") + '"' + (on ? " disabled" : "") + ">" + esc(t) + "</button>";
      });
      html += "</div>";
    });
    html += '<p class="memo-hint" id="tag-msg">タップで追加。付与済みタグの×で取り消しできます。</p></div>';
    return html;
  }

  function tagChipHTML(tag, canRemove) {
    if (!canRemove) {
      return '<span class="tag-chip is-on" title="' + esc(TAG_DESC[tag] || "") + '">' + esc(tag) + "</span>";
    }
    return '<button type="button" class="tag-chip tag-remove is-on" data-tag="' + esc(tag) +
      '" title="' + esc(tag) + 'を取り消す"><span>' + esc(tag) +
      '</span><span class="tag-remove-mark" aria-hidden="true">×</span></button>';
  }

  function renderTagSection(g) {
    var box = document.getElementById("tag-box");
    if (!box) return;
    var applied = g._tags || [];
    var canRemove = memoUnlocked();
    var appliedHTML = applied.length
      ? '<div class="tag-applied">' + applied.map(function (t) {
          return tagChipHTML(t, canRemove);
        }).join("") + "</div>"
      : '<p class="memo-empty">まだ風味タグはありません。</p>';
    var addHTML;
    if (memoUnlocked()) {
      addHTML = tagPaletteHTML(g);
    } else {
      addHTML = '<div class="memo-add">' +
        '<button type="button" class="tag-unlock">＋ タグを付ける（スタッフ）</button>' +
        '<div class="memo-pin-row" id="tag-pin-row" hidden>' +
          '<input id="tag-pin" class="memo-pin" type="password" inputmode="numeric" autocomplete="off" placeholder="スタッフPIN" />' +
          '<button type="button" class="tag-pin-ok">解錠</button>' +
          '<span class="memo-hint" id="tag-pin-err"></span>' +
        "</div>" +
        "</div>";
    }
    box.innerHTML = appliedHTML + addHTML;
  }

  function addTag(g, tag) {
    if (!g || !tag) return;
    if ((g._tags || []).indexOf(tag) >= 0) return;
    var msg = document.getElementById("tag-msg");
    if (msg) msg.textContent = "追加中…";
    fetch(SUPABASE_URL + "/rest/v1/" + TAGS_TABLE, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY,
        "Content-Type": "application/json", Prefer: "return=minimal"
      },
      body: JSON.stringify({ gin_name: g.name, tag: tag })
    }).then(function (res) {
      if (res.status === 201) {
        g._tags = uniqArr((g._tags || []).concat([tag]));
        g._hay = buildHay(g) + " " + normSearch(g._tags.join(" "));
        renderTagSection(g);
        render();
      } else if (msg) {
        msg.textContent = "追加に失敗しました（" + res.status + "）。";
      }
    }).catch(function () { if (msg) msg.textContent = "追加に失敗しました（通信エラー）。"; });
  }

  function removeTag(g, tag) {
    if (!g || !tag || !memoUnlocked()) return;
    if ((g._tags || []).indexOf(tag) < 0) return;
    var msg = document.getElementById("tag-msg");
    if (msg) msg.textContent = "取り消し中…";
    var url = SUPABASE_URL + "/rest/v1/" + TAGS_TABLE +
      "?gin_name=eq." + encodeURIComponent(g.name) +
      "&tag=eq." + encodeURIComponent(tag);
    fetch(url, {
      method: "DELETE",
      headers: {
        apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY,
        Prefer: "return=minimal"
      }
    }).then(function (res) {
      if (res.status === 204) {
        g._tags = (g._tags || []).filter(function (t) { return t !== tag; });
        g._hay = buildHay(g) + " " + normSearch(g._tags.join(" "));
        buildControls();
        renderTagSection(g);
        render();
      } else if (msg) {
        msg.textContent = "取り消しに失敗しました（" + res.status + "）。SQLの削除権限を確認してください。";
      }
    }).catch(function () { if (msg) msg.textContent = "取り消しに失敗しました（通信エラー）。"; });
  }

  function renderAromaSection(g) {
    var box = document.getElementById("aroma-box");
    if (!box || !g) return;
    var current = Number(g._aromaStrength) || 0;
    var value = g._aromaStrengthSet ? current : 0;
    var lockedHTML = '<div class="memo-add">' +
      '<button type="button" class="aroma-unlock">＋ 強さを設定（スタッフ）</button>' +
      '<div class="memo-pin-row" id="aroma-pin-row" hidden>' +
        '<input id="aroma-pin" class="memo-pin" type="password" inputmode="numeric" autocomplete="off" placeholder="スタッフPIN" />' +
        '<button type="button" class="aroma-pin-ok">解錠</button>' +
        '<span class="memo-hint" id="aroma-pin-err"></span>' +
      "</div>" +
      "</div>";
    var unavailable = aromaStrengthState === "unavailable";
    var loading = aromaStrengthState === "loading";
    var editHTML = '<div class="aroma-editor">' +
      '<div class="aroma-slider-row">' +
        '<input id="aroma-range" class="aroma-range" type="range" min="0" max="10" step="1" value="' + value + '"' + (unavailable ? " disabled" : "") + ' />' +
        '<output id="aroma-output" class="aroma-output">' + value + '</output>' +
      '</div>' +
      '<button type="button" class="aroma-save"' + (unavailable ? " disabled" : "") + '>保存</button>' +
      '<p class="memo-hint aroma-msg" id="aroma-msg">' +
        (unavailable ? "保存先未設定です。supabase_aroma_strengths_setup.sql を実行すると共有保存できます。" : "") +
      '</p>' +
      "</div>";
    box.innerHTML =
      (loading ? '<p class="memo-hint aroma-loading">共有値を読み込み中…</p>' : "") +
      (memoUnlocked() ? editHTML : lockedHTML);
  }

  function updateAromaOutput() {
    var range = document.getElementById("aroma-range");
    var out = document.getElementById("aroma-output");
    if (range && out) out.textContent = range.value;
  }

  function loadAllAromaStrengths() {
    if (!SUPABASE_URL || SUPABASE_URL.indexOf("YOUR_PROJECT_REF") !== -1) return;
    var url = SUPABASE_URL + "/rest/v1/" + AROMA_TABLE +
      "?select=gin_name,strength,created_at&order=created_at.desc";
    fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY } })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (rows) {
        var byGin = {};
        (rows || []).forEach(function (row) {
          var k = normName(row.gin_name);
          if (!Object.prototype.hasOwnProperty.call(byGin, k)) byGin[k] = Number(row.strength) || 0;
        });
        GINS.forEach(function (g) {
          var key = normName(g.name);
          if (Object.prototype.hasOwnProperty.call(byGin, key)) {
            g._aromaStrength = byGin[key];
            g._aromaStrengthSet = true;
          } else {
            g._aromaStrength = 0;
            g._aromaStrengthSet = false;
          }
        });
        aromaStrengthState = "ready";
        render();
        if (modalGin && els.modal && !els.modal.hidden) renderAromaSection(modalGin);
      })
      .catch(function () {
        aromaStrengthState = "unavailable";
        render();
        if (modalGin && els.modal && !els.modal.hidden) renderAromaSection(modalGin);
      });
  }

  function submitAromaStrength(g) {
    var range = document.getElementById("aroma-range");
    var msg = document.getElementById("aroma-msg");
    if (!range || !g) return;
    var strength = Number(range.value);
    if (!(strength >= 0 && strength <= 10)) {
      if (msg) msg.textContent = "0〜10の範囲で選んでください。";
      return;
    }
    if (msg) msg.textContent = "保存中…";
    fetch(SUPABASE_URL + "/rest/v1/" + AROMA_TABLE, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY,
        "Content-Type": "application/json", Prefer: "return=minimal"
      },
      body: JSON.stringify({ gin_name: g.name, strength: strength })
    }).then(function (res) {
      if (res.status === 201) {
        g._aromaStrength = strength;
        g._aromaStrengthSet = true;
        aromaStrengthState = "ready";
        render();
        renderAromaSection(g);
      } else {
        if (res.status === 404) aromaStrengthState = "unavailable";
        if (msg) msg.textContent = "保存に失敗しました（" + res.status + "）。";
      }
    }).catch(function () { if (msg) msg.textContent = "保存に失敗しました（通信エラー）。"; });
  }

  function clampStaffRating(v) {
    var n = Math.round(Number(v));
    if (!isFinite(n)) n = 0;
    if (n < 0) return 0;
    if (n > 10) return 10;
    return n;
  }

  function renderStaffRatingSection(g) {
    var box = document.getElementById("rating-box");
    if (!box || !g) return;
    var value = g._staffRatingSet ? clampStaffRating(g._staffRating) : 0;
    var unavailable = staffRatingState === "unavailable";
    var loading = staffRatingState === "loading";
    var lockedHTML = '<div class="memo-add">' +
      '<button type="button" class="rating-unlock">＋ 評価を設定（スタッフ）</button>' +
      '<div class="memo-pin-row" id="rating-pin-row" hidden>' +
        '<input id="rating-pin" class="memo-pin" type="password" inputmode="numeric" autocomplete="off" placeholder="スタッフPIN" />' +
        '<button type="button" class="rating-pin-ok">解錠</button>' +
        '<span class="memo-hint" id="rating-pin-err"></span>' +
      "</div>" +
      "</div>";
    var displayHTML = '<div class="rating-display">' +
      '<span class="rating-score-main">' + (g._staffRatingSet ? value : "-") + '</span>' +
      '<span class="rating-score-sub">' + (g._staffRatingSet ? "/10" : "未設定") + "</span>" +
      "</div>";
    var editHTML = '<div class="rating-editor">' +
      '<div class="rating-slider-row">' +
        '<input id="rating-range" class="rating-range" type="range" min="0" max="10" step="1" value="' + value + '"' + (unavailable ? " disabled" : "") + ' />' +
        '<output id="rating-output" class="rating-output">' + value + '</output>' +
      '</div>' +
      '<button type="button" class="rating-save"' + (unavailable ? " disabled" : "") + '>保存</button>' +
      '<p class="memo-hint rating-msg" id="rating-msg">' +
        (unavailable ? "保存先未設定です。supabase_staff_ratings_setup.sql を実行すると共有保存できます。" : "") +
      '</p>' +
      "</div>";
    box.innerHTML =
      (loading ? '<p class="memo-hint rating-loading">共有評価を読み込み中…</p>' : "") +
      displayHTML +
      (memoUnlocked() ? editHTML : lockedHTML);
  }

  function updateStaffRatingOutput() {
    var range = document.getElementById("rating-range");
    var out = document.getElementById("rating-output");
    if (range && out) out.textContent = clampStaffRating(range.value);
  }

  function loadAllStaffRatings() {
    if (!SUPABASE_URL || SUPABASE_URL.indexOf("YOUR_PROJECT_REF") !== -1) return;
    var url = SUPABASE_URL + "/rest/v1/" + RATING_TABLE +
      "?select=gin_name,rating,created_at&order=created_at.desc";
    fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY } })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (rows) {
        var byGin = {};
        (rows || []).forEach(function (row) {
          var k = normName(row.gin_name);
          if (!Object.prototype.hasOwnProperty.call(byGin, k)) byGin[k] = clampStaffRating(row.rating);
        });
        GINS.forEach(function (g) {
          var key = normName(g.name);
          if (Object.prototype.hasOwnProperty.call(byGin, key)) {
            g._staffRating = byGin[key];
            g._staffRatingSet = true;
          } else {
            g._staffRating = 0;
            g._staffRatingSet = false;
          }
        });
        staffRatingState = "ready";
        render();
        if (modalGin && els.modal && !els.modal.hidden) renderStaffRatingSection(modalGin);
      })
      .catch(function () {
        staffRatingState = "unavailable";
        render();
        if (modalGin && els.modal && !els.modal.hidden) renderStaffRatingSection(modalGin);
      });
  }

  function submitStaffRating(g) {
    var inp = document.getElementById("rating-range");
    var msg = document.getElementById("rating-msg");
    if (!inp || !g) return;
    var rating = clampStaffRating(inp.value);
    if (msg) msg.textContent = "保存中…";
    fetch(SUPABASE_URL + "/rest/v1/" + RATING_TABLE, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY,
        "Content-Type": "application/json", Prefer: "return=minimal"
      },
      body: JSON.stringify({ gin_name: g.name, rating: rating })
    }).then(function (res) {
      if (res.status === 201) {
        g._staffRating = rating;
        g._staffRatingSet = true;
        staffRatingState = "ready";
        render();
        renderStaffRatingSection(g);
      } else {
        if (res.status === 404) staffRatingState = "unavailable";
        if (msg) msg.textContent = "保存に失敗しました（" + res.status + "）。";
      }
    }).catch(function () { if (msg) msg.textContent = "保存に失敗しました（通信エラー）。"; });
  }

  function clampBottlePrice(v) {
    var raw = String(v == null ? "" : v).replace(/[^\d.]/g, "");
    var n = Math.round(Number(raw));
    if (!isFinite(n) || n < 0) n = 0;
    if (n > 1000000) return 1000000;
    return n;
  }

  function clampBottleMl(v) {
    var raw = String(v == null ? "" : v).replace(/[^\d.]/g, "");
    var n = Math.round(Number(raw));
    if (!isFinite(n) || n <= 0) n = DEFAULT_BOTTLE_ML;
    if (n < 50) return 50;
    if (n > 3000) return 3000;
    return n;
  }

  function renderBottlePriceSection(g) {
    var box = document.getElementById("price-box");
    if (!box || !g) return;
    var value = g._bottlePriceSet ? clampBottlePrice(g._bottlePrice) : 0;
    var ml = bottleMlValue(g);
    var cost = pourCost(g);
    var unavailable = bottlePriceState === "unavailable";
    var loading = bottlePriceState === "loading";
    var lockedHTML = '<div class="memo-add">' +
      '<button type="button" class="price-unlock">＋ 価格目安を設定（スタッフ）</button>' +
      '<div class="memo-pin-row" id="price-pin-row" hidden>' +
        '<input id="price-pin" class="memo-pin" type="password" inputmode="numeric" autocomplete="off" placeholder="スタッフPIN" />' +
        '<button type="button" class="price-pin-ok">解錠</button>' +
        '<span class="memo-hint" id="price-pin-err"></span>' +
      "</div>" +
      "</div>";
    var displayHTML = g._bottlePriceSet
      ? '<div class="price-facts">' +
          '<div class="price-fact"><span>ボトル</span><b>' + esc(yenLabel(value)) + "</b></div>" +
          '<div class="price-fact"><span>容量</span><b>' + esc(mlLabel(ml)) + (g._bottleMlSet ? "" : '<em>目安</em>') + "</b></div>" +
          '<div class="price-fact"><span>30ml原価</span><b>' + esc(yenLabel(cost)) + "</b></div>" +
        "</div>"
      : '<p class="memo-empty">まだ価格目安はありません。</p>';
    var editHTML = '<div class="price-editor">' +
      '<label class="price-field"><span>価格</span><input id="price-input" class="price-input" type="number" inputmode="numeric" min="0" max="1000000" step="100" value="' +
        (value || "") + '" placeholder="4500" ' + (unavailable ? "disabled" : "") + '/></label>' +
      '<label class="price-field"><span>容量ml</span><input id="price-ml-input" class="price-input" type="number" inputmode="numeric" min="50" max="3000" step="10" value="' +
        ml + '" placeholder="700" ' + (unavailable ? "disabled" : "") + '/></label>' +
      '<button type="button" class="price-save"' + (unavailable ? " disabled" : "") + '>保存</button>' +
      '<p class="memo-hint price-msg" id="price-msg">' +
        (unavailable ? "保存先未設定です。supabase_bottle_prices_setup.sql を実行すると共有保存できます。" : "価格はざっくりでOK。容量が未確定なら700ml目安で30ml原価を出します。") +
      '</p>' +
      "</div>";
    box.innerHTML =
      (loading ? '<p class="memo-hint price-loading">共有価格を読み込み中…</p>' : "") +
      displayHTML +
      (memoUnlocked() ? editHTML : lockedHTML);
  }

  function loadAllBottlePrices() {
    var hasSupabase = !!SUPABASE_URL && SUPABASE_URL.indexOf("YOUR_PROJECT_REF") === -1;
    var headers = { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY };
    var withMlUrl = SUPABASE_URL + "/rest/v1/" + PRICE_TABLE +
      "?select=gin_name,price_yen,bottle_ml,created_at&order=created_at.desc";
    var fallbackUrl = SUPABASE_URL + "/rest/v1/" + PRICE_TABLE +
      "?select=gin_name,price_yen,created_at&order=created_at.desc";

    function applyRows(rows, preserveAbsent) {
      var byGin = {};
      (rows || []).forEach(function (row) {
        var k = normName(row.gin_name);
        if (!Object.prototype.hasOwnProperty.call(byGin, k)) {
          byGin[k] = {
            price: clampBottlePrice(row.price_yen),
            ml: row.bottle_ml == null ? 0 : clampBottleMl(row.bottle_ml)
          };
        }
      });
      GINS.forEach(function (g) {
        var key = normName(g.name);
        if (Object.prototype.hasOwnProperty.call(byGin, key) && byGin[key].price > 0) {
          g._bottlePrice = byGin[key].price;
          g._bottlePriceSet = true;
          if (byGin[key].ml) {
            g._bottleMl = byGin[key].ml;
            g._bottleMlSet = true;
          } else if (!g._bottleMlSet) {
            g._bottleMl = DEFAULT_BOTTLE_ML;
            g._bottleMlSet = false;
          }
        } else if (!preserveAbsent) {
          g._bottlePrice = 0;
          g._bottlePriceSet = false;
          g._bottleMl = DEFAULT_BOTTLE_ML;
          g._bottleMlSet = false;
        }
      });
      bottlePriceState = "ready";
      render();
      if (modalGin && els.modal && !els.modal.hidden) renderBottlePriceSection(modalGin);
    }

    function fetchSeedRows() {
      return fetch(BOTTLE_PRICE_SEED_URL, { cache: "no-store" })
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(function (rows) {
          if (rows && rows.length) applyRows(rows, false);
          return rows || [];
        })
        .catch(function () { return []; });
    }

    function fetchRemoteRows() {
      if (!hasSupabase) return Promise.resolve([]);
      return fetch(withMlUrl, { headers: headers })
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .catch(function () {
          return fetch(fallbackUrl, { headers: headers })
            .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
        });
    }

    fetchSeedRows()
      .then(function () { return fetchRemoteRows(); })
      .then(function (rows) {
        if (rows && rows.length) {
          applyRows(rows, true);
        } else if (bottlePriceState !== "ready") {
          applyRows([], false);
        }
      })
      .catch(function () {
        if (bottlePriceState !== "ready") bottlePriceState = "unavailable";
        render();
        if (modalGin && els.modal && !els.modal.hidden) renderBottlePriceSection(modalGin);
      });
  }

  function submitBottlePrice(g) {
    var inp = document.getElementById("price-input");
    var mlInp = document.getElementById("price-ml-input");
    var msg = document.getElementById("price-msg");
    if (!inp || !g) return;
    var price = clampBottlePrice(inp.value);
    var ml = clampBottleMl(mlInp ? mlInp.value : DEFAULT_BOTTLE_ML);
    if (price <= 0) { if (msg) msg.textContent = "1円以上の価格目安を入力してください。"; return; }
    if (msg) msg.textContent = "保存中…";
    var headers = {
      apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY,
      "Content-Type": "application/json", Prefer: "return=minimal"
    };
    function post(body) {
      return fetch(SUPABASE_URL + "/rest/v1/" + PRICE_TABLE, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(body)
      });
    }
    post({ gin_name: g.name, price_yen: price, bottle_ml: ml }).then(function (res) {
      if (res.status === 400) return post({ gin_name: g.name, price_yen: price });
      return res;
    }).then(function (res) {
      if (res.status === 201) {
        g._bottlePrice = price;
        g._bottlePriceSet = true;
        g._bottleMl = ml;
        g._bottleMlSet = true;
        bottlePriceState = "ready";
        render();
        renderBottlePriceSection(g);
      } else {
        if (res.status === 404) bottlePriceState = "unavailable";
        if (msg) msg.textContent = "保存に失敗しました（" + res.status + "）。";
      }
    }).catch(function () { if (msg) msg.textContent = "保存に失敗しました（通信エラー）。"; });
  }

  function init() {
    els = {
      q: $("q"), country: $("f-country"), bot: $("f-bot"), abv: $("f-abv"), aroma: $("f-aroma"), sort: $("f-sort"),
      count: $("result-count"), list: $("list"), reset: $("reset"),
      meta: $("data-meta"), kana: $("kana-index"), modal: $("gin-modal"),
      favFilter: $("fav-filter"),
      provFilter: $("prov-filter"),
      tag: $("f-tag"),
    };

    fetch("gins.json", { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (data) {
        GINS = (data && data.gins) || [];
        GINS.forEach(function (g) { g._bot = botTokens(g.botanicals); g._tags = g._tags || []; g._aromaStrength = 0; g._aromaStrengthSet = false; g._staffRating = 0; g._staffRatingSet = false; g._bottlePrice = 0; g._bottlePriceSet = false; g._bottleMl = DEFAULT_BOTTLE_ML; g._bottleMlSet = false; g._infoSources = []; g._hay = buildHay(g); }); // ボタニカル代表名化＋共有値初期化＋検索用テキスト
        if (els.meta) {
          var upd = fmtDate(data.updated);
          els.meta.textContent = "在庫 " + GINS.length + "銘柄" + (upd ? "・データ最終更新 " + upd : "");
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
        [els.country, els.bot, els.abv, els.aroma, els.sort, els.tag].forEach(function (s) { if (s) s.addEventListener("change", render); });
        els.reset.addEventListener("click", resetAll);
        if (els.favFilter) {
          els.favFilter.addEventListener("click", function () { favOnly = !favOnly; render(); });
        }
        if (els.provFilter) {
          els.provFilter.addEventListener("click", function () { provOnly = !provOnly; render(); });
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

        // モーダル内の★トグル／ボタニカル小窓／閉じる（×・背景クリック・Esc）
        els.modal.addEventListener("click", function (e) {
          var favBtn = e.target.closest(".modal-fav");
          if (favBtn) {
            toggleFav(favBtn.getAttribute("data-name"));
            render();
            if (modalGin) openModal(modalGin); // モーダルの★表示を更新
            return;
          }
          var botBtn = e.target.closest(".bot-link[data-botanical]");
          if (botBtn) { showBotanicalInfo(botBtn.getAttribute("data-botanical")); return; }
          if (e.target.closest(".bot-mini-close")) { closeBotanicalInfo(); return; }
          if (e.target.closest(".memo-unlock")) {
            var prow = document.getElementById("memo-pin-row");
            if (prow) { prow.hidden = false; var pin = document.getElementById("memo-pin"); if (pin) pin.focus(); }
            return;
          }
          if (e.target.closest(".memo-pin-ok")) { verifyStaffPin("memo-pin", "memo-pin-err"); return; }
          if (e.target.closest(".memo-send")) { submitMemo(modalGin); return; }
          var memoEdit = e.target.closest(".memo-edit[data-memo-id]");
          if (memoEdit) { beginMemoEdit(modalGin, memoEdit.getAttribute("data-memo-id")); return; }
          var memoUpdate = e.target.closest(".memo-update[data-memo-id]");
          if (memoUpdate) { updateMemo(modalGin, memoUpdate.getAttribute("data-memo-id")); return; }
          if (e.target.closest(".memo-cancel")) { cancelMemoEdit(modalGin); return; }
          var memoDelete = e.target.closest(".memo-delete[data-memo-id]");
          if (memoDelete) { deleteMemo(modalGin, memoDelete.getAttribute("data-memo-id")); return; }
          if (e.target.closest(".source-unlock")) {
            var srow = document.getElementById("source-pin-row");
            if (srow) { srow.hidden = false; var sp = document.getElementById("source-pin"); if (sp) sp.focus(); }
            return;
          }
          if (e.target.closest(".source-pin-ok")) { verifyStaffPin("source-pin", "source-pin-err"); return; }
          if (e.target.closest(".source-send")) { submitInfoSource(modalGin); return; }
          var sourceRemove = e.target.closest(".source-remove[data-source-id]");
          if (sourceRemove) { removeInfoSource(modalGin, sourceRemove.getAttribute("data-source-id")); return; }
          if (e.target.closest(".tag-unlock")) {
            var trow = document.getElementById("tag-pin-row");
            if (trow) { trow.hidden = false; var tp = document.getElementById("tag-pin"); if (tp) tp.focus(); }
            return;
          }
          if (e.target.closest(".tag-pin-ok")) { verifyStaffPin("tag-pin", "tag-pin-err"); return; }
          var tagRemove = e.target.closest(".tag-remove[data-tag]");
          if (tagRemove) { removeTag(modalGin, tagRemove.getAttribute("data-tag")); return; }
          var pick = e.target.closest(".tag-pick");
          if (pick && !pick.disabled) { addTag(modalGin, pick.getAttribute("data-tag")); return; }
          if (e.target.closest(".aroma-unlock")) {
            var arow = document.getElementById("aroma-pin-row");
            if (arow) { arow.hidden = false; var ap = document.getElementById("aroma-pin"); if (ap) ap.focus(); }
            return;
          }
          if (e.target.closest(".aroma-pin-ok")) { verifyStaffPin("aroma-pin", "aroma-pin-err"); return; }
          if (e.target.closest(".aroma-save")) { submitAromaStrength(modalGin); return; }
          if (e.target.closest(".rating-unlock")) {
            var rrow = document.getElementById("rating-pin-row");
            if (rrow) { rrow.hidden = false; var rp = document.getElementById("rating-pin"); if (rp) rp.focus(); }
            return;
          }
          if (e.target.closest(".rating-pin-ok")) { verifyStaffPin("rating-pin", "rating-pin-err"); return; }
          if (e.target.closest(".rating-save")) { submitStaffRating(modalGin); return; }
          if (e.target.closest(".price-unlock")) {
            var priceRow = document.getElementById("price-pin-row");
            if (priceRow) { priceRow.hidden = false; var pricePin = document.getElementById("price-pin"); if (pricePin) pricePin.focus(); }
            return;
          }
          if (e.target.closest(".price-pin-ok")) { verifyStaffPin("price-pin", "price-pin-err"); return; }
          if (e.target.closest(".price-save")) { submitBottlePrice(modalGin); return; }
          if (e.target === els.modal || e.target.closest(".modal-close")) closeModal();
        });
        els.modal.addEventListener("input", function (e) {
          if (e.target.closest(".aroma-range")) updateAromaOutput();
          if (e.target.closest(".rating-range")) updateStaffRatingOutput();
        });
        document.addEventListener("keydown", function (e) {
          if (e.key === "Escape" && !els.modal.hidden) closeModal();
        });

        // 申請箱の「仮登録」を後追いで読み込んで合流（失敗してもカタログは動く）
        loadProvisional();
        // 風味タグを読み込んで各銘柄に付与＋フィルタ構築（失敗してもカタログは動く）
        loadAllTags();
        // 香りの強さを読み込んで各銘柄に付与（保存先未作成でもカタログは動く）
        loadAllAromaStrengths();
        // スタッフ共有評価を読み込んで各銘柄に付与（保存先未作成でもカタログは動く）
        loadAllStaffRatings();
        // ボトル価格目安を読み込んで各銘柄に付与（保存先未作成でもカタログは動く）
        loadAllBottlePrices();
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
