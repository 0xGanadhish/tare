import { parseUnits } from 'viem';

export type AmountResult = { ok: true; value: bigint } | { ok: false; error: string };

/** Parse a user-typed token amount against a balance. Never returns NaN or throws. */
export function validateAmount(input: string, balance: bigint, decimals: number): AmountResult {
  const text = input.trim().replace(/,/g, '');
  if (text === '') return { ok: false, error: 'Enter an amount' };
  if (!/^\d*\.?\d*$/.test(text) || text === '.') return { ok: false, error: 'Enter a valid amount' };
  const [, frac = ''] = text.split('.');
  if (frac.length > decimals) return { ok: false, error: 'Too many decimals' };
  const value = parseUnits(text.startsWith('.') ? `0${text}` : text, decimals);
  if (value === 0n) return { ok: false, error: 'Enter an amount' };
  if (value > balance) return { ok: false, error: 'Insufficient balance' };
  return { ok: true, value };
}
