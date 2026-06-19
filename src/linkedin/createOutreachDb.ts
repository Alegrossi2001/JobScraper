import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
import { Client } from '@notionhq/client';

async function main() {
  const notion = new Client({ auth: process.env.NOTION_TOKEN });
  const parentPageId = process.env.NOTION_PARENT_PAGE_ID!;

  const db = await notion.databases.create({
    parent: { type: 'page_id', page_id: parentPageId },
    icon: { type: 'emoji', emoji: '🤝' },
    title: [{ type: 'text', text: { content: 'LinkedIn Outreach' } }],
    properties: {
      'Name':               { title: {} },
      'Company':            { rich_text: {} },
      'Their Title':        { rich_text: {} },
      'LinkedIn URL':       { url: {} },
      'Connection Message': { rich_text: {} },
      'Follow-up Message':  { rich_text: {} },
      'Job Role':           { rich_text: {} },
      'Job URL':            { url: {} },
      'Status': {
        select: { options: [
          { name: 'Pending',      color: 'blue' },
          { name: 'Sent',         color: 'yellow' },
          { name: 'Connected',    color: 'green' },
          { name: 'Replied',      color: 'purple' },
          { name: 'Not Relevant', color: 'gray' },
        ]},
      },
      'Date Added': { date: {} },
    },
  });

  console.log(`✓ LinkedIn Outreach DB created: ${db.id}`);
  console.log(`Add to .env: LINKEDIN_OUTREACH_DB_ID=${db.id}`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
