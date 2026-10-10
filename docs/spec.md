# Tare — Design Spec

**Date:** 2026-10-10
**Event:** Monad Blitz Pune (V3), one-day IRL build sprint, 6 hours of build time (11:30 AM–5:30 PM IST, 10 Oct 2026), solo, judged by a 400-point rubric (§14), "consumer app on Monad"
**Status:** Design approved section-by-section in brainstorming; this document is the single source of truth for the implementation plan and for every build agent.

> **Tare** — *Every yield on Monad, weighed.*

---

## 1. Intent

### What we are building
A yield-intelligence platform for Monad. It reads every yield on the chain, uses Jev (TypeSafe's System One model) to judge which yields are real, helps a user deposit into the right one, watches their position afterwards, and can automatically pull them out when a vault turns risky. A yield-backed token launchpad shows the same engine protecting a token's reserve.

### Who it is for
Monad users with idle capital (stables, MON, gold, BTC/ETH) who cannot tell real yield from emission-inflated yield and do not want to watch positions all day.

### Success criteria (for the hackathon)
1. A 3-minute live demo with no dead ends (script in §13).
2. One memorable moment: the Guardian auto-exit landing before the vault locks.
3. Jev is visibly central (reads intent, judges pools, gates actions), not bolted on.
4. Looks like a funded company: the "Field" visual direction (§5), professional tone.
5. Every transactional success shown on screen is backed by a real testnet receipt (§10).

### Constraints
- Solo builder, one day, no pre-written project code. Planning, tooling setup and accounts beforehand are fine.
- **Testnet for all transactions** (Monad testnet, chain id 10143). Mainnet is read-only.
- Token budget matters: orchestration rules in §15 exist to limit it.
- Confirm with organizers on the day that AI-assisted coding is allowed (assumed yes).

---

## 2. Scope

### In scope (build order = priority order)
1. **Discover** — every Monad pool (≥ $100k TVL, ~166 pools, 27 protocols, ~$1.35B) grouped by asset class, shown as the Field chart and a table.
2. **Decide** — Jev judges every pool; a plain-language Advisor turns "500 USDC, safe, 3 months" into a ranked shortlist.
3. **Idle scan** — paste any mainnet address, see idle money and what it could earn.
4. **Deposit + Watch + Guardian** — real testnet deposits into mirror vaults, a watchdog, and Guardian auto-exit gated by Jev confidence.
5. **Pulse dashboard** — a market overview of Monad yields built from the cached pools and verdicts (§3, §5).
6. **Launch** — yield-backed token launchpad (§8.4).

Pulse and Launch are both planned; the user decides on the day if either has to slip.

### Out of scope
Multi-chain, user accounts/auth, our own token, chat UI, mobile app, rotating funds between vaults automatically, cross-model code reviews, the "most overhyped yields" leaderboard (dropped).

### Future additions (mention on the "what's next" slide, do not build)
Telegram/push alerts · gold-backed launch reserves ("a memecoin with a gold floor"; real gold yield on Monad is ~0%, so the pitch is a price floor, not yield growth — contracts use `vault.asset()` rather than hardcoding USDC so a gold mirror can be added later without contract changes) · automatic rotation into a better vault · mainnet deployment · intro motion video (optional, only if time remains).

---

## 3. Product surface

One Next.js (App Router) project. Marketing route is server-rendered; app routes navigate client-side.

| Route | Purpose |
|---|---|
| `/` | Landing page in the Field direction: headline, live Field chart, "Scan a wallet" input, three-step "Judge · Deposit · Watch" explainer, Launch teaser, footer. Live numbers ("166 pools · 27 protocols · $1.35B") come from the cache. |
| `/app/explore` | Field chart + table of all pools, filters by asset class and protocol. Clicking a dot or row opens the **verdict slip** drawer. |
| `/app/scan/[address]` | Idle report for a mainnet address with "put it to work" suggestions linking into the Advisor. |
| `/app/advisor` | Intent input → intent chips with confidence → top 3 verdict slips → Deposit flow into the matching mirror vault. |
| `/app/watch` | Connected wallet's mirror positions, latest Jev judgment per position, autopilot (Guardian) toggle, live event feed. |
| `/app/pulse` | Dashboard: KPI tiles (TVL tracked, pools, protocols, median real APY, share of TVL in emission-heavy pools), headline vs real APY by asset class, TVL by verdict per protocol, TVL by asset class, top 5 APY movers over 7 days. Every element links to Explore or a verdict slip. |
| `/app/launch` | Create a yield-backed token; token page with live rising floor price; buy/sell. (Stretch.) |
| `/app/admin` | Hidden demo controls: per-mirror sliders for APY and utilization → `POST /api/admin/stats` (protected by `ADMIN_TOKEN`), which signs `setStats` server-side with the operator key, so nobody switches wallet accounts on stage. |

Every page must work at phone width (judges will open the deployed URL from a QR code).

---

## 4. Architecture

```
                    ┌──────────────── Next.js app ─────────────────┐
                    │ /  /app/explore  /app/scan  /app/advisor      │
                    │ /app/watch  /app/launch  /app/admin           │
                    └──────┬───────────────────────────┬────────────┘
                           │ API routes (read cache,   │ wallet txs (wagmi/viem)
                           │ on-demand Jev)            │ straight to Monad testnet
  ┌────────────────────────▼──────────┐      ┌─────────▼────────────────────────┐
  │ lib/indexer   DeFiLlama → Pool[]   │      │ MockUSDC (open mint)             │
  │ lib/classify  asset-class rules    │      │ MirrorVault ×4 (ERC-4626)        │
  │ lib/judge     the only Jev client  │      │ Guardian (exit → owner only)     │
  │ lib/advisor   ranking + fit        │      │ LaunchFactory + CurveToken       │
  │ lib/idle      mainnet balances     │      └─────────▲────────────────────────┘
  └───────────────────────────────────┘                 │ keeper tx
  ┌───────────────────────────────────┐                 │
  │ worker/ (one Node process)        ├─────────────────┘
  │  indexer every 10 min             │
  │  judgePool (concurrency 4)        │──► cache/pools.json, cache/verdicts.json
  │  watchdog: poll testnet 1s        │──► cache/watch-events.jsonl
  └───────────────────────────────────┘
```

**Two processes, no database.** The worker does all background work and writes JSON under `cache/`. The Next.js app is a stateless reader of `cache/` and calls Jev directly only for user-initiated actions (intent parsing, advice). Worker state is rebuildable from chain events and DeFiLlama, so restarts are safe.

### Units

| Unit | Does | Depends on |
|---|---|---|
| `shared/types.ts` | All cross-unit types (§7.4). Orchestrator-owned. | — |
| `lib/indexer` | Fetch DeFiLlama `/pools`, keep `chain == "Monad"` and `tvlUsd ≥ 100_000`, normalize to `Pool`. | DeFiLlama, `classify` |
| `lib/classify` | `assetClass(symbol, project)` and `maturity(symbol)` rules (§6.2). Pure. | — |
| `lib/judge` | `parseIntent`, `judgePool`, `judgePosition`; state rendering; verdict combination rules. The only module that calls Jev. | Jev REST API |
| `lib/advisor` | `advise(intent, pools, verdicts) → Recommendation[]`. Pure. | types |
| `lib/idle` | `scan(address) → IdleReport` via mainnet RPC + DeFiLlama prices. | viem, token list |
| `contracts/` | Foundry project (§8). | OpenZeppelin v5 |
| `worker/` | indexer loop, pool judging, watchdog + keeper. | lib/*, viem |
| `app/` + `components/` | Pages, Field chart, verdict slip, tx state machine. | API routes, wagmi |

---

## 5. Visual design — "Field"

Chosen from three mockups built on the user's references (Tempo, Aave, Dragonfly, Inspora, uncut.wtf, landing.love). Mockups live in `.superpowers/brainstorm/` (not committed).

**Principles:** one signature visual instead of card grids; lots of air; quiet, confident type; the data *is* the illustration.

| Token | Value |
|---|---|
| Background | `#F6F5F1` (warm off-white) |
| Ink | `#16151A`; secondary text `#6B6974`; muted `#8B8894` |
| Hairlines / gridlines | `#E6E4DE` |
| Deposit | Monad purple `#6E54F5` (filled dot / stamp) |
| Avoid | Burnt orange `#E2552C` (filled dot) |
| Consider | Hollow ring `#B9B6C3` |
| Type | Geist (UI, headings at weight 500, tight tracking −0.035em), Geist Mono (numbers, captions, labels) |

**Field chart (hero, landing + Explore):** every pool is a dot. x = headline APY (0–30%, capped), y = log10(TVL), radius grows with TVL, color = Jev verdict. Thin leader-line annotations call out one DEPOSIT and one AVOID pool with their verdict and confidence. Hover shows pool, verdict, confidence; click opens the verdict slip. Mono caption: legend + "166 POOLS · 27 PROTOCOLS · $1.35B · X = APY · Y = TVL".

**Landing animation — "Weigh-in" (runs once per load, ~2 s):** dots fade in as grey rings (`#CFCCD6`) with a staggered start; a thin ink scan line (1 px, opacity ≤ 0.35) sweeps left to right; as it passes each dot, the dot takes its verdict color with a small scale pop (1 → 1.35 → 1, 320 ms); the two annotations fade in when the sweep ends. With `prefers-reduced-motion`, the final state renders immediately. Explore shows the chart without animation.

**Pulse dashboard** uses the same tokens: hairline-ruled tiles, Geist Mono numbers, verdict colors only for verdict data, no gradients.

**Verdict slip (borrowed from the "Object" mockup):** a paper-like card (`#FFFEFB`, soft shadow, dashed perforation) with pool name, an ink stamp of the verdict (DEPOSIT/CONSIDER/AVOID), rows for real APY, share from incentives, exit risk, TVL, Jev confidence, and the "why" flags. Used in Explore, Advisor and Watch.

**Closing slide** may reuse the "Signal" mockup's giant condensed wordmark.

Headline copy: "Every yield on Monad, weighed. Know which ones are real before you deposit."

---

## 6. Data

### 6.1 Sources

| Source | Use | Notes |
|---|---|---|
| DeFiLlama `https://yields.llama.fi/pools` | All pools | Free. Fields used: `pool, project, symbol, tvlUsd, apy, apyBase, apyReward, apyMean30d, apyPct7D, sigma, ilRisk, exposure, underlyingTokens, poolMeta` |
| DeFiLlama `https://yields.llama.fi/chart/{pool}` | 90-day history in the slip | On demand, cached per pool for 1h |
| DeFiLlama `https://coins.llama.fi/prices/current/monad:{addr},...` | Prices for the idle scan | |
| Monad mainnet RPC | Idle-scan balances (read-only) | Use Multicall3 if deployed on Monad (verify on the day), else parallel calls |
| Monad testnet RPC `https://testnet-rpc.monad.xyz` | Contracts, positions, watchdog | chain id 10143, explorer `testnet.monadexplorer.com` |
| Jev `POST https://api.typesafe.ai/v1/systemone` | Judgments | Bearer key, server-side only; `model: "jev-latest"` |

### 6.2 Asset-class rules (`lib/classify`, first match wins)

| Class | Symbol / project match |
|---|---|
| `gold` | symbol contains `XAUT` |
| `rwa` | symbol starts with `PT-`; or project in `centrifuge-protocol, midas-rwa`; or symbol contains `SYRUP`, `MROX` |
| `mon` | symbol contains `SHMON`, `SMON`, `GMON`, `WMON`, or equals `MON` |
| `btc_eth` | symbol contains `BTC`, `ETH` |
| `stable` | symbol contains any of `USD`, `AUSD`, `USDC`, `USDT`, `GHO`, `USDE` |
| `other` | everything else |

`maturity(symbol)`: parse `PT-<X>-<DDMONYYYY>` into an ISO date, else null.

### 6.3 Derived numbers (code, never Jev)
- `realApy = apyBase ?? 0` (percent).
- `incentiveShare = apy > 0 ? (apyReward ?? 0) / apy : 0`.
- `expectedReturnUsd = amount × realApy/100 × days/365` (days: short 30, medium 90, long 365).
- Snapshot files `fixtures/pools.json` and `fixtures/verdicts.json` are captured at H0 and committed; they are the offline fallback and the data every agent builds against first.

---

## 7. Jev integration (`lib/judge`)

**Rule:** code computes and renders facts as plain text; Jev answers atomic typed questions; code combines answers (Jev's "Composite Scoring" and "Confidence-Gated Routing" patterns). Jev returns `choice` + `confidence` + `probabilities`, `score` + `confidence`, or `noul` (0–1).

### 7.1 `parseIntent(text)`
State: the user's raw text. Amount and asset ticker are parsed by regex in code.

| Question | Type | Criteria |
|---|---|---|
| `risk_appetite` | choice | `low`, `medium`, `high` |
| `horizon` | choice | `short` (<1 month), `medium` (1–6 months), `long` (>6 months) |
| `asset_pref` | choice | `stable`, `gold`, `rwa`, `mon`, `btc_eth`, `any` |

Each answer renders as a chip; confidence < 0.6 shows "?" and asks the user to pick.

### 7.2 `judgePool(pool)` — one call per pool, cached by `poolId + statsHash`
State example (illustrative numbers): "Example Lending XAUt0 · Gold · TVL $1.2M · headline APY 15.68%: base 0.52%, rewards 15.16% (97% of headline) · 30-day mean 14.9% · volatility 0.8 · single asset, no IL."

| Question | Type | Criteria / instruction |
|---|---|---|
| `yield_source` | choice | `organic` (borrower interest, staking, real revenue), `incentive` (token emissions), `mixed` |
| `sustainable` | noul | "The headline APY is likely to persist for the next 30 days." |
| `risk` | score | 5 levels, lowest → highest: blue-chip protocol, large TVL, stable yield, single asset … tiny TVL, volatile or emission-driven yield, exotic asset |

**Combination (pure function, unit-tested):**
- `AVOID` if `risk ≥ 4` **or** (`yield_source = incentive` **and** `sustainable < 0.4`)
- `DEPOSIT` if `risk ≤ 2` **and** `yield_source ≠ incentive` **and** `sustainable ≥ 0.6`
- otherwise `CONSIDER`
- `confidence` = lowest confidence among the deciding answers (noul values are not confidences and are excluded); band: high ≥ 0.8, medium ≥ 0.6, else low ("Jev unsure — review yourself").
- `flags[]` = the deciding answers rendered as text, e.g. "Yield is 97% emissions (incentive, 0.93) · unlikely to persist (0.21)".

### 7.3 `judgePosition(position, stats, alternative)`
State example: "Holding 500 USDC in Clearstar USDC (mirror). APY at deposit 6.3%, now 0.9%. Utilization 92% (was 71%). Withdrawable liquidity 8% of vault. Best same-risk alternative: K3 USDC at 6.1%."

| Question | Type |
|---|---|
| `action` | choice: `hold`, `exit`, `rotate` |
| `withdrawal_risk` | noul: "The holder may soon be unable to withdraw in full." |
| `yield_collapse` | noul: "Yield has deteriorated materially since deposit." |

**Gating:**
- `exit` with confidence ≥ **0.9** and autopilot enabled → keeper calls `Guardian.exit` automatically.
- `exit` with confidence 0.6–0.9 → in-app alert with a one-click "Exit" (user-signed redeem).
- confidence < 0.6 → informational only.
- `rotate` is never automatic; it shows the suggested target and the user confirms.
- Re-judge only when |ΔAPY| > 50 bps or |Δutilization| > 500 bps since the last judgment.

### 7.4 Shared types (sketch for `shared/types.ts`)
```ts
type AssetClass = 'stable' | 'gold' | 'rwa' | 'mon' | 'btc_eth' | 'other';
type Choice<T extends string> = { value: T; confidence: number };

interface Pool {
  id: string; project: string; symbol: string; assetClass: AssetClass;
  tvlUsd: number; apy: number; apyBase: number; apyReward: number;
  apyMean30d: number | null; sigma: number | null;
  realApy: number; incentiveShare: number;
  apyPct7D: number | null;                              // 7-day APY change, for Pulse movers
  ilRisk: boolean; exposure: 'single' | 'multi';
  maturity: string | null; underlying: string[]; meta: string | null;
}
type VerdictLabel = 'DEPOSIT' | 'CONSIDER' | 'AVOID' | 'NOT_JUDGED';
interface Flag { key: 'yield_source' | 'sustainable' | 'risk'; text: string; confidence?: number }
interface Verdict {
  poolId: string; label: VerdictLabel; confidence: number;
  risk: number | null;                                  // Jev risk score 1–5, used by the advisor
  yieldSource: 'organic' | 'incentive' | 'mixed' | null;
  band: 'high' | 'medium' | 'low'; flags: Flag[]; statsHash: string; judgedAt: string;
}
interface Intent {
  text: string; amount: number | null; asset: string | null;
  risk: Choice<'low' | 'medium' | 'high'>;
  horizon: Choice<'short' | 'medium' | 'long'>;
  assetPref: Choice<AssetClass | 'any'>;
}
interface Recommendation {
  pool: Pool; verdict: Verdict; realApy: number; expectedReturnUsd: number;
  fitReasons: string[]; mirrorVault: `0x${string}` | null; // where Deposit goes
}
interface Holding { symbol: string; token: `0x${string}`; amount: number; usd: number; assetClass: AssetClass; earning: boolean }
interface IdleReport {
  address: `0x${string}`; holdings: Holding[]; idleUsd: number;
  potentialYearlyUsd: number; suggestions: Recommendation[]; asOf: string;
}
interface PositionJudgment {
  action: Choice<'hold' | 'exit' | 'rotate'>; withdrawalRisk: number;
  yieldCollapse: number; statsHash: string; at: string;
}
interface Position {
  vault: `0x${string}`; mirrorOf: string; shares: string; assets: string;
  apyBps: number; utilBps: number; autopilot: boolean; judgment: PositionJudgment | null;
}
interface WatchEvent {
  id: string; at: string; vault: `0x${string}`; owner?: `0x${string}`;
  type: 'stats_changed' | 'judged' | 'alert' | 'exit_sent' | 'exit_confirmed' | 'exit_failed';
  message: string; txHash?: `0x${string}`; confidence?: number;
}
```

### 7.5 Advisor ranking (`lib/advisor`, pure)
1. Filter by `assetPref` (unless `any`).
2. Drop pools above the user's risk appetite (low → Jev risk ≤ 2, medium → ≤ 3, high → any) and `AVOID` verdicts.
3. Drop pools whose `maturity` is later than the horizon end.
4. Rank by `realApy` descending, tiebreak by `tvlUsd`. Return top 3 with `fitReasons`.
5. `mirrorVault` is set when the pool is one of the four mirrored vaults; otherwise the slip shows "Deposit via testnet mirror of the closest match" pointing at the best-matching mirror.

---

## 8. Contracts (Foundry, Solidity 0.8.24, OpenZeppelin v5, Monad testnet)

### 8.1 `MockUSDC`
ERC-20, 6 decimals, `mint(address to, uint256 amount)` open to anyone (testnet faucet; the app has a "Get test USDC" button).

### 8.2 `MirrorVault` (×4)
OpenZeppelin `ERC4626` over MockUSDC, plus:
- Storage: `string mirrorOf` (e.g. "Clearstar USDC · Euler"), `uint16 apyBps`, `uint16 utilizationBps`, `address admin`, `uint256 lastAccrual`.
- `setStats(uint16 apyBps, uint16 utilizationBps)` — admin only; accrues first; emits `StatsUpdated(apyBps, utilizationBps, block.timestamp)`.
- **Real accrual:** `_accrue()` mints `rawAssets × apyBps × elapsed / (365 days × 10_000)` MockUSDC into the vault; called before deposit/mint/withdraw/redeem and in `setStats`. `totalAssets()` includes pending (not yet minted) interest so previews are accurate.
- **Real exit risk:** `availableLiquidity() = totalAssets() × (10_000 − utilizationBps) / 10_000`; `maxWithdraw(owner)` and `maxRedeem(owner)` are capped by it.
- The four mirrors are all USDC-denominated. Pick them on the day from real Monad vaults that Jev rates DEPOSIT/CONSIDER, covering the named curators where possible: Clearstar (Euler), K3 (Euler), one Morpho USDC vault, and one USDC-denominated RWA strategy (e.g. syrupUSDC or Centrifuge USDC). Seed `apyBps` from the real vault's `apyBase`; real utilization is not available from DeFiLlama, so seed `utilizationBps` at 7_100 and label it a demo default.

### 8.3 `Guardian`
- `constructor(address admin, address keeper)`; `setVaultApproved(address vault, bool ok)` admin only.
- `enable(address vault)` / `disable(address vault)` — called by the position owner. The owner also approves Guardian on the vault's share token.
- `exit(address vault, address owner)` — keeper only; requires vault approved and `enabled[owner][vault]`; `shares = min(balanceOf(owner), maxRedeem(owner), allowance(owner, guardian))`; requires `shares > 0`; calls `vault.redeem(shares, owner, owner)`; emits `Exited(owner, vault, shares, assets)`.
- Events: `Enabled(owner, vault)`, `Disabled(owner, vault)`, `Exited(owner, vault, shares, assets)`.

**Invariants (each covered by a test):**
1. Assets always go to the owner — `exit` has no receiver parameter.
2. Guardian never holds funds — `redeem` pays the owner directly.
3. Only the keeper can call `exit`, only for enabled owner/vault pairs, only for approved vaults.
4. The owner can stop it at any time (`disable` or revoke allowance).

Worst case if the keeper key leaks: users are moved out of a vault into their own wallets.

### 8.4 `LaunchFactory` + `CurveToken`
- `LaunchFactory.create(string name, string symbol, address reserveVault) → address token`; `reserveVault` must be Guardian-approved. The UI pre-selects the vault Jev rates best for the chosen reserve type.
- `CurveToken` (ERC-20, 18 decimals): linear curve `price(s) = p0 + k·s` in MockUSDC.
  - `buy(uint256 usdcIn, uint256 minTokensOut)` — mints tokens per the curve integral, deposits `usdcIn` into `reserveVault`, holds the shares.
  - `sell(uint256 tokensIn, uint256 minUsdcOut)` — burns, pays the curve integral by redeeming from the vault.
  - `reserveAssets()` = `reserveVault.convertToAssets(shares held)`; `floorPrice()` = `reserveAssets() / totalSupply()`.
  - Yield accrued in the vault is surplus above the curve integral; sells pay only the integral, so the surplus stays and **the floor rises over time**.
  - Optional if time permits: `protectReserve()` callable by the keeper, redeeming all reserve shares to idle USDC inside the token contract (same "funds never leave the owner" rule).
- No fees, no graduation to a DEX (testnet DEX liquidity is empty).

### 8.5 Deployment
One Foundry script deploys MockUSDC, four MirrorVaults (seeded as above), Guardian (approves the four vaults), and LaunchFactory if built; writes `shared/addresses.testnet.json`. Wallets (two are enough): **operator** = deployer + admin + keeper, a server-side key in `.env`; **demo user** = the browser wallet used on stage. Both funded with testnet MON beforehand. Guardian is deployed with `admin = keeper = operator`.

---

## 9. API routes and data flow

| Route | Returns |
|---|---|
| `GET /api/pools?asset=&protocol=` | `{ pools: Pool[], verdicts: Record<string, Verdict>, asOf }` |
| `GET /api/pools/[id]` | `{ pool, verdict, history: {t: string, apy: number, tvlUsd: number}[] }` |
| `POST /api/intent` `{ text }` | `Intent` |
| `POST /api/advise` `{ intent }` | `{ recommendations: Recommendation[] }` |
| `GET /api/scan/[address]` | `IdleReport` |
| `GET /api/positions/[address]` | `{ positions: Position[] }` |
| `GET /api/watch/stream` | Server-sent events of `WatchEvent` (tails `cache/watch-events.jsonl`) |

- Launch uses no API routes: the browser signs `create`, `buy`, `sell` directly.
- `POST /api/admin/stats` `{ vault, apyBps, utilBps }` with header `x-admin-token` → sends `setStats` from the operator key, waits for the receipt, returns `{ txHash, block, seconds }`.
- Secrets (`TYPESAFE_API_KEY`, `OPERATOR_PRIVATE_KEY`, `ADMIN_TOKEN`) live only in server `.env`; never in client bundles.
- Idle-scan token list: MON (native), WMON, USDC, AUSD, USDT0, XAUt0, shMON, sMON, gMON, WBTC, WETH. Addresses are researched (Grok) then verified by calling `symbol()`/`decimals()` before use. shMON/sMON/gMON count as `earning: true`.
- `potentialYearlyUsd` = Σ idle holding × best `realApy` among DEPOSIT pools of the same asset class.

### Watchdog loop (`worker/watchdog`)
1. Every 1 s: read new `StatsUpdated` logs from the four mirrors and `Enabled`/`Disabled` logs from Guardian.
2. For each enabled position whose vault stats crossed the re-judge threshold: build state (§7.3), call `judgePosition`, append a `judged` event.
3. Apply gating (§7.3). For auto-exit: send `Guardian.exit` from the keeper, append `exit_sent`, wait for the receipt, append `exit_confirmed` (with measured seconds) or `exit_failed` (with reason; at most 2 retries).

---

## 10. Transactions: real vs simulated

**Real testnet transactions (wallet popup, signature, receipt):** get test USDC (`mint`), deposit (`approve` → `deposit`), withdraw (`redeem`), enable autopilot (share `approve` → `Guardian.enable`), admin `setStats` and Guardian `exit` (both signed server-side by the operator key; the UI still shows hash, explorer link and receipt), Launch `create`/`buy`/`sell`.

**UI rule — no fake success.** Every transactional button runs this state machine (wagmi `useWriteContract` + `useWaitForTransactionReceipt`):
`idle → awaiting signature → pending (tx hash + explorer link) → confirmed ("Confirmed in 0.6s · block N") | failed (reason) | cancelled (user rejected)`.
Success is shown only after a receipt with `status = success`; balances are re-read from chain after every receipt.

**Real data:** pool APY/TVL/history (DeFiLlama, mainnet), idle-scan balances (mainnet RPC), Jev verdicts (live API).

**Simulated and labeled in the UI:** the mirror vaults themselves ("Testnet mirror · Clearstar USDC (Euler)"), interest paid in test USDC, and the stress event triggered from `/app/admin`. Everything after the stress event (detection, Jev call, Guardian tx) is real.

Pitch line: "Real data, real decisions, real transactions on testnet. The only thing we control is the vault's stress event."

---

## 11. Failure handling

| Failure | Behavior |
|---|---|
| DeFiLlama down | Serve last cache, else fixtures; show "data as of HH:MM". |
| Jev down / >8 s timeout | Cards show "not judged" (grey); ranking falls back to `realApy`; intent chips become manual pickers. **Nothing auto-executes without a Jev answer.** Watchdog falls back to one rule: utilization > 95% → alert suggesting exit (no auto-exit). |
| Mainnet RPC fails on scan | One retry, then "Couldn't read this wallet". The demo whale's report is also in fixtures. |
| Keeper exit fails | `exit_failed` event, red alert "Exit failed: vault locked" (or the revert reason); at most 2 retries. |
| Worker crashes | Run under `node --watch`; state rebuilds from chain logs and cache. |
| Venue Wi-Fi down | `OFFLINE=1` serves pools, verdicts and scan from fixtures; only testnet txs need network (phone hotspot backup). |
| Wallet rejection | UI shows "Cancelled", never success. |

---

## 12. Testing (only what protects the demo)

- **Foundry:** Guardian — exit pays owner; reverts for non-keeper, non-enabled pair, unapproved vault; partial exit when liquidity is capped. MirrorVault — accrual raises share price; `maxWithdraw` follows utilization. CurveToken (if built) — floor price only rises as the vault accrues; buy/sell round-trip respects the curve.
- **Vitest (offline, on fixtures):** `classify` rules; verdict combination rules; advisor ranking and filters; `incentiveShare`/`realApy` derivation.
- **Jev calibration (live, run manually once):** five golden pools with expected verdicts (an emission-heavy pool → AVOID; Accountable AUSD → DEPOSIT; etc.). Adjust thresholds in §7 if they disagree.
- **Manual end-to-end:** the demo script (§13) as a checklist, plus wallet-rejection shows "Cancelled".

---

## 13. Demo script (3 minutes)

| Time | Screen | Beat |
|---|---|---|
| 0:00 | Landing (Field) | "Monad has 166 pools holding $1.35B. Many headline APYs are mostly emissions. Which ones are real?" Hover the orange dot → AVOID 0.88. |
| 0:20 | Scan | Paste the whale address → "$X idle, could earn $Y a year." (real numbers from the chosen whale) |
| 0:50 | Advisor | "500 USDC, safe, 3 months" → chips with confidence → top 3 slips → Deposit → wallet → "Confirmed in 0.6s." |
| 1:30 | Watch | Enable autopilot (sign). Admin tab: utilization 71% → 92%. ~2 s later: "Jev: exit (0.94)" → Guardian tx → "You're out." Admin: 100% → "Vault locked. We were already out." |
| 2:30 | Launch (if built) | Token backed by a Clearstar-mirror reserve, floor price ticking up. |
| 2:50 | Close | QR code to the deployed app. "Real data, real decisions, real transactions." |

Say out loud during the pitch: repo link, contract address, live URL, network (required for prize eligibility). Backup: the 4:15 demo video.

---

## 14. Build plan (11:30 AM–5:30 PM IST; feature freeze 3:30)

| Clock | Orchestrator (Opus) | A — Sonnet | B — Codex gpt-6.1-sol | C — Sonnet | R — Grok |
|---|---|---|---|---|---|
| 11:30–11:50 | Create `~/code/personal/tare` and the public GitHub repo, skeleton, `shared/`, fixtures, agents, `blitz.yml`, deps | | | | Token decimals, Jev limits |
| 11:50–1:15 | Read reports | Contracts + tests + testnet deploy + verify (`builder-deep`) | indexer, classify, judge, advisor, idle (high) | Field landing, tokens, app shell (`builder-deep`) | |
| 1:15 | **CP1**, push; teaser post | | | | |
| 1:15–2:30 | Integration fixes | Worker (`builder`) | API routes; Jev over all pools · second tab: Launch contracts | Explore, Advisor, Watch (`builder`) · Pulse (`builder-deep`) | |
| 2:30 | **CP2**: full demo run, push | | | | |
| 2:30–3:30 | Fixes | Admin, phone pass (`builder-light`) | Launch page | | |
| 3:30 | **Feature freeze** | | | | |
| 3:30–5:30 | Mainnet deploy + verify, Vercel + custom domain, README, demo video, ad video, posts, 2 rehearsals | | | | |
| 5:30 / 5:45 | Code freeze / submit | | | | |

**Deployed site** runs from fixtures for browsing and does real testnet transactions; the live watchdog runs on the laptop for the stage moment.

**If behind at 3:30:** Pulse and Launch are both planned; whatever isn't working is hidden and not announced (the rubric scores announced features). Cheap fallbacks first: pool history chart → Explore filters. **Never cut:** Field landing, scan, advisor + deposit, watchdog exit.

---

### Judging rubric (organizers, Pune V3; no peer voting; max 400)
- **Basic 100 (required for prizes):** public GitHub repo 25 · README with live URL + contract address 25 · contracts on Monad testnet 25 · publicly hosted 25.
- **Working 100:** all announced functions work 25 · live on-chain tx during the demo 25 · contracts verified on the explorer 25 · runnable from the README without help 25.
- **Build in public 100:** X/LinkedIn post tagging @monad @monad_dev @geeky_kartikey 25 · demo video (30 s+) posted 25 · creative ad video posted 25 · 5K+ combined views by 5:45 PM 25.
- **Bonus 100:** contracts on Monad mainnet 25 · custom domain 15 · pre-market fit ≤20 · revenue potential ≤20 · innovation ≤20.

Plan: go for every item. Contracts are also deployed and verified on mainnet; user transactions in the app stay on testnet.

## 15. Build orchestration

### Repositories
- **This repo (`~/code/personal/monad-blitz-research`) is research only.** It holds the spec, the plan and the brainstorm mockups. No product code goes here.
- **The product is built in a new repo at `~/code/personal/tare`**, created at H0 by the orchestrator (`git init`), with this spec and the implementation plan copied into its `docs/` so every build agent reads them from inside the project. The build-day Claude Code session, all OMP workers and all terminal tabs run with `~/code/personal/tare` as their working directory.

### Roles
- **Orchestrator:** Claude Code desktop app on the Claude subscription. Opus 5.5 at medium by default, high for planning, checkpoints and hard bugs. **Claude is never signed into OMP** (Anthropic's terms restrict subscription OAuth to Anthropic's own apps).
- **Claude workers:** `.claude/agents/builder-light.md` (Sonnet 5.5, low), `builder.md` (Sonnet 5.5, medium), `builder-deep.md` (Sonnet 5.5, high).
- **GPT and Grok workers via OMP**, one worker per visible terminal tab:
  - GPT: `omp --config .omp/blitz.yml --model openai-codex/gpt-6.1-sol --thinking high --approval-mode write "<brief>"`
  - Grok research (read-only): `omp --config .omp/blitz.yml --model xai-oauth/grok-4.6 --thinking high --tools read,web_search "<question>"`
- **Fallback if OMP misbehaves** (both tested on 2026-10-09): `codex -c sandbox_workspace_write.network_access=true -s workspace-write -a on-request "<brief>"` and `grok --permission-mode default "<question>"`, launched in visible tabs (they do not authenticate from the orchestrator's sandboxed shell).

### `.omp/blitz.yml`
```yaml
modelRoles:
  default: openai-codex/gpt-6.1-sol:high
  task: openai-codex/gpt-6.1-sol:medium
  smol: openai-codex/gpt-6.1-sol:medium   # never gpt-6-astra
tools:
  approvalMode: write
task:
  maxConcurrency: 2
  speculativeLaunch: false
bash:
  patterns:   # run without a prompt; every other shell command asks
    - { match: "pnpm vitest*", approval: allow }
    - { match: "pnpm test*", approval: allow }
    - { match: "pnpm tsc*", approval: allow }
    - { match: "pnpm exec tsc*", approval: allow }
    - { match: "pnpm lint*", approval: allow }
    - { match: "forge build*", approval: allow }
    - { match: "forge test*", approval: allow }
    - { match: "node *", approval: allow }
    - { match: "git status*", approval: allow }
    - { match: "git diff*", approval: allow }
```
Reason: the global OMP config uses `approvalMode: yolo`; the overlay sets `write` for these runs only, without touching the user's global settings.

**Verified in the dry run (2026-10-10, OMP v18.6.1):**
- `--config .omp/blitz.yml` and `--model` are honored. The status bar shows `GPT-6.1-Sol` or `Grok 4.6`, never Astra.
- `--approval-mode write` applies file edits and writes without asking and shows each diff in the tab. Every shell command shows an Approve/Deny prompt unless it matches an `allow` pattern above.
- An `allow` pattern is ignored when the command contains shell metacharacters such as `( ) ; | &` or `$`, even inside double quotes, so that command prompts. Briefs should ask for plain commands (`pnpm vitest run lib/x.test.ts`).
- Grok with `--tools read,web_search` searched the web and answered correctly. It had no write or shell tools.
- Reports land at `reports/<task-id>.md` in the §15 format.
- OMP 18.8.7 is available. Update before the day or not at all, and repeat this dry run after any update.

### Ownership (one working copy)
| Owner | Paths |
|---|---|
| Orchestrator only | `shared/`, `package.json`, lockfile, `.env*`, root configs, `fixtures/` |
| Stream A | `contracts/` (except `contracts/launch/`), `worker/` |
| Stream B | `lib/`, `app/api/` |
| Stream C | `app/(site)/`, `app/(app)/` (except `launch/`), `components/`, `styles/` |
| Launch | `contracts/launch/`, `app/(app)/launch/` |

Workers never install dependencies; they request them under `needs:` in their report.

### Report format — `reports/<task-id>.md` (5–8 lines; the only thing the orchestrator reads)
```
task: B2 · judge + advisor
status: done            # done | partial | blocked
files: lib/judge.ts, lib/advisor.ts, lib/advisor.test.ts
tests: vitest 14/14
needs: none             # deps, type changes, or decisions requested
```

### Monad reference skills
`npx skills add therealharpaljadeja/monskills` is installed into the build repo at T0 (`.claude/skills/`) for gas, address and chain-behavior notes. Where it disagrees with this spec, this spec wins: wagmi with injected wallets (not Para), `forge script` deploys with the operator key (not Alchemy Agent Wallet), no Envio indexer.

### Token rules
Every brief names exact files and types and says "don't explore the repo"; build against fixtures first; no cross-model reviews; two failed attempts → the orchestrator takes over; one task per tab, close it when done.

---

## 16. Before the day (setup only, no project code)

- [x] `omp login` — GPT accounts (`openai-codex`) and `xai-oauth`
- [x] Orchestrator runs in the Claude Code desktop app (no tmux needed)
- [x] Dry run: one GPT and one Grok worker via `blitz.yml` on a dummy task. Done 2026-10-10; results are in §15 under "Verified in the dry run".
- [x] Codex daemon prompt: no action needed. Workers run through OMP; if the plain `codex` fallback is ever used and the prompt appears, choose "Run without daemon this time".
- [x] TypeSafe API key with credits
- [x] Two testnet wallets (operator, demo user) — confirm both hold well over 10 testnet MON (`faucet.monad.xyz`), because Monad keeps a 10 MON reserve floor per account
- [x] Whale address for the scan demo: `0xf70da97812cb96acdf810712aa562db8dfa3dbef` (~$1.06M idle on 2026-10-10: 820k USDC, 8.4M MON); backup `0xe3322c79ebc96bb4d91a10af9ab9298b739e33c7` (~$77k USDC)
- [x] Vercel account ready

## 17. To verify on the day (first 30 minutes, mostly Grok research)

- ~~AI-assisted coding is allowed~~ — confirmed: the agenda includes "Build with AI & Monskills".
- ~~Multicall3 address on Monad mainnet~~ — verified: `0xcA11bde05977b3631167028862bE2a173976CA11` is deployed (2026-10-10).
- Mainnet token addresses: USDC, AUSD, USDT0, WMON, XAUt0 verified on-chain 2026-10-10 (listed in the plan, Task T0); verify shMON, sMON, gMON, WBTC, WETH at T0.
- Jev rate limits, pricing and latency (judging ~166 pools at concurrency 4).
- Which four real vaults to mirror (§8.2).
