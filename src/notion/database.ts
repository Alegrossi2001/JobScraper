import { getClient } from './client';
import { Job } from '../types/job';

// ─── Database creation ────────────────────────────────────────────────────────

export async function createJobDatabase(parentPageId: string): Promise<string> {
  const notion = getClient();

  const db = await notion.databases.create({
    parent: { type: 'page_id', page_id: parentPageId },
    icon: { type: 'emoji', emoji: '💼' },
    title: [{ type: 'text', text: { content: 'Job Pipeline' } }],
    properties: {
      // Title is the job name — Notion requires exactly one title property
      'Role': { title: {} },

      'Company':    { rich_text: {} },
      'Location':   { rich_text: {} },
      'Job ID':     { rich_text: {} },

      'Salary Min': { number: { format: 'number' } },
      'Salary Max': { number: { format: 'number' } },

      'Currency': {
        select: { options: [
          { name: 'PLN', color: 'blue' },
          { name: 'EUR', color: 'yellow' },
          { name: 'USD', color: 'green' },
        ]},
      },

      'Source': {
        select: { options: [
          { name: 'JustJoin',    color: 'blue' },
          { name: 'NoFluffJobs', color: 'green' },
          { name: 'Bulldogjob',  color: 'orange' },
        ]},
      },

      'Experience': {
        select: { options: [
          { name: 'Junior', color: 'yellow' },
          { name: 'Mid',    color: 'blue' },
          { name: 'Senior', color: 'purple' },
          { name: 'Lead',   color: 'red' },
          { name: 'Expert', color: 'pink' },
        ]},
      },

      'Status': {
        select: { options: [
          { name: 'New',       color: 'blue' },
          { name: 'Reviewing', color: 'yellow' },
          { name: 'Applied',   color: 'green' },
          { name: 'Rejected',  color: 'red' },
          { name: 'Offer',     color: 'purple' },
        ]},
      },

      'Tech Stack':    { multi_select: { options: [] } },
      'Remote':        { checkbox: {} },
      'URL':           { url: {} },
      'Date Scraped':  { date: {} },

      // Free-form notes for the enrichment agent
      'AI Notes':      { rich_text: {} },
    },
  });

  return db.id;
}

// ─── Deduplication — query existing Job IDs from Notion ──────────────────────
// Cloud runs start with no local seen_jobs.json, so we query Notion directly.

export async function fetchExistingJobIds(databaseId: string): Promise<Set<string>> {
  const notion = getClient();
  const ids = new Set<string>();
  let cursor: string | undefined;

  do {
    const res = await notion.databases.query({
      database_id: databaseId,
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });

    for (const page of res.results) {
      if (!('properties' in page)) continue;
      const prop = page.properties['Job ID'];
      if (prop?.type === 'rich_text' && Array.isArray(prop.rich_text) && prop.rich_text.length > 0) {
        const first = prop.rich_text[0] as { plain_text?: string };
        if (first?.plain_text) ids.add(first.plain_text);
      }
    }

    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return ids;
}

// ─── Row insertion ────────────────────────────────────────────────────────────

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
}

export async function insertJob(databaseId: string, job: Job): Promise<void> {
  const notion = getClient();

  // Truncate tech stack entries — Notion multi_select option names max 100 chars
  const techStack = job.techStack
    .filter(Boolean)
    .map(t => t.trim().slice(0, 100))
    .slice(0, 20);  // max 20 tags per row to stay clean

  await notion.pages.create({
    parent: { database_id: databaseId },
    properties: {
      'Role':    { title:     [{ text: { content: job.title } }] },
      'Company': { rich_text: [{ text: { content: job.company } }] },
      'Location':{ rich_text: [{ text: { content: job.location } }] },
      'Job ID':  { rich_text: [{ text: { content: job.id } }] },

      ...(job.salaryMin !== undefined && { 'Salary Min': { number: job.salaryMin } }),
      ...(job.salaryMax !== undefined && { 'Salary Max': { number: job.salaryMax } }),
      ...(job.currency  && { 'Currency':   { select: { name: job.currency } } }),

      'Source': { select: { name: job.source } },

      ...(job.experience && {
        'Experience': { select: { name: cap(job.experience) } },
      }),

      'Status': { select: { name: 'New' } },

      ...(techStack.length > 0 && {
        'Tech Stack': { multi_select: techStack.map(t => ({ name: t })) },
      }),

      'Remote': { checkbox: job.remote },

      ...(job.url && { 'URL': { url: job.url } }),

      'Date Scraped': { date: { start: job.dateScraped } },
    },
  });
}
