#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
申請箱（Supabase）の「承認済み(approved)」をカタログ(gins.json)に昇格させるスクリプト。
オーナーが手元で実行する。SECRETキーを使う（RLSをバイパスして読める）ので、
このキーは絶対にリポジトリ／公開ページに置かないこと（.gitignore 済みの設定ファイルから読む）。

流れ：
  1. Supabaseから status='approved' の行を取得
  2. 型を強制し、必須項目(name/kana/country_main)を検証、既存と重複する銘柄は除外
  3. gins.json の gins 配列へ追記、count を実数で再計算、version を +1
  4. 昇格できた行は Supabase 上で status='promoted' に更新（二重登録防止）
  5. 何を追加し何を飛ばしたかを表示（push はしない＝オーナーが差分を確認してから手動で）

設定の渡し方（どちらか）：
  A) 環境変数 SUPABASE_URL と SUPABASE_SECRET_KEY
  B) 同じフォルダの .supabase_secret.json  例：
     { "url": "https://xxxx.supabase.co", "secret_key": "sb_secret_..." }
"""

import json
import os
import sys
import unicodedata
import urllib.request
import urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
GINS_PATH = os.path.join(HERE, "gins.json")
SECRET_PATH = os.path.join(HERE, ".supabase_secret.json")
TABLE = "gin_submissions"

# gins.json に書き出してよいキー（この8つ以外は絶対に混ぜない）
ALLOWED_KEYS = ["name", "kana", "abv", "country", "country_main", "note", "botanicals", "not_gin"]


def load_config():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SECRET_KEY")
    if not (url and key) and os.path.exists(SECRET_PATH):
        with open(SECRET_PATH, encoding="utf-8") as f:
            c = json.load(f)
        url = url or c.get("url")
        key = key or c.get("secret_key")
    if not (url and key):
        sys.exit("エラー: SUPABASE_URL と SUPABASE_SECRET_KEY（または .supabase_secret.json）が必要です。")
    return url.rstrip("/"), key


def api(method, url, key, path, body=None):
    """GET/PATCH 共通。失敗時は例外を送出（呼び出し側で扱う）。"""
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url + path, data=data, method=method)
    req.add_header("apikey", key)
    req.add_header("Authorization", "Bearer " + key)
    req.add_header("Content-Type", "application/json")
    if method == "PATCH":
        req.add_header("Prefer", "return=minimal")
    with urllib.request.urlopen(req) as res:
        raw = res.read().decode("utf-8")
        return json.loads(raw) if raw else None


def norm_name(name):
    """重複判定キー：全半角を揃え(NFKC)、連続空白を1つに畳んで小文字化。"""
    s = unicodedata.normalize("NFKC", str(name or "")).strip().lower()
    return " ".join(s.split())


def coerce_row(row, existing_names, added_names):
    """承認行を8キーの正規オブジェクトに整える。問題があれば (None, 理由) を返す。"""
    name = (row.get("name") or "").strip()
    kana = (row.get("kana") or "").strip()
    country_main = (row.get("country_main") or "").strip()

    if not name:
        return None, "銘柄名が空"
    if not kana:
        return None, "カナ読みが空（%s）" % name
    if not country_main:
        return None, "国（代表）が空（%s）" % name

    key = norm_name(name)
    if key in existing_names:
        return None, "既にカタログに存在（%s）" % name
    if key in added_names:
        return None, "今回の中で重複（%s）" % name

    # 度数：数値 or None、0〜100の範囲外はNone扱い
    abv = row.get("abv", None)
    if abv is not None:
        try:
            abv = float(abv)
            if abv < 0 or abv > 100:
                abv = None
        except (TypeError, ValueError):
            abv = None

    country = (row.get("country") or "").strip() or country_main  # 詳細が無ければ代表で代用
    note = (row.get("note") or "").strip()
    botanicals = (row.get("botanicals") or "").strip()

    obj = {
        "name": name,
        "kana": kana,
        "abv": abv,
        "country": country,
        "country_main": country_main,
        "note": note,
        "botanicals": botanicals,
    }
    if row.get("not_gin") is True:
        obj["not_gin"] = True
    # 念のため、許可キー以外は持ち込まない
    obj = {k: obj[k] for k in ALLOWED_KEYS if k in obj}
    return obj, None


def main():
    url, key = load_config()

    try:
        approved = api("GET", url, key,
                       "/rest/v1/%s?status=eq.approved&select=*&order=created_at.asc" % TABLE) or []
    except (urllib.error.HTTPError, urllib.error.URLError) as e:
        sys.exit("承認済みの取得に失敗しました（Supabase接続/キーを確認）: %s" % e)

    if not approved:
        print("承認済み(approved)の申請はありません。")
        return

    with open(GINS_PATH, encoding="utf-8") as f:
        data = json.load(f)
    gins = data.get("gins", [])
    existing_names = set(norm_name(g.get("name", "")) for g in gins)

    added_names = set()
    added, skipped = [], []
    promoted_ids = []

    for row in approved:
        obj, reason = coerce_row(row, existing_names, added_names)
        if obj is None:
            skipped.append((row.get("id"), reason))
            continue
        gins.append(obj)
        added_names.add(norm_name(obj["name"]))
        added.append(obj["name"])
        # id はDB採番のbigint。防御的に整数強制し、非整数の行は昇格対象から外す
        try:
            promoted_ids.append(int(row["id"]))
        except (KeyError, TypeError, ValueError):
            skipped.append((row.get("id"), "idが不正で promoted 更新不可（%s）" % obj["name"]))

    if not added:
        print("追加できる行がありませんでした。")
        for sid, reason in skipped:
            print("  - スキップ(id=%s): %s" % (sid, reason))
        return

    # count を実数で再計算、version を +1
    data["gins"] = gins
    data["count"] = len(gins)
    data["version"] = int(data.get("version", 0)) + 1

    with open(GINS_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")

    # 昇格できた行を promoted に更新（二重登録防止）。
    # gins.json は保存済みなので、PATCHが失敗しても「データ消失」より安全側の「重複候補」に倒れる。
    # 失敗は握りつぶさず必ず一覧で警告し、オーナーが手動で promoted にできるようにする。
    patch_failed = []
    for sid in promoted_ids:
        try:
            api("PATCH", url, key, "/rest/v1/%s?id=eq.%d" % (TABLE, sid), {"status": "promoted"})
        except (urllib.error.HTTPError, urllib.error.URLError) as e:
            patch_failed.append((sid, str(e)))

    print("✅ %d件をカタログに追加しました（version=%d / count=%d）。" %
          (len(added), data["version"], data["count"]))
    for n in added:
        print("  + " + n)
    if skipped:
        print("⚠ %d件はスキップしました：" % len(skipped))
        for sid, reason in skipped:
            print("  - id=%s: %s" % (sid, reason))
    if patch_failed:
        print("\n‼ 次のidは gins.json に追加済みですが、Supabaseの 'promoted' 更新に失敗しました。")
        print("   再実行での二重追加を防ぐため、ダッシュボードで手動で status を 'promoted' にしてください：")
        for sid, err in patch_failed:
            print("   - id=%s（%s）" % (sid, err))
    print("\n次の手順：gins.json の差分を確認してから push してください（CSVが必要なら python3 export_csv.py）。")


if __name__ == "__main__":
    main()
