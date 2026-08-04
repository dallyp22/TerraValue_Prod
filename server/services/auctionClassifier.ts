/**
 * Auction property classifier.
 *
 * Determines what KIND of property an auction is so the UI can exclude
 * non-land listings (equipment, personal property, vehicles, household/estate
 * contents, firearms, livestock, etc.) that leak in from the auctioneer feeds.
 *
 * Deterministic and precision-oriented: it only marks something `non_land`
 * when there's a clear non-land signal AND no strong land signal, so real
 * farmland is never hidden. Runs at ingest and again after enrichment.
 */

export type PropertyCategory =
  | "farmland"
  | "recreational"
  | "residential"
  | "commercial"
  | "development"
  | "non_land"
  | "unknown";

export interface ClassificationResult {
  category: PropertyCategory;
  confidence: number; // 0-1
  reason: string;
}

export interface ClassifiableAuction {
  title?: string | null;
  description?: string | null;
  enrichedDescription?: string | null;
  landType?: string | null;
  acreage?: number | null;
  csr2Mean?: number | null;
}

// Land-type values that map directly (these come structured from the scrape).
const LANDTYPE_MAP: Record<string, PropertyCategory> = {
  residential: "residential",
  commercial: "commercial",
  "commercial building": "commercial",
  "auto auction": "non_land",
  "personal property auction": "non_land",
  "farm equipment auction": "non_land",
  "equipment auction": "non_land",
  "farm equipment": "non_land",
  workshop: "non_land",
  "church contents": "non_land",
  livestock: "non_land",
  tillable: "farmland",
  cropland: "farmland",
  irrigated: "farmland",
  dryland: "farmland",
  pasture: "farmland",
  crp: "farmland",
  recreational: "recreational",
  woods: "recreational",
  timber: "recreational",
};

// Strong non-land signals (the thing being sold is NOT real estate).
const NON_LAND = [
  "equipment auction", "farm equipment", "personal property", "household goods",
  "estate contents", "antique", "collectible", "collector car", "coin auction",
  "firearm", "guns", "gun auction", "ammo", "ammunition", "vehicle auction",
  "auto auction", "car auction", "truck auction", "machinery auction", "consignment",
  "tools", "furniture", "liquidation sale", "moving sale", "benefit auction",
  "livestock", "cattle sale", "feeder cattle", "hog sale", "sheep sale", "poultry",

  // Bare implement and vehicle titles. Individual lots from item-level pages
  // (bid.dreamdirt.com/auction/{id}/item/..., HiBid catalogues) arrive titled
  // "2022 John Deere S780 2WD Combine" with no auction-level wording, so none of
  // the phrases above catch them and they landed on the land map as `unknown`.
  // Safe to list bare terms here because this rule only fires when there is NO
  // land signal — a combined land-and-equipment sale still classifies as land.
  "combine", "tractor", "skid steer", "skidloader", "planter", "ripper", "rippers",
  "disk", "disks", "disc mower", "mower", "baler", "sprayer", "grain cart", "auger",
  "hay rake", "manure spreader", "atv", "utv", "four wheeler", "semi trailer",
  "pickup", "flatbed", "backhoe", "excavator", "forklift", "snowblower",
];

// Strong land signals (this IS real property).
const LAND = [
  "acre", "acres", " ac ", " ac.", "m/l", "farmland", "tillable", "cropland",
  "crp", "pasture", "grassland", "ranch", "section of land", "wooded", "timber",
  "recreational", "hunting", "homestead", "building site", "development ground",
];
const REC = ["hunting", "recreational", "timber", "wooded", "woods", "cabin", "duck", "deer", "wildlife"];
const RESIDENTIAL = ["residential lot", "single family", "home on", "house and", "acreage with home", "residential acreage"];
const COMMERCIAL = ["commercial building", "commercial lot", "commercial property", "retail", "warehouse", "office building"];
const DEVELOPMENT = ["development ground", "development land", "subdivision", "building lots"];

/**
 * Keyword matching with word boundaries.
 *
 * This used to be a bare `text.includes(k)`, which put farm equipment on the
 * land map: "deer" in the recreational list matched "John **Deer**e", so a
 * 2022 John Deere S780 combine classified as recreational land with 0.7
 * confidence. Every listing titled after a Deere implement went the same way.
 *
 * Boundaries are applied only where the keyword actually starts/ends on a word
 * character, so entries like " ac." and "m/l" still match — a trailing \b after
 * "." can never match and would silently kill those rules.
 */
const KEYWORD_PATTERNS = new Map<string, RegExp>();

function keywordPattern(keyword: string): RegExp {
  let re = KEYWORD_PATTERNS.get(keyword);
  if (!re) {
    const body = keyword
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&") // escape regex metacharacters
      .replace(/\s+/g, "\\s+");               // tolerate variable whitespace
    const lead = /^\w/.test(keyword.trim()) ? "\\b" : "";
    const tail = /\w$/.test(keyword.trim()) ? "\\b" : "";
    re = new RegExp(`${lead}${body}${tail}`, "i");
    KEYWORD_PATTERNS.set(keyword, re);
  }
  return re;
}

function hasAny(text: string, kws: string[]): boolean {
  return kws.some((k) => keywordPattern(k).test(text));
}

export function classifyAuction(a: ClassifiableAuction): ClassificationResult {
  const title = (a.title || "").toLowerCase();
  const landType = (a.landType || "").trim().toLowerCase();
  const desc = (a.enrichedDescription || a.description || "").toLowerCase();
  const text = `${title} ${landType} ${desc}`;
  const landSignal = hasAny(text, LAND) || (a.csr2Mean != null && a.csr2Mean > 0) || (a.acreage != null && a.acreage >= 5);

  // 1) Structured land_type is the most reliable signal.
  if (landType && LANDTYPE_MAP[landType]) {
    const category = LANDTYPE_MAP[landType];
    // Guard: a "farm equipment"/"equipment" land_type with strong land words is
    // probably a combined land+equipment sale leaning land — leave as non_land
    // only when no land signal.
    if (category === "non_land" && landSignal && hasAny(text, ["acre", "acres", "tillable", "farmland", "cropland"])) {
      return { category: "farmland", confidence: 0.6, reason: `land_type "${landType}" but title indicates land acreage` };
    }
    return { category, confidence: 0.9, reason: `land_type "${landType}"` };
  }

  // 2) Clear non-land keyword with no land signal.
  if (hasAny(text, NON_LAND) && !landSignal) {
    return { category: "non_land", confidence: 0.85, reason: "non-land keywords, no land/acreage signal" };
  }

  // 3) Land sub-types.
  if (hasAny(text, COMMERCIAL)) return { category: "commercial", confidence: 0.7, reason: "commercial keywords" };
  if (hasAny(text, DEVELOPMENT)) return { category: "development", confidence: 0.7, reason: "development keywords" };
  if (hasAny(text, RESIDENTIAL) && !hasAny(text, ["tillable", "cropland", "farmland"])) {
    return { category: "residential", confidence: 0.65, reason: "residential keywords" };
  }
  if (hasAny(text, REC) && !hasAny(text, ["tillable", "cropland"])) {
    return { category: "recreational", confidence: 0.7, reason: "recreational/hunting keywords" };
  }

  // 4) Has a real land signal → farmland (the default for ag auctions).
  if (landSignal) {
    return { category: "farmland", confidence: hasAny(text, ["tillable", "cropland", "csr", "farmland", "crp"]) ? 0.8 : 0.6, reason: "land/acreage signal" };
  }

  // 5) Couldn't tell.
  return { category: "unknown", confidence: 0.3, reason: "no clear signal" };
}

/** UI gate helper: categories shown to users by default (everything but non-land). */
export const HIDDEN_CATEGORIES: PropertyCategory[] = ["non_land"];

export const auctionClassifier = { classifyAuction };
