/**
 * Minimal Firecrawl client for sources that sit behind Cloudflare.
 *
 * The existing `server/services/firecrawl.ts` covers the normal pipeline (map, extract,
 * search, scrape) but its `scrape()` sends no `proxy` option, so it uses the default
 * proxy tier. That is fine for the 51 ordinary sources and useless for a Cloudflare-
 * blocked host: exchangeline.com returns 403 to anything else.
 *
 * Rather than change a shared service that other work depends on, this module makes the
 * one call those sources need — `POST /v2/scrape` with `proxy: "stealth"` — and nothing
 * more. Verified 2026-08-03: exchangeline (a plain Cloudflare block) and HiBid (the
 * harder Turnstile challenge) both returned 200 through it.
 *
 * COST: unlike the rest of this folder, these calls are NOT free. Stealth proxying is
 * billed at a premium and took 3–13s per page in testing, so adapters built on it should
 * fetch one index/feed per run rather than one request per listing.
 */

/** Matches the base URL used by the existing firecrawl service. */
const FIRECRAWL_BASE_URL = 'https://api.firecrawl.dev/v2';

export type FirecrawlFormat = 'markdown' | 'html' | 'rawHtml' | 'links';

export interface StealthScrapeOptions {
  formats?: FirecrawlFormat[];
  /** Keep the full page. Defaults to false because feeds and calendars often live
   *  outside whatever Firecrawl considers "main content". */
  onlyMainContent?: boolean;
  /** Extra settle time for JS-rendered pages. Not needed for static feeds. */
  waitFor?: number;
  timeoutMs?: number;
}

export interface StealthScrapeResult {
  markdown?: string;
  html?: string;
  rawHtml?: string;
  links?: string[];
  statusCode?: number;
  title?: string;
}

/**
 * Scrape one URL through Firecrawl's stealth proxy.
 *
 * Throws on a missing key or a failed scrape so a caller cannot mistake an auth problem
 * for "this source has no auctions" — a silent empty result is the failure mode that
 * hides for months.
 */
export async function stealthScrape(url: string, options: StealthScrapeOptions = {}): Promise<StealthScrapeResult> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error('FIRECRAWL_API_KEY is not set — stealth-proxied sources cannot run');

  const { formats = ['markdown'], onlyMainContent = false, waitFor, timeoutMs = 180_000 } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let payload: {
    success?: boolean;
    error?: string;
    data?: {
      markdown?: string;
      html?: string;
      rawHtml?: string;
      links?: string[];
      metadata?: { statusCode?: number; title?: string };
    };
  };

  try {
    const response = await fetch(`${FIRECRAWL_BASE_URL}/scrape`, {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, formats, onlyMainContent, proxy: 'stealth', ...(waitFor ? { waitFor } : {}) }),
    });

    if (!response.ok) throw new Error(`Firecrawl HTTP ${response.status} for ${url}`);
    payload = (await response.json()) as typeof payload;
  } finally {
    clearTimeout(timer);
  }

  if (!payload.success) throw new Error(`Firecrawl failed for ${url}: ${payload.error ?? 'unknown error'}`);

  const data = payload.data ?? {};
  return {
    markdown: data.markdown,
    html: data.html,
    rawHtml: data.rawHtml,
    links: data.links,
    statusCode: data.metadata?.statusCode,
    title: data.metadata?.title,
  };
}
