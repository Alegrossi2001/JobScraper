import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
import axios from 'axios';
import * as cheerio from 'cheerio';

function proxyUrl(url: string): string {
  const key = process.env.SCRAPER_API_KEY;
  if (!key) return url;
  return `https://api.scraperapi.com/?api_key=${key}&url=${encodeURIComponent(url)}`;
}

// ATS platforms and redirect systems that require manual application
const ATS_DOMAINS = [
  'greenhouse.io', 'lever.co', 'workday.com', 'myworkdayjobs.com',
  'bamboohr.com', 'recruitee.com', 'smartrecruiters.com', 'jobvite.com',
  'taleo.net', 'successfactors.com', 'icims.com', 'ashbyhq.com',
  'erecruiter.pl', 'breezy.hr', 'dover.com', 'rippling.com',
  'personio.com', 'hrlink.pl', 'traffit.com', 'teamtailor.com',
  'workable.com', 'jazz.co', 'pinpoint.co', 'comeet.co',
];

function isAtsDomain(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return ATS_DOMAINS.some(d => host.includes(d));
  } catch { return false; }
}

// Job-board / aggregator domains — their own emails (e.g. bulldogjob.pl's GDPR
// inbox daneosobowe@bulldogjob.pl) must never be mistaken for an apply address.
const BOARD_DOMAINS = ['bulldogjob.pl', 'justjoin.it', 'nofluffjobs.com', 'pracuj.pl', 'theprotocol.it', 'rocketjobs.pl'];
// System / data-protection local-parts that are never an application address.
const JUNK_LOCALPARTS = ['daneosobowe', 'rodo', 'gdpr', 'dpo', 'privacy', 'noreply', 'no-reply', 'abuse', 'postmaster', 'example', 'sentry', 'wixpress'];

function isJunkEmail(e: string): boolean {
  const [local, domain = ''] = e.toLowerCase().split('@');
  if (BOARD_DOMAINS.some(d => domain === d || domain.endsWith('.' + d))) return true;
  return JUNK_LOCALPARTS.some(j => local.includes(j));
}

function findApplyEmail(text: string, $: cheerio.CheerioAPI): string | null {
  // 1. Explicit mailto: links (footer/nav already stripped from $)
  const mailtos: string[] = [];
  $('a[href^="mailto:"]').each((_, el) => {
    const raw = $(el).attr('href')!.replace(/^mailto:/i, '').split('?')[0].trim();
    if (raw.includes('@')) mailtos.push(raw);
  });
  const goodMailto = mailtos.find(e => !isJunkEmail(e));
  if (goodMailto) return goodMailto;

  // 2. Email addresses in the cleaned page text (prefer HR/recruitment local-parts)
  const emailRe = /\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/g;
  const found = (text.match(emailRe) ?? []).filter(e => !isJunkEmail(e));
  const hrKeywords = ['career', 'recruit', 'hr', 'job', 'apply', 'hiring', 'talent', 'praca', 'kariera', 'cv', 'rekrut'];
  const hrEmail = found.find(e => hrKeywords.some(k => e.toLowerCase().split('@')[0].includes(k)));
  if (hrEmail) return hrEmail;

  return found[0] ?? null;
}

function findAtsUrl($: cheerio.CheerioAPI): string | null {
  let atsUrl: string | null = null;
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    if (isAtsDomain(href)) { atsUrl = href; return false; }
  });
  return atsUrl;
}

async function main() {
  const url = process.argv[2];
  if (!url) { console.error('Usage: tsx fetchJobDetails.ts <url>'); process.exit(1); }

  const result: Record<string, any> = { url, description: '', applyType: 'unknown', applyEmail: null, atsUrl: null };

  try {
    const { data: html } = await axios.get<string>(proxyUrl(url), {
      timeout: 60_000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,pl;q=0.8',
      },
    });

    const $ = cheerio.load(html);
    $('nav, header, footer, script, style, noscript, [role="navigation"]').remove();

    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
    result.description = bodyText.slice(0, 6000);

    const applyEmail = findApplyEmail(bodyText, $);
    const atsUrl     = findAtsUrl($);

    if (applyEmail) {
      result.applyType  = 'email';
      result.applyEmail = applyEmail;
    } else if (atsUrl) {
      result.applyType = 'ats';
      result.atsUrl    = atsUrl;
    } else if (isAtsDomain(url)) {
      result.applyType = 'ats';
    }
  } catch (err: any) {
    result.error = err.message;
  }

  console.log(JSON.stringify(result, null, 2));
}

main();
