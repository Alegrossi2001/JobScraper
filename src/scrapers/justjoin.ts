import * as cheerio from 'cheerio';
import { Job } from '../types/job';
import { SETTINGS } from '../settings';
import { get, withRetry } from '../http';
import { logger } from '../logger';

const API_URL  = 'https://justjoin.it/api/offers';
const BASE_URL = 'https://justjoin.it/offers';
const HTML_URL = 'https://justjoin.it';

// ─── Types ────────────────────────────────────────────────────────────────────

interface JJSkill { name: string; level: number }
interface JJSalary { from: number; to: number; currency: string; gross: boolean }
interface JJEmploymentType { type: string; salary: JJSalary | null }
interface JJOffer {
  id: string;
  title: string;
  company_name: string;
  city: string;
  marker_icon: string;
  workplace_type: string;
  experience_level: string;
  skills: JJSkill[];
  employment_types: JJEmploymentType[];
  multilocation?: Array<{ city: string; street: string }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isInPoznan(o: JJOffer): boolean {
  const check = (s: string) => s.toLowerCase().includes('pozna');
  return check(o.city ?? '') || (o.multilocation?.some(m => check(m.city)) ?? false);
}

function isRelevant(o: JJOffer): boolean {
  const cats = SETTINGS.categories as readonly string[];
  if (cats.includes(o.marker_icon?.toLowerCase())) return true;
  return o.skills?.some(s => cats.includes(s.name.toLowerCase())) ?? false;
}

function bestSalary(types: JJEmploymentType[]): JJSalary | null {
  return types.find(t => t.type === 'b2b' && t.salary)?.salary
      ?? types.find(t => t.salary)?.salary
      ?? null;
}

function toJob(o: JJOffer): Job {
  const salary = bestSalary(o.employment_types ?? []);
  return {
    id:          `jj_${o.id}`,
    title:       o.title,
    company:     o.company_name,
    location:    o.city || 'Poznan',
    salaryMin:   salary?.from,
    salaryMax:   salary?.to,
    currency:    salary?.currency ?? 'PLN',
    techStack:   (o.skills ?? []).map(s => s.name),
    source:      'JustJoin',
    url:         `${BASE_URL}/${o.id}`,
    dateScraped: new Date().toISOString(),
    experience:  o.experience_level,
    remote:      o.workplace_type === 'remote',
  };
}

// ─── Strategy 1: public JSON API ─────────────────────────────────────────────

async function tryApi(): Promise<Job[] | null> {
  try {
    const offers = await withRetry(() =>
      get<JJOffer[]>(API_URL, { headers: { Accept: 'application/json', Referer: 'https://justjoin.it/' } })
    );
    if (!Array.isArray(offers) || offers.length === 0) return null;
    return offers.filter(o => isInPoznan(o) && isRelevant(o)).map(toJob);
  } catch {
    return null;
  }
}

// ─── Strategy 2: parse __NEXT_DATA__ from the HTML page ──────────────────────
// Next.js embeds initial server-side data in a <script id="__NEXT_DATA__"> tag.

async function tryNextData(): Promise<Job[] | null> {
  try {
    const html = await withRetry(() => get<string>(HTML_URL));
    const $ = cheerio.load(html as string);
    const raw = $('#__NEXT_DATA__').html();
    if (!raw) return null;

    const data = JSON.parse(raw);

    // JustJoin embeds offer list somewhere in props — try common paths
    const candidates: unknown[] = [
      data?.props?.pageProps?.offers,
      data?.props?.pageProps?.dehydratedState?.queries?.[0]?.state?.data?.pages?.[0]?.data,
      data?.props?.pageProps?.initialOffers,
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate) && candidate.length > 0) {
        const offers = candidate as JJOffer[];
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

  logger.warn('JustJoin: API blocked — falling back to __NEXT_DATA__ extraction');
  const fromHtml = await tryNextData();
  if (fromHtml) {
    logger.info(`JustJoin: __NEXT_DATA__ returned ${fromHtml.length} matching jobs`);
    return fromHtml;
  }

  logger.warn('JustJoin: both strategies failed — set SCRAPER_API_KEY to bypass bot detection');
  return [];
}
