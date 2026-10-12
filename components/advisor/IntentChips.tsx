'use client';

import type { AssetClass, Choice, Intent } from '@/shared/types';

const LOW = 0.6;

const RISK: { value: Intent['risk']['value']; label: string }[] = [
  { value: 'low', label: 'Safe' },
  { value: 'medium', label: 'Balanced' },
  { value: 'high', label: 'Aggressive' },
];
const HORIZON: { value: Intent['horizon']['value']; label: string }[] = [
  { value: 'short', label: '< 1 month' },
  { value: 'medium', label: '~3 months' },
  { value: 'long', label: '6+ months' },
];
const ASSET: { value: Intent['assetPref']['value']; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'stable', label: 'Stablecoin' },
  { value: 'gold', label: 'Gold' },
  { value: 'rwa', label: 'RWA' },
  { value: 'mon', label: 'MON' },
  { value: 'btc_eth', label: 'BTC/ETH' },
];

export function IntentChips({ intent, onChange }: { intent: Intent; onChange: (i: Intent) => void }) {
  return (
    <div className="flex flex-wrap gap-2" aria-label="Interpreted intent">
      {intent.amount != null && (
        <span className="mono rounded-full border border-hairline bg-white px-3 py-1.5 text-[12px]">
          ${intent.amount.toLocaleString('en-US')}
          {intent.asset ? ` ${intent.asset}` : ''}
        </span>
      )}
      <Chip<Intent['risk']['value']> name="Risk" choice={intent.risk} options={RISK} onPick={(v) => onChange({ ...intent, risk: { value: v, confidence: 1 } })} />
      <Chip<Intent['horizon']['value']> name="Horizon" choice={intent.horizon} options={HORIZON} onPick={(v) => onChange({ ...intent, horizon: { value: v, confidence: 1 } })} />
      <Chip<Intent['assetPref']['value']> name="Asset" choice={intent.assetPref} options={ASSET} onPick={(v: AssetClass | 'any') => onChange({ ...intent, assetPref: { value: v, confidence: 1 } })} />
    </div>
  );
}

function Chip<T extends string>({
  name,
  choice,
  options,
  onPick,
}: {
  name: string;
  choice: Choice<T>;
  options: { value: T; label: string }[];
  onPick: (v: T) => void;
}) {
  const unsure = choice.confidence < LOW;
  const current = options.find((o) => o.value === choice.value);
  return (
    <label className={`inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1.5 text-[12px] ${unsure ? 'border-avoid/50' : 'border-hairline'}`}>
      <span className="mono text-[10.5px] uppercase tracking-[0.06em] text-muted">{name}</span>
      {unsure && (
        <span title="Not clear from your words. Pick one." className="mono font-semibold text-avoid">
          ?
        </span>
      )}
      <select
        value={unsure ? '' : choice.value}
        onChange={(e) => onPick(e.target.value as T)}
        aria-label={`${name}${unsure ? ' (pick one)' : ''}`}
        className="bg-transparent text-[12px] outline-none"
      >
        {unsure && (
          <option value="" disabled>
            Pick…
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {current === undefined && !unsure && null}
    </label>
  );
}

export const needsPick = (i: Intent) => i.risk.confidence < LOW || i.horizon.confidence < LOW || i.assetPref.confidence < LOW;
