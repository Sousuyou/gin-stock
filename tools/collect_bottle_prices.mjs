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
const jsonPath = path.join(outDir, `bottle_price_estimates_${today}.json`);
const sqlPath = path.join(outDir, `bottle_price_estimates_${today}.sql`);
const combinedSqlPath = path.join(outDir, `bottle_price_setup_and_seed_${today}.sql`);
const setupSqlPath = path.join(root, "supabase_bottle_prices_setup.sql");

const MIN_PRICE = 900;
const MAX_PRICE = 250000;
const DEFAULT_BOTTLE_ML = 700;
const CONCURRENCY = Number(process.env.PRICE_CONCURRENCY || 8);
const TIMEOUT_MS = Number(process.env.PRICE_TIMEOUT_MS || 12000);
const SOURCE_LIMIT = Number(process.env.PRICE_SOURCE_LIMIT || 8);
const SQL_MIN_CONFIDENCE = Number(process.env.PRICE_SQL_MIN_CONFIDENCE || 48);
const ENABLE_SHOPIFY_CATALOGS = process.env.PRICE_SHOPIFY_CATALOGS !== "0";
const ENABLE_MARKETPLACE_FALLBACK = process.env.PRICE_MARKETPLACE_FALLBACK !== "0";
const MARKETPLACE_RESULT_LIMIT = Number(process.env.PRICE_MARKETPLACE_RESULT_LIMIT || 8);
const SHOPIFY_MAX_PAGES = Number(process.env.PRICE_SHOPIFY_MAX_PAGES || 8);
const NAME_FILTER = process.env.PRICE_NAME_FILTER || "";
const ESTIMATE_ALL_MISSING = process.env.PRICE_ESTIMATE_ALL_MISSING !== "0";
const ESTIMATE_ONLY = process.env.PRICE_ESTIMATE_ONLY === "1";

const shopifyCatalogHosts = [
  "www.syurui.co.jp",
  "nihonkusakilab.com",
  "holongin.com",
  "shop.gotogin.jp",
  "shop.andspirits.com",
  "faryeast.com"
];

const genericNameTokens = new Set([
  "gin",
  "ジン",
  "craft",
  "クラフト",
  "dry",
  "ドライ",
  "distilled",
  "premium",
  "london",
  "ロンドン",
  "small",
  "batch",
  "edition",
  "エディション",
  "limited",
  "リミテッド",
  "original",
  "オリジナル",
  "classic",
  "クラシック",
  "spirits",
  "スピリッツ"
]);

const verifiedBottlePriceOverrides = {
  "草木酒フォレストジン": {
    price_yen: 5995,
    bottle_ml: 500,
    confidence: 99,
    kind: "manual.verified",
    context: "公式通販の(大)500mlバリアント"
  }
};

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

const countryPrice700Fallbacks = {
  "日本": 6200,
  "イギリス": 4600,
  "フランス": 5400,
  "イタリア": 4800,
  "スペイン": 5200,
  "オランダ": 4800,
  "アメリカ": 6500,
  "カナダ": 6500,
  "メキシコ": 6500,
  "オーストラリア": 5800,
  "ニュージーランド": 5200,
  "ベルギー": 6000,
  "ドイツ": 6000,
  "アイルランド": 5200,
  "スウェーデン": 6800,
  "フィンランド": 7000,
  "ノルウェー": 7200,
  "デンマーク": 6200,
  "インド": 5200,
  "タイ": 5200,
  "台湾": 5600,
  "中国": 5200,
  "ベトナム": 6200,
  "カンボジア": 6200,
  "南アフリカ": 5000
};

const regionPrice700Fallbacks = {
  europe: 5200,
  northAmerica: 6500,
  oceania: 5600,
  asia: 5600,
  latinAmerica: 6200,
  africa: 5200,
  global: 5600
};

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

function normalizeComparable(s) {
  return htmlDecode(String(s || ""))
    .normalize("NFKD")
    .replace(/(\p{Script=Latin})\p{M}+/gu, "$1")
    .normalize("NFC")
    .replace(/[’‘´`]/g, "'")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[‐‑‒–—―〜～]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactComparable(s) {
  return normalizeComparable(s).replace(/\s+/g, "");
}

function hasJapanese(s) {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(String(s || ""));
}

function comparableTokens(s) {
  return normalizeComparable(s).split(/\s+/).filter((token) => token && (token.length >= 2 || hasJapanese(token)));
}

function uniqueTokens(values) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    for (const token of comparableTokens(value)) {
      if (seen.has(token)) continue;
      seen.add(token);
      out.push(token);
    }
  }
  return out;
}

function tokenMatchesTitle(token, titleText, titleCompact) {
  if (titleText.includes(` ${token} `) || titleText.startsWith(`${token} `) || titleText.endsWith(` ${token}`)) return true;
  return hasJapanese(token) && titleCompact.includes(token);
}

function looksGinProductTitle(title) {
  const rawTitle = String(title || "");
  return /(^|[^a-z])gin([^a-z]|$)/i.test(rawTitle) || /ジン(?!ジャ)/.test(rawTitle) || /スピリッツ/.test(rawTitle);
}

function productMatchScore(g, title) {
  const rawTitle = compactText(title);
  if (!rawTitle) return 0;
  if (g.name === "FOREST GIN" && /草木酒/.test(rawTitle)) return 0;
  if (!looksGinProductTitle(rawTitle)) return 0;

  const titleText = ` ${normalizeComparable(rawTitle)} `;
  const titleCompact = compactComparable(rawTitle);
  const names = [g.name, g.kana].filter(Boolean);

  for (const name of names) {
    const compact = compactComparable(name);
    if (compact.length >= 4 && titleCompact.includes(compact)) return 100;
  }

  const allTokens = uniqueTokens(names);
  const meaningfulTokens = allTokens.filter((token) =>
    !genericNameTokens.has(token) && (token.length >= 3 || hasJapanese(token) || /^\d{2,}$/.test(token))
  );
  const tokens = meaningfulTokens.length ? meaningfulTokens : allTokens.filter((token) => !genericNameTokens.has(token));
  if (!tokens.length) return 0;

  const matched = tokens.filter((token) => tokenMatchesTitle(token, titleText, titleCompact));
  const primaryToken = tokens.find((token) => !/^\d+$/.test(token)) || tokens[0];
  if (primaryToken && !tokenMatchesTitle(primaryToken, titleText, titleCompact)) return 0;
  const variantTokens = tokens.filter((token) => hasJapanese(token) && token.length === 1);
  if (variantTokens.length && !variantTokens.every((token) => tokenMatchesTitle(token, titleText, titleCompact))) {
    return 0;
  }
  const numericTokens = tokens.filter((token) => /^\d{2,}$/.test(token));
  if (numericTokens.length && !numericTokens.every((token) => tokenMatchesTitle(token, titleText, titleCompact))) {
    return 0;
  }

  const ratio = matched.length / tokens.length;
  const hasLongAnchor = matched.some((token) => token.length >= 5);
  if (tokens.length <= 2 && matched.length !== tokens.length) return 0;
  if (matched.length >= 2 && ratio >= 0.75) return Math.round(72 + ratio * 24);
  if (matched.length === tokens.length && ratio === 1 && hasLongAnchor) return 88;
  if (tokens.length === 1 && hasLongAnchor && ratio === 1) return 78;
  return 0;
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
      return item.score >= -5;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, SOURCE_LIMIT);
}

function uniqueByUrl(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item.url || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
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

function parseJsonLd(html) {
  const out = [];
  const scripts = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const script of scripts) {
    const body = script.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "").trim();
    if (!body) continue;
    try {
      out.push(JSON.parse(htmlDecode(body)));
    } catch (_) {
      // 壊れたJSON-LDは無視する。
    }
  }
  return out;
}

function nodeHasJpy(node, pageIsYen) {
  if (pageIsYen) return true;
  try { return /priceCurrency["']?\s*[:=]\s*["']?JPY/i.test(JSON.stringify(node)); } catch (_) { return false; }
}

function collectFromJsonLd(html, candidates, pageIsYen) {
  for (const data of parseJsonLd(html)) {
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
  const yenRe = new RegExp(`.{0,32}${priceWords}.{0,32}(?:¥|￥)?\\s*(^|[^\\d,])([0-9][0-9,]{2,6})(?:\\s*円|\\s*yen|\\s*JPY|\\s*税込|\\s*税抜)`, "g");
  let m;
  while ((m = yenRe.exec(text))) pushCandidate(candidates, m[2], 62, "text.price-context", m[0]);

  const directYenRe = /(?:¥|￥)\s*([0-9][0-9,]{2,6})(?![\d,])/g;
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

function pushVolume(candidates, ml, score, kind, context) {
  var n = Math.round(Number(ml));
  if (!Number.isFinite(n) || n < 180 || n > 2000) return;
  candidates.push({ ml: n, score, kind, context: compactText(context).slice(0, 140) });
}

function collectVolumesFromText(text, candidates, score, kind) {
  let m;
  const mlRe = /(^|[^\d])(\d{2,4})\s*(?:ml|mL|ML|ｍｌ|㎖|ミリリットル)/g;
  while ((m = mlRe.exec(text))) pushVolume(candidates, m[2], score, kind + ".ml", text.slice(Math.max(0, m.index - 45), m.index + 80));

  const clRe = /(^|[^\d])(\d{1,3}(?:\.\d+)?)\s*(?:cl|cL|CL|ｃｌ)/g;
  while ((m = clRe.exec(text))) pushVolume(candidates, Number(m[2]) * 10, score, kind + ".cl", text.slice(Math.max(0, m.index - 45), m.index + 80));

  const lRe = /(^|[^\d])(\d(?:\.\d+)?)\s*(?:L|Ｌ|リットル)(?![a-zA-Z])/g;
  while ((m = lRe.exec(text))) pushVolume(candidates, Number(m[2]) * 1000, score - 5, kind + ".l", text.slice(Math.max(0, m.index - 45), m.index + 80));
}

function chooseVolume(candidates) {
  if (!candidates.length) return { ml: DEFAULT_BOTTLE_ML, kind: "default" };
  const grouped = new Map();
  for (const c of candidates) {
    const bonus = [700, 500, 750, 720, 200, 350, 375, 1000].includes(c.ml) ? 4 : 0;
    const score = c.score + bonus;
    const prev = grouped.get(String(c.ml));
    if (!prev || score > prev.score) grouped.set(String(c.ml), { ...c, score });
  }
  return [...grouped.values()].sort((a, b) => b.score - a.score)[0];
}

function extractBottleMl(html, url, ginName, priceContext) {
  const candidates = [];
  collectVolumesFromText(url, candidates, 95, "url");
  collectVolumesFromText(ginName || "", candidates, 80, "gin-name");
  collectVolumesFromText(priceContext || "", candidates, 70, "price-context");

  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "";
  collectVolumesFromText(compactText(title), candidates, 78, "title");

  const ogTitle = (html.match(/<meta\b[^>]*(?:property|name)=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i) || [])[1] || "";
  collectVolumesFromText(compactText(ogTitle), candidates, 78, "og-title");

  collectVolumesFromText(compactText(html).slice(0, 200000), candidates, 45, "page");
  return chooseVolume(candidates);
}

function countryKey(g) {
  return String((g && (g.country_main || g.country)) || "").trim();
}

function regionKey(country) {
  if (/イギリス|フランス|イタリア|スペイン|オランダ|ベルギー|ドイツ|アイルランド|スウェーデン|フィンランド|ノルウェー|デンマーク|ポルトガル|オーストリア|スイス|ポーランド|チェコ|スロベニア|エストニア|アイスランド/.test(country)) return "europe";
  if (/アメリカ|カナダ|メキシコ/.test(country)) return "northAmerica";
  if (/オーストラリア|ニュージーランド/.test(country)) return "oceania";
  if (/日本|インド|タイ|台湾|中国|ベトナム|カンボジア|フィリピン|シンガポール|韓国/.test(country)) return "asia";
  if (/アルゼンチン|ペルー|コロンビア|ブラジル|チリ/.test(country)) return "latinAmerica";
  if (/南アフリカ|ケニア|ナミビア/.test(country)) return "africa";
  return "global";
}

function defaultBottleMlForCountry(country) {
  if (country === "日本") return 500;
  if (/アメリカ|カナダ|メキシコ/.test(country)) return 750;
  return DEFAULT_BOTTLE_ML;
}

function median(values) {
  const nums = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!nums.length) return 0;
  return nums[Math.floor(nums.length / 2)];
}

function stat(values) {
  return { count: values.length, median: median(values) };
}

function addGroupedValue(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

function buildEstimateBasis(gins, sourcedRows) {
  const byName = new Map(gins.map((g) => [g.name, g]));
  const country700 = new Map();
  const region700 = new Map();
  const countryActual = new Map();
  const regionActual = new Map();
  const global700 = [];
  const globalActual = [];

  for (const row of sourcedRows) {
    if (!row || row.price_kind === "estimated") continue;
    const price = Number(row.price_yen);
    const ml = Number(row.bottle_ml || DEFAULT_BOTTLE_ML);
    if (!validPrice(price) || !Number.isFinite(ml) || ml <= 0) continue;
    const g = byName.get(row.gin_name);
    const country = countryKey(g);
    const region = regionKey(country);
    const price700 = price * 700 / ml;
    addGroupedValue(country700, country, price700);
    addGroupedValue(region700, region, price700);
    addGroupedValue(countryActual, country, price);
    addGroupedValue(regionActual, region, price);
    global700.push(price700);
    globalActual.push(price);
  }

  function collapse(map) {
    const out = new Map();
    for (const [key, values] of map.entries()) out.set(key, stat(values));
    return out;
  }

  return {
    country700: collapse(country700),
    region700: collapse(region700),
    countryActual: collapse(countryActual),
    regionActual: collapse(regionActual),
    global700: stat(global700),
    globalActual: stat(globalActual)
  };
}

function blend(a, b, weightA) {
  if (!Number.isFinite(a) || a <= 0) return b;
  if (!Number.isFinite(b) || b <= 0) return a;
  return a * weightA + b * (1 - weightA);
}

function estimateBottleMl(g) {
  const candidates = [];
  collectVolumesFromText(`${g.name || ""} ${g.kana || ""}`, candidates, 95, "catalog-name");
  if (candidates.length) {
    const chosen = chooseVolume(candidates);
    return { ml: chosen.ml, kind: "estimated." + chosen.kind };
  }

  const country = countryKey(g);
  return { ml: defaultBottleMlForCountry(country), kind: "estimated.country-default" };
}

function fallbackPrice700(country) {
  return countryPrice700Fallbacks[country] || regionPrice700Fallbacks[regionKey(country)] || regionPrice700Fallbacks.global;
}

function estimateBasePrice(g, basis, ml) {
  const country = countryKey(g);
  const region = regionKey(country);
  const defaultMl = defaultBottleMlForCountry(country);
  const countryActual = basis.countryActual.get(country);
  const regionActual = basis.regionActual.get(region);
  const country700 = basis.country700.get(country);
  const region700 = basis.region700.get(region);
  const fallback700 = fallbackPrice700(country);

  if (ml === defaultMl) {
    const fallbackActual = fallback700 * ml / 700;
    if (countryActual && countryActual.count >= 4) return blend(countryActual.median, fallbackActual, 0.75);
    if (countryActual && countryActual.count >= 2) return blend(countryActual.median, fallbackActual, 0.6);
    if (regionActual && regionActual.count >= 8) return blend(regionActual.median, fallbackActual, 0.55);
    if (basis.globalActual.count) return blend(basis.globalActual.median, fallbackActual, 0.35);
    return fallbackActual;
  }

  let base700 = fallback700;
  if (country700 && country700.count >= 4) base700 = blend(country700.median, fallback700, 0.75);
  else if (country700 && country700.count >= 2) base700 = blend(country700.median, fallback700, 0.6);
  else if (region700 && region700.count >= 8) base700 = blend(region700.median, fallback700, 0.55);
  else if (basis.global700.count) base700 = blend(basis.global700.median, fallback700, 0.35);

  return base700 * ml / 700;
}

function roundEstimatedYen(price) {
  const clamped = Math.max(1500, Math.min(22000, price));
  const step = clamped >= 12000 ? 500 : 100;
  return Math.round(clamped / step) * step;
}

function estimateBottlePrice(g, basis) {
  const volume = estimateBottleMl(g);
  const text = `${g.name || ""} ${g.kana || ""} ${g.note || ""}`;
  const abv = Number(g.abv || 0);
  let factor = 1;

  if (abv >= 57) factor += 0.3;
  else if (abv >= 50) factor += 0.18;
  else if (abv >= 47) factor += 0.08;
  else if (abv > 0 && abv < 38) factor -= 0.08;

  if (/navy|ネイビー|strength|over\s*proof|overproof|barrel|cask|樽|limited|リミテッド|限定|edition|エディション|single|batch|季節|winter|summer|spring|autumn|anniversary|周年|voyager|experimental|experiment|prototype|reserve|special/i.test(text)) {
    factor += 0.14;
  }
  if (/sloe|スロー|liqueur|リキュール/i.test(text)) factor -= 0.08;
  if (/beefeater|gordon'?s?|bombay|tanqueray|gilbey|seagram|ウィルキンソン|翠|sui\b/i.test(text)) factor -= 0.18;

  const country = countryKey(g);
  const countryStat = basis.countryActual.get(country) || basis.country700.get(country);
  const price = roundEstimatedYen(estimateBasePrice(g, basis, volume.ml) * factor);
  const confidence = Math.max(24, Math.min(42, 28 + (countryStat ? Math.min(8, countryStat.count) : 0) + (volume.kind.includes("catalog-name") ? 3 : 0)));

  return {
    gin_name: g.name,
    kana: g.kana || "",
    price_yen: price,
    bottle_ml: volume.ml,
    bottle_ml_kind: volume.kind,
    source_url: "",
    source_label: "簡易推定",
    confidence,
    kind: "estimated",
    context: `${country || "全体"}の既存価格中央値をもとにした簡易推定`
  };
}

function estimatedRowsForMissingGins(gins, sourcedJsonRows) {
  if (!ESTIMATE_ALL_MISSING) return [];
  const seen = new Set(sourcedJsonRows.map((row) => row.gin_name));
  const basis = buildEstimateBasis(gins, sourcedJsonRows);
  return gins
    .filter((g) => g && g.name && !seen.has(g.name))
    .map((g) => estimateBottlePrice(g, basis));
}

function absoluteUrl(url, base) {
  try { return new URL(url, base).toString(); } catch (_) { return url || ""; }
}

function productRowFromTitle(g, item, confidence, kind, sourceLabel) {
  const price = cleanPrice(item.price);
  if (!validPrice(price)) return null;
  const title = compactText(item.title || item.name || "");
  const score = productMatchScore(g, title);
  if (!score) return null;
  const volume = extractBottleMl(item.body || "", item.url || "", `${g.name} ${g.kana || ""} ${title}`, title);
  return {
    gin_name: g.name,
    kana: g.kana || "",
    price_yen: price,
    bottle_ml: volume.ml,
    bottle_ml_kind: volume.kind,
    source_url: item.url || "",
    source_label: sourceLabel,
    confidence: Math.min(99, confidence + Math.floor(score / 20)),
    match_score: score,
    kind,
    context: title
  };
}

function chooseProductRow(g, items, confidence, kind, sourceLabel) {
  const rows = uniqueByUrl(items)
    .map((item) => productRowFromTitle(g, item, confidence, kind, sourceLabel))
    .filter(Boolean)
    .sort((a, b) => b.match_score - a.match_score || b.confidence - a.confidence || a.price_yen - b.price_yen);
  return rows[0] || null;
}

function collectProductItemsFromJsonLd(html) {
  const items = [];
  for (const data of parseJsonLd(html)) {
    const stack = Array.isArray(data) ? [...data] : [data];
    while (stack.length) {
      const node = stack.pop();
      if (!node || typeof node !== "object") continue;
      const type = Array.isArray(node["@type"]) ? node["@type"].join(" ") : String(node["@type"] || "");
      if (/Product/i.test(type) && node.offers) {
        const offers = Array.isArray(node.offers) ? node.offers : [node.offers];
        for (const offer of offers) {
          if (!offer || typeof offer !== "object") continue;
          items.push({
            title: node.name || node.title || "",
            price: offer.price || offer.lowPrice || offer.highPrice,
            url: offer.url || node.url || ""
          });
        }
      }
      if (/ItemList/i.test(type) && Array.isArray(node.itemListElement)) {
        for (const entry of node.itemListElement) {
          const item = entry && typeof entry === "object" ? entry.item : null;
          if (item && typeof item === "object") {
            const offers = Array.isArray(item.offers) ? item.offers : [item.offers || {}];
            for (const offer of offers) {
              items.push({
                title: item.name || item.title || "",
                price: offer.price || offer.lowPrice || offer.highPrice,
                url: item.url || offer.url || ""
              });
            }
          }
        }
      }
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) stack.push(...value);
        else if (value && typeof value === "object") stack.push(value);
      }
    }
  }
  return items;
}

function parseNextData(html) {
  const m = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return null;
  try {
    return JSON.parse(htmlDecode(m[1]));
  } catch (_) {
    return null;
  }
}

function collectProductItemsFromObject(root, baseUrl) {
  const items = [];
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    const title = node.name || node.title || node.itemName || node.productName;
    const price = node.price || node.itemPrice || node.priceValue || node.salePrice;
    const url = node.url || node.itemUrl || node.originalItemUrl || node.productUrl;
    if (title && price && url) {
      items.push({ title, price, url: absoluteUrl(String(url).replace(/\\u002F/g, "/"), baseUrl) });
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === "object") stack.push(item);
        }
      } else if (value && typeof value === "object") {
        stack.push(value);
      }
    }
  }
  return items;
}

async function collectFromRakuten(g) {
  const query = encodeURIComponent(g.name);
  const url = `https://search.rakuten.co.jp/search/mall/${query}/?sf=1`;
  const { html, finalUrl } = await fetchWithTimeout(url);
  const items = collectProductItemsFromJsonLd(html)
    .concat(collectProductItemsFromObject(parseNextData(html), finalUrl || url))
    .slice(0, MARKETPLACE_RESULT_LIMIT * 4);
  return chooseProductRow(g, items, 82, "rakuten.search", "楽天市場");
}

async function collectFromYahoo(g) {
  const query = encodeURIComponent(g.name);
  const url = `https://shopping.yahoo.co.jp/search?p=${query}`;
  const { html, finalUrl } = await fetchWithTimeout(url);
  const items = collectProductItemsFromObject(parseNextData(html), finalUrl || url).slice(0, MARKETPLACE_RESULT_LIMIT * 4);
  return chooseProductRow(g, items, 78, "yahoo.search", "Yahoo!ショッピング");
}

async function collectFromMarketplace(g) {
  if (!ENABLE_MARKETPLACE_FALLBACK) return null;
  for (const fn of [collectFromRakuten, collectFromYahoo]) {
    try {
      const row = await fn(g);
      if (row) return row;
    } catch (_) {
      // 検索ページが重い・拒否される場合は次の候補へ進む。
    }
  }
  return null;
}

async function loadShopifyCatalogs() {
  if (!ENABLE_SHOPIFY_CATALOGS) return [];
  const rows = [];
  for (const host of shopifyCatalogHosts) {
    for (let page = 1; page <= SHOPIFY_MAX_PAGES; page++) {
      const url = `https://${host}/products.json?limit=250&page=${page}`;
      try {
        const { html } = await fetchWithTimeout(url);
        const json = JSON.parse(html);
        const products = Array.isArray(json.products) ? json.products : [];
        if (!products.length) break;
        for (const product of products) {
          const variants = Array.isArray(product.variants) && product.variants.length ? product.variants : [{}];
          for (const variant of variants) {
            const variantTitle = variant.title && !/^default title$/i.test(variant.title) ? ` ${variant.title}` : "";
            rows.push({
              title: `${product.title || ""}${variantTitle}`,
              price: variant.price || product.price,
              url: `https://${host}/products/${product.handle || ""}`,
              body: product.body_html || "",
              host
            });
          }
        }
      } catch (_) {
        break;
      }
    }
  }
  process.stderr.write(`shopify catalog items ${rows.length}\n`);
  return rows;
}

let shopifyCatalogItems = [];

function collectFromShopifyCatalog(g) {
  if (!shopifyCatalogItems.length) return null;
  return chooseProductRow(g, shopifyCatalogItems, 86, "shopify.catalog", "Shopify商品カタログ");
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
  const override = verifiedBottlePriceOverrides[g.name];
  if (override) {
    return {
      gin_name: g.name,
      kana: g.kana || "",
      price_yen: override.price_yen,
      bottle_ml: override.bottle_ml,
      bottle_ml_kind: "manual",
      source_url: "",
      source_label: "手動確認",
      confidence: override.confidence,
      kind: override.kind,
      context: override.context
    };
  }

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
        const volume = extractBottleMl(html, finalUrl || source.url, g.name + " " + (g.kana || ""), chosen.context);
        return {
          gin_name: g.name,
          kana: g.kana || "",
          price_yen: chosen.price,
          bottle_ml: volume.ml,
          bottle_ml_kind: volume.kind,
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
  const catalogRow = collectFromShopifyCatalog(g);
  if (catalogRow) return catalogRow;
  return collectFromMarketplace(g);
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
const ginsByName = new Map(gins.map((g) => [g.name, g]));
let rows;

if (ESTIMATE_ONLY) {
  const existingRows = fs.existsSync(jsonPath) ? JSON.parse(fs.readFileSync(jsonPath, "utf8")) : [];
  rows = existingRows
    .filter((r) => r && r.price_kind !== "estimated")
    .map((r) => {
      const g = ginsByName.get(r.gin_name) || {};
      return {
        gin_name: r.gin_name,
        kana: g.kana || "",
        price_yen: r.price_yen,
        bottle_ml: r.bottle_ml || DEFAULT_BOTTLE_ML,
        bottle_ml_kind: "seed",
        source_url: "",
        source_label: "既存同梱JSON",
        confidence: r.confidence || 70,
        kind: "seed.sourced",
        context: "既存の同梱価格データ"
      };
    });
  process.stderr.write(`estimate-only source rows ${rows.length}/${gins.length}\n`);
} else {
  shopifyCatalogItems = await loadShopifyCatalogs();
  const targetGins = gins.filter((g) => (!NAME_FILTER || g.name.includes(NAME_FILTER) || String(g.kana || "").includes(NAME_FILTER)) && (uniqueSources(g).length || ENABLE_SHOPIFY_CATALOGS || ENABLE_MARKETPLACE_FALLBACK));
  process.stderr.write(`targets ${targetGins.length}/${gins.length}, concurrency ${CONCURRENCY}\n`);
  rows = (await mapLimit(targetGins, CONCURRENCY, collectForGin)).filter(Boolean);
}

rows.sort((a, b) => a.gin_name.localeCompare(b.gin_name, "ja"));
fs.mkdirSync(outDir, { recursive: true });

function sqlSafeRow(r) {
  if (r.confidence < SQL_MIN_CONFIDENCE) return false;
  if (/記事|県産品情報/.test(r.source_label)) return false;
  if (r.kind === "yahoo.search" && r.confidence < 87) return false;
  if (r.kind === "text.yen") return false;
  if (/価格で探す|送料|地域|\/\s*100\s*ml|100\s*ml|割材|ポイント|クーポン/.test(r.context)) return false;
  if (/ふるさと納税|Tシャツ|シャツ|アパレル|エンジン|モールディング|プッシュボタン|ボタンカバー|Stelvio|Alfa Romeo|Geronimo Shirt|スターリングエンジン|DIY|POD|バルサミコ|ビネガー|vinegar|酢|クラフトラム|ラム酒|NON[-\s]?ALCOHOLIC|ノンアルコール|清涼飲料|0\.00%|150\s*m/i.test(r.context)) return false;
  return true;
}

const sqlRows = rows.filter(sqlSafeRow);
const sourcedJsonRows = sqlRows.map((r) => ({
  gin_name: r.gin_name,
  price_yen: r.price_yen,
  bottle_ml: r.bottle_ml || DEFAULT_BOTTLE_ML,
  price_kind: "sourced",
  confidence: r.confidence
}));
const estimatedRows = estimatedRowsForMissingGins(gins, sourcedJsonRows);
const csvRows = [...rows, ...estimatedRows].sort((a, b) => a.gin_name.localeCompare(b.gin_name, "ja"));
const fullJsonRows = [
  ...sourcedJsonRows,
  ...estimatedRows.map((r) => ({
    gin_name: r.gin_name,
    price_yen: r.price_yen,
    bottle_ml: r.bottle_ml || DEFAULT_BOTTLE_ML,
    price_kind: "estimated",
    confidence: r.confidence
  }))
].sort((a, b) => a.gin_name.localeCompare(b.gin_name, "ja"));

const csv = [
  ["gin_name", "kana", "price_yen", "bottle_ml", "bottle_ml_kind", "confidence", "kind", "context"].map(escCsv).join(","),
  ...csvRows.map((r) => [r.gin_name, r.kana, r.price_yen, r.bottle_ml, r.bottle_ml_kind, r.confidence, r.kind, r.context].map(escCsv).join(","))
].join("\n") + "\n";
fs.writeFileSync(csvPath, csv);

fs.writeFileSync(jsonPath, JSON.stringify(fullJsonRows, null, 2) + "\n");

const values = sqlRows.map((r, idx) =>
  `  ('${escSql(r.gin_name)}', ${r.price_yen}, ${r.bottle_ml || DEFAULT_BOTTLE_ML}, 'active')${idx < sqlRows.length - 1 ? "," : ""}`
);
const generatedAt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  dateStyle: "medium",
  timeStyle: "medium"
}).format(new Date());
const sql = `-- Bar Soutsu｜ボトル価格目安 自動収集シード\n` +
  `-- 生成日時（JST）: ${generatedAt}\n` +
  `-- SQL投入対象: ${sqlRows.length}件 / JSON出力: ${fullJsonRows.length}件 / CSV出力: ${csvRows.length}件\n` +
  `-- 先に supabase_bottle_prices_setup.sql をRunしてテーブルを作成してください。\n` +
  `-- SQLの価格は公開ページから機械抽出した「目安」です。\n` +
  `-- JSON/CSVには未収録銘柄の簡易推定値も含みますが、SQL投入対象からは外しています。\n\n` +
  `insert into public.gin_bottle_prices (gin_name, price_yen, bottle_ml, status)\nvalues\n` +
  values.join("\n") +
  `;\n\nNOTIFY pgrst, 'reload schema';\n`;
fs.writeFileSync(sqlPath, sql);

const setupSql = fs.existsSync(setupSqlPath) ? fs.readFileSync(setupSqlPath, "utf8") : "";
fs.writeFileSync(combinedSqlPath, setupSql + "\n\n" + sql);

process.stdout.write(JSON.stringify({ count: csvRows.length, sourcedRows: rows.length, estimatedRows: estimatedRows.length, sqlRows: sqlRows.length, jsonRows: fullJsonRows.length, csv: csvPath, json: jsonPath, sql: sqlPath, combinedSql: combinedSqlPath }, null, 2) + "\n");
