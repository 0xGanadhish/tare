import { NETWORKS, type Network } from '@/shared/networks';
import type { LedgerVerdict } from '@/lib/backend';
import { shortHash, txUrl } from '@/components/tx/explorer';
import { stateUrl } from '@/lib/stateUrl';
import { outcomeOf, verdictLabel } from './format';

const TONE: Record<string, string> = { HOLD: 'text-deposit', EXIT: 'text-avoid', MOVE: 'text-avoid' };
const OUTCOME_TONE = { pending: 'text-muted', adverse: 'text-avoid', clear: 'text-deposit' } as const;

const vaultName = (network: Network, vault: string) =>
  NETWORKS[network].vaults.find((v) => v.address.toLowerCase() === vault.toLowerCase())?.name ?? shortHash(vault);

const time = (unix: number) =>
  new Date(unix * 1000).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }) + ' UTC';

/** One row per onchain verdict (spec §7). */
export function LedgerTable({ rows, stateBase }: { rows: LedgerVerdict[]; stateBase: string | null }) {
  return (
    <div className="overflow-x-auto rounded-[14px] border border-hairline bg-paper">
      <table className="w-full min-w-[760px] text-left text-[12.5px]">
        <thead className="mono text-[10px] uppercase tracking-[0.06em] text-muted">
          <tr className="border-b border-hairline">
            {['Posted', 'Vault', 'Verdict', 'Confidence', 'Risk forecast', 'Outcome', 'Proof'].map((h) => (
              <th key={h} scope="col" className="px-3 py-2.5 font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline/70">
          {rows.map((r) => {
            const label = verdictLabel(r.verdict);
            const outcome = outcomeOf(r);
            const seen = stateUrl(stateBase, r.stateHash);
            return (
              <tr key={`${r.network}-${r.id}`}>
                <td className="mono whitespace-nowrap px-3 py-2.5 text-secondary">{time(r.postedAt)}</td>
                <td className="px-3 py-2.5">
                  {vaultName(r.network, r.vault)}
                  {r.drill && (
                    <span className="mono ml-2 rounded border border-hairline px-1.5 py-px text-[9.5px] uppercase tracking-[0.06em] text-secondary" title="Posted by hand as a labelled drill">
                      drill
                    </span>
                  )}
                </td>
                <td className={`mono px-3 py-2.5 font-medium ${TONE[label]}`}>{label}</td>
                <td className="mono px-3 py-2.5 tabular-nums">{(r.confidenceBps / 100).toFixed(0)}%</td>
                <td className="mono px-3 py-2.5 tabular-nums">{(r.riskBps / 100).toFixed(0)}%</td>
                <td className={`px-3 py-2.5 ${OUTCOME_TONE[outcome.kind]}`}>
                  <span className="mono">{outcome.kind}</span>
                  {outcome.reasons.length > 0 && <span className="text-secondary"> · {outcome.reasons.join(', ')}</span>}
                </td>
                <td className="mono whitespace-nowrap px-3 py-2.5 text-[11.5px]">
                  {r.txHash ? (
                    <a href={txUrl(r.txHash, r.network)} target="_blank" rel="noopener noreferrer" className="underline decoration-hairline underline-offset-4">
                      {shortHash(r.txHash)} ↗
                    </a>
                  ) : (
                    <span className="text-muted">#{r.id}</span>
                  )}
                  {seen && (
                    <>
                      {' · '}
                      <a href={seen} target="_blank" rel="noopener noreferrer" className="underline decoration-hairline underline-offset-4">
                        What Jev saw ↗
                      </a>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
