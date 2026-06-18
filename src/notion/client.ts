import { Client } from '@notionhq/client';

let _client: Client | null = null;

export function getClient(): Client {
  if (_client) return _client;
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error('NOTION_TOKEN is not set in environment. Copy .env.example → .env and fill it in.');
  _client = new Client({ auth: token });
  return _client;
}
