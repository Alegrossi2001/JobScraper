import * as cheerio from 'cheerio';
import { Job } from '../types/job';
import { SETTINGS } from '../settings';
import { get, withRetry } from '../http';
import { logger } from '../logger';

const BASE_URL    = 'https://bulldogjob.pl';
const LISTING_URL = `${BASE_URL}/companies/jobs/s/city,Poznan`;

// ─── Shape (covers both the JSON API and the Next.js SSR payload) ────────────

interface BDJApiJob {
  id?: number | string;
  // Title varies by endpoint: the SSR payload uses `position`.
  title?: string;
  name?: string;
  position?: string;
  headline?: string;
  // Company is a string in some endpoints, an object in the SSR payload.
  company_name?: string;
  company?: { name?: string } | string;
  city?: string;
  // Legacy numeric salary (JSON API) vs SSR `denominatedSalaryLong`.
  salary_from?: number;
  salary_to?: number;
  salary_currency?: string;
  denominatedSalaryLong?: { money?: string; currency?: string };
  slug?: string;
  tags?: string[];
  technologyTags?: string[];
  seniority?: string;
  experienceLevel?: string;
  remote?: boolean;
}

function resolveTitle(j: BDJApiJob): string {
  return (j.position ?? j.title ?? j.name ?? j.headline ?? '').trim();
}

function resolveId(j: BDJApiJob): string {
  return String(j.id ?? j.slug ?? '').trim();
}

function resolveCompany(j: BDJApiJob): string {
  if (typeof j.company === 'string') return j.company.trim();
  return (j.company?.name ?? j.company_name ?? '').trim();
}

// Bulldogjob's SSR seniority uses "medium" where our Notion select expects "mid".
function normalizeSeniority(s?: string): string | undefined {
  if (!s) return undefined;
  return s.toLowerCase() === 'medium' ? 'mid' : s;
}

// SSR salary is a string like "25 000 - 30 000"; the JSON API uses numbers.
function resolveSalary(j: BDJApiJob): { min?: number; max?: number; currency: string } {
  if (j.salary_from != null) {
    return { min: j.salary_from, max: j.salary_to, currency: j.salary_currency ?? 'PLN' };
  }
  const money = j.denominatedSalaryLong?.money;
  const currency = j.denominatedSalaryLong?.currency ?? 'PLN';
  if (money) {
    const m = money.replace(/\s/g, '').match(/(\d+)\D+(\d+)/);
    if (m) return { min: Number(m[1]), max: Number(m[2]), currency };
    const one = money.replace(/\s/g, '').match(/(\d+)/);
    if (one) return { min: Number(one[1]), currency };
  }
  return { currency };
}

function mapJob(j: BDJApiJob): Job {
  const rawId  = resolveId(j);
  const salary = resolveSalary(j);
  return {
    id:          `bdj_${rawId}`,
    title:       resolveTitle(j),
    company:     resolveCompany(j),
    location:    j.city ?? 'Poznan',
    salaryMin:   salary.min,
    salaryMax:   salary.max,
    currency:    salary.currency,
    techStack:   j.technologyTags ?? j.tags ?? [],
    source:      'Bulldogjob' as const,
    url:         rawId ? `${BASE_URL}/companies/jobs/${rawId}` : `${BASE_URL}/companies/jobs`,
    dateScraped: new Date().toISOString(),
    experience:  normalizeSeniority(j.experienceLevel ?? j.seniority),
    remote:      j.remote ?? false,
  };
}

// Bulldogjob's listing payload includes jobs from other cities (Warsaw, Paris, …)
// and lists the same role many times. Keep Poznań/remote roles and collapse the
// content duplicates that distinct IDs would otherwise let through.
function isPoznanOrRemote(j: Job): boolean {
  return j.location.toLowerCase().includes('pozna') || j.remote;
}

function finalize(jobs: Job[]): Job[] {
  const seen = new Set<string>();
  return jobs.filter(j => {
    if (!j.title?.trim() || !isPoznanOrRemote(j)) return false;
    const key = `${j.title.toLowerCase().trim()}|${j.company.toLowerCase().trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Strategy 1: undocumented JSON API ───────────────────────────────────────

async function tryJsonApi(): Promise<Job[] | null> {
  const skills = SETTINGS.categories.join(',');
  try {
    const data = await withRetry(() =>
      get<BDJApiJob[]>(`${BASE_URL}/api/jobs?city=Poznan&tags=${skills}`, {
        headers: { Accept: 'application/json', Referer: BASE_URL },
      })
    );
    if (!Array.isArray(data) || data.length === 0) return null;
    return data.map(mapJob);
  } catch {
    return null;
  }
}

// ─── Strategy 2: __NEXT_DATA__ from the SSR HTML ─────────────────────────────

async function tryNextData(): Promise<Job[] | null> {
  try {
    const skills = SETTINGS.categories.join(',');
    const url    = `${LISTING_URL}/skills,${skills}`;
    const html   = await withRetry(() => get<string>(url));
    const $      = cheerio.load(html as string);
    const raw    = $('#__NEXT_DATA__').html();
    if (!raw) return null;

    const data = JSON.parse(raw);
    const candidates: unknown[] = [
      data?.props?.pageProps?.jobs,
      data?.props?.pageProps?.listings,
      data?.props?.pageProps?.offers,
      data?.props?.pageProps?.data?.jobs,
      data?.props?.pageProps?.initialData,
    ];

    for (const c of candidates) {
      if (!Array.isArray(c) || c.length === 0) continue;
      return (c as BDJApiJob[]).map(mapJob);
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
    return all.length > 0 ? all : null;
  } catch {
    return null;
  }
}

// ─── Public entry ─────────────────────────────────────────────────────────────

export async function scrapeBulldogjob(): Promise<Job[]> {
  const fromApi = await tryJsonApi();
  if (fromApi) {
    const jobs = finalize(fromApi);
    logger.info(`Bulldogjob: JSON API returned ${jobs.length} jobs`);
    return jobs;
  }

  logger.info('Bulldogjob: JSON API unavailable — trying __NEXT_DATA__');
  const fromNext = await tryNextData();
  if (fromNext) {
    const jobs = finalize(fromNext);
    logger.info(`Bulldogjob: __NEXT_DATA__ returned ${jobs.length} jobs (Poznań/remote, deduped)`);
    return jobs;
  }

  logger.info('Bulldogjob: falling back to HTML scraping');
  const fromHtml = await tryHtmlScraping();
  if (fromHtml) {
    const jobs = finalize(fromHtml);
    logger.info(`Bulldogjob: HTML scraping returned ${jobs.length} jobs`);
    return jobs;
  }

  logger.warn('Bulldogjob: all strategies failed — set SCRAPER_API_KEY to bypass bot detection');
  return [];
}
