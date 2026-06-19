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
    const { data } = await axios.post(
      'https://api.apollo.io/v1/mixed_people/search',
      {
        api_key:          process.env.APOLLO_API_KEY,
        organization_names: [companyName],
        person_titles:    titles,
        person_locations: ['Poland'],
        per_page:         5,
        page:             1,
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 30_000 }
    );

    return (data.people ?? []).map((p: any) => ({
      name:         p.name ?? '',
      title:        p.title ?? '',
      linkedin_url: p.linkedin_url ?? null,
      email:        p.email ?? null,
      location:     p.city ? `${p.city}, ${p.country}` : (p.country ?? ''),
    }));
  } catch {
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
