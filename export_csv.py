#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ジン在庫カタログ：gins.json から「あなたの手元ファイル更新用CSV」を書き出すツール。

新しい運用（2026-06-09〜）では、このリポジトリの gins.json が元データ（マスター）。
Googleスプレッドシートは使わない。たまにこのスクリプトでCSVを作り、
ユーザーが自分の手元ファイル（Excel等）を最新版に差し替えるのに使う。

使い方:  python3 export_csv.py
出力:    ジン在庫_最新版.csv（同じフォルダ）。Excelでそのまま開ける（UTF-8 BOM付き）。
"""
import csv
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "gins.json")
OUT = os.path.join(HERE, "ジン在庫_最新版.csv")

# 出力する列（見出し名と、gins.json側のキー）
COLUMNS = [
    ("ボトルネーム", "name"),
    ("カタカナ", "kana"),
    ("度数", "abv"),
    ("国", "country"),
    ("ボタニカル", "botanicals"),
    ("備考", "note"),
]


def main():
    data = json.load(open(SRC, encoding="utf-8"))
    gins = data.get("gins", [])
    # Excelで文字化けしないよう UTF-8 BOM 付きで書き出す
    with open(OUT, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow([c[0] for c in COLUMNS])
        for g in gins:
            row = []
            for _, key in COLUMNS:
                v = g.get(key, "")
                if key == "abv" and v is not None:
                    # 47.0 → 47、47.7 → 47.7 のように見やすく
                    v = int(v) if float(v).is_integer() else v
                row.append("" if v is None else v)
            w.writerow(row)
    print(f"書き出し完了: {len(gins)} 銘柄 → {os.path.basename(OUT)}")


if __name__ == "__main__":
    main()
