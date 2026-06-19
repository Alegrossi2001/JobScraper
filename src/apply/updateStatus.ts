import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
import { Client } from '@notionhq/client';

async function main() {
  const [,, pageId, status, ...noteParts] = process.argv;
  if (!pageId || !status) {
    console.error('Usage: tsx updateStatus.ts <pageId> <status> [notes]');
    process.exit(1);
  }
  const notes = noteParts.join(' ').trim();

  const notion = new Client({ auth: process.env.NOTION_TOKEN });

  const properties: Record<string, any> = {
    'Status': { select: { name: status } },
  };
  if (notes) {
    properties['AI Notes'] = { rich_text: [{ text: { content: notes.slice(0, 2000) } }] };
  }

  await notion.pages.update({ page_id: pageId, properties });
  console.log(`✓ ${pageId} → ${status}`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
