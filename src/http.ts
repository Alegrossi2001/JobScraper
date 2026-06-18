import axios, { AxiosRequestConfig } from 'axios';

// Full browser header set — reduces Cloudflare/fingerprint detection
const BROWSER_HEADERS = {
  'User-Agent':                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':                    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language':           'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding':           'gzip, deflate, br',
  'Connection':                'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest':            'document',
  'Sec-Fetch-Mode':            'navigate',
  'Sec-Fetch-Site':            'none',
  'Sec-Fetch-User':            '?1',
  'Cache-Control':             'max-age=0',
};

const API_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':          'application/json, text/plain, */*',
  'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
  'Sec-Fetch-Dest':  'empty',
  'Sec-Fetch-Mode':  'cors',
  'Sec-Fetch-Site':  'same-origin',
};

/**
 * If SCRAPER_API_KEY is set, all requests are proxied through ScraperAPI
 * (scraperapi.com — free tier covers ~5 000 req/month, enough for this scraper).
 * This bypasses Cloudflare / IP-based bot detection on JustJoin and NoFluffJobs.
 */
function proxyUrl(url: string): string {
  const key = process.env.SCRAPER_API_KEY;
  if (!key) return url;
  return `https://api.scraperapi.com/?api_key=${key}&url=${encodeURIComponent(url)}`;
}

export async function get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const wantJson = String(config?.headers?.['Accept'] ?? '').includes('application/json');
  const defaultHeaders = wantJson ? API_HEADERS : BROWSER_HEADERS;

  const res = await axios.get<T>(proxyUrl(url), {
    timeout: 60_000, // ScraperAPI adds latency
    headers: { ...defaultHeaders, ...config?.headers },
    ...config,
  });
  return res.data;
}

export async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < retries - 1) await sleep(1_000 * 2 ** i + Math.random() * 500);
    }
  }
  throw lastErr;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
