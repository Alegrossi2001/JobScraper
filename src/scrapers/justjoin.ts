import * as cheerio from 'cheerio';
import { Job } from '../types/job';
import { SETTINGS } from '../settings';
import { get, withRetry } from '../http';
import { logger } from '../logger';

// JustJoin migrated to a versioned API host. The legacy https://justjoin.it/api/offers
// now 404s. This v2 endpoint is paginated and supports server-side city filtering.
const API_URL  = 'https://api.justjoin.it/v2/user-panel/offers';
const HTML_URL = 'https://justjoin.it';
const OFFER_URL = (slug: string) => `https://justjoin.it/job-offer/${slug}`;
const MAX_PAGES = 3; // Poznań fits in one page of 100; cap as a safety net

// ─── Category mapping ────────────────────────────────────────────────────────
// The v2 list payload no longer carries skills, only a numeric categoryId.
// These IDs are stable JustJoin categories (verified against live Poznań data).
const CATEGORY_SLUG_BY_ID: Record<number, string> = {
  1: 'js', 2: 'html', 3: 'php', 4: 'ruby', 5: 'python', 6: 'java', 7: '.net',
  8: 'scala', 9: 'c', 10: 'mobile', 11: 'testing', 12: 'devops', 13: 'admin',
  14: 'ux', 15: 'pm', 16: 'game', 17: 'analytics', 18: 'security', 19: 'data',
  20: 'go', 21: 'support', 22: 'erp', 23: 'architecture', 24: 'other', 25: 'ai',
};

// Translate the user's SETTINGS.categories into JustJoin category slugs.
const SETTING_TO_CATEGORY: Record<string, string> = {
  javascript: 'js', typescript: 'js', react: 'js', nodejs: 'js', backend: '', fullstack: '',
  python: 'python', java: 'java', devops: 'devops', go: 'go', php: 'php', ruby: 'ruby',
  csharp: '.net', '.net': '.net', dotnet: '.net', c: 'c', 'c++': 'c', scala: 'scala',
  mobile: 'mobile', testing: 'testing', qa: 'testing', security: 'security',
  data: 'data', ai: 'ai', ml: 'ai', game: 'game', html: 'html', architecture: 'architecture',
};

const WANTED_CATEGORIES = new Set(
  (SETTINGS.categories as readonly string[])
    .map(c => SETTING_TO_CATEGORY[c])
    .filter(Boolean),
);

// ─── Types (v2 schema) ────────────────────────────────────────────────────────

interface JJv2Employment {
  from: number | null;
  to: number | null;
  currency: string;
  type: string;
}
interface JJv2Offer {
  guid: string;
  slug: string;
  title: string;
  requiredSkills?: Array<string | { name: string }> | null;
  workplaceType?: string;
  experienceLevel?: string;
  employmentTypes?: JJv2Employment[];
  categoryId?: number;
  multilocation?: Array<{ city: string }>;
  city?: string;
  companyName?: string;
}
interface JJv2Response {
  data: JJv2Offer[];
  meta?: { nextPage: number | null };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isInPoznan(o: JJv2Offer): boolean {
  const check = (s?: string) => (s ?? '').toLowerCase().includes('pozna');
  return check(o.city) || (o.multilocation?.some(m => check(m.city)) ?? false);
}

function isRelevant(o: JJv2Offer): boolean {
  const slug = CATEGORY_SLUG_BY_ID[o.categoryId ?? -1];
  return slug ? WANTED_CATEGORIES.has(slug) : false;
}

function bestSalary(types: JJv2Employment[]): JJv2Employment | null {
  return types.find(t => t.type === 'b2b' && t.from != null)
      ?? types.find(t => t.from != null)
      ?? null;
}

function toJob(o: JJv2Offer): Job {
  const salary = bestSalary(o.employmentTypes ?? []);
  const techStack = Array.isArray(o.requiredSkills)
    ? o.requiredSkills.map(s => (typeof s === 'string' ? s : s?.name)).filter(Boolean) as string[]
    : [];
  return {
    id:          `jj_${o.guid}`,
    title:       o.title,
    company:     o.companyName ?? '',
    location:    o.city || 'Poznan',
    salaryMin:   salary?.from ?? undefined,
    salaryMax:   salary?.to ?? undefined,
    currency:    (salary?.currency ?? 'PLN').toUpperCase(),
    techStack,
    source:      'JustJoin',
    url:         OFFER_URL(o.slug),
    dateScraped: new Date().toISOString(),
    experience:  o.experienceLevel,
    remote:      o.workplaceType === 'remote',
  };
}

// ─── Strategy 1: v2 JSON API (fetched direct — see http.ts noProxy) ──────────

async function tryApi(): Promise<Job[] | null> {
  try {
    const offers: JJv2Offer[] = [];
    let page = 1;
    while (page <= MAX_PAGES) {
      const url = `${API_URL}?page=${page}&perPage=100&city=poznan`;
      const res = await withRetry(() =>
        get<JJv2Response>(url, {
          headers: { Accept: 'application/json', Referer: 'https://justjoin.it/', Version: '2' },
        }, /* noProxy */ true)
      );
      const batch = res?.data ?? [];
      offers.push(...batch);
      if (batch.length === 0 || res?.meta?.nextPage == null) break;
      page++;
    }
    if (offers.length === 0) return null;
    return offers.filter(o => isInPoznan(o) && isRelevant(o)).map(toJob);
  } catch {
    return null;
  }
}

// ─── Strategy 2: parse __NEXT_DATA__ from the HTML page (fallback) ───────────

async function tryNextData(): Promise<Job[] | null> {
  try {
    const html = await withRetry(() => get<string>(HTML_URL));
    const $ = cheerio.load(html as string);
    const raw = $('#__NEXT_DATA__').html();
    if (!raw) return null;

    const data = JSON.parse(raw);
    const candidates: unknown[] = [
      data?.props?.pageProps?.offers,
      data?.props?.pageProps?.dehydratedState?.queries?.[0]?.state?.data?.pages?.[0]?.data,
      data?.props?.pageProps?.initialOffers,
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate) && candidate.length > 0) {
        const offers = candidate as JJv2Offer[];
        return offers.filter(o => isInPoznan(o) && isRelevant(o)).map(toJob);
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Public entry ─────────────────────────────────────────────────────────────

export async function scrapeJustJoin(): Promise<Job[]> {
  const fromApi = await tryApi();
  if (fromApi) {
    logger.info(`JustJoin: API returned ${fromApi.length} matching jobs`);
    return fromApi;
  }

  logger.warn('JustJoin: v2 API unavailable — falling back to __NEXT_DATA__ extraction');
  const fromHtml = await tryNextData();
  if (fromHtml) {
    logger.info(`JustJoin: __NEXT_DATA__ returned ${fromHtml.length} matching jobs`);
    return fromHtml;
  }

  logger.warn('JustJoin: both strategies failed');
  return [];
}
