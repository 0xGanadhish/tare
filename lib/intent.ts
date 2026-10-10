import type { Choice, Intent } from '../shared/types';
import { jev, JevUnavailable, type JevAnswer, type JevQuestion } from './jev';

const tickers = 'USDT0|SYRUPUSDC|EARNAUSD|USDC|AUSD|USDT|USDE|GHO|XAUT0|XAUT|SHMON|WMON|SMON|GMON|MON|CBBTC|WBTC|BTC|WETH|ETH';
const number = '(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?[kKmM]?';

export function parseAmount(text: string): { amount: number | null; asset: string | null } {
  const after = new RegExp(`(${number})\\s*(${tickers})\\b`, 'i').exec(text);
  const before = new RegExp(`\\b(${tickers})\\s+\\$?(${number})(?![\\d.])`, 'i').exec(text);
  const dollar = new RegExp(`\\$\\s*(${number})`, 'i').exec(text);
  const standalone = new RegExp(`(?:^|\\s)(${number})(?![\\d.,])\\b(?!\\s*(?:days?|weeks?|months?|years?|hours?|%))`, 'i').exec(text);
  const amountText = after?.[1] ?? before?.[2] ?? dollar?.[1] ?? standalone?.[1];
  const asset = after?.[2] ?? before?.[1] ?? new RegExp(`\\b(${tickers})\\b`, 'i').exec(text)?.[1] ?? null;
  if (!amountText) return { amount: null, asset: asset?.toUpperCase() ?? null };
  const suffix = amountText.slice(-1).toLowerCase();
  const amount = Number(amountText.replace(/,/g, '').replace(/[km]$/i, '')) * (suffix === 'k' ? 1_000 : suffix === 'm' ? 1_000_000 : 1);
  return { amount: Number.isFinite(amount) ? amount : null, asset: asset?.toUpperCase() ?? null };
}

export function answerChoice<T extends string>(answer: JevAnswer): Choice<T> {
  // jev validates each answer against its question before returning it.
  if (answer.type !== 'choice') throw new Error('Expected choice answer');
  return { value: answer.choice as T, confidence: answer.confidence };
}

const questions: Record<string, JevQuestion> = {
  risk_appetite: { type: 'choice', instructions: 'What is the user\'s risk appetite?', criteria: {
    low: 'Prioritizes capital preservation and safe yield.', medium: 'Accepts moderate risk for more yield.', high: 'Accepts high risk for maximum yield.',
  } },
  horizon: { type: 'choice', instructions: 'What is the user\'s investment horizon?', criteria: {
    short: 'Less than one month.', medium: 'One to six months.', long: 'More than six months.',
  } },
  asset_pref: { type: 'choice', instructions: 'Which asset class does the user prefer?', criteria: {
    stable: 'Stablecoins.', gold: 'Gold-backed tokens.', rwa: 'Real-world assets or principal tokens.',
    mon: 'MON or MON staking.', btc_eth: 'Bitcoin or Ether.', any: 'No asset-class preference.',
  } },
};

export async function parseIntent(text: string): Promise<Intent> {
  try {
    if (process.env.OFFLINE === '1') throw new JevUnavailable('Offline mode');
    const answers = await jev(text, questions);
    return { text, ...parseAmount(text), risk: answerChoice(answers.risk_appetite),
      horizon: answerChoice(answers.horizon), assetPref: answerChoice(answers.asset_pref) };
  } catch (error) {
    if (!(error instanceof JevUnavailable)) throw error;
    return { text, ...parseAmount(text), risk: { value: 'low', confidence: 0 },
      horizon: { value: 'medium', confidence: 0 }, assetPref: { value: 'any', confidence: 0 } };
  }
}
