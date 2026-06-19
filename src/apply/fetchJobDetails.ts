import * as dotenv from 'dotenv';
dotenv.config();
import axios from 'axios';
import * as cheerio from 'cheerio';

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

function findApplyEmail(html: string, $: cheerio.CheerioAPI): string | null {
  // 1. Explicit mailto: links
  let email: string | null = null;
  $('a[href^="mailto:"]').each((_, el) => {
    const raw = $(el).attr('href')!.replace(/^mailto:/i, '').split('?')[0].trim();
    if (raw.includes('@')) { email = raw; return false; }
  });
  if (email) return email;

  // 2. Email addresses visible in text (prefer HR/recruitment emails)
  const emailRe = /\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/g;
  const found = html.match(emailRe) ?? [];
  const hrKeywords = ['career', 'recruit', 'hr', 'job', 'apply', 'hiring', 'work', 'talent', 'praca', 'kariera'];
  const hrEmail = found.find(e => hrKeywords.some(k => e.toLowerCase().includes(k)));
  if (hrEmail) return hrEmail;

  // 3. Any non-image, non-noreply email
  const filtered = found.filter(e => !e.includes('example') && !e.includes('noreply') && !e.includes('no-reply'));
  return filtered[0] ?? null;
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
    const { data: html } = await axios.get<string>(url, {
      timeout: 30_000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,pl;q=0.8',
      },
    });

    const $ = cheerio.load(html);
    $('nav, header, footer, script, style, noscript, [role="navigation"]').remove();

    result.description = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 6000);

    const applyEmail = findApplyEmail(html, $);
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
