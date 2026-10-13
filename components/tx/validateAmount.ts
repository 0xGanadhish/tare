import { formatUnits, parseUnits } from 'viem';

export type AmountResult = { ok: true; value: bigint } | { ok: false; error: string; code?: 'over_soft_cap' };

/** Per-wallet UI cap (mainnet only, spec §8.2). Amounts are USDC, so token units are dollars. */
export interface SoftCap { softCapUsd: number | null; alreadyDepositedUsd: number }

/** Parse a user-typed token amount against a balance. Never returns NaN or throws. */
export function validateAmount(input: string, balance: bigint, decimals: number, cap?: SoftCap): AmountResult {
  const text = input.trim().replace(/,/g, '');
  if (text === '') return { ok: false, error: 'Enter an amount' };
  if (!/^\d*\.?\d*$/.test(text) || text === '.') return { ok: false, error: 'Enter a valid amount' };
  const [, frac = ''] = text.split('.');
  if (frac.length > decimals) return { ok: false, error: 'Too many decimals' };
  const value = parseUnits(text.startsWith('.') ? `0${text}` : text, decimals);
  if (value === 0n) return { ok: false, error: 'Enter an amount' };
  if (cap?.softCapUsd != null && cap.alreadyDepositedUsd + Number(formatUnits(value, decimals)) > cap.softCapUsd) {
    const left = Math.max(0, cap.softCapUsd - cap.alreadyDepositedUsd);
    return {
      ok: false,
      code: 'over_soft_cap',
      error: `Over the $${cap.softCapUsd.toLocaleString('en-US')} per-wallet limit on mainnet ($${left.toLocaleString('en-US', { maximumFractionDigits: 2 })} left)`,
    };
  }
  if (value > balance) return { ok: false, error: 'Insufficient balance' };
  return { ok: true, value };
}
