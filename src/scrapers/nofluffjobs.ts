import * as cheerio from 'cheerio';
import { Job } from '../types/job';
import { SETTINGS } from '../settings';
import { get, withRetry } from '../http';
import { logger } from '../logger';

const SEARCH_URL = 'https://nofluffjobs.com/api/search/posting';
const RSS_URL    = 'https://nofluffjobs.com/rss';

// ─── Types ────────────────────────────────────────────────────────────────────

interface NFJPosting {
  id: string;
  name: string;
  posted: string;
  title?: { original: string };
  company: { name: string; url: string };
  location: {
    places?: Array<{ city: string }>;
    fullyRemote?: boolean;
  };
  salary?: { from: number; to: number; currency: string; period: string };
  seniority?: string[];
  url: string;
  tiles?: { values: Array<{ value: string; type: string }> };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isInPoznan(p: NFJPosting): boolean {
  return p.location.fullyRemote === true ||
    (p.location.places?.some(pl => pl.city?.toLowerCase().includes('pozna')) ?? false);
}

function postingToJob(p: NFJPosting): Job {
  return {
    id:          `nfj_${p.id}`,
    title:       p.title?.original ?? p.name,
    company:     p.company?.name ?? '',
    location:    p.location.places?.[0]?.city ?? 'Poznan',
    salaryMin:   p.salary?.from,
    salaryMax:   p.salary?.to,
    currency:    p.salary?.currency ?? 'PLN',
    techStack:   (p.tiles?.values ?? []).map(v => v.value).filter(Boolean),
    source:      'NoFluffJobs',
    url:         `https://nofluffjobs.com/job/${p.url}`,
    dateScraped: new Date().toISOString(),
    experience:  p.seniority?.[0],
    remote:      p.location.fullyRemote ?? false,
  };
}

// ─── Strategy 1: JSON search API ─────────────────────────────────────────────

async function tryApi(): Promise<Job[] | null> {
  const criteria = `city%3DPozna%C5%84+seniority%3D${SETTINGS.experience.join(',')}`;
  try {
    const data = await withRetry(() =>
      get<{ postings: NFJPosting[] }>(`${SEARCH_URL}?criteria=${criteria}`, {
        headers: {
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          Referer: 'https://nofluffjobs.com/',
          Origin:  'https://nofluffjobs.com',
        },
      })
    );
    const postings = data.postings ?? [];
    if (postings.length === 0) return null;
    return postings.filter(isInPoznan).map(postingToJob);
  } catch {
    return null;
  }
}

// ─── Strategy 2: RSS feed ─────────────────────────────────────────────────────
// RSS doesn't require auth/cookies and is rarely behind bot detection.

function parseSalaryFromDesc(desc: string): { from?: number; to?: number; currency: string } {
  const m = desc.replace(/\s/g, '').match(/(\d{4,6})[–\-](\d{4,6})(PLN|EUR|USD)/i);
  return m
    ? { from: Number(m[1]), to: Number(m[2]), currency: m[3].toUpperCase() }
    : { currency: 'PLN' };
}

async function tryRss(): Promise<Job[] | null> {
  try {
    const xml = await withRetry(() =>
      get<string>(RSS_URL, {
        headers: { Accept: 'application/rss+xml, application/xml, text/xml, */*' },
      })
    );

    const $ = cheerio.load(xml as string, { xmlMode: true });
    const jobs: Job[] = [];

    $('item').each((_, el) => {
      const $el   = $(el);
      const title = $el.find('title').first().text().trim();
      const link  = $el.find('link').first().text().trim();
      const desc  = $el.find('description').first().text();
      const guid  = $el.find('guid').first().text().trim();

      if (!title || !link) return;

      // Filter to Poznan — description contains location
      const descLower = desc.toLowerCase();
      const isRemote  = descLower.includes('remote') || descLower.includes('zdalnie');
      const inPoznan  = descLower.includes('pozna') || isRemote;
      if (!inPoznan) return;

      // Filter to relevant categories
      const cats = SETTINGS.categories as readonly string[];
      const relevant = cats.some(c => title.toLowerCase().includes(c) || descLower.includes(c));
      if (!relevant) return;

      const { from, to, currency } = parseSalaryFromDesc(desc);
      const id = guid.split('/').pop() ?? title.replace(/\s+/g, '_').slice(0, 40);

      // Extract tech stack from description tags
      const $desc = cheerio.load(desc);
      const tags  = $desc('li, .requirement, span')
        .map((_, t) => $desc(t).text().trim())
        .get()
        .filter(t => t.length < 30 && /^[a-zA-Z0-9#+.\-/ ]+$/.test(t));

      jobs.push({
        id:          `nfj_${id}`,
        title,
        company:     '', // RSS doesn't always expose company separately
        location:    isRemote ? 'Remote' : 'Poznan',
        salaryMin:   from,
        salaryMax:   to,
        currency,
        techStack:   [...new Set(tags)].slice(0, 15),
        source:      'NoFluffJobs',
        url:         link,
        dateScraped: new Date().toISOString(),
        remote:      isRemote,
      });
    });

    return jobs.length > 0 ? jobs : null;
  } catch {
    return null;
  }
}

// ─── Public entry ─────────────────────────────────────────────────────────────

export async function scrapeNoFluffJobs(): Promise<Job[]> {
  const fromApi = await tryApi();
  if (fromApi) {
    logger.info(`NoFluffJobs: API returned ${fromApi.length} matching jobs`);
    return fromApi;
  }

  logger.warn('NoFluffJobs: API blocked — falling back to RSS feed');
  const fromRss = await tryRss();
  if (fromRss) {
    logger.info(`NoFluffJobs: RSS returned ${fromRss.length} matching jobs`);
    return fromRss;
  }

  logger.warn('NoFluffJobs: both strategies failed — set SCRAPER_API_KEY to bypass bot detection');
  return [];
}
