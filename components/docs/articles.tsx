import type { ReactNode } from 'react';
import { ALERT_CONFIDENCE, FALLBACK_UTIL_BPS, REJUDGE_APY_BPS, REJUDGE_UTIL_BPS } from '@/lib/judge/gating';
import { VERDICT_RULES as R } from '@/lib/judge/combine';
import { EARLY_BELOW } from '@/shared/score';
import { MIN_BAND_VERDICTS } from '@/components/ledger/format';
import { MAINNET_SOFT_CAP_USD, NETWORKS, UNDEPLOYED, type Network } from '@/shared/networks';
import { addressUrl } from '@/components/tx/explorer';
import mainnetVaultConfig from '@/contracts/script/vaults.mainnet.json';
import { A, Callout, Checklist, Code, Facts, Flow, OneLine, Section, Stamp, Steps, Strong, Table, Terms, VerdictRows, paper } from './blocks';

/*
 * Plain-language docs, one article per topic in topics.ts. Numbers the app already exports are imported, so the docs
 * follow the code. The rest mirror values the app cannot import into a server component; docs.test.tsx checks them.
 */

const pct = (x: number) => `${Math.round(x * 100)}%`;
const pts = (bps: number) => `${bps / 100} point${bps === 100 ? '' : 's'}`;

/** Guardian rule bounds: ProtectStep's slider and freshness choices (GuardianV2 accepts 80–99%, 1–60 min). */
export const GUARDIAN = { minPct: 80, maxPct: 99, defaultPct: 90, freshness: [5, 10, 30, 60], defaultFreshness: 10 } as const;
/** How long the oracle waits before a verdict can be graded (TareRiskOracle `resolveWindow`). */
export const RESOLVE_WINDOW: Record<Network, string> = { testnet: '1 hour', mainnet: '24 hours' };
/** After that, how long anyone can record readings that grading uses (TareRiskOracle `sampleWindow`; none on testnet). */
export const SAMPLE_WINDOW: Record<Network, string | null> = { testnet: null, mainnet: '1 hour' };
/** How often each vault is checked (backend `ALARM_MS`). */
export const CHECK_EVERY: Record<Network, string> = { testnet: '15 seconds', mainnet: '30 seconds' };
/** Mainnet vaults Tare covers: the live config once deployed, else the vaults the deploy will register. */
const MAINNET_VAULT_NAMES = (NETWORKS.mainnet.vaults.length ? NETWORKS.mainnet.vaults : mainnetVaultConfig.vaults).map((v) => v.name);
/** Net outflow over the last hour, as a share of the vault, that makes Jev look again (backend `OUTFLOW_REJUDGE_PCT`). */
export const OUTFLOW_PCT = 10;

export const API_BASE = 'https://api.tarefi.xyz';
export const STATE_URL = 'https://ledger.tarefi.xyz/state/{stateHash}.json';
/** The public routes GET / lists (backend `PUBLIC_ROUTES`), each with a plain description. */
export const API_ROUTES: [string, string][] = [
  ['GET /v1/health', 'Is the backend running, and when did each watched vault last get a verdict.'],
  ['GET /v1/pools', 'Every pool Tare tracks, with its verdict.'],
  ['GET /v1/pools/{poolId}', 'One pool and its verdict.'],
  ['GET /v1/verdicts?network={testnet|mainnet}', 'The Verdict Ledger: every verdict posted onchain and how it was graded.'],
  ['GET /v1/vaults/{network}/{vault}/latest', 'The newest verdict for one vault.'],
  ['GET /v1/events/{network}/{owner}?since={iso}', 'The Watch feed for one wallet.'],
  ['GET /v1/ledger/score?network={testnet|mainnet}', 'The scoreboard: Brier score and hit rates.'],
];

function WhatIsTare() {
  return (
    <>
      <OneLine>Tare weighs every yield on Monad so you don&apos;t have to, then keeps watching after you deposit.</OneLine>
      <Section id="dollar" title="Follow one dollar through Tare">
        <p>Here is the whole protocol, from finding a yield to getting your money back out.</p>
      </Section>
      <Flow
        steps={[
          { k: 'Explore', title: 'Pools are read', body: 'Every Monad pool with $100k or more, refreshed every 10 minutes.' },
          { k: 'Jev', title: 'Jev judges each one', body: 'DEPOSIT, CONSIDER or AVOID, with reasons in plain words.' },
          { k: 'Advisor', title: 'You deposit', body: 'From your own wallet, into a vault you picked.' },
          { k: 'Watch', title: 'The vault is watched', body: 'Price, size and cash on hand, checked every few seconds.' },
          { k: 'Ledger', title: 'Verdicts go onchain', body: 'HOLD, EXIT or MOVE, with proof of what Jev saw.' },
          { k: 'Guardian', title: 'Back to your wallet', body: 'On your rule, Guardian pulls you out. Only to you.', accent: true },
        ]}
      />
      <Section id="jev" title="Who is Jev">
        <p>
          Jev is the AI judge behind Tare. It is TypeSafe&apos;s System One model. Tare describes a pool or a position to Jev in plain text and asks it a
          fixed set of questions, such as &ldquo;what&apos;s the chance this yield lasts 30 days?&rdquo;. Jev answers with probabilities.
        </p>
        <p>
          Jev never decides what happens to your money. <Strong>Fixed rules in code turn its answers into actions</Strong>, and Jev never holds keys.
        </p>
      </Section>
      <Section id="promises" title="Three promises">
        <Facts
          items={[
            { k: 'Keys', v: 'Jev has none', hint: 'Answers only. Rules and contracts act.' },
            { k: 'Your money', v: 'Only to you', hint: 'Guardian can send funds to the owner and nobody else.', tone: 'deposit' },
            { k: 'Every call', v: 'Public', hint: 'Posted onchain and graded later by anyone.' },
          ]}
        />
      </Section>
      <Section id="words" title="Words you will see">
        <Terms
          items={[
            ['Pool or vault', 'A place you deposit money so it earns yield, run by a protocol such as Euler or Morpho.'],
            ['APY', 'What a pool says it pays per year, as a percentage.'],
            ['Real APY', 'The part of the APY that comes from real activity, without token rewards that can stop at any time.'],
            ['TVL', 'Total value locked: how much money is in the pool.'],
            ['Utilization', 'How much of a vault’s money is lent out. Only the rest can be withdrawn right now.'],
            ['Verdict', 'Jev’s call. For pools: DEPOSIT, CONSIDER or AVOID. For your position: HOLD, EXIT or MOVE.'],
            ['Confidence', 'How sure Jev is of a verdict, from 0 to 100%.'],
            ['Onchain', 'Written to the Monad blockchain, where anyone can read it and nobody can edit it.'],
          ]}
        />
      </Section>
    </>
  );
}

function Explore() {
  return (
    <>
      <OneLine>Every Monad pool with at least $100,000 in it, on one chart, each stamped with its verdict.</OneLine>
      <Section id="chart" title="How to read the chart">
        <p>
          Each dot is a pool. <Strong>Further right means a higher APY. Higher up means more money in it (TVL).</Strong> The colour is Jev&apos;s verdict,
          so the purple dots high on the chart are big pools Jev trusts.
        </p>
        <p>Use the tabs to narrow by asset (Stable, Gold, RWA, MON, BTC/ETH) and the Protocol menu to see one protocol. The table below the chart lists the same pools.</p>
      </Section>
      <Section id="verdicts" title="What the verdicts mean">
        <VerdictRows
          rows={[
            { label: 'DEPOSIT', body: <>Risk {R.depositRiskAtMost} or less out of 5, the yield comes from real activity rather than token rewards, and Jev gives it at least a {pct(R.depositLastsAtLeast)} chance of lasting 30 days.</> },
            { label: 'CONSIDER', body: 'Everything in between. Not a red flag, but read the reasons first.' },
            { label: 'AVOID', body: <>Risk {R.avoidRiskAtLeast} or more out of 5, or the yield is paid in token rewards with under a {pct(R.avoidRewardsLastsBelow)} chance of lasting 30 days.</> },
          ]}
        />
      </Section>
      <Section id="slip" title="The verdict slip">
        <p>
          Click any dot or row to open its slip. Under the name is the pool&apos;s label, or its size when it has none, because one protocol can run several pools
          for the same token. The slip shows:
        </p>
        <Terms
          items={[
            ['Real APY', 'The yield without token rewards.'],
            ['From incentives', 'How much of the APY is token rewards.'],
            ['Exit risk', 'Low, Medium or High, from Jev’s 1 to 5 risk score.'],
            ['Confidence', 'How sure Jev is of this verdict.'],
          ]}
        />
        <p>
          Underneath are Jev&apos;s reasons in plain words, for example &ldquo;Chance this APY lasts the next 30 days: 68%&rdquo;, with links to the protocol and the
          pool&apos;s DefiLlama page. If Tare can deposit into that pool on your network, the slip has a <Strong>Deposit</Strong> button; otherwise it notes that there is no Tare vault for it, and you can use{' '}
          <Strong>Open on</Strong> the protocol instead.
        </p>
      </Section>
      <Callout title="Where the data comes from">
        Pool data is read from DefiLlama every 10 minutes. It is Monad mainnet market data on both networks, so Explore looks the same whichever network you pick.
      </Callout>
    </>
  );
}

function Pulse() {
  return (
    <>
      <OneLine>The whole Monad yield market on one screen: how much is tracked, how much of the yield is real, and who holds it.</OneLine>
      <Section id="tiles" title="The five numbers at the top">
        <Terms
          items={[
            ['TVL tracked', 'All the money in the pools Tare reads.'],
            ['Pools weighed', 'How many pools have a verdict.'],
            ['Protocols', 'How many protocols those pools belong to.'],
            ['Median real APY', 'The typical yield once token rewards are taken out.'],
            ['TVL in emission-heavy pools', 'The share of money in pools where more than half the APY is token rewards.'],
          ]}
        />
      </Section>
      <Section id="charts" title="The four charts">
        <Table
          head={['Chart', 'What it tells you']}
          rows={[
            ['What the APY says, and what’s left', 'For each asset type, the advertised APY next to the real APY. A big gap means the yield leans on rewards.'],
            ['TVL by asset class', 'Where the money sits: stables, gold, RWA, MON, BTC/ETH.'],
            ['Who holds the real yield', 'Each protocol’s money split by verdict.'],
            ['Biggest APY swings', 'The five pools whose APY changed most over the last 7 days, up or down.'],
          ]}
        />
      </Section>
      <p className="mt-6 text-[14px] text-secondary">Every tile links to Explore, so you can go from a number to the pools behind it.</p>
    </>
  );
}

function Scan() {
  return (
    <>
      <OneLine>Paste any Monad mainnet wallet address to see what is sitting idle and what it could earn.</OneLine>
      <Section id="how" title="How it works">
        <Steps
          items={[
            { title: 'Paste an address', body: 'Any wallet, yours or not. You don’t connect a wallet and you don’t sign anything. Or press “Try the demo whale”.' },
            { title: 'Tare reads the balances', body: 'It reads the wallet’s tokens on Monad mainnet and marks the ones that earn nothing as idle.' },
            { title: 'You see the gap', body: 'The headline reads like “$X idle · could earn $Y a year”, with up to three pools that fit.' },
          ]}
        />
      </Section>
      <Section id="math" title="Where the numbers come from">
        <p>
          <Strong>Idle</Strong> means balances that are not earning anything. <Strong>Could earn</Strong> uses the best real APY among DEPOSIT pools of the same
          asset type: idle stablecoins are compared with stablecoin pools, idle MON with MON pools, and so on.
        </p>
      </Section>
      <Callout title="Where to find it">
        The idle scan is not in the top menu. Open it from the landing page or go to <A href="/app/scan">/app/scan</A>.
      </Callout>
    </>
  );
}

function Advisor() {
  return (
    <>
      <OneLine>Type what you want, like &ldquo;500 USDC, safe, 3 months&rdquo;, and Tare returns the three pools that fit best.</OneLine>
      <Section id="reads" title="What Tare reads from your words">
        <Terms
          items={[
            ['Amount', 'How much you want to put in.'],
            ['Risk appetite', 'Low, medium or high.'],
            ['Horizon', 'Short (30 days), medium (90 days) or long (a year).'],
            ['Asset', 'Stablecoins, gold, MON and so on, or any.'],
          ]}
        />
        <p>
          Each choice shows up as a chip you can change. If Tare is under {pct(ALERT_CONFIDENCE)} sure of one, the chip shows <Strong>?</Strong> and you pick it yourself.
        </p>
      </Section>
      <Section id="ranks" title="How the top three are picked">
        <Checklist
          items={[
            'AVOID pools are never suggested.',
            'Low appetite only gets risk 2 or less out of 5; medium gets 3 or less.',
            'Pools with a fixed end date must end within your horizon.',
            'What is left is sorted by real APY, then by size.',
          ]}
        />
        <p>Each pick shows a rough return over your horizon and which of your choices it matches. <Strong>Details</Strong> opens the rest: base yield, your risk limit, any end date, and whether Tare has a vault for it.</p>
      </Section>
      <Section id="deposit" title="Depositing">
        <Steps
          items={[
            { title: 'Approve', body: 'Let the vault take the amount you chose. Signed in your wallet.' },
            { title: 'Deposit', body: 'The money goes from your wallet into the vault. Tare never holds it.' },
            { title: 'Protect with Guardian (optional)', body: <>Set your exit rule right away. See <A href="/app/docs/guardian">Guardian v2</A>.</> },
          ]}
        />
        <Callout tone="warn" title="On mainnet">
          This is real money. Your first mainnet deposit asks you to confirm a short risk note, and the app caps deposits at ${MAINNET_SOFT_CAP_USD.toLocaleString('en-US')} per
          wallet.
        </Callout>
      </Section>
    </>
  );
}

function Watch() {
  return (
    <>
      <OneLine>Your positions, the latest verdict on each, and a live feed of everything that happened to them.</OneLine>
      <Section id="card" title="Your position card">
        <p>Connect your wallet and each vault you are in gets a card:</p>
        <Terms
          items={[
            ['Latest verdict', <>The latest onchain verdict: <Stamp label="HOLD" />, <Stamp label="EXIT" /> or <Stamp label="MOVE" />.</>],
            ['Confidence', 'How sure Jev was.'],
            ['Exit rule', 'Your Guardian rule, for example “≥90% · 10m”.'],
            ['What Jev saw', 'A link to the exact text Jev was given for that verdict, plus the transaction.'],
          ]}
        />
      </Section>
      <Section id="exit-now" title="Exit now, always">
        <p>
          Every card has an <Strong>Exit now</Strong> button. It withdraws straight from the vault to your wallet and needs nothing from Tare, so it works even if
          Tare is down. If part of the vault&apos;s money is lent out, it takes what can leave now and you exit the rest later.
        </p>
      </Section>
      <Section id="when" title="When Tare checks again">
        <p>Each vault is checked every {CHECK_EVERY.testnet} on testnet and every {CHECK_EVERY.mainnet} on mainnet. Jev is asked again when:</p>
        <Checklist
          mark="→"
          items={[
            `APY moves more than ${pts(REJUDGE_APY_BPS)}`,
            `utilization moves more than ${pts(REJUDGE_UTIL_BPS)}`,
            `more than ${OUTFLOW_PCT}% of the vault’s money left in the last hour`,
            'the vault has no verdict yet',
          ]}
        />
        <p>
          An EXIT that is at least {pct(ALERT_CONFIDENCE)} sure but below your Guardian rule becomes an <Strong>alert</Strong> with a one-click Exit, so you decide.
          Anything less sure is only logged.
        </p>
      </Section>
      <Section id="feed" title="Reading the feed">
        <Table
          head={['You see', 'It means']}
          rows={[
            ['Vault stats changed', 'The vault’s numbers moved.'],
            ['Re-checked', 'Jev looked at your position again and gave a verdict.'],
            ['Verdict posted onchain', 'The verdict is now on the Verdict Ledger.'],
            ['Alert', 'Jev leans towards EXIT, but not as sure as your rule. Your call.'],
            ['Exit sent / You’re out', 'Guardian’s exit was sent, then confirmed, with the transaction link.'],
            ['Partly out', 'Some money is still locked in the vault; the amount is shown.'],
            ['Exit failed', 'The exit did not run, with the reason in plain words.'],
            ['Judge unreachable', <>Jev could not be reached, so there is no new verdict and no automatic exit. You still get an alert if utilization passes {FALLBACK_UTIL_BPS / 100}%.</>],
          ]}
        />
      </Section>
    </>
  );
}

function Guardian() {
  const g = GUARDIAN;
  return (
    <>
      <OneLine>You set an exit rule. When Tare posts a fresh EXIT verdict that meets it, anyone can trigger the exit, and the money can only go back to you.</OneLine>
      <Section id="rule" title="Your rule, in two numbers">
        <Facts
          items={[
            { k: 'Confidence needed', v: `${g.minPct}–${g.maxPct}%`, hint: `Default ${g.defaultPct}%.` },
            { k: 'How fresh the verdict', v: `${g.freshness[0]}–${g.freshness[g.freshness.length - 1]} min`, hint: `Pick ${g.freshness.join(', ')} minutes. Default ${g.defaultFreshness}.` },
            { k: 'Where funds go', v: 'Your wallet', hint: 'Nowhere else, ever.', tone: 'deposit' },
          ]}
        />
      </Section>
      <Section id="setup" title="Turning it on">
        <Steps
          items={[
            { title: 'Approve your vault shares to Guardian', body: 'This lets Guardian redeem your shares. It can only send what comes out to you.' },
            { title: 'Turn on Guardian', body: 'Pick your two numbers and sign. You can do it right after depositing in the Advisor, or later on Watch.' },
            { title: 'That’s it', body: 'Change the rule or turn it off at any time on Watch. Exit now keeps working either way.' },
          ]}
        />
      </Section>
      <Section id="keeperless" title="Why anyone can press the button">
        <p>
          Older auto-exits need one trusted bot (a &ldquo;keeper&rdquo;) to press the button. If that bot is down, nobody gets out. Guardian v2 has no keeper:
          <Strong> anyone can call the exit</Strong>. Tare&apos;s backend normally does it within seconds, but if Tare is offline, you or anyone else can.
        </p>
        <p>That is safe because the contract checks every rule itself and ignores who is calling. The exit only goes through if all of this is true:</p>
        <Checklist
          items={[
            'Guardian covers this vault.',
            'Your rule is turned on.',
            <>The vault&apos;s latest onchain verdict is <Stamp label="EXIT" />.</>,
            'The verdict’s confidence meets your rule.',
            'The verdict is newer than your freshness limit.',
            'The verdict was posted after you turned Guardian on.',
            'That verdict hasn’t already been used to take you fully out.',
          ]}
        />
      </Section>
      <Section id="never" title="What Guardian can never do">
        <Facts
          items={[
            { k: 'Hold funds', v: 'Never', hint: 'Money moves from the vault straight to you.', tone: 'avoid' },
            { k: 'Pay anyone else', v: 'Never', hint: 'Not the caller, not Tare.', tone: 'avoid' },
            { k: 'Move you elsewhere', v: 'Never', hint: 'It only exits. MOVE is a suggestion.', tone: 'avoid' },
          ]}
        />
        <p>
          Guardian never holds your funds, not even for a moment: when it exits, the vault pays you directly. Guardian&apos;s admin can only choose which vaults
          Guardian covers. It has no other power.
        </p>
      </Section>
      <Section id="vaults" title="Which vaults Guardian covers">
        <p>On mainnet, Tare only watches a vault if it passes all five of these checks:</p>
        <Checklist
          label="Vault rules"
          items={[
            'It holds real USDC and passes Tare’s contract checks.',
            'It is an Euler Earn or Morpho V2 vault, the two kinds where Tare can read how much cash can leave.',
            'It holds at least $1M.',
            'On a copy of mainnet, Guardian fully exits a 1,000 USDC position from it.',
            'The cash Tare reads is above zero and no more than the vault holds.',
          ]}
        />
        <p className="mt-4">
          Saturn USDC is an example of a vault Guardian can&apos;t protect: almost none of its $3M sits idle, and withdrawals wait on its curator to free up
          cash, so an exit could return nothing.
        </p>
      </Section>
      <Section id="edges" title="Edge cases">
        <Terms
          items={[
            ['The vault is short of cash', 'Guardian takes what can leave now. You are “Partly out”, and the rest can still exit later on the same verdict.'],
            ['The judge is down', 'No new verdict means no automatic exit. When something breaks, exits get harder, never easier. Exit now still works.'],
            ['You change your rule', 'An EXIT posted before the change no longer counts. Guardian waits for a newer one.'],
          ]}
        />
      </Section>
    </>
  );
}

function Ledger() {
  return (
    <>
      <OneLine>Every verdict is posted onchain with proof of what Jev saw, then graded in public, so the track record can&apos;t be edited or flattered.</OneLine>
      <Section id="posted" title="What gets posted">
        <p>Each verdict goes to a contract called TareRiskOracle, with:</p>
        <Terms
          items={[
            ['The call', <>The vault and the verdict: <Stamp label="HOLD" />, <Stamp label="EXIT" /> or <Stamp label="MOVE" />.</>],
            ['Confidence', 'How sure Jev is of the call.'],
            ['Risk forecast', 'Jev’s chance that holders can’t withdraw in full soon. This is the number that gets graded.'],
            ['A fingerprint', 'A hash of exactly what Jev was shown and how it answered. Change one character and the fingerprint changes.'],
          ]}
        />
      </Section>
      <Section id="saw" title="Check what Jev saw">
        <p>The full text behind every fingerprint is archived in public at:</p>
        <p className={`${paper} mono break-all px-4 py-3 text-[13px] text-ink`}>{STATE_URL}</p>
        <p>
          Anyone can download it, hash it again and compare with the fingerprint onchain. If they match, that is exactly what Jev saw. The Ledger and Watch link it as{' '}
          <Strong>What Jev saw</Strong>.
        </p>
      </Section>
      <Section id="graded" title="How a verdict is graded">
        <p>
          When the verdict is posted, the oracle also writes down the vault&apos;s share price, size and cash on hand. On mainnet, {RESOLVE_WINDOW.mainnet} later a{' '}
          {SAMPLE_WINDOW.mainnet} grading window opens. During it, <Strong>anyone</Strong> can call <Code>sample</Code>, and the contract keeps the worst share price,
          size and cash it sees. When the window closes, anyone can call <Code>resolve</Code>, and the contract grades those worst readings. On testnet,{' '}
          <Code>resolve</Code> reads the vault once, after {RESOLVE_WINDOW.testnet}. It is <Strong>adverse</Strong> if any of these happened:
        </p>
        <Checklist
          mark="!"
          items={['The share price fell more than 0.5%.', 'The vault’s total money fell more than 20%.', 'Cash on hand is below 5% of the vault (where Tare can read it).', 'The vault could not be read at all.']}
        />
        <p>Otherwise it is <Strong>clear</Strong>. Grading doesn&apos;t depend on Tare: the rules are in the contract.</p>
        <p>
          A reading can only make a grade harsher. Someone could borrow millions for a single transaction (a flash loan) to make a vault look healthy for one
          reading, but the contract keeps the worst one, so one honest sample is enough. Tare&apos;s backend samples every verdict as soon as its window opens,
          and anyone else can too.
        </p>
      </Section>
      <Section id="score" title="The scoreboard">
        <Terms
          items={[
            ['Right', 'An EXIT followed by an adverse outcome, or a HOLD or MOVE followed by a clear one. The scoreboard leads with how many graded verdicts were right.'],
            ['Right, by confidence', `The same count grouped by how sure Jev was (under 80%, 80–89%, 90–94%, 95–100%). A well-calibrated judge is right more often when it is more sure. Groups with fewer than ${MIN_BAND_VERDICTS} verdicts are greyed out as too few to judge.`],
            ['Brier score', 'Under “How we score this”. How close the risk forecasts were to what happened: 0 means every forecast matched, and lower is better.'],
            ['Demo stress tests', 'On testnet, the record includes stress tests where a vault is pushed into trouble and then reset before grading. The real track record is on mainnet.'],
            ['Early data', `Shown until ${EARLY_BELOW} verdicts are graded. Small samples can mislead.`],
          ]}
        />
        <Callout title="Honest limits">
          Grading compares the moment of posting with the grading window, so a crunch that recovers before then is not counted. Testnet reads one moment, and its
          mirror vaults are run by the operator, so its record is practice. Drills, posted by hand to test exits, are labelled and left out of the score.
        </Callout>
      </Section>
    </>
  );
}

function contractRow({ network }: { network: Network }) {
  const c = NETWORKS[network];
  const link = (a: string) =>
    a === UNDEPLOYED ? <span className="text-muted">Not deployed yet</span> : (
      <a href={addressUrl(a, network)} target="_blank" rel="noopener noreferrer" className="mono break-all text-[12px] text-ink underline decoration-hairline underline-offset-4">
        {a}
      </a>
    );
  return [network === 'mainnet' ? 'Mainnet' : 'Testnet', link(c.oracle), link(c.guardian)];
}

function Networks() {
  const t = NETWORKS.testnet;
  const m = NETWORKS.mainnet;
  const yes = (on: boolean) => (on ? 'Yes' : 'No');
  return (
    <>
      <OneLine>Testnet is the free practice run. Mainnet is real money. The switch in the header picks which one the app uses.</OneLine>
      <Section id="compare" title="Side by side">
        <Table
          head={['', 'Testnet', 'Mainnet']}
          rows={[
            ['Chain', `Monad Testnet (${t.chain.id})`, `Monad (${m.chain.id})`],
            ['Money', 'Test tokens with no value', 'Real money'],
            ['Vaults', 'Mirror vaults that copy real vaults’ APY', 'Approved real vaults'],
            ['Deposit cap in the app', 'None', `$${MAINNET_SOFT_CAP_USD.toLocaleString('en-US')} per wallet`],
            ['Each vault checked every', CHECK_EVERY.testnet, CHECK_EVERY.mainnet],
            ['Verdict graded after', RESOLVE_WINDOW.testnet, `${RESOLVE_WINDOW.mainnet}, then a ${SAMPLE_WINDOW.mainnet} window`],
            ['Graded on', 'One reading', 'The worst reading in that window'],
            ['Faucet', yes(t.features.faucet), yes(m.features.faucet)],
            ['Demo controls', yes(t.features.demoControls), yes(m.features.demoControls)],
            ['Launch', yes(t.features.launch), yes(m.features.launch)],
          ]}
        />
        <p className="mt-4">
          Explore, Pulse and the idle scan show Monad mainnet market data on both networks. Only your own positions and transactions change.
        </p>
      </Section>
      <Section id="testnet-only" title="Testnet-only features">
        <p>These use test tokens, so they never appear on mainnet:</p>
        <Terms
          items={[
            ['Get test USDC', 'The faucet button in the header mints 1,000 test USDC to your wallet.'],
            ['Demo controls', 'Lets the operator stress a mirror vault, to show a Guardian exit happening live.'],
            ['Launch', 'Create a token on a bonding curve whose reserve earns yield in a vault, so its floor price rises over time.'],
          ]}
        />
      </Section>
      <Section id="mainnet" title="On mainnet">
        <p>
          A <Strong>Real funds</Strong> banner stays at the top of every page. If your wallet is on the other chain, the app shows a button to switch it.
        </p>
        <p>Tare watches these real USDC vaults. Guardian explains how they were picked.</p>
        <Checklist items={MAINNET_VAULT_NAMES} mark="·" />
      </Section>
      <Section id="switch" title="How the app remembers your choice">
        <p>
          A <Code>?network=</Code> link wins first, then the last network you picked, then testnet by default.
        </p>
      </Section>
      <Section id="contracts" title="Contracts">
        <Table head={['Network', 'TareRiskOracle', 'GuardianV2']} rows={[contractRow({ network: 'testnet' }), contractRow({ network: 'mainnet' })]} />
      </Section>
    </>
  );
}

function Api() {
  return (
    <>
      <OneLine>The data behind Tare, as JSON, for anyone to read. No key, no sign-up.</OneLine>
      <Section id="base" title="Start here">
        <div className={`${paper} overflow-hidden`}>
          <div className="mono flex items-center justify-between border-b border-hairline px-4 py-2 text-[10.5px] uppercase tracking-[0.08em] text-muted">
            <span>Request</span>
            <span>v1</span>
          </div>
          <pre className="mono overflow-x-auto px-4 py-3 text-[13px] leading-relaxed text-ink">curl {API_BASE}/</pre>
        </div>
        <p>
          <Code>GET /</Code> at <A href={API_BASE}>{API_BASE.replace('https://', '')}</A> lists every route below. Everything is read-only and open to any website.
        </p>
      </Section>
      <Section id="routes" title="Routes">
        <div className="mt-4 divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-white">
          {API_ROUTES.map(([route, what]) => (
            <div key={route} className="px-4 py-3">
              <div className="mono break-all text-[12.5px] text-ink">
                <span className="mr-2 rounded-[4px] bg-deposit/10 px-1.5 py-[1px] text-[11px] font-medium text-deposit">GET</span>
                {route.replace(/^GET /, '')}
              </div>
              <p className="mt-1 text-[13.5px] text-secondary">{what}</p>
            </div>
          ))}
        </div>
      </Section>
      <Section id="also" title="Also public">
        <Terms
          items={[
            ['What Jev saw', <span key="s" className="mono break-all text-[12.5px]">{STATE_URL}</span>],
            ['Source code', <A key="g" href="https://github.com/0xGanadhish/tare">github.com/0xGanadhish/tare</A>],
          ]}
        />
      </Section>
    </>
  );
}

function Risks() {
  return (
    <>
      <OneLine>Tare lowers risk. It does not remove it. Here is what can still go wrong.</OneLine>
      <Callout tone="warn" title="Not financial advice">
        Verdicts are an AI model&apos;s judgement, shown with how sure it is. Do your own research and only put in what you can afford to lose.
      </Callout>
      <Section id="list" title="The risks, plainly">
        <Terms
          items={[
            ['Jev can be wrong', <>It can miss a problem or call one that never comes. Its record is public on the <A href="/app/ledger">Ledger</A>, early data included.</>],
            ['Vaults are run by others', 'Euler, Morpho and the other protocols run the vaults, not Tare. Their bugs or losses are your losses.'],
            ['Locked money', 'If a vault has lent out all its cash, nobody can withdraw, including Guardian. An exit can be partial.'],
            ['Exits need a fresh verdict', 'If Jev, the network or Tare’s backend is down, no new verdict is posted, so Guardian can’t act. Exit now still works.'],
            ['Smart contract risk', 'Tare’s contracts are tested and were security-reviewed during the build. Bugs are still possible.'],
            ['Key risk', 'If the key that posts verdicts were stolen, the worst case is an early exit, back to your own wallet. It can be rotated.'],
            ['Grading limits', 'Verdicts are graded on the moment of posting and the worst reading in the grading window, so short crunches in between are missed.'],
            ['Mainnet is real money', `Start small. The app caps deposits at $${MAINNET_SOFT_CAP_USD.toLocaleString('en-US')} per wallet.`],
          ]}
        />
      </Section>
      <Section id="fees" title="Fees">
        <p>Tare charges no fees today. The contracts take nothing. Testnet tokens have no value.</p>
      </Section>
    </>
  );
}

export const ARTICLES: Record<string, () => ReactNode> = {
  'what-is-tare': WhatIsTare,
  explore: Explore,
  pulse: Pulse,
  scan: Scan,
  advisor: Advisor,
  watch: Watch,
  guardian: Guardian,
  ledger: Ledger,
  networks: Networks,
  api: Api,
  risks: Risks,
};
