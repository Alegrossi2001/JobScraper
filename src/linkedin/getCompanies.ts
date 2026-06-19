import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
import { Client } from '@notionhq/client';

async function main() {
  const notion = new Client({ auth: process.env.NOTION_TOKEN });
  const dbId = process.env.NOTION_DATABASE_ID!;
  const outreachDbId = process.env.LINKEDIN_OUTREACH_DB_ID;

  // Find companies already in the outreach DB so we don't duplicate
  const alreadyContacted = new Set<string>();
  if (outreachDbId) {
    let cursor: string | undefined;
    do {
      const res = await notion.databases.query({ database_id: outreachDbId, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
      for (const page of res.results) {
        if (!('properties' in page)) continue;
        const p = page.properties as Record<string, any>;
        const company = p['Company']?.rich_text?.[0]?.plain_text ?? '';
        if (company) alreadyContacted.add(company.toLowerCase().trim());
      }
      cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
    } while (cursor);
  }

  // Get jobs with New or Manual Apply status
  const companyMap = new Map<string, { roles: string[]; urls: string[]; pageIds: string[] }>();
  let cursor: string | undefined;

  do {
    const res = await notion.databases.query({
      database_id: dbId,
      filter: { or: [
        { property: 'Status', select: { equals: 'New' } },
        { property: 'Status', select: { equals: 'Manual Apply' } },
      ]},
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });

    for (const page of res.results) {
      if (!('properties' in page)) continue;
      const p = page.properties as Record<string, any>;
      const company = p['Company']?.rich_text?.[0]?.plain_text ?? '';
      const role    = p['Role']?.title?.[0]?.plain_text ?? '';
      const url     = p['URL']?.url ?? '';
      if (!company) continue;

      // Skip companies already in outreach DB
      if (alreadyContacted.has(company.toLowerCase().trim())) continue;

      if (!companyMap.has(company)) companyMap.set(company, { roles: [], urls: [], pageIds: [] });
      const entry = companyMap.get(company)!;
      if (role) entry.roles.push(role);
      if (url)  entry.urls.push(url);
      entry.pageIds.push(page.id);
    }

    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);

  // Sort by number of open roles (most interested targets first)
  const result = Array.from(companyMap.entries())
    .sort((a, b) => b[1].roles.length - a[1].roles.length)
    .map(([company, data]) => ({ company, roles: data.roles, urls: data.urls }));

  console.log(JSON.stringify(result, null, 2));
}

main().catch(err => { console.error(err.message); process.exit(1); });
