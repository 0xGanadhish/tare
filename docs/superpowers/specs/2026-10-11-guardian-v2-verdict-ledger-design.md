# Guardian v2 and the Verdict Ledger: Design Spec

**Date:** 2026-10-11
**Status:** Design approved section by section in the project thread (superpowers:brainstorming, architectural path). This spec is the source of truth for the implementation plan.
**Target:** Monad Metropolis, Track 01 Onchain Finance & Trading. Submission deadline 2026-10-14 09:29 IST, with about half a day reserved for README, LICENSE, disclosures and the demo video.
**Foundation:** everything in the repo at `7f90aaf` was built at Monad Blitz Pune V3 (10 Oct 2026) and is named as pre-existing in the README. This spec describes the new work.

---

## 1. Intent

### What we are building
We are turning Tare's Guardian from a demo protected by one hot key into a **verifiable, keeperless risk system that runs on real money**:

- Every position verdict Jev makes is posted onchain to a public **risk oracle**, along with a hash of exactly what Jev was shown.
- **Anyone** can trigger a protective exit. The Guardian contract enforces every rule itself, and funds can only ever go to the position owner.
- Every verdict is later **graded onchain by anyone**, so Tare builds a public track record it cannot edit or flatter. This is the **Verdict Ledger**, a candidate standalone product.
- The backend runs 24/7 on **Cloudflare**, not on a laptop.
- **Envio** indexes real vault flows (input to Jev) and Tare's own events (the ledger and Watch feeds).
- The app gets an Aave-style **Testnet / Mainnet switch**. Mainnet allows real deposits into approved vaults.

### Who it is for
- Monad users with idle stablecoins who want yield without watching positions.
- Protocols, wallets and funds that want to read a public, graded risk feed (later: API, white-label Guardian).
- Hackathon judges, investors and possible acquirers, who need to verify every claim onchain.

### Success criteria
1. One **real mainnet exit** through GuardianV2 on a real ERC-4626 vault (Euler or Morpho USDC), linked to the oracle verdict that justified it.
2. The **testnet stress demo** still works end to end on the new contracts: stress the mirror, verdict posted, exit lands, Watch shows both transactions.
3. Every verdict is publicly checkable: its oracle tx, the exact state text in public R2, and its onchain grade once the window closes.
4. The backend runs without the laptop. `/health` shows fresh verdicts.
5. The app switches networks cleanly, and nothing transactional on mainnet touches mock contracts.

### Constraints and principles carried over
- Jev answers typed questions. Fixed rules in code and contracts turn answers into actions. Jev never holds keys.
- Funds can only ever go to the owner.
- Fail safe: when anything is down, exits become *harder*, never easier.
- Testnet-only features (faucet, demo controls, Launch) never appear on mainnet.

---

## 2. Scope

### In scope (build order)
1. **Contracts:** `TareRiskOracle`, `GuardianV2`, `LiquidityAdapter`s; deployed on testnet (10143) and mainnet (143).
2. **Cloudflare backend:** pool scan, vault watchers, verdict posting, exit queue, tx sender, public API, health.
3. **Envio indexer:** Tare events and real-vault flows, both networks.
4. **App:** network switch, per-network config, deposit + protect flow, Watch v2, Ledger page.

### Out of scope (the "next" slide)
- Onchain liquidity circuit breaker (exit without any verdict).
- EIP-7702 delegated exits.
- Pool-verdict Merkle epochs (the 166 pool verdicts stay offchain in D1/R2 for now).
- Nansen wallet labels (unless confirmed cheap after core ships).
- API keys, SLAs, a multi-chain ledger, an SDK.
- Privy/Dynamic embedded wallets.
- Moving the Next.js app off Vercel.

---

## 3. Architecture

```
            Real ERC-4626 vaults (mainnet)        MirrorVaults (testnet)
                     │ Deposit/Withdraw events            │ stats
                     ▼                                    │
   ┌──────────── Envio HyperIndex (10143 + 143) ──────────┼──────────┐
   │ VaultFlow (hourly), Verdict, Resolution, Protection, │ Exit     │
   └───────┬──────────────────────────────────────────────┼──────┬───┘
           │ GraphQL (flows, opted-in users)              │      │ GraphQL
           ▼                                              ▼      ▼
   ┌──────────────── Cloudflare backend ────────────────────┐   Next.js app (Vercel)
   │ Cron: pool scan → Jev → D1                             │   network switch, Advisor,
   │ DO VaultWatcher (per vault): read stats (Alchemy RPC)  │   Deposit+Protect, Watch,
   │   → re-judge? → Jev → R2 state → oracle.post           │   Ledger
   │   → EXIT? → Queue exit jobs                            │        │ wallet txs (wagmi)
   │ Queue consumer → simulate → DO TxSender → Guardian.exit│        ▼
   │ Cron: resolve() due verdicts                           │   TareRiskOracle · GuardianV2
   │ HTTP API: /v1/*, /health                               │   (both networks)
   └─────────────────────────────────────────────────────────┘
```

Units (each one has a single purpose and can be tested on its own):

| Unit | Does | Depends on |
|---|---|---|
| `contracts/src/TareRiskOracle.sol` | Stores verdicts, snapshots vault metrics, grades outcomes | ERC-4626, `ILiquidityAdapter` |
| `contracts/src/GuardianV2.sol` | Permissionless, rule-checked exits to the owner | Oracle, ERC-4626 |
| `contracts/src/adapters/*` | Available-liquidity reading per vault type | vault |
| `backend/` (Cloudflare Worker) | Scan, watch, judge, post, exit, resolve, serve API | `lib/judge`, viem, Envio, Alchemy, D1, R2, Queues |
| `indexer/` (Envio) | Index Tare events + vault flows | contract ABIs |
| `shared/networks.ts` | One config object per network | addresses JSON |
| `app/` + `components/` | UI | backend API, Envio, wagmi |

Reused unchanged: `lib/judge` (state rendering, Jev calls, combination), `lib/judge/gating.ts` re-judge thresholds, `lib/indexer`, `lib/classify`, `lib/advisor`.

---

## 4. Contracts

Solidity 0.8.24, OpenZeppelin v5, Foundry. The same bytecode ships on both networks. v1 contracts stay deployed as history.

### 4.1 `TareRiskOracle`

```solidity
enum Verdict { HOLD, EXIT, MOVE }

struct Post {
    address vault;
    Verdict verdict;
    uint16  confidenceBps;   // Jev's confidence in `verdict`, 0..10000
    uint16  riskBps;         // Jev's withdrawal_risk probability, 0..10000 (the graded forecast)
    bytes32 stateHash;       // keccak256 of the exact state text + questions + answers JSON (archived in R2)
    uint64  postedAt;
    uint256 ppsAtPost;       // vault.convertToAssets(10**vault.decimals())
    uint256 assetsAtPost;    // vault.totalAssets()
    uint256 liquidityAtPost; // adapter.availableLiquidity(vault), or type(uint256).max if no adapter
}

struct Resolution { bool resolved; bool adverse; uint8 reasons; uint64 resolvedAt; }
```

- `post(vault, verdict, confidenceBps, riskBps, stateHash) returns (uint256 id)`: attester only. The vault must be registered. Takes the snapshots, stores `posts[id]`, sets `latest[vault] = id`, and emits `VerdictPosted(id, vault, verdict, confidenceBps, riskBps, stateHash, postedAt)`.
- `resolve(uint256 id)`: **permissionless**. Requires `block.timestamp >= postedAt + resolveWindow` and that the post is not yet resolved. Reads current metrics and sets `adverse` if any of:
  - share price fell more than `PPS_DROP_BPS = 50` (0.5%) vs `ppsAtPost`
  - total assets fell more than `TVL_DROP_BPS = 2000` (20%) vs `assetsAtPost`
  - an adapter exists and available liquidity is below `LIQ_FLOOR_BPS = 500` (5%) of total assets

  `reasons` is a bitmask of which criteria fired. Emits `VerdictResolved(id, adverse, reasons)`.
- `registerVault(vault, adapter)`: owner only. The adapter can be `address(0)`. An adapter **cannot be changed once the vault has a post**, so grading rules can't be swapped after the fact.
- `setAttester(address)`: owner only, emits `AttesterChanged`.
- `resolveWindow`: immutable constructor argument. Testnet 1 hour, mainnet 24 hours.
- Views: `latest(vault)`, `getPost(id)`, `getResolution(id)`, `postCount()`.

**Known limitation (documented on the Ledger page):** grading compares the start and end of the window only, so a crunch that recovers inside the window is not counted as adverse.

### 4.2 `ILiquidityAdapter` and adapters

`availableLiquidity(address vault) view returns (uint256 assets)`

- `MirrorAdapter`: returns `MirrorVault.availableLiquidity()`.
- `EulerAdapter`: returns the EVK vault's `cash()`.
- Morpho (MetaMorpho) vaults register with no adapter at first; their grading uses the share-price and TVL criteria only.

### 4.3 `GuardianV2`

```solidity
struct Rule { bool enabled; uint16 minConfidenceBps; uint32 maxAge; uint64 enabledAt; }
mapping(address owner => mapping(address vault => Rule)) public rules;
```

- `enable(vault, minConfidenceBps, maxAge)`: requires `8000 <= minConfidenceBps <= 9900`, `60 <= maxAge <= 3600`, and the vault approved. Sets `enabledAt = block.timestamp`. Emits `Enabled(owner, vault, minConfidenceBps, maxAge)`. Calling it again updates the rule and resets `enabledAt`.
- `disable(vault)`: emits `Disabled`.
- `exit(vault, owner) returns (uint256 assets)`: **anyone** may call. Reverts unless all of these hold:
  1. `approvedVault[vault]`
  2. `rules[owner][vault].enabled`
  3. `id = oracle.latest(vault)` exists and has `verdict == EXIT`
  4. `confidenceBps >= rule.minConfidenceBps`
  5. `block.timestamp - postedAt <= rule.maxAge` (fresh)
  6. `postedAt >= rule.enabledAt` (posted after the user opted in)

  Then: `shares = min(balanceOf(owner), maxRedeem(owner), allowance(owner, this))`; revert `NothingToExit` if zero; `assets = vault.redeem(shares, owner, owner)`. Emits `Exited(owner, vault, id, msg.sender, shares, assets, remainingShares)`.
- `setVaultApproved(vault, ok)`: admin only. The admin has no other power.
- `oracle`: immutable.

**Invariants (tested):**
- The underlying asset only moves vault → owner.
- Guardian never holds tokens.
- Only the six conditions above gate `exit`. The caller's identity is irrelevant.

### 4.4 Keys and roles

| Role | Holder now | Power |
|---|---|---|
| Oracle owner / Guardian admin | Ganadhish's wallet (Safe later) | Register and approve vaults, rotate the attester |
| Attester | Cloudflare secret, one per network | Post verdicts only |
| Executor | Cloudflare secret, one per network | Pays gas for `exit` and `resolve`. No special rights; anyone could do the same |

Mainnet keys are never testnet keys.

### 4.5 Contract tests (Foundry)
- One unit test per revert path of `enable`, `exit`, `post`, `resolve` and `registerVault`.
- Fuzz test: for random callers, amounts and rules, the owner's asset balance after `exit` equals before plus `assets`, the caller's balance is unchanged, and Guardian's balance stays 0.
- Partial exit when liquidity is capped (MirrorVault at 99% utilization).
- `resolve` truth table: each criterion alone, none, all, and the no-adapter case.
- Mainnet fork test: register a real Euler USDC vault and a real Morpho USDC vault, deposit, enable, post EXIT, `exit` from a random address, then assert redeem-by-allowance works and funds land with the owner.

---

## 5. Cloudflare backend (`backend/`)

One Worker project (TypeScript, wrangler). Every row and object key carries `network: 'testnet' | 'mainnet'`.

| Component | Cloudflare primitive | Behaviour |
|---|---|---|
| Pool scan | Cron Trigger, every 10 min | `lib/indexer` → `judgePool` (concurrency 4, cached by `poolId + statsHash`) → D1 `pools`, `pool_verdicts` |
| Vault watcher | Durable Object per (network, vault), alarm every 5 s on testnet and 30 s on mainnet | Read stats over Alchemy RPC: share price, total assets, adapter liquidity, plus `apyBps`/`utilBps` for mirrors. Read the last hour of flows from Envio. If `shouldRejudge` (existing thresholds), or net outflow in the last hour is above 10% of TVL, or no post exists, then render state → `judgePosition` → write JSON to R2 `state/{stateHash}.json` → `oracle.post` via TxSender → if EXIT, enqueue exit jobs |
| Exit queue | Queue `exits`, message `{network, vault, owner, verdictId}` | Consumer: `eth_call` simulate `exit`; if it would revert, record the reason and ack. Otherwise send via TxSender. Idempotency key `verdictId:owner` in D1. Max 3 retries with backoff, then dead-letter → `exit_failed` event |
| Tx sender | Durable Object per (network, key) | Serializes txs for one key: nonce, `estimateGas × 1.15` as an explicit gas limit (Monad bills the gas limit), wait for receipt, record in D1 |
| Resolver | Cron, every 5 min | Find posts in D1 (backfilled from Envio) past their window and not yet resolved → `resolve(id)` via TxSender |
| API | Worker fetch handler | `GET /v1/pools`, `/v1/pools/:id`, `/v1/verdicts?network=&vault=&cursor=`, `/v1/vaults/:network/:vault/latest`, `/v1/ledger/score?network=`, `/v1/events/:network/:owner` (polling), `/health`. Read-only, CORS open |
| Demo controls | `POST /v1/admin/stats` (`ADMIN_TOKEN`), **testnet only**; returns 404 on mainnet | Calls `MirrorVault.setStats` |

Who gets exit jobs: owners from Envio `Protection` entities with `enabled = true` for that vault whose `minConfidenceBps <= confidenceBps`. Freshness and post-after-enable are left to the contract and the simulation.

Alert path (offchain, unchanged meaning): an EXIT with confidence between 0.6 and the user's threshold, or between 0.6 and 0.9 for non-protected holders, becomes an `alert` event on Watch with a one-click user exit.

### 5.1 Storage
- **D1 tables:** `pools`, `pool_verdicts`, `posts` (mirror of onchain posts + tx hash), `exits`, `events`, `tx_log`, `idempotency`.
- **R2 (public bucket, `ledger.tarefi.xyz`):** `state/{stateHash}.json` holding the state text, questions, Jev's raw answers, model id and timestamp. Anyone can re-hash it and compare with the onchain `stateHash`.

### 5.2 Secrets
`TYPESAFE_API_KEY`, `ALCHEMY_URL_TESTNET`, `ALCHEMY_URL_MAINNET`, `ATTESTER_KEY_TESTNET`, `ATTESTER_KEY_MAINNET`, `EXECUTOR_KEY_TESTNET`, `EXECUTOR_KEY_MAINNET`, `ADMIN_TOKEN`, `ENVIO_GRAPHQL_URL`.

### 5.3 Failure behaviour

| Failure | Behaviour |
|---|---|
| Jev unreachable or errors | No post (so no exit is possible). Event `jev_unavailable`. If utilization is readable and ≥ 95%, an `alert` event |
| RPC errors | Retry with backoff. Posts go stale, which blocks exits |
| Envio down | Watcher runs without flow data (state text says "flow data unavailable"). Exit jobs fall back to `getLogs` for `Enabled`/`Disabled` |
| Attester out of gas | `/health` turns red. Posts stop, so exits stop. Never silent |
| Exit simulation reverts | Recorded with the decoded reason (e.g. `StaleVerdict`, `BelowThreshold`). No tx sent |

### 5.4 Observability
- Structured JSON logs with `network`, `vault`, `verdictId` and `txHash`.
- `/health` shows per vault the last post age, last error, queue depth and attester/executor balances, and returns 503 if any watched vault's last post is older than 3× its alarm interval while the vault is healthy.

### 5.5 Backend tests (Vitest)
- Watcher decision table (stats/flows → post / no post / enqueue), with a mocked Jev and chain.
- Exit consumer idempotency: the same message twice gives one tx.
- TxSender nonce ordering under concurrent sends.
- State hash reproducibility: hashing the R2 JSON gives the posted hash.
- API shape tests against a seeded D1 (Miniflare).

---

## 6. Envio indexer (`indexer/`)

One HyperIndex project, networks 10143 and 143.

| Source | Events | Entities |
|---|---|---|
| `TareRiskOracle` | `VerdictPosted`, `VerdictResolved`, `AttesterChanged` | `Verdict` (+ resolution fields) |
| `GuardianV2` | `Enabled`, `Disabled`, `Exited` | `Protection` (owner, vault, rule, enabled), `Exit` (→ `Verdict`) |
| Approved real vaults (mainnet), mirrors (testnet) | ERC-4626 `Deposit`, `Withdraw` | `VaultFlowHour` (in, out, net, largest withdrawal), `LargeWithdrawal` (≥ 1% of TVL) |

Because ERC-4626 events are standard, adding a vault means adding one address to the config, with no new handler code. Hosted on Envio Cloud. The app and backend read it over GraphQL.

---

## 7. Verdict Ledger

- **Page `/ledger`:** a table of verdicts (network, vault, verdict, confidence, risk forecast, time, oracle tx, a "what Jev saw" link to R2, outcome: pending / adverse / clear with reasons, and linked exits). Filters: network, vault, verdict.
- **Scoreboard:** for resolved posts, the hit rate by confidence band and the Brier score of `riskBps` vs `adverse`, always shown with `n`. Below 30 resolved posts it is labelled "early data".
- **Method section** on the page: the three grading criteria, the window per network, the endpoint-only limitation, and "anyone can call `resolve`".
- **API:** `/v1/verdicts`, `/v1/ledger/score` (section 5).

---

## 8. App

### 8.1 Network switch
- A `Testnet | Mainnet` toggle in the header. The choice comes from the `?network=` URL param, then localStorage, then defaults to **testnet**. It is exposed through a `NetworkProvider` context.
- wagmi config gets both chains. If the connected wallet is on the other chain, a "Switch to Monad {network}" button calls `switchChain`.
- `shared/networks.ts` exports `NETWORKS[network]` = `{ chain, usdc, oracle, guardian, vaults: [{ address, name, poolId, protocol, adapter }], explorer, features: { faucet, demoControls, launch } }`. It is built from `addresses.{network}.json`.

### 8.2 Pages
- **Explore / Pulse / Scan:** unchanged data (pools are mainnet data on both). The verdict slip's action is "Deposit" if the pool maps to a depositable vault on the current network, else "Open on protocol".
- **Advisor:** the same, plus the deposit target follows the network.
- **Deposit + Protect:** approve → deposit → optional "Protect with Guardian": approve vault shares to GuardianV2 + `enable(vault, minConfidence, maxAge)`, with a slider from 80 to 99% (default 90) and a freshness select of 5 / 10 / 30 / 60 min (default 10). On mainnet, the first deposit shows a confirmation with a plain-language risk note.
- **Watch:** positions on the current network, the rule per position, the latest onchain verdict (+ tx link, + "what Jev saw"), the event feed (from the backend), and **Exit now**, which calls `vault.redeem` directly from the user's wallet and needs nothing from Tare.
- **Ledger:** section 7.
- **Mainnet guardrails:** a persistent "Real funds" banner, a soft per-wallet cap of $1,000 enforced in the UI (config value, not a contract limit), and the faucet, demo controls and Launch hidden.

### 8.3 Data sources
- The Next.js API routes become thin proxies to the backend API, or are removed where the app can call the backend directly.
- `DATA_SOURCE=fixtures` keeps working for the no-keys local run (README promise).

### 8.4 App tests
- Unit: network resolution order (URL > storage > default), the feature flags hide testnet-only features on mainnet, and the slip action choice.
- Playwright smoke on both networks against fixtures: landing, Explore, Advisor, Watch empty state, and Ledger render, with no console errors.

---

## 9. Deployment and demo

1. Deploy the oracle, adapters and GuardianV2 to testnet. Register and approve the 4 mirrors with `MirrorAdapter`.
2. Deploy to mainnet. Register and approve 1 Euler USDC vault (`EulerAdapter`) and 1 Morpho USDC vault (no adapter). Exact addresses are confirmed in the plan via the `addresses` skill and the fork test.
3. Deploy the backend (Cloudflare), the indexer (Envio Cloud) and the app (Vercel).
4. Mainnet proof: deposit a few USDC, enable at 80%, and wait for a natural EXIT or post one at high confidence from the attester as a labelled manual drill. The drill is disclosed as such on the Ledger, with "drill" in the R2 state. Exit, then resolve after 24 h.
5. Testnet demo: the existing stress script on GuardianV2.

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| Time: about 2.5 build days of work in about 2 days | Build order in section 2. Cut order: Ledger scoreboard → Envio flows as Jev input (keep Tare events) → mainnet Morpho vault → Cloudflare DO alarms (fall back to a Cron every minute) |
| Real-funds bug | Fuzz invariant, fork tests, tiny amounts, UI cap |
| Real vault can't be redeemed by allowance | Fork test before mainnet deploy. Drop that vault if it fails |
| Attester key theft | Worst case is early exits to owners' own wallets. Rotate via `setAttester` |
| Jev outage during demo | Testnet demo has a recorded fallback in the video |
| Endpoint-only grading misses intra-window crunches | Documented on the Ledger. Continuous grading goes on the next slide |

## Amendment (2026-10-11): contracts security review 1

A fresh security review of Tasks 1-4 found no critical issues. These changes were made before any deploy:

- **Reverting vaults (oracle).** `post` records the verdict even if the vault's or adapter's views revert (snapshot fields are 0). `resolve` grades a vault whose views revert as adverse with a new reason bit `REASON_BROKEN = 8`. To stop a caller starving the read of gas to fake that grade, `resolve` reverts with `InsufficientGas()` unless 100k gas remains after a failed read. New view `metricsOf(vault)`.
- **Liquidity check overflow.** The liquidity floor uses `mulDiv` (rounded up), so an adapter returning `type(uint256).max` can't brick `resolve`.
- **Verdict floor (GuardianV2).** New `verdictFloor(owner, vault)`. `enable` sets it to the oracle's current `postCount`, so a verdict from earlier in the same second no longer counts. A full exit (`remainingShares == 0`) sets it to that verdict's id, so one verdict can't be replayed against a re-deposit. A partial exit keeps the floor, so the exit can finish on the same verdict. This adds a seventh check, which reverts with `VerdictAlreadyUsed()`.
- **Constructors.** Both constructors reject zero addresses, and the oracle also rejects a zero window (`ZeroArg()`). `disable` emits only when a rule was enabled.
- **Known limitation, documented rather than fixed.** The TVL and liquidity criteria read a single moment, so anyone with flash liquidity can bend them at `resolve` time, and the first caller after the window picks that moment. To mitigate this, the backend resolves each post as soon as its window ends, and the Ledger page says that the TVL and liquidity grades are point-in-time. A time-averaged grade is post-hackathon work. The share-price criterion is robust, because EVK and MetaMorpho ignore direct donations.
