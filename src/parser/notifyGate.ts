/**
 * Notification gating for the links-only bot (no AI, no LLM, no scoring).
 *
 * Every new ad from a monitored link is a candidate, so without gates a cycle
 * across 30+ links produces dozens of Telegram messages. These gates cut the
 * volume deterministically:
 *
 *  1. price floor / ceiling  — drops the 20-85 BYN junk and the "Договорная" noise
 *  2. per-model dedupe       — one alert per model, not one per lot
 *  3. blocked keywords       — obvious junk categories
 *
 * Model key extraction is deliberately conservative: it groups an identical
 * product across lots (same make + model + capacity), and never collapses two
 * genuinely different products into one alert.
 */

/** Lower-case, strip markup noise and collapse whitespace. */
function normalizeTitle(title: string): string {
  return String(title || '')
    .toLowerCase()
    .replace(/[«»"'`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Known brands, so "kingston a400" keys the same regardless of word order. */
const BRANDS = [
  'samsung', 'seagate', 'western digital', 'wd', 'kingston', 'crucial', 'intel',
  'toshiba', 'hgst', 'sandisk', 'lexar', 'adata', 'sk hynix', 'hynix', 'micron',
  'apple', 'macbook', 'lenovo', 'thinkpad', 'thinkcentre', 'dell', 'optiplex',
  'latitude', 'hp', 'elitedesk', 'prodesk', 'probook', 'elitebook', 'asus',
  'acer', 'msi', 'gigabyte', 'asrock', 'supermicro', 'fujitsu', 'huawei',
  'xiaomi', 'framework', 'nuc', 'synology', 'qnap', 'mikrotik', 'ubiquiti',
  'tp-link', 'netgear', 'cisco', 'hpe', 'amd', 'ryzen', 'nvidia', 'geforce',
  'radeon', 'asus', 'amd', 'dell', 'intel',
];

/** Storage / memory capacity tokens (1tb, 512gb, 16gb...) — part of the identity. */
function capacityToken(t: string): string | null {
  const m = t.match(/\b(\d{2,4})\s?(tb|gb|mb)\b/);
  return m ? `${m[1]}${m[2]}` : null;
}

/** Model-ish token: letters+digits (a400, bx500, x18, m1, wd20earx, 450g6, x1). */
function modelTokens(t: string): string[] {
  return Array.from(new Set((t.match(/\b[a-z]{1,4}\d{2,5}[a-z0-9]*\b|\b\d{3,5}[a-z]{2,4}\b/g) || [])));
}

/**
 * Stable key identifying "the same product". Returns null when we cannot decide,
 * which callers treat as "never dedupe" (fail noisy but never silently drop).
 */
export function modelKey(listing: { title?: string }): string | null {
  const t = normalizeTitle(listing.title || '');
  if (!t) return null;

  const brand = BRANDS.find((b) => t.includes(b)) || null;
  const cap = capacityToken(t);
  const models = modelTokens(t);

  // Need at least a brand or a model token to claim identity.
  if (!brand && !models.length) return null;

  const parts = [brand || '', ...models.slice(0, 2).sort(), cap || ''].filter(Boolean);
  return parts.join('|') || null;
}

/**
 * Per-source price ceiling: applies ONLY to ads fetched from a search link
 * whose URL contains `match`. A title-only rule cannot express "оперативка до
 * 300" safely — "Ноутбук ... 8GB DDR4" / "Мини ПК ... DDR4" carry the same
 * tokens and would be dropped along with the memory sticks.
 *
 * Format of NOTIFY_SOURCE_MAX_PRICE_BYN (comma-separated, last ':' separates):
 *   query=ddr4:300,query=ddr3:150
 */
export interface SourcePriceRule {
  /** Case-insensitive substring matched against the source search URL. */
  match: string;
  /** Ads above this price coming from that source are dropped. */
  maxPrice: number;
}

/** Parses NOTIFY_SOURCE_MAX_PRICE_BYN. Never throws: junk entries are ignored. */
export function parseSourcePriceRules(
  raw: string | undefined | null,
): SourcePriceRule[] {
  if (!raw || typeof raw !== 'string') return [];
  const rules: SourcePriceRule[] = [];
  for (const chunk of raw.split(',')) {
    const part = chunk.trim();
    if (!part) continue;
    const sep = part.lastIndexOf(':');
    if (sep <= 0) continue;
    const match = part.slice(0, sep).trim().toLowerCase();
    const maxPrice = Number(part.slice(sep + 1).trim());
    if (!match || !Number.isFinite(maxPrice) || maxPrice <= 0) continue;
    rules.push({ match, maxPrice });
  }
  return rules;
}

/** First rule whose `match` occurs in the (raw or percent-decoded) URL. */
export function matchSourcePriceRule(
  sourceUrl: string,
  rules: SourcePriceRule[],
): SourcePriceRule | undefined {
  const raw = sourceUrl.toLowerCase();
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    /* keep raw form when the URL is malformed */
  }
  return rules.find((r) => raw.includes(r.match) || decoded.includes(r.match));
}

export interface GateOptions {
  /** Minimum price in the listing's own currency. 0 disables the floor. */
  minPrice?: number;
  /** Ads above this are usually not "deals" for this user. 0 disables. */
  maxPrice?: number;
  /** Titles containing any of these (case-insensitive) are dropped. */
  blockedKeywords?: string[];
  /** Search link the listing was fetched from (enables per-source ceilings). */
  sourceUrl?: string;
  /** Ceilings that apply only to listings from a matching source URL. */
  sourceRules?: SourcePriceRule[];
}

const DEFAULT_BLOCKED = [
  'райзер', 'райзеры', 'кабель', 'переходник', 'adapter', 'чехол', 'сумка',
  'клавиатура ссср', 'дискета', 'картридж', 'факс', 'сканер',
  'монитор crt', 'телефон кнопочный', 'лента питания',
  // Сборки/магазины «новые ПК на заказ»: warranty/credit boilerplate, new
  // retail builds — user only wants used deals from these search links.
  'гарантия', 'рассрочка', 'в кредит', 'кредит ', 'обмен на ваш',
  'изменение конфигурации', 'сборка пк', 'доставляем по всей',
];

/** Native Kufar category for 3D printers — those get their own price ceiling. */
const PRINTER_MARKERS = ['3d принтер', '3d-принтер', '3d printer', '3д принтер',
  'ender', 'bambu', 'prusa', 'creality', 'anycubic', 'elegoo', 'фотополимерный'];

/** Ads at or above this look like a different product class, not a cheap printer. */
const PRINTER_MAX_PRICE_BYN = Number(process.env.NOTIFY_PRINTER_MAX_PRICE_BYN ?? 1000);

/**
 * Cheap pre-filter: runs BEFORE the dedupe map, so junk never occupies a key
 * slot and never blocks a real deal of the same model.
 */
export function passesPriceAndKeywordGate(
  listing: { title?: string; price?: number; currency?: string },
  options: GateOptions = {},
): { pass: boolean; reason?: string } {
  const minPrice = options.minPrice ?? 0;
  const maxPrice = options.maxPrice ?? 0;
  const blocked = options.blockedKeywords ?? DEFAULT_BLOCKED;
  const sourceRules = options.sourceRules ?? [];
  const t = normalizeTitle(listing.title || '');

  if (blocked.some((k) => t.includes(normalizeTitle(k)))) {
    return { pass: false, reason: 'blocked_keyword' };
  }

  const price = listing.price;
  // "Договорная" / missing price: keep only if there is no floor configured,
  // otherwise these are the bulk of the noise.
  if (price === undefined || price === null || !Number.isFinite(price)) {
    return minPrice > 0 ? { pass: false, reason: 'no_price' } : { pass: true };
  }

  if (minPrice > 0 && price < minPrice) return { pass: false, reason: 'below_min_price' };
  if (maxPrice > 0 && price > maxPrice) return { pass: false, reason: 'above_max_price' };

  // 3D printers have their own ceiling: the user wants cheap ones only, so a
  // 1800 BYN Bambu is noise even though it is a "real deal".
  if (PRINTER_MAX_PRICE_BYN > 0 && PRINTER_MARKERS.some((k) => t.includes(k))) {
    if (price > PRINTER_MAX_PRICE_BYN) {
      return { pass: false, reason: 'printer_above_max_price' };
    }
  }

  // Per-source ceiling (e.g. the оперативка link capped at 300 BYN). Only ads
  // that actually came from the matching search link are affected, so DDR4
  // mentioned inside a laptop/mini-PC title is untouched.
  if (sourceRules.length && options.sourceUrl) {
    const rule = matchSourcePriceRule(options.sourceUrl, sourceRules);
    if (rule && price > rule.maxPrice) {
      return { pass: false, reason: 'source_above_max_price' };
    }
  }

  return { pass: true };
}

/**
 * Rolling per-model dedupe. Keeps an in-memory map of modelKey -> timestamp so
 * the same model is only alerted once per window.
 */
export class ModelDedupe {
  private readonly seen = new Map<string, number>();

  constructor(private readonly windowMs: number) {}

  /** Returns true when this model has NOT been alerted within the window. */
  shouldAlert(listing: { title?: string }, now = Date.now()): boolean {
    const key = modelKey(listing);
    if (!key) return true; // undecidable -> never suppress
    const last = this.seen.get(key);
    if (last !== undefined && now - last < this.windowMs) return false;
    this.seen.set(key, now);
    this.prune(now);
    return true;
  }

  private prune(now: number): void {
    if (this.seen.size < 5000) return;
    for (const [k, ts] of this.seen) {
      if (now - ts > this.windowMs) this.seen.delete(k);
    }
  }

  get size(): number {
    return this.seen.size;
  }
}
