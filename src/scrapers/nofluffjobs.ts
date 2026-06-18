import { Job } from '../types/job';
import { SETTINGS } from '../settings';
import { get, withRetry } from '../http';

// NoFluffJobs search endpoint — criteria is a space-separated filter string
const SEARCH_URL = 'https://nofluffjobs.com/api/search/posting';

interface NFJPlace {
  city: string;
  country: { code: string };
  virtual?: boolean;
}
interface NFJLocation {
  places: NFJPlace[];
  fullyRemote?: boolean;
}
interface NFJSalary {
  from: number;
  to: number;
  currency: string;
  period: string;
}
interface NFJTileValue {
  value: string;
  type: string;
}
interface NFJPosting {
  id: string;
  name: string;
  posted: string;
  title?: { original: string };
  company: { name: string; url: string };
  location: NFJLocation;
  salary?: NFJSalary;
  seniority?: string[];
  technology?: string;
  category?: string;
  url: string;
  tiles?: { values: NFJTileValue[] };
}
interface NFJResponse {
  postings: NFJPosting[];
  totalCount?: number;
}

function buildCriteria(): string {
  // Poznań in Polish includes ń — must be encoded correctly
  const city = 'Pozna%C5%84'; // URL-encoded Poznań
  const seniority = SETTINGS.experience.join(',');
  // Decode as: city=Poznań seniority=junior,mid,senior
  return `city%3D${city}+seniority%3D${seniority}`;
}

export async function scrapeNoFluffJobs(): Promise<Job[]> {
  const criteria = buildCriteria();
  const url = `${SEARCH_URL}?criteria=${criteria}`;

  const data = await withRetry(() =>
    get<NFJResponse>(url, {
      headers: {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: 'https://nofluffjobs.com/',
      },
    })
  );

  const postings = data.postings ?? [];

  // NFJ sometimes returns all cities; filter to Poznan
  const isInPoznan = (p: NFJPosting) =>
    p.location.fullyRemote ||
    p.location.places?.some(pl => pl.city?.toLowerCase().includes('pozna'));

  return postings
    .filter(isInPoznan)
    .map(p => {
      const techStack = (p.tiles?.values ?? []).map(v => v.value).filter(Boolean);
      const salary = p.salary;

      return {
        id:          `nfj_${p.id}`,
        title:       p.title?.original ?? p.name,
        company:     p.company?.name ?? '',
        location:    p.location.places?.[0]?.city ?? 'Poznan',
        salaryMin:   salary?.from,
        salaryMax:   salary?.to,
        currency:    salary?.currency ?? 'PLN',
        techStack,
        source:      'NoFluffJobs' as const,
        url:         `https://nofluffjobs.com/job/${p.url}`,
        dateScraped: new Date().toISOString(),
        experience:  p.seniority?.[0],
        remote:      p.location.fullyRemote ?? false,
      };
    });
}
