#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ジン在庫カタログ：データ自動取り込みスクリプト。

Googleスプレッドシート（ウェブ公開したCSV）を読み込み、カタログ用の gins.json を作り直す。
GitHub Actions から定期実行される（手動実行も可）。

【鍵・パスワード不要】公開CSVをただ読むだけなので、認証情報は一切使わない。
【標準ライブラリのみ】urllib / csv / json / re だけ。pip install 不要。

設定：CSVのURLは同じフォルダの `sheet_source.txt` に1行で書く（ウェブ公開で得たURL）。
"""
import csv
import io
import json
import os
import re
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE_FILE = os.path.join(HERE, "sheet_source.txt")
OUT_FILE = os.path.join(HERE, "gins.json")


def read_source_url():
    """sheet_source.txt からCSVのURLを読む（# 始まりの行と空行は無視）。"""
    if not os.path.exists(SOURCE_FILE):
        sys.exit("エラー: sheet_source.txt がありません。公開CSVのURLを1行で書いてください。")
    for line in open(SOURCE_FILE, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#"):
            return line
    sys.exit("エラー: sheet_source.txt にURLが書かれていません。")


def fetch_csv(url):
    """公開CSVを取得して文字列で返す。HTMLが返ってきたら設定ミスとして止める。"""
    req = urllib.request.Request(url, headers={"User-Agent": "gin-stock-builder"})
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read().decode("utf-8", errors="replace")
    head = raw.lstrip()[:200].lower()
    if head.startswith("<!doctype html") or head.startswith("<html"):
        sys.exit("エラー: CSVではなくHTMLが返りました。シートの『ウェブに公開（CSV）』設定とURLを確認してください。")
    return raw


def clean(v):
    if v is None:
        return ""
    return re.sub(r"\s+", " ", str(v).strip())


def country_main(c):
    """『日本（東京：蔵前）』→『日本』のように大分類を取り出す。"""
    if not c:
        return "その他・不明"
    return re.split(r"[（(：:]", c, 1)[0].strip() or "その他・不明"


def parse_abv(v):
    if v is None or str(v).strip() == "":
        return None
    m = re.match(r"^\s*([0-9]+(?:\.[0-9]+)?)", str(v))
    return float(m.group(1)) if m else None


def find_col(headers, *keys):
    """ヘッダー名に keys のどれかを含む列番号を返す（無ければ -1）。列の順番が変わっても動くように。"""
    for i, h in enumerate(headers):
        hh = clean(h)
        for k in keys:
            if k in hh:
                return i
    return -1


def main():
    url = read_source_url()
    text = fetch_csv(url)
    rows = list(csv.reader(io.StringIO(text)))
    if not rows:
        sys.exit("エラー: CSVが空です。")

    headers = rows[0]
    ci_name = find_col(headers, "ボトル", "ネーム", "銘柄", "名前")
    ci_abv = find_col(headers, "度数")
    ci_country = find_col(headers, "国", "産地")
    ci_kana = find_col(headers, "カタカナ", "カナ")
    ci_note = find_col(headers, "備考", "コメント", "説明")
    ci_bot = find_col(headers, "ボタニカル")
    if ci_name < 0:
        sys.exit("エラー: 銘柄名の列（ボトルネーム）が見つかりません。1行目の見出しを確認してください。")

    def cell(row, ci):
        return clean(row[ci]) if 0 <= ci < len(row) else ""

    gins = []
    for row in rows[1:]:
        name = cell(row, ci_name)
        if not name:
            continue  # 名前のない行は飛ばす
        country = cell(row, ci_country)
        gins.append({
            "name": name,
            "kana": cell(row, ci_kana),
            "abv": parse_abv(row[ci_abv] if 0 <= ci_abv < len(row) else None),
            "country": country,
            "country_main": country_main(country),
            "note": cell(row, ci_note),
            "botanicals": cell(row, ci_bot),
        })

    # 名前（カナ優先）で並べ替え
    gins.sort(key=lambda g: (g["kana"] or g["name"]))

    out = {
        "version": 6,
        "updated": "auto",  # 実際の日付はコミット履歴で分かる
        "source": "BarSoustu ジンの在庫の管理表（自動取り込み）",
        "count": len(gins),
        "gins": gins,
    }
    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"取り込み完了: {len(gins)} 銘柄 → gins.json")


if __name__ == "__main__":
    main()
