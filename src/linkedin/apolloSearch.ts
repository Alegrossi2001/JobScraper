import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
import axios from 'axios';

const ENGINEERING_TITLES = [
  'Engineering Manager', 'Head of Engineering', 'VP of Engineering', 'VP Engineering',
  'CTO', 'Chief Technology Officer', 'Director of Engineering',
  'Lead Software Engineer', 'Principal Engineer', 'Staff Engineer',
  'Technical Lead', 'Tech Lead',
];

const RECRUITMENT_TITLES = [
  'Technical Recruiter', 'IT Recruiter', 'Talent Acquisition',
  'Hiring Manager', 'Head of Talent', 'Recruitment Manager',
];

async function searchPeople(companyName: string, titles: string[]): Promise<object[]> {
  try {
    // Apollo requires the API key in the X-Api-Key header (body api_key → HTTP 422).
    const { data } = await axios.post(
      'https://api.apollo.io/api/v1/mixed_people/search',
      {
        organization_names: [companyName],
        person_titles:    titles,
        person_locations: ['Poland'],
        per_page:         5,
        page:             1,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'X-Api-Key': process.env.APOLLO_API_KEY ?? '',
        },
        timeout: 30_000,
      }
    );

    return (data.people ?? []).map((p: any) => ({
      name:         p.name ?? '',
      title:        p.title ?? '',
      linkedin_url: p.linkedin_url ?? null,
      email:        p.email ?? null,
      location:     p.city ? `${p.city}, ${p.country}` : (p.country ?? ''),
    }));
  } catch (err: any) {
    // Surface the real reason instead of silently returning [] (looks like "no people").
    const status = err.response?.status ?? '';
    const msg = err.response?.data?.error ?? err.message;
    console.error(`Apollo search failed for "${companyName}" [${status}]: ${msg}`);
    return [];
  }
}

async function main() {
  const companyName = process.argv[2];
  if (!companyName) { console.error('Usage: tsx apolloSearch.ts <company_name>'); process.exit(1); }

  const [engineers, recruiters] = await Promise.all([
    searchPeople(companyName, ENGINEERING_TITLES),
    searchPeople(companyName, RECRUITMENT_TITLES),
  ]);

  // Merge, deduplicate by name, engineers first
  const seen = new Set<string>();
  const all: object[] = [];
  for (const p of [...engineers, ...recruiters]) {
    const name = (p as any).name;
    if (name && !seen.has(name)) { seen.add(name); all.push(p); }
  }

  console.log(JSON.stringify(all.slice(0, 6), null, 2));
}

main().catch(err => { console.error(err.message); process.exit(1); });
