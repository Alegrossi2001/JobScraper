/**
 * Archives all pages in the Notion Job Pipeline database.
 * Run this to clear bad/test data: npm run cleanup
 */
import 'dotenv/config';
import { getClient } from './notion/client';
import { logger } from './logger';
import * as fs from 'fs';
import * as path from 'path';

async function cleanup() {
  const dbId = process.env.NOTION_DATABASE_ID?.replace(/-/g, '');
  if (!dbId) { logger.error('NOTION_DATABASE_ID not set'); process.exit(1); }

  const notion  = getClient();
  let archived  = 0;
  let cursor: string | undefined;

  logger.section('Archiving all pages in the Notion Job Pipeline database');

  do {
    const res = await notion.databases.query({
      database_id: dbId,
      page_size:   100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });

    await Promise.all(
      res.results.map(page =>
        notion.pages.update({ page_id: page.id, archived: true }).then(() => { archived++; })
      )
    );

    if (archived > 0) logger.ok(`Archived ${archived} so far…`);
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);

  // Also clear local dedup file so next run starts clean
  const seenFile = path.join(process.cwd(), 'data', 'seen_jobs.json');
  if (fs.existsSync(seenFile)) {
    fs.writeFileSync(seenFile, '[]');
    logger.ok('Cleared data/seen_jobs.json');
  }

  logger.section(`Done — archived ${archived} Notion pages. Run \`npm start\` to re-scrape.`);
}

cleanup().catch(err => { logger.error(err.message); process.exit(1); });
