import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ginsPath = path.join(root, "gins.json");
const outDir = path.join(root, "data");
const today = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).format(new Date()).replace(/\D/g, "");
const csvPath = path.join(outDir, `bottle_price_estimates_${today}.csv`);
const sqlPath = path.join(outDir, `bottle_price_estimates_${today}.sql`);
const combinedSqlPath = path.join(outDir, `bottle_price_setup_and_seed_${today}.sql`);
const setupSqlPath = path.join(root, "supabase_bottle_prices_setup.sql");

const MIN_PRICE = 900;
const MAX_PRICE = 250000;
const CONCURRENCY = Number(process.env.PRICE_CONCURRENCY || 8);
const TIMEOUT_MS = Number(process.env.PRICE_TIMEOUT_MS || 12000);

const shopDomainHints = [
  "ginbottle.shop",
  "store.musashiya-net.co.jp",
  "syurui.co.jp",
  "shop.gotogin.jp",
  "store.shopping.yahoo.co.jp",
  "rakuten.co.jp",
  "amazon.co.jp",
  "liquorpage.com",
  "babo.wine",
  "masterofmalt.com",
  "thewhiskyexchange.com",
  "caskcartel.com",
  "ginshop.it",
  "totalwine.com",
  "dekanta.com",
  "urban-drinks.de",
  "whiskyexchange.com"
];

function escCsv(value) {
  return `"${String(value == null ? "" : value).replace(/"/g, '""')}"`;
}

function escSql(value) {
  return String(value == null ? "" : value).replace(/'/g, "''");
}

function htmlDecode(s) {
  return String(s || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&yen;/g, "¥")
    .replace(/&#165;/g, "¥")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function compactText(s) {
  return htmlDecode(String(s || "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function normalizeUrl(item) {
  if (!item) return "";
  if (typeof item === "string") return item;
  return item.url || item.href || item.source_url || item.sourceUrl || item.info_url || item.infoUrl || "";
}

function sourceItems(g) {
  const raw = [];
  if (Array.isArray(g.sources)) raw.push(...g.sources);
  if (Array.isArray(g.source_urls)) raw.push(...g.source_urls);
  for (const key of ["source_url", "sourceUrl", "info_url", "infoUrl", "official_url", "officialUrl", "product_url", "productUrl"]) {
    if (g[key]) raw.push(g[key]);
  }
  if (g.source && /^https?:\/\//i.test(String(g.source))) raw.push(g.source);
  return raw.map((item) => ({ label: typeof item === "object" && item ? item.label || "" : "", url: normalizeUrl(item) }))
    .filter((item) => /^https?:\/\//i.test(item.url));
}

function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch (_) { return ""; }
}

function looksJapaneseHost(url) {
  const host = domainOf(url);
  return host.endsWith(".jp") || host.includes(".co.jp") || host.includes(".ne.jp") || host.includes(".or.jp");
}

function looksYenPage(html, url) {
  return looksJapaneseHost(url) || /priceCurrency["']?\s*[:=]\s*["']?JPY/i.test(html) || /(?:JPY|税込|税抜|円|￥|¥)/.test(compactText(html).slice(0, 120000));
}

function shopScore(url, label) {
  const host = domainOf(url);
  let score = 0;
  if (shopDomainHints.some((d) => host === d || host.endsWith("." + d))) score += 8;
  if (/酒販店|販売|ショップ|shop|store|liquor|wine|whisky|ginbottle/i.test(label || "")) score += 5;
  if (/\/(item|items|products?|shop|store|cart|goods|product)\b/i.test(url)) score += 2;
  if (/official|公式|news|blog|review|guide|award|prtimes|ginisin|difford|guild/i.test(label || "")) score -= 2;
  if (/theginisin|diffordsguide|theginguild|prtimes|worldginawards|distiller|gin-foundry/i.test(host)) score -= 5;
  return score;
}

function uniqueSources(g) {
  const seen = new Set();
  return sourceItems(g)
    .map((item) => ({ ...item, score: shopScore(item.url, item.label) }))
    .filter((item) => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return item.score >= 2;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function validPrice(n) {
  return Number.isFinite(n) && n >= MIN_PRICE && n <= MAX_PRICE;
}

function cleanPrice(raw) {
  if (raw == null) return null;
  const s = String(raw).replace(/,/g, "").replace(/[^\d.]/g, "");
  if (!s) return null;
  const n = Math.round(Number(s));
  return validPrice(n) ? n : null;
}

function pushCandidate(candidates, raw, confidence, kind, context) {
  const price = cleanPrice(raw);
  if (!validPrice(price)) return;
  candidates.push({ price, confidence, kind, context: compactText(context).slice(0, 160) });
}

function nodeHasJpy(node, pageIsYen) {
  if (pageIsYen) return true;
  try { return /priceCurrency["']?\s*[:=]\s*["']?JPY/i.test(JSON.stringify(node)); } catch (_) { return false; }
}

function collectFromJsonLd(html, candidates, pageIsYen) {
  const scripts = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const script of scripts) {
    const body = script.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "").trim();
    if (!body) continue;
    try {
      const data = JSON.parse(htmlDecode(body));
      const stack = Array.isArray(data) ? [...data] : [data];
      while (stack.length) {
        const node = stack.pop();
        if (!node || typeof node !== "object") continue;
        if (Object.prototype.hasOwnProperty.call(node, "price") && nodeHasJpy(node, pageIsYen)) {
          pushCandidate(candidates, node.price, 95, "jsonld.price", JSON.stringify(node).slice(0, 300));
        }
        if (Object.prototype.hasOwnProperty.call(node, "lowPrice") && nodeHasJpy(node, pageIsYen)) {
          pushCandidate(candidates, node.lowPrice, 88, "jsonld.lowPrice", JSON.stringify(node).slice(0, 300));
        }
        for (const value of Object.values(node)) {
          if (Array.isArray(value)) stack.push(...value);
          else if (value && typeof value === "object") stack.push(value);
        }
      }
    } catch (_) {
      // 壊れたJSON-LDは無視する。
    }
  }
}

function collectFromMeta(html, candidates, pageIsYen) {
  const metaRe = /<meta\b[^>]*(?:property|name|itemprop)=["']([^"']*(?:price|amount)[^"']*)["'][^>]*content=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = metaRe.exec(html))) {
    if (pageIsYen || /JPY|円|税込|税抜/.test(m[0])) pushCandidate(candidates, m[2], 90, "meta." + m[1], m[0]);
  }

  const reverseMetaRe = /<meta\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name|itemprop)=["']([^"']*(?:price|amount)[^"']*)["'][^>]*>/gi;
  while ((m = reverseMetaRe.exec(html))) {
    if (pageIsYen || /JPY|円|税込|税抜/.test(m[0])) pushCandidate(candidates, m[1], 90, "meta." + m[2], m[0]);
  }

  const itempropRe = /<[^>]+itemprop=["']price["'][^>]*(?:content=["']([^"']+)["'])?[^>]*>([\s\S]{0,120}?)<\/[^>]+>/gi;
  while ((m = itempropRe.exec(html))) {
    if (pageIsYen || /JPY|円|税込|税抜/.test(m[0])) pushCandidate(candidates, m[1] || m[2], 88, "itemprop.price", m[0]);
  }
}

function collectFromText(html, candidates) {
  const text = compactText(html);
  const priceWords = "(?:価格|税込|税抜|販売|通常|本体|price|Price|PRICE)";
  const yenRe = new RegExp(`.{0,32}${priceWords}.{0,32}(?:¥|￥)?\\s*([0-9][0-9,]{2,6})(?:\\s*円|\\s*yen|\\s*JPY|\\s*税込|\\s*税抜)`, "g");
  let m;
  while ((m = yenRe.exec(text))) pushCandidate(candidates, m[1], 62, "text.price-context", m[0]);

  const directYenRe = /(?:¥|￥)\s*([0-9][0-9,]{2,6})/g;
  while ((m = directYenRe.exec(text))) {
    const ctx = text.slice(Math.max(0, m.index - 40), Math.min(text.length, m.index + 80));
    if (/送料|送料無料|代引|ポイント|クーポン|レビュー|獲得|以上|未満/.test(ctx)) continue;
    pushCandidate(candidates, m[1], 48, "text.yen", ctx);
  }
}

function chooseCandidate(candidates) {
  if (!candidates.length) return null;
  const grouped = new Map();
  for (const c of candidates) {
    const key = String(c.price);
    const prev = grouped.get(key);
    if (!prev || c.confidence > prev.confidence) grouped.set(key, c);
  }
  return [...grouped.values()].sort((a, b) => b.confidence - a.confidence || a.price - b.price)[0];
}

async function fetchWithTimeout(url) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: {
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "ja,en-US;q=0.8,en;q=0.6",
        "user-agent": "Mozilla/5.0 (compatible; BarSoutsuPriceCollector/1.0; +https://sousuyou.github.io/top/)"
      },
      redirect: "follow"
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    return { html, finalUrl: res.url };
  } finally {
    clearTimeout(timer);
  }
}

async function collectForGin(g) {
  const sources = uniqueSources(g);
  for (const source of sources) {
    try {
      const { html, finalUrl } = await fetchWithTimeout(source.url);
      const pageIsYen = looksYenPage(html, finalUrl || source.url);
      if (!pageIsYen) continue;
      const candidates = [];
      collectFromJsonLd(html, candidates, pageIsYen);
      collectFromMeta(html, candidates, pageIsYen);
      collectFromText(html, candidates);
      const chosen = chooseCandidate(candidates);
      if (chosen) {
        return {
          gin_name: g.name,
          kana: g.kana || "",
          price_yen: chosen.price,
          source_url: finalUrl || source.url,
          source_label: source.label || domainOf(source.url),
          confidence: chosen.confidence,
          kind: chosen.kind,
          context: chosen.context
        };
      }
    } catch (_) {
      // 次の候補URLへ進む。
    }
  }
  return null;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
      if ((i + 1) % 50 === 0) process.stderr.write(`checked ${i + 1}/${items.length}\n`);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return out;
}

const data = JSON.parse(fs.readFileSync(ginsPath, "utf8"));
const gins = data.gins || [];
const targetGins = gins.filter((g) => uniqueSources(g).length);
process.stderr.write(`targets ${targetGins.length}/${gins.length}, concurrency ${CONCURRENCY}\n`);

const rows = (await mapLimit(targetGins, CONCURRENCY, collectForGin)).filter(Boolean);
rows.sort((a, b) => a.gin_name.localeCompare(b.gin_name, "ja"));
fs.mkdirSync(outDir, { recursive: true });

const csv = [
  ["gin_name", "kana", "price_yen", "source_label", "source_url", "confidence", "kind", "context"].map(escCsv).join(","),
  ...rows.map((r) => [r.gin_name, r.kana, r.price_yen, r.source_label, r.source_url, r.confidence, r.kind, r.context].map(escCsv).join(","))
].join("\n") + "\n";
fs.writeFileSync(csvPath, csv);

const sqlRows = rows.filter((r) => r.confidence >= 88 && !/記事/.test(r.source_label) && !/amazon/i.test(r.source_url));
const values = sqlRows.map((r) =>
  `  ('${escSql(r.gin_name)}', ${r.price_yen}, 'active') -- ${escSql(r.source_label)} / ${escSql(r.source_url)}`
);
const generatedAt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  dateStyle: "medium",
  timeStyle: "medium"
}).format(new Date());
const sql = `-- Bar Soutsu｜ボトル価格目安 自動収集シード\n` +
  `-- 生成日時（JST）: ${generatedAt}\n` +
  `-- SQL投入対象: ${sqlRows.length}件 / CSV候補: ${rows.length}件\n` +
  `-- 先に supabase_bottle_prices_setup.sql をRunしてテーブルを作成してください。\n` +
  `-- 価格は公開ページから機械抽出した「目安」です。\n` +
  `-- CSVには低信頼候補も残し、SQLは構造化データ/メタ価格中心の高信頼候補だけに絞っています。\n\n` +
  `insert into public.gin_bottle_prices (gin_name, price_yen, status)\nvalues\n` +
  values.join(",\n") +
  `;\n\nNOTIFY pgrst, 'reload schema';\n`;
fs.writeFileSync(sqlPath, sql);

const setupSql = fs.existsSync(setupSqlPath) ? fs.readFileSync(setupSqlPath, "utf8") : "";
fs.writeFileSync(combinedSqlPath, setupSql + "\n\n" + sql);

process.stdout.write(JSON.stringify({ count: rows.length, sqlRows: sqlRows.length, csv: csvPath, sql: sqlPath, combinedSql: combinedSqlPath }, null, 2) + "\n");
