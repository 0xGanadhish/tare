import { BaseError } from 'viem';

const MAX_LEN = 200;

/**
 * Error text that is safe to store, log or return. viem puts the RPC URL (and an Alchemy key in its path)
 * into error messages, so only the short message is kept and any URL is replaced.
 */
export function safeError(err: unknown): string {
  const text = err instanceof BaseError ? err.shortMessage : err instanceof Error ? err.message : String(err);
  const line = text.split('\n')[0].replace(/https?:\/\/[^\s"'<>)]+/g, '[url]');
  return line.length > MAX_LEN ? `${line.slice(0, MAX_LEN - 1)}…` : line;
}
