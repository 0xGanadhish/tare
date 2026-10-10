import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { Pool, Verdict, WatchEvent } from './types';

const root = () => process.cwd();
const cacheDir = () => process.env.CACHE_DIR ?? join(root(), 'cache');
const fixturesDir = () => process.env.FIXTURES_DIR ?? join(root(), 'fixtures');

async function readJson<T>(name: string): Promise<T> {
  if (process.env.DATA_SOURCE !== 'fixtures') {
    try {
      return JSON.parse(await fs.readFile(join(cacheDir(), `${name}.json`), 'utf8')) as T;
    } catch {
      // fall through to fixtures
    }
  }
  return JSON.parse(await fs.readFile(join(fixturesDir(), `${name}.json`), 'utf8')) as T;
}

export async function readPools(): Promise<{ pools: Pool[]; asOf: string }> {
  return readJson('pools');
}

export async function readVerdicts(): Promise<Record<string, Verdict>> {
  return readJson('verdicts');
}

export async function writeCache(name: 'pools' | 'verdicts', data: unknown): Promise<void> {
  await fs.mkdir(cacheDir(), { recursive: true });
  const file = join(cacheDir(), `${name}.json`);
  await fs.writeFile(`${file}.tmp`, JSON.stringify(data));
  await fs.rename(`${file}.tmp`, file);
}

const eventsFile = () => join(cacheDir(), 'events.jsonl');

export async function appendEvent(e: WatchEvent): Promise<void> {
  await fs.mkdir(cacheDir(), { recursive: true });
  await fs.appendFile(eventsFile(), JSON.stringify(e) + '\n');
}

export async function readEvents(afterId?: string): Promise<WatchEvent[]> {
  let text = '';
  try {
    text = await fs.readFile(eventsFile(), 'utf8');
  } catch {
    return [];
  }
  const events = text.split('\n').filter(Boolean).map((l) => JSON.parse(l) as WatchEvent);
  if (!afterId) return events;
  const i = events.findIndex((e) => e.id === afterId);
  return i === -1 ? events : events.slice(i + 1);
}
