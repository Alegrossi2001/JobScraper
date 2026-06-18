import 'dotenv/config';
import { scrapeJustJoin }    from './scrapers/justjoin';
import { scrapeNoFluffJobs } from './scrapers/nofluffjobs';
import { scrapeBulldogjob }  from './scrapers/bulldogjob';
import { insertJob, fetchExistingJobIds } from './notion/database';
import { loadSeenJobs, saveSeenJobs, isNew, markSeen } from './dedup';
import { logger }            from './logger';
import { sleep }             from './http';
import { Job, ScraperResult } from './types/job';

const SCRAPERS: Array<{ name: string; fn: () => Promise<Job[]> }> = [
  { name: 'JustJoin',    fn: scrapeJustJoin },
  { name: 'NoFluffJobs', fn: scrapeNoFluffJobs },
  { name: 'Bulldogjob',  fn: scrapeBulldogjob },
];

async function runScraper(name: string, fn: () => Promise<Job[]>): Promise<ScraperResult> {
  const source = name as ScraperResult['source'];
  const start  = Date.now();
  try {
    const jobs = await fn();
    return { source, jobs, durationMs: Date.now() - start };
  } catch (err) {
    return { source, jobs: [], durationMs: Date.now() - start, error: (err as Error).message };
  }
}

async function main() {
  const dbId = process.env.NOTION_DATABASE_ID?.replace(/-/g, '');
  if (!dbId) {
    logger.error('NOTION_DATABASE_ID not set. Run `npm run setup` first.');
    process.exit(1);
  }

  logger.section(`Job Scraper — ${new Date().toLocaleString('pl-PL')}`);

  // Primary dedup: query Notion directly (works in cloud where seen_jobs.json is ephemeral)
  // Secondary: local file (for local runs — avoids redundant Notion queries)
  logger.info('Loading existing job IDs from Notion…');
  const notionIds = await fetchExistingJobIds(dbId);
  const localSeen = loadSeenJobs();
  const seen      = new Set([...notionIds, ...localSeen]);
  logger.info(`Dedup: ${notionIds.size} in Notion, ${localSeen.size} local → ${seen.size} total known`);

  let totalNew    = 0;
  let totalErrors = 0;

  for (const { name, fn } of SCRAPERS) {
    logger.info(`Scraping ${name}…`);
    const result = await runScraper(name, fn);

    if (result.error) {
      logger.error(`${name} failed: ${result.error}`);
      totalErrors++;
      await sleep(2_000);
      continue;
    }

    const newJobs = result.jobs.filter(j => isNew(j.id, seen));
    logger.ok(`${name}: ${result.jobs.length} found, ${newJobs.length} new (${result.durationMs}ms)`);

    for (const job of newJobs) {
      try {
        await insertJob(dbId, job);
        markSeen(job.id, seen);
        totalNew++;
        const salary = job.salaryMin
          ? ` · ${job.salaryMin}–${job.salaryMax} ${job.currency}`
          : '';
        logger.ok(`  + ${job.title} @ ${job.company}${salary}`);
        await sleep(350); // stay within Notion 3 req/s limit
      } catch (err) {
        logger.error(`  Failed to insert ${job.id}: ${(err as Error).message}`);
        totalErrors++;
      }
    }

    await sleep(2_000);
  }

  saveSeenJobs(seen);

  logger.section(
    `Done — ${totalNew} new job${totalNew !== 1 ? 's' : ''} added to Notion` +
    (totalErrors ? ` · ${totalErrors} error(s)` : '')
  );
}

main().catch(err => {
  logger.error(`Fatal: ${err.message}`);
  process.exit(1);
});
