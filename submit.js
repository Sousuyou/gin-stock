/*
 * スタッフ用「新規ジン申請」処理（staff.html 専用）。
 * CSP（script-src 'self'）下で動くよう外部ファイル。インラインJSは使わない。
 *
 * 安全設計のポイント：
 *  - 送信は Supabase の「申請箱（gin_submissions / status=pending）」へINSERTするだけ。
 *    公開カタログ(gins.json)は一切書き換わらない＝事実確認の関所を必ず通る。
 *  - ここで使う SUPABASE_KEY は「公開してよいキー（publishable / anon）」。
 *    守りはキーの秘密ではなくDB側の権限設定(RLS)。anonはINSERTのみ・statusは設定不可。
 *  - PINは「一般客の目に触れさせない」ための簡易ゲート（暗号的防御ではない）。
 */
(function () {
  "use strict";

  // ===== 設定（Supabaseプロジェクト作成後にこの2つを書き換える）=====
  var SUPABASE_URL = "https://ypruajtzzfvfhgcirrsv.supabase.co"; // Bar Soutsu の Supabase プロジェクト
  var SUPABASE_KEY = "sb_publishable_eP6BBO6u2M4iTNkK_jjULA_94qadrt1"; // publishable(anon) キー＝公開してよいキー
  var TABLE = "gin_submissions";

  // ===== スタッフPIN（SHA-256ハッシュで照合。平文は置かない）=====
  // 既定PIN: soutsu2026 。STAFF_SETUP.md の手順で必ず自店のPINに変更すること。
  var PIN_SHA256 = "694b39a1bfa7ff68a9dee1972d6323fbb797f368fad85b74429e0fa696529263";
  var UNLOCK_KEY = "soutsu_staff_unlocked";

  var els = {};
  var existingNames = null; // 既存銘柄名（小文字trim）のSet。重複チェック用

  function $(id) { return document.getElementById(id); }

  // XSS対策：外部由来テキストは必ずエスケープ（app.jsと同方針）
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // 重複判定キー：全半角を揃え(NFKC)、連続空白を1つに畳んで小文字化（promote_pending.py と同方針）
  function normName(s) {
    return String(s == null ? "" : s).normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
  }

  // localStorage/sessionStorage は file:// 等で例外を投げることがあるので包む
  function safeGet(store, key) {
    try { return window[store].getItem(key); } catch (e) { return null; }
  }
  function safeSet(store, key, val) {
    try { window[store].setItem(key, val); } catch (e) {}
  }

  function isConfigured() {
    return SUPABASE_URL.indexOf("YOUR_PROJECT_REF") === -1 &&
           SUPABASE_KEY.indexOf("REPLACE_ME") === -1;
  }

  // ---- SHA-256（PIN照合用。https/localhost の安全コンテキストで動作）----
  function sha256hex(str) {
    var data = new TextEncoder().encode(str);
    return crypto.subtle.digest("SHA-256", data).then(function (buf) {
      var bytes = new Uint8Array(buf);
      var out = "";
      for (var i = 0; i < bytes.length; i++) {
        out += bytes[i].toString(16).padStart(2, "0");
      }
      return out;
    });
  }

  // ===== PINゲート =====
  function showForm() {
    els.gate.hidden = true;
    els.formWrap.hidden = false;
    loadExisting();
  }

  function handlePin() {
    var val = (els.pinInput.value || "").trim();
    if (!val) return;
    els.pinError.textContent = "";
    if (!crypto || !crypto.subtle) {
      // 安全でないコンテキスト（file://等）ではハッシュ照合不可
      els.pinError.textContent = "この環境ではPIN照合ができません（https で開いてください）。";
      return;
    }
    sha256hex(val).then(function (h) {
      if (h === PIN_SHA256) {
        safeSet("sessionStorage", UNLOCK_KEY, "1");
        showForm();
      } else {
        els.pinError.textContent = "PINが違います。";
        els.pinInput.value = "";
        els.pinInput.focus();
      }
    }).catch(function () {
      els.pinError.textContent = "PIN照合でエラーが発生しました（https で開いているか確認してください）。";
    });
  }

  // ===== 既存データ読込（重複チェック＋国の候補補完）=====
  function loadExisting() {
    fetch("gins.json", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !Array.isArray(data.gins)) return;
        existingNames = new Set();
        var mains = {};
        data.gins.forEach(function (g) {
          if (g.name) existingNames.add(normName(g.name));
          if (g.country_main) mains[String(g.country_main).trim()] = true;
        });
        // 国（代表）の候補をdatalistに（表記ゆれ防止）
        var list = Object.keys(mains).sort(function (a, b) { return a.localeCompare(b, "ja"); });
        els.countryList.innerHTML = list.map(function (m) {
          return '<option value="' + esc(m) + '"></option>';
        }).join("");
      })
      .catch(function () { /* 候補が出なくても入力は可能 */ });
  }

  function checkDup() {
    if (!existingNames) { els.dupWarn.textContent = ""; return; }
    var name = normName(els.name.value);
    if (name && existingNames.has(name)) {
      els.dupWarn.textContent = "⚠ 同名がカタログに既にあります。続行できますが、重複しないかご確認ください。";
    } else {
      els.dupWarn.textContent = "";
    }
  }

  // ===== 送信 =====
  function setMsg(text, kind) {
    els.msg.textContent = text;
    els.msg.className = "submit-msg" + (kind ? " is-" + kind : "");
  }

  function buildPayload() {
    var name = (els.name.value || "").trim();
    var kana = (els.kana.value || "").trim();
    // 銘柄名・カナ読みはどちらか一方でOK。空の側はもう片方で埋める
    // （申請箱の name/kana は NOT NULL。オーナーが事実確認時に正式表記へ整える）
    if (!name) name = kana;
    if (!kana) kana = name;
    var countryMain = (els.countryMain.value || "").trim();
    var country = (els.country.value || "").trim();
    var note = (els.note.value || "").trim();
    var bot = (els.botanicals.value || "").trim();

    // 度数：数値 or null（"40%"等が来てもparseFloatで救う）
    var abvRaw = (els.abv.value || "").trim();
    var abv = abvRaw === "" ? null : parseFloat(abvRaw);
    if (abv != null && (isNaN(abv) || abv < 0 || abv > 100)) abv = null;

    var p = {
      name: name,
      kana: kana,
      country_main: countryMain,
      abv: abv,
      country: country || null,
      note: note || null,
      botanicals: bot || null
    };
    if (els.notGin.checked) p.not_gin = true; // trueのときだけ送る
    // status はクライアントから送らない（DB側で必ず 'pending' になる）
    return p;
  }

  function handleSubmit() {
    setMsg("", "");
    // 必須チェック（銘柄名・カナ読みはどちらか一方でよい）
    var missing = [];
    if (!(els.name.value || "").trim() && !(els.kana.value || "").trim()) missing.push("銘柄名またはカナ読み（どちらか一方）");
    if (!(els.countryMain.value || "").trim()) missing.push("国（代表）");
    if (missing.length) {
      setMsg("必須項目が未入力です：" + missing.join("、"), "error");
      return;
    }
    if (!isConfigured()) {
      setMsg("管理者へ：Supabaseが未設定です（submit.js のURL/キーを設定してください）。", "error");
      return;
    }

    var payload = buildPayload();
    els.btn.disabled = true;
    setMsg("送信中…", "");

    fetch(SUPABASE_URL + "/rest/v1/" + TABLE, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": "Bearer " + SUPABASE_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=minimal" // 投稿専用テーブルなので必須（SELECTさせない）
      },
      body: JSON.stringify(payload)
    }).then(function (res) {
      els.btn.disabled = false;
      if (res.status === 201) {
        setMsg("申請箱に送りました。オーナーの事実確認のうえカタログに反映されます。ありがとうございます。", "ok");
        resetForm();
      } else {
        return res.text().then(function (t) {
          setMsg("送信に失敗しました（" + res.status + "）。オーナーにご連絡ください。", "error");
          // 失敗は握りつぶさない（取りこぼし防止）
          try { console.error("submit failed", res.status, t); } catch (e) {}
        });
      }
    }).catch(function (err) {
      els.btn.disabled = false;
      setMsg("送信に失敗しました（通信エラー）。電波とSupabaseの状態をご確認ください。", "error");
      try { console.error(err); } catch (e) {}
    });
  }

  function resetForm() {
    ["name", "kana", "abv", "country", "countryMain", "botanicals", "note"].forEach(function (k) {
      if (els[k]) els[k].value = "";
    });
    if (els.notGin) els.notGin.checked = false;
    els.dupWarn.textContent = "";
  }

  // ===== 初期化 =====
  function init() {
    els = {
      gate: $("pin-gate"),
      pinInput: $("pin-input"),
      pinBtn: $("pin-submit"),
      pinError: $("pin-error"),
      formWrap: $("form-wrap"),
      name: $("f-name"),
      kana: $("f-kana"),
      abv: $("f-abv"),
      country: $("f-country"),
      countryMain: $("f-country-main"),
      countryList: $("country-main-list"),
      botanicals: $("f-botanicals"),
      note: $("f-note"),
      notGin: $("f-not-gin"),
      btn: $("do-submit"),
      msg: $("submit-msg"),
      dupWarn: $("dup-warn")
    };

    els.pinBtn.addEventListener("click", handlePin);
    els.pinInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") handlePin();
    });
    els.btn.addEventListener("click", handleSubmit);
    els.name.addEventListener("input", checkDup);

    // 既に今回のセッションで解錠済みならフォームを表示
    if (safeGet("sessionStorage", UNLOCK_KEY) === "1") {
      showForm();
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
