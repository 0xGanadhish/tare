import { RESOLVE_WINDOW, SAMPLE_WINDOW } from '@/components/docs/windows';

/** How the Ledger grades verdicts, in plain words (shown under the table). */
export function Method() {
  return (
    <section aria-labelledby="method" className="mt-10 max-w-[720px] text-[13px] leading-relaxed text-secondary">
      <h2 id="method" className="text-[17px] font-semibold text-ink">Method</h2>
      <p className="mt-2">
        When Tare posts a verdict, the oracle records the vault&apos;s share price, total assets and available liquidity. After the window
        ({RESOLVE_WINDOW.testnet} on testnet, {RESOLVE_WINDOW.mainnet} on mainnet) the verdict is graded{' '}
        <strong className="text-ink">adverse</strong> if any of these happened:
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>the share price fell more than 0.5% (price drop)</li>
        <li>total assets fell more than 20% (TVL drop)</li>
        <li>available liquidity is below 5% of total assets, for vaults with a liquidity adapter (liquidity)</li>
        <li>the vault could not be read at all (vault unreadable)</li>
      </ul>
      <p className="mt-2">
        Otherwise it is <strong className="text-ink">clear</strong>. On mainnet, the {RESOLVE_WINDOW.mainnet} are followed by a {SAMPLE_WINDOW.mainnet}{' '}
        sampling window: anyone can call <code className="mono text-ink">sample</code>, and the oracle keeps the <strong className="text-ink">worst</strong>{' '}
        share price, total assets and liquidity it sees, so a flash loan can&apos;t make a vault look healthier. Tare samples every verdict twice, once at
        an unannounced moment. Then anyone can call <code className="mono text-ink">resolve</code>, so grading does not depend on Tare.
      </p>
      <p className="mt-2">
        A verdict is right when an EXIT is followed by an adverse outcome, or a HOLD or MOVE by none. The Brier score compares each verdict&apos;s
        withdrawal-risk forecast with what happened (0 is perfect, lower is better). Drills, posted by hand to test exits, are labelled and left out of the score. Fewer than 30
        graded verdicts is early data.
      </p>
      <p className="mt-2">
        Limits: grading looks at the moment of posting and the readings taken at the end of the window, so a crunch that starts and recovers in between
        is not counted. On testnet there is no sampling window: <code className="mono text-ink">resolve</code> takes one reading.
      </p>
    </section>
  );
}
