export type JevQuestion =
  | { type: 'choice'; instructions: string; criteria: Record<string, string> }
  | { type: 'score'; instructions: string; criteria: string[] }
  | { type: 'noul'; instructions: string };
export type JevAnswer =
  | { type: 'choice'; choice: string; confidence: number; probabilities: Record<string, number> }
  | { type: 'score'; score: number; confidence: number; legend: Record<string, string>; probabilities: Record<string, number> }
  | { type: 'noul'; noul: number };
export const JEV_MODEL = 'jev-latest';

export interface JevOptions { timeoutMs?: number; fetchImpl?: typeof fetch }

export class JevUnavailable extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'JevUnavailable';
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function probability(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}
function distribution(value: unknown, keys: string[]): boolean {
  return object(value) && keys.every((key) => probability(value[key]))
    && Object.keys(value).length === keys.length
    && Math.abs(Object.values(value).reduce<number>((sum, n) => sum + (n as number), 0) - 1) < 0.01;
}
function validAnswer(answer: unknown, question: JevQuestion): answer is JevAnswer {
  if (!object(answer) || answer.type !== question.type) return false;
  if (question.type === 'noul') return probability(answer.noul);
  if (!probability(answer.confidence)) return false;
  if (question.type === 'choice') {
    return typeof answer.choice === 'string' && Object.hasOwn(question.criteria, answer.choice)
      && distribution(answer.probabilities, Object.keys(question.criteria));
  }
  const keys = question.criteria.map((_, index) => String(index));
  const legend = answer.legend;
  return typeof answer.score === 'number' && Number.isFinite(answer.score)
    && answer.score >= 0 && answer.score <= question.criteria.length - 1
    && object(legend) && keys.every((key) => typeof legend[key] === 'string')
    && distribution(answer.probabilities, keys);
}

export async function jev(state: string, questions: Record<string, JevQuestion>, opts: JevOptions = {}): Promise<Record<string, JevAnswer>> {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) throw new JevUnavailable('TYPESAFE_API_KEY is missing');
  const controller = new AbortController();
  const deadline = Promise.withResolvers<never>();
  const timer = setTimeout(() => {
    controller.abort();
    deadline.reject(new JevUnavailable('Jev request timed out'));
  }, opts.timeoutMs ?? 8_000);
  try {
    const request = async () => {
      const response = await (opts.fetchImpl ?? fetch)('https://api.typesafe.ai/v1/systemone', {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: JEV_MODEL, state, questions }), signal: controller.signal,
      });
      if (!response.ok) throw new JevUnavailable(`Jev HTTP ${response.status}`);
      const body: unknown = await response.json();
      if (!object(body) || !object(body.answers)) throw new JevUnavailable('Malformed Jev response');
      const answers = body.answers;
      for (const [id, question] of Object.entries(questions)) {
        if (!validAnswer(answers[id], question)) throw new JevUnavailable(`Malformed Jev answer: ${id}`);
      }
      return answers as Record<string, JevAnswer>;
    };
    return await Promise.race([request(), deadline.promise]);
  } catch (error) {
    if (error instanceof JevUnavailable) throw error;
    throw new JevUnavailable('Jev request failed', { cause: error });
  } finally {
    clearTimeout(timer);
  }
}
