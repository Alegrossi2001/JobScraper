import { Job } from '../types/job';
import { SETTINGS } from '../settings';
import { get, withRetry } from '../http';

// JustJoin public flat API — returns every active listing
const API_URL  = 'https://justjoin.it/api/offers';
const BASE_URL = 'https://justjoin.it/offers';

interface JJSkill {
  name: string;
  level: number;
}
interface JJSalary {
  from: number;
  to: number;
  currency: string;
  gross: boolean;
}
interface JJEmploymentType {
  type: string;
  salary: JJSalary | null;
}
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

function isInPoznan(offer: JJOffer): boolean {
  const check = (s: string) => s.toLowerCase().includes('pozna');
  return check(offer.city ?? '') ||
    (offer.multilocation?.some(m => check(m.city)) ?? false);
}

function isRelevantCategory(offer: JJOffer): boolean {
  const cats = SETTINGS.categories as readonly string[];
  const icon = offer.marker_icon?.toLowerCase() ?? '';
  if (cats.includes(icon)) return true;
  return offer.skills?.some(s => cats.includes(s.name.toLowerCase())) ?? false;
}

function bestSalary(types: JJEmploymentType[]): JJSalary | null {
  // Prefer B2B, then any type with a salary
  const b2b = types.find(t => t.type === 'b2b' && t.salary);
  if (b2b?.salary) return b2b.salary;
  return types.find(t => t.salary)?.salary ?? null;
}

export async function scrapeJustJoin(): Promise<Job[]> {
  const offers = await withRetry(() => get<JJOffer[]>(API_URL, {
    headers: { Accept: 'application/json' },
  }));

  return offers
    .filter(o => isInPoznan(o) && isRelevantCategory(o))
    .map(o => {
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
        source:      'JustJoin' as const,
        url:         `${BASE_URL}/${o.id}`,
        dateScraped: new Date().toISOString(),
        experience:  o.experience_level,
        remote:      o.workplace_type === 'remote',
      };
    });
}
