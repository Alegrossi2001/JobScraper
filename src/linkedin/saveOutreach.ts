import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
import { Client } from '@notionhq/client';

async function main() {
  // Accept JSON from stdin for reliability with long message strings
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const input = JSON.parse(Buffer.concat(chunks).toString('utf-8'));

  const { name, company, title, linkedinUrl, connectionMsg, followupMsg, jobRole, jobUrl } = input;

  const notion = new Client({ auth: process.env.NOTION_TOKEN });
  const dbId   = process.env.LINKEDIN_OUTREACH_DB_ID!;

  await notion.pages.create({
    parent: { database_id: dbId },
    properties: {
      'Name':               { title:     [{ text: { content: name } }] },
      'Company':            { rich_text: [{ text: { content: company ?? '' } }] },
      'Their Title':        { rich_text: [{ text: { content: title ?? '' } }] },
      ...(linkedinUrl ? { 'LinkedIn URL': { url: linkedinUrl } } : {}),
      'Connection Message': { rich_text: [{ text: { content: (connectionMsg ?? '').slice(0, 2000) } }] },
      'Follow-up Message':  { rich_text: [{ text: { content: (followupMsg ?? '').slice(0, 2000) } }] },
      'Job Role':           { rich_text: [{ text: { content: jobRole ?? '' } }] },
      ...(jobUrl ? { 'Job URL': { url: jobUrl } } : {}),
      'Status':             { select: { name: 'Pending' } },
      'Date Added':         { date: { start: new Date().toISOString() } },
    },
  });

  console.log(`✓ Saved outreach for ${name} @ ${company}`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
