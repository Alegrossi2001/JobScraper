import * as cheerio from 'cheerio';
import { Job } from '../types/job';
import { SETTINGS } from '../settings';
import { get, withRetry } from '../http';
import { logger } from '../logger';

const BASE_URL    = 'https://bulldogjob.pl';
const LISTING_URL = `${BASE_URL}/companies/jobs/s/city,Poznan`;

// ─── Strategy 1: undocumented JSON API ───────────────────────────────────────

interface BDJApiJob {
  id: number | string;
  title: string;
  company_name?: string;
  company?: { name: string };
  city?: string;
  salary_from?: number;
  salary_to?: number;
  salary_currency?: string;
  slug?: string;
  tags?: string[];
  seniority?: string;
  remote?: boolean;
}

async function tryJsonApi(): Promise<Job[] | null> {
  const skills = SETTINGS.categories.join(',');
  try {
    const data = await withRetry(() =>
      get<BDJApiJob[]>(`${BASE_URL}/api/jobs?city=Poznan&tags=${skills}`, {
        headers: { Accept: 'application/json', Referer: BASE_URL },
      })
    );
    if (!Array.isArray(data) || data.length === 0) return null;
    return data.map(j => ({
      id:          `bdj_${j.id}`,
      title:       j.title,
      company:     j.company_name ?? j.company?.name ?? '',
      location:    j.city ?? 'Poznan',
      salaryMin:   j.salary_from,
      salaryMax:   j.salary_to,
      currency:    j.salary_currency ?? 'PLN',
      techStack:   j.tags ?? [],
      source:      'Bulldogjob' as const,
      url:         j.slug ? `${BASE_URL}/companies/jobs/${j.slug}` : `${BASE_URL}/companies/jobs`,
      dateScraped: new Date().toISOString(),
      experience:  j.seniority,
      remote:      j.remote ?? false,
    }));
  } catch {
    return null;
  }
}

// ─── Strategy 2: __NEXT_DATA__ from the SSR HTML ─────────────────────────────
// Bulldogjob uses Next.js — initial job data is embedded in the page JSON.

async function tryNextData(): Promise<Job[] | null> {
  try {
    const skills = SETTINGS.categories.join(',');
    const url    = `${LISTING_URL}/skills,${skills}`;
    const html   = await withRetry(() => get<string>(url));
    const $      = cheerio.load(html as string);
    const raw    = $('#__NEXT_DATA__').html();
    if (!raw) return null;

    const data = JSON.parse(raw);

    // Try common Next.js pageProps paths for job listings
    const candidates: unknown[] = [
      data?.props?.pageProps?.jobs,
      data?.props?.pageProps?.listings,
      data?.props?.pageProps?.offers,
      data?.props?.pageProps?.data?.jobs,
      data?.props?.pageProps?.initialData,
    ];

    for (const c of candidates) {
      if (!Array.isArray(c) || c.length === 0) continue;
      return (c as BDJApiJob[]).map(j => ({
        id:          `bdj_${j.id ?? j.slug ?? j.title}`,
        title:       j.title,
        company:     j.company_name ?? j.company?.name ?? '',
        location:    j.city ?? 'Poznan',
        salaryMin:   j.salary_from,
        salaryMax:   j.salary_to,
        currency:    j.salary_currency ?? 'PLN',
        techStack:   j.tags ?? [],
        source:      'Bulldogjob' as const,
        url:         j.slug ? `${BASE_URL}/companies/jobs/${j.slug}` : `${BASE_URL}/companies/jobs`,
        dateScraped: new Date().toISOString(),
        experience:  j.seniority,
        remote:      j.remote ?? false,
      }));
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Strategy 3: CSS selector HTML scraping (across multiple pages) ───────────

function parseSalary(text: string): { min?: number; max?: number; currency: string } {
  const m = text.replace(/\s/g, '').match(/(\d+)[–\-](\d+)(PLN|EUR|USD)?/i);
  return m
    ? { min: Number(m[1]), max: Number(m[2]), currency: (m[3] ?? 'PLN').toUpperCase() }
    : { currency: 'PLN' };
}

async function scrapePage(page: number): Promise<Job[]> {
  const skills = SETTINGS.categories.join(',');
  const url    = page === 1
    ? `${LISTING_URL}/skills,${skills}`
    : `${LISTING_URL}/skills,${skills}/page,${page}`;

  const html = await withRetry(() => get<string>(url));
  const $    = cheerio.load(html as string);
  const jobs: Job[] = [];

  const containerSel = [
    '[data-job-id]', 'article.job', 'li.job-item',
    '.JobListItem', '[class*="JobItem"]',
  ].find(s => $(s).length > 0) ?? '[data-job-id]';

  $(containerSel).each((_, el) => {
    const $el    = $(el);
    const title  = $el.find('[data-testid="job-title"], .job-title, h3, h2').first().text().trim();
    const company= $el.find('[data-testid="company-name"], .company-name, .company').first().text().trim();
    const href   = $el.find('a[href*="/companies/jobs"]').first().attr('href')
                ?? $el.closest('a').attr('href') ?? '';
    if (!title) return;

    const salaryRaw = $el.find('[data-testid="salary"], .salary, [class*="salary"]').first().text().trim();
    const { min, max, currency } = parseSalary(salaryRaw);
    const techStack = $el
      .find('[data-testid="tech-item"], .tag, .tech, [class*="Tag"], [class*="Skill"]')
      .map((_, t) => $(t).text().trim()).get().filter(Boolean);

    const slug    = href.split('/').pop() ?? '';
    const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;

    jobs.push({
      id:          `bdj_${slug || title.replace(/\s+/g, '_').slice(0, 40)}`,
      title,
      company,
      location:    'Poznan',
      salaryMin:   min,
      salaryMax:   max,
      currency,
      techStack,
      source:      'Bulldogjob' as const,
      url:         fullUrl,
      dateScraped: new Date().toISOString(),
      remote:      false,
    });
  });

  return jobs;
}

async function tryHtmlScraping(): Promise<Job[] | null> {
  try {
    const pages = await Promise.all([1, 2, 3].map(p => scrapePage(p).catch(() => [] as Job[])));
    const all   = pages.flat();
    const seen  = new Set<string>();
    const dedup = all.filter(j => { if (seen.has(j.id)) return false; seen.add(j.id); return true; });
    return dedup.length > 0 ? dedup : null;
  } catch {
    return null;
  }
}

// ─── Public entry ─────────────────────────────────────────────────────────────

export async function scrapeBulldogjob(): Promise<Job[]> {
  const fromApi = await tryJsonApi();
  if (fromApi) {
    logger.info(`Bulldogjob: JSON API returned ${fromApi.length} jobs`);
    return fromApi;
  }

  logger.info('Bulldogjob: JSON API unavailable — trying __NEXT_DATA__');
  const fromNext = await tryNextData();
  if (fromNext) {
    logger.info(`Bulldogjob: __NEXT_DATA__ returned ${fromNext.length} jobs`);
    return fromNext;
  }

  logger.info('Bulldogjob: falling back to HTML scraping');
  const fromHtml = await tryHtmlScraping();
  if (fromHtml) {
    logger.info(`Bulldogjob: HTML scraping returned ${fromHtml.length} jobs`);
    return fromHtml;
  }

  logger.warn('Bulldogjob: all strategies failed — set SCRAPER_API_KEY to bypass bot detection');
  return [];
}
