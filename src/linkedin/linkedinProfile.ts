import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
import axios from 'axios';
import * as cheerio from 'cheerio';

function extractPublicId(linkedinUrl: string): string {
  return linkedinUrl.replace(/\/$/, '').split('/').pop() ?? '';
}

async function fetchVoyager(publicId: string): Promise<object | null> {
  const liAt = process.env.LINKEDIN_LI_AT;
  if (!liAt) return null;

  try {
    const { data } = await axios.get(
      `https://www.linkedin.com/voyager/api/identity/profiles/${publicId}`,
      {
        timeout: 20_000,
        headers: {
          'Cookie':                      `li_at=${liAt}`,
          'csrf-token':                  'ajax:0000000000000000',
          'X-Restli-Protocol-Version':   '2.0.0',
          'X-Li-Lang':                   'en_US',
          'Accept':                      'application/vnd.linkedin.normalized+json+2.1',
          'User-Agent':                  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
      }
    );

    // Voyager returns normalized JSON — extract the profile object
    const included: any[] = data.included ?? [];
    const profile = included.find((i: any) => i.$type?.includes('Profile') && i.publicIdentifier === publicId)
                 ?? included.find((i: any) => i.$type?.includes('Profile'));

    if (!profile) return null;

    return {
      headline:    profile.headline ?? '',
      summary:     profile.summary ?? '',
      location:    profile.locationName ?? '',
      currentRole: profile.headline ?? '',
    };
  } catch { return null; }
}

async function fetchPublicPage(linkedinUrl: string): Promise<object | null> {
  const liAt   = process.env.LINKEDIN_LI_AT;
  const apiKey = process.env.SCRAPER_API_KEY;
  if (!apiKey) return null;

  try {
    const proxyUrl = `https://api.scraperapi.com/?api_key=${apiKey}&url=${encodeURIComponent(linkedinUrl)}`;
    const { data: html } = await axios.get<string>(proxyUrl, {
      timeout: 60_000,
      headers: liAt ? { Cookie: `li_at=${liAt}` } : {},
    });

    const $ = cheerio.load(html);
    const headline = $('h2.top-card-layout__headline, .top-card__headline').first().text().trim();
    const summary  = $('.core-section-container__content p').first().text().trim();
    const location = $('[data-section="currentPositionInsight"] span, .top-card__subline-item').first().text().trim();

    return { headline, summary, location, currentRole: headline };
  } catch { return null; }
}

async function main() {
  const url = process.argv[2];
  if (!url) { console.error('Usage: tsx linkedinProfile.ts <linkedin_url>'); process.exit(1); }

  const publicId = extractPublicId(url);
  const result   = (await fetchVoyager(publicId)) ?? (await fetchPublicPage(url)) ?? {};

  console.log(JSON.stringify({ url, publicId, ...result }, null, 2));
}

main();
