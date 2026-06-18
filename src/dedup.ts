import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR  = path.join(process.cwd(), 'data');
const SEEN_FILE = path.join(DATA_DIR, 'seen_jobs.json');

export function loadSeenJobs(): Set<string> {
  try {
    if (!fs.existsSync(SEEN_FILE)) return new Set();
    const raw = fs.readFileSync(SEEN_FILE, 'utf-8');
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

export function saveSeenJobs(seen: Set<string>): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SEEN_FILE, JSON.stringify([...seen], null, 2));
}

export function isNew(id: string, seen: Set<string>): boolean {
  return !seen.has(id);
}

export function markSeen(id: string, seen: Set<string>): void {
  seen.add(id);
}
