import {
  ALERT_CONFIDENCE,
  AUTO_EXIT_CONFIDENCE,
  FALLBACK_UTIL_BPS,
  REJUDGE_APY_BPS,
  REJUDGE_UTIL_BPS,
} from '@/lib/judge/gating';
import { VERDICT_RULES as R } from '@/lib/judge/combine';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const pts = (bps: number) => `${bps / 100} point${bps === 100 ? '' : 's'}`;

/** Plain-language account of what the demo controls do and the rules Jev's answers go through. Numbers come from the code. */
export function HowJevDecides() {
  return (
    <section id="how" className="mt-12 scroll-mt-24 grid gap-8 border-t border-hairline pt-10 md:grid-cols-2">
      <div>
        <h2 className="text-[18px] font-semibold tracking-[-0.02em]">What happens when you press Apply</h2>
        <ol className="mt-4 space-y-3 text-[13.5px] leading-relaxed text-secondary">
          <Step n={1}>The operator signs <span className="mono text-ink">setStats</span> on Monad testnet. The mirror vault now reports the new APY and utilization, the same signal a real vault gives when it gets into trouble.</Step>
          <Step n={2}>The worker sees it within about a second. If APY moved more than {pts(REJUDGE_APY_BPS)} or utilization more than {pts(REJUDGE_UTIL_BPS)}, it asks Jev again.</Step>
          <Step n={3}>
            Jev answers three questions about each position, and says how sure it is of each:
            <ul className="mt-1.5 list-disc space-y-1 pl-5">
              <li>What should the holder do: hold, exit, or move to a better vault?</li>
              <li>What&apos;s the chance they can&apos;t withdraw in full soon?</li>
              <li>What&apos;s the chance the yield collapses?</li>
            </ul>
          </Step>
          <Step n={4}>
            Fixed rules turn the answer into action:
            <ul className="mt-1.5 list-disc space-y-1 pl-5">
              <li><b className="font-medium text-ink">Exit, at least {pct(AUTO_EXIT_CONFIDENCE)} sure, autopilot on:</b> the Guardian withdraws for you. No signature needed, and funds can only go back to your wallet.</li>
              <li><b className="font-medium text-ink">Exit, {pct(ALERT_CONFIDENCE)}–{pct(AUTO_EXIT_CONFIDENCE)} sure:</b> an alert with a one-click Exit. You decide.</li>
              <li><b className="font-medium text-ink">Under {pct(ALERT_CONFIDENCE)} sure:</b> logged on Watch, nothing else.</li>
              <li><b className="font-medium text-ink">Jev unreachable:</b> never exits on its own; alerts if utilization passes {FALLBACK_UTIL_BPS / 100}%.</li>
            </ul>
          </Step>
        </ol>
        <p className="mt-5 text-[13px] text-muted">Open <a href="/app/watch" className="text-ink underline decoration-hairline underline-offset-4">Watch</a> in another tab to see each step arrive.</p>
      </div>

      <div className="space-y-8">
        <div>
          <h2 className="text-[18px] font-semibold tracking-[-0.02em]">The two numbers</h2>
          <dl className="mt-4 space-y-3 text-[13.5px] leading-relaxed text-secondary">
            <div><dt className="font-medium text-ink">APY</dt><dd>What the vault pays per year. A sharp drop means the yield is collapsing.</dd></div>
            <div><dt className="font-medium text-ink">Utilization</dt><dd>The share of the vault&apos;s money that is lent out. Only the rest can be withdrawn: at 95%, just 5% of the vault can leave; at 100%, nobody can withdraw.</dd></div>
          </dl>
        </div>
        <div>
          <h2 className="text-[18px] font-semibold tracking-[-0.02em]">How Tare rates pools on Explore</h2>
          <ul className="mt-4 space-y-2 text-[13.5px] leading-relaxed text-secondary">
            <li><b className="font-medium text-avoid">AVOID</b>: risk {R.avoidRiskAtLeast} or more out of 5, or the yield is paid in token rewards with under {pct(R.avoidRewardsLastsBelow)} chance of lasting 30 days.</li>
            <li><b className="font-medium text-deposit">DEPOSIT</b>: risk {R.depositRiskAtMost} or less, yield from real activity rather than token rewards, and at least {pct(R.depositLastsAtLeast)} chance it lasts 30 days.</li>
            <li><b className="font-medium text-ink">CONSIDER</b>: everything in between.</li>
          </ul>
        </div>
        <div>
          <h2 className="text-[18px] font-semibold tracking-[-0.02em]">Who is Jev</h2>
          <p className="mt-4 text-[13.5px] leading-relaxed text-secondary">
            Jev is TypeSafe&apos;s System One model. Tare sends it a plain-text description of a pool or position and a fixed set of questions; it returns answers with probabilities. Jev never holds keys: the rules above decide what happens, and every automatic withdrawal goes through the Guardian contract.
          </p>
        </div>
      </div>
    </section>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mono mt-[3px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink text-[10.5px] text-white">{n}</span>
      <div>{children}</div>
    </li>
  );
}
