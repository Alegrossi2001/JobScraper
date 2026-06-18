import * as cheerio from 'cheerio';
import { Job } from '../types/job';
import { SETTINGS } from '../settings';
import { get, withRetry } from '../http';
import { logger } from '../logger';

// Bulldogjob does not expose a stable JSON API — we scrape the HTML listing pages.
// URL structure: /companies/jobs/s/city,Poznan/skills,<csv>
const BASE_URL    = 'https://bulldogjob.pl';
const LISTING_URL = `${BASE_URL}/companies/jobs/s/city,Poznan`;

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

// Attempt the undocumented JSON endpoint first; fall back to HTML.
async function tryJsonApi(): Promise<Job[] | null> {
  const skills = SETTINGS.categories.join(',');
  const url = `${BASE_URL}/api/jobs?city=Poznan&tags=${skills}`;
  try {
    const data = await withRetry(() => get<BDJApiJob[]>(url, {
      headers: { Accept: 'application/json' },
    }));
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
    return null; // API not available — fall through to HTML
  }
}

function parseSalary(text: string): { min?: number; max?: number; currency: string } {
  if (!text) return { currency: 'PLN' };
  // Matches: "15 000 – 25 000 PLN" or "15000-25000 PLN"
  const m = text.replace(/\s/g, '').match(/(\d+)[–\-](\d+)(PLN|EUR|USD)?/i);
  if (!m) return { currency: 'PLN' };
  return { min: Number(m[1]), max: Number(m[2]), currency: (m[3] ?? 'PLN').toUpperCase() };
}

async function scrapeHtml(page = 1): Promise<Job[]> {
  const skills = SETTINGS.categories.join(',');
  const url = page === 1
    ? `${LISTING_URL}/skills,${skills}`
    : `${LISTING_URL}/skills,${skills}/page,${page}`;

  const html = await withRetry(() => get<string>(url, {
    headers: { Accept: 'text/html,application/xhtml+xml' },
    responseType: 'text' as const,
  } as Parameters<typeof get>[1]));

  const $ = cheerio.load(html as string);
  const jobs: Job[] = [];

  // Bulldogjob renders list items with data-job-id or inside article/li tags
  const selectors = [
    '[data-job-id]',
    'article.job',
    'li.job-item',
    '.JobListItem',
    '[class*="JobItem"]',
  ];
  const container = selectors.find(s => $(s).length > 0) ?? '[data-job-id]';

  $(container).each((_, el) => {
    const $el = $(el);

    const title   = $el.find('[data-testid="job-title"], .job-title, h3, h2').first().text().trim();
    const company = $el.find('[data-testid="company-name"], .company-name, .company').first().text().trim();
    const href    = $el.find('a[href*="/companies/jobs"]').first().attr('href') ??
                    $el.closest('a').attr('href') ?? '';

    if (!title) return;

    const salaryRaw = $el.find('[data-testid="salary"], .salary, [class*="salary"]').first().text().trim();
    const { min, max, currency } = parseSalary(salaryRaw);

    const techStack = $el
      .find('[data-testid="tech-item"], .tag, .tech, [class*="Tag"], [class*="Skill"]')
      .map((_, t) => $(t).text().trim())
      .get()
      .filter(Boolean);

    const slug = href.split('/').pop() ?? '';
    const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;

    jobs.push({
      id:          `bdj_${slug || title.replace(/\s+/g, '_')}`,
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

export async function scrapeBulldogjob(): Promise<Job[]> {
  // 1. Try undocumented JSON API
  const apiJobs = await tryJsonApi();
  if (apiJobs) {
    logger.info(`Bulldogjob: JSON API returned ${apiJobs.length} jobs`);
    return apiJobs;
  }

  // 2. Fall back to HTML — scrape first 3 pages to get decent coverage
  logger.info('Bulldogjob: JSON API unavailable, falling back to HTML scraping');
  const pages = await Promise.all([1, 2, 3].map(p => scrapeHtml(p).catch(() => [] as Job[])));
  const all = pages.flat();

  // Deduplicate by id within this scraper run
  const seen = new Set<string>();
  return all.filter(j => {
    if (seen.has(j.id)) return false;
    seen.add(j.id);
    return true;
  });
}
