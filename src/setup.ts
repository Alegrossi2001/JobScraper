/**
 * One-time setup: creates the Notion Job Pipeline database under a parent page.
 * Run: npm run setup
 */
import 'dotenv/config';
import * as fs   from 'fs';
import * as path from 'path';
import { createJobDatabase } from './notion/database';
import { logger } from './logger';

async function setup() {
  const parentPageId = process.env.NOTION_PARENT_PAGE_ID?.replace(/-/g, '');
  if (!parentPageId) {
    logger.error('NOTION_PARENT_PAGE_ID is not set.');
    console.log(`
  Steps to get it:
  1. Create a page in Notion where the jobs database will live
  2. Click "..." → "Copy link" on that page
  3. Extract the 32-char ID from the URL:
       https://www.notion.so/My-Page-<PAGE_ID>?...
  4. Set NOTION_PARENT_PAGE_ID=<PAGE_ID> in your .env file
  5. Make sure the page is shared with your integration ("..." → Add connections)
`);
    process.exit(1);
  }

  logger.section('Creating Notion "Job Pipeline" database');
  const dbId = await createJobDatabase(parentPageId);
  logger.ok(`Database created! ID: ${dbId}`);

  // Auto-patch .env so the user doesn't have to copy-paste
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    let env = fs.readFileSync(envPath, 'utf-8');
    if (env.includes('NOTION_DATABASE_ID=')) {
      env = env.replace(/NOTION_DATABASE_ID=.*/, `NOTION_DATABASE_ID=${dbId}`);
    } else {
      env += `\nNOTION_DATABASE_ID=${dbId}\n`;
    }
    fs.writeFileSync(envPath, env);
    logger.ok('Patched NOTION_DATABASE_ID in .env automatically.');
  } else {
    logger.warn('.env not found — add this line manually:');
    console.log(`  NOTION_DATABASE_ID=${dbId}`);
  }

  logger.section('Setup complete — run `npm start` to begin scraping');
}

setup().catch(err => {
  logger.error(err.message);
  process.exit(1);
});
