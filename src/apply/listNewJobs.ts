import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
import { Client } from '@notionhq/client';

export interface NewJob {
  pageId: string;
  role: string;
  company: string;
  url: string;
  source: string;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string;
  techStack: string[];
}

export async function listNewJobs(): Promise<NewJob[]> {
  const notion = new Client({ auth: process.env.NOTION_TOKEN });
  const dbId = process.env.NOTION_DATABASE_ID!;

  const jobs: NewJob[] = [];
  let cursor: string | undefined;

  do {
    const res = await notion.databases.query({
      database_id: dbId,
      filter: { property: 'Status', select: { equals: 'New' } },
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });

    for (const page of res.results) {
      if (!('properties' in page)) continue;
      const p = page.properties as Record<string, any>;

      const role    = p['Role']?.title?.[0]?.plain_text ?? '';
      const company = p['Company']?.rich_text?.[0]?.plain_text ?? '';
      const url     = p['URL']?.url ?? '';
      const source  = p['Source']?.select?.name ?? '';
      const salMin  = p['Salary Min']?.number ?? null;
      const salMax  = p['Salary Max']?.number ?? null;
      const cur     = p['Currency']?.select?.name ?? 'PLN';
      const tech    = (p['Tech Stack']?.multi_select ?? []).map((t: any) => t.name);

      if (!url) continue;

      jobs.push({ pageId: page.id, role, company, url, source, salaryMin: salMin, salaryMax: salMax, currency: cur, techStack: tech });
    }

    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return jobs;
}

async function main() {
  console.log(JSON.stringify(await listNewJobs(), null, 2));
}

if (require.main === module) {
  main().catch(err => { console.error(err.message); process.exit(1); });
}
