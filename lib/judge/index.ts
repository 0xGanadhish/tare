import { createHash } from 'node:crypto';
import type { Pool, PositionJudgment, Verdict } from '../../shared/types';
import { answerChoice } from '../intent';
import { jev, JevUnavailable, type JevOptions, type JevQuestion } from '../jev';
import { combineVerdict } from './combine';
import { renderPoolState, renderPositionState, type PositionInput } from './state';

export const poolQuestions: Record<string, JevQuestion> = {
  yield_source: { type: 'choice', instructions: 'What is the primary source of the headline yield?', criteria: {
    organic: 'Borrower interest, staking, or real revenue.', incentive: 'Token emissions.', mixed: 'Both organic revenue and token emissions.',
  } },
  sustainable: { type: 'noul', instructions: 'The headline APY is likely to persist for the next 30 days.' },
  risk: { type: 'score', instructions: 'Rate the risk of depositing into this pool, from lowest to highest.', criteria: [
    'Lowest risk: blue-chip protocol, large TVL, stable organic yield, single asset, no IL.',
    'Low risk: established protocol, substantial TVL, mostly organic stable yield, single asset.',
    'Moderate risk: smaller protocol or TVL, mixed yield, some volatility or asset risk.',
    'High risk: small TVL, volatile or emission-driven yield, multi-asset IL or exotic asset.',
    'Highest risk: tiny TVL, extreme volatility, fragile emissions, severe IL or exotic asset risk.',
  ] },
};
const positionQuestions: Record<string, JevQuestion> = {
  action: { type: 'choice', instructions: 'What should the holder do given current stats, deposit stats, and the best same-risk alternative?', criteria: {
    hold: 'Keep the position; yield and withdrawal conditions remain acceptable.',
    exit: 'Withdraw to protect capital from worsening withdrawal conditions or material yield deterioration.',
    rotate: 'Consider a better same-risk alternative; rotation requires user confirmation.',
  } },
  withdrawal_risk: { type: 'noul', instructions: 'The holder may soon be unable to withdraw in full.' },
  yield_collapse: { type: 'noul', instructions: 'Yield has deteriorated materially since deposit.' },
};
const judgments = new Map<string, Promise<Verdict>>();

export function statsHash(p: Pool): string {
  return createHash('sha256').update(renderPoolState(p)).digest('hex');
}

export async function judgePool(p: Pool, opts: JevOptions = {}): Promise<Verdict> {
  const hash = statsHash(p);
  const key = `${p.id}:${hash}`;
  const cached = judgments.get(key);
  if (cached) return cached;
  const judgment = (async (): Promise<Verdict> => {
    try {
      const answers = await jev(renderPoolState(p), poolQuestions, opts);
      const risk = answers.risk;
      const sustainable = answers.sustainable;
      if (risk.type !== 'score' || sustainable.type !== 'noul') throw new JevUnavailable('Invalid pool answers');
      // Score probabilities use zero-based legend levels; preserve the expectation, not a rounded category.
      const probabilities = Object.entries(risk.probabilities);
      const mass = probabilities.reduce((sum, [, probability]) => sum + probability, 0);
      const score = 1 + probabilities.reduce((sum, [level, probability]) => sum + Number(level) * probability, 0) / mass;
      const confidence = Math.max(...probabilities.map(([, probability]) => probability));
      return { poolId: p.id, statsHash: hash, judgedAt: new Date().toISOString(), source: 'jev',
        ...combineVerdict({ yieldSource: answerChoice(answers.yield_source), sustainable: sustainable.noul,
          risk: { score, confidence } }) };
    } catch (error) {
      judgments.delete(key);
      return { poolId: p.id, statsHash: hash, judgedAt: new Date().toISOString(), label: 'NOT_JUDGED',
        confidence: 0, risk: null, yieldSource: null, band: 'low', flags: [] };
    }
  })();
  judgments.set(key, judgment);
  return judgment;
}

export async function judgePosition(input: PositionInput): Promise<PositionJudgment> {
  const state = renderPositionState(input);
  const answers = await jev(state, positionQuestions);
  const withdrawal = answers.withdrawal_risk;
  const collapse = answers.yield_collapse;
  if (withdrawal.type !== 'noul' || collapse.type !== 'noul') throw new JevUnavailable('Invalid position answers');
  return { action: answerChoice(answers.action), withdrawalRisk: withdrawal.noul, yieldCollapse: collapse.noul,
    statsHash: createHash('sha256').update(state).digest('hex'), at: new Date().toISOString() };
}
