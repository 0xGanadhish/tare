# Guardian v2 and Verdict Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a public onchain risk oracle, a keeperless GuardianV2 with per-user rules, onchain anyone-can-resolve grading, a 24/7 Cloudflare backend, an Envio indexer and an app with a Testnet/Mainnet switch, on Monad testnet (10143) and mainnet (143).

**Architecture:** Contracts are the source of truth: `TareRiskOracle` stores every position verdict and grades it, and `GuardianV2` lets anyone trigger an exit that the contract checks itself. A Cloudflare Worker (Durable Objects, Queues, Cron, D1, R2) watches vaults, asks Jev, posts verdicts, sends exits and resolves due verdicts. Envio indexes Tare's events and ERC-4626 flows. The Next.js app reads the backend and Envio and sends wallet txs on the selected network.

**Tech Stack:** Solidity 0.8.24 + OpenZeppelin v5 + Foundry; TypeScript, viem 2, Cloudflare Workers (wrangler 3, `@cloudflare/vitest-pool-workers`), Envio HyperIndex, Next.js 15 + wagmi 2, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-11-guardian-v2-verdict-ledger-design.md` (read it alongside this plan; section numbers below refer to it).

## Global Constraints

- Deadline: submission 2026-10-14 09:29 IST. Keep the last half day for README, LICENSE, disclosures and the video (owned outside this plan).
- Chains: testnet `10143` (`https://testnet-rpc.monad.xyz`), mainnet `143` (`https://rpc.monad.xyz`). Mainnet USDC `0x754704Bc059F8C67012fEd69BC8A327a5aafb603` (from the `addresses` skill; verify with `cast code` before use).
- Solidity `0.8.24`, OpenZeppelin v5, contracts in `contracts/src`, tests in `contracts/test`, matching the existing style (custom errors, `forge-std/Test.sol`, `makeAddr`).
- Funds only ever move vault → owner. Guardian never holds tokens.
- Fail safe: anything down makes exits harder, never easier.
- Basis points everywhere onchain (`uint16`, 0..10000).
- Constants (spec §4): `PPS_DROP_BPS = 50`, `TVL_DROP_BPS = 2000`, `LIQ_FLOOR_BPS = 500`; `minConfidenceBps` ∈ [8000, 9900]; `maxAge` ∈ [60, 3600] s; `resolveWindow` testnet `3600`, mainnet `86400`.
- Watcher alarm: testnet 5 s, mainnet 30 s. Re-judge on existing `shouldRejudge` thresholds (50 bps APY, 500 bps util) or hourly net outflow > 10% of TVL. Exit retries max 3. Gas limit = `estimateGas × 1.15` (Monad bills the limit).
- Testnet-only: faucet, demo controls (`POST /v1/admin/stats`), Launch. Mainnet: "Real funds" banner, first-deposit confirmation, soft UI cap `$1,000` per wallet (`MAINNET_SOFT_CAP_USD = 1000`).
- Network resolution order in the app: `?network=` URL param, then localStorage `tare.network`, then `testnet`.
- `DATA_SOURCE=fixtures` must keep working with no keys.
- Mainnet keys are never testnet keys. Secrets never reach the browser.
- Commit messages end with the session attribution lines. No model names in commits.

## Prerequisites only Ganadhish can provide

These block specific tasks. Ask for each when its task starts, not before.

| Needed for | What |
|---|---|
| Task 6 (testnet deploy) | Testnet operator key in `.env` (already exists as `OPERATOR_PRIVATE_KEY`) |
| Task 6 (mainnet deploy) | A fresh mainnet deployer/owner wallet with a little MON. **Mainnet deploy runs only after an explicit "deploy mainnet" from Ganadhish** |
| Task 14 | Cloudflare account access (`wrangler login` or an API token), Alchemy Monad URLs for both networks, fresh attester and executor keys per network funded with MON |
| Task 15 | Envio Cloud account (GitHub login) |
| Task 23 | A few real USDC in Ganadhish's wallet for the mainnet proof |

## Review Focus

1. **Exit with a partial allowance or a partially locked vault:** `exit` must redeem what it can and report `remainingShares`; the UI must say "Partly out", not "You're out". Test: `test_exit_partialLiquidity_reportsRemaining` (Task 4) and the Watch event copy test (Task 20).
2. **User re-enables during an EXIT period:** a verdict posted before the new `enabledAt` must not fire. Test: `test_exit_revertsWhenVerdictPredatesEnable` (Task 4).
3. **Network switch while a tx is pending, or wallet on the wrong chain:** the action buttons must be disabled and offer "Switch to Monad {network}"; no tx goes to the wrong chain. Test: `DepositFlow blocks when wallet chain != selected network` (Task 19).
4. **Duplicate queue delivery or a watcher restart mid-exit:** one tx per `verdictId:owner`. Test: `exit consumer: same message twice sends one tx` (Task 12).
5. **Real vault rejects redeem-by-allowance or uses a non-6-decimals share token:** the fork test must catch it before mainnet approval; pps uses `10 ** vault.decimals()`. Test: `testFork_realVault_redeemByAllowance` (Task 5).

---

## File Structure

```
contracts/src/
  interfaces/ILiquidityAdapter.sol     availableLiquidity(vault)
  adapters/MirrorAdapter.sol           → MirrorVault.availableLiquidity()
  adapters/EulerAdapter.sol            → IEVault(vault).cash()
  TareRiskOracle.sol                   post / resolve / registerVault / setAttester
  GuardianV2.sol                       enable / disable / exit / setVaultApproved
contracts/test/
  Adapters.t.sol  TareRiskOracle.t.sol  OracleResolve.t.sol  GuardianV2.t.sol  Fork.t.sol
contracts/script/
  DeployV2.s.sol                       chain-aware; writes v2 fields into shared/addresses.<net>.json
  vaults.mainnet.json                  approved real vaults (address, name, poolId, protocol, adapter)
shared/
  networks.ts                          NETWORKS[network] config + feature flags
  contracts.ts                         + abis.oracle, abis.guardianV2, abis.erc4626
  verdict.ts                           toOraclePost(), Verdict enum mapping, stateDocument()
lib/judge/state.ts                     renderPositionState generalised (real vaults, flows)
backend/
  wrangler.toml  package.json  tsconfig.json  vitest.config.ts
  migrations/0001_init.sql
  src/index.ts                         fetch / scheduled / queue entrypoints
  src/env.ts                           Env type, per-network secret lookup
  src/api.ts                           /v1/* and /health handlers
  src/txSender.ts                      DO: serialized sends per (network, key)
  src/archive.ts                       R2 state documents + keccak stateHash
  src/watcher.ts                       DO: VaultWatcher alarm loop
  src/decide.ts                        pure watcher decision function
  src/exits.ts                         queue consumer
  src/envio.ts                         GraphQL client + getLogs fallback
  src/crons.ts                         pool scan + resolver
  test/*.test.ts
indexer/
  config.yaml  schema.graphql  src/EventHandlers.ts  test/handlers.test.ts
app/(app)/app/ledger/page.tsx
components/network/NetworkProvider.tsx  NetworkSwitch.tsx  RealFundsBanner.tsx
components/advisor/DepositFlow.tsx      (modify: protect step, cap, chain guard)
components/watch/*                      (modify: v2 data, Exit now)
components/ledger/LedgerTable.tsx  Scoreboard.tsx
shared/score.ts                         scoreLedger() used by backend and app
lib/wagmi.ts                            both chains
lib/backend.ts                          typed client for the backend API
e2e/smoke.spec.ts  playwright.config.ts
```

---

## Phase A: Contracts

### Task 1: Liquidity adapters

**Files:**
- Create: `contracts/src/interfaces/ILiquidityAdapter.sol`, `contracts/src/adapters/MirrorAdapter.sol`, `contracts/src/adapters/EulerAdapter.sol`
- Test: `contracts/test/Adapters.t.sol`

**Interfaces:**
- Produces: `interface ILiquidityAdapter { function availableLiquidity(address vault) external view returns (uint256); }`; `MirrorAdapter` and `EulerAdapter` (no constructor args, stateless). `EulerAdapter` calls `IEVaultCash(vault).cash()` with a local minimal interface `function cash() external view returns (uint256)`.

- [ ] **Step 1: Install Foundry if missing** (`curl -L https://foundry.paradigm.xyz | bash && foundryup`), then `cd contracts && forge build`. Expected: compiles.
- [ ] **Step 2: Write failing tests** `test_mirrorAdapter_matchesVault` (MirrorVault with 40_000e6 seeded at 7100 bps → adapter returns `vault.availableLiquidity()`), `test_mirrorAdapter_tracksUtilization` (setStats to 9500 → returns 5% of totalAssets), `test_eulerAdapter_returnsCash` (a `MockEVault` in the test file exposing `cash()` returning 123e6 → adapter returns 123e6).
- [ ] **Step 3: Run** `forge test --match-path test/Adapters.t.sol`. Expected: FAIL (missing contracts).
- [ ] **Step 4: Implement** the three files.
- [ ] **Step 5: Run** the same command. Expected: PASS.
- [ ] **Step 6: Commit** `feat(contracts): liquidity adapters for grading`.

### Task 2: TareRiskOracle (post, registry, attester)

**Files:**
- Create: `contracts/src/TareRiskOracle.sol`
- Test: `contracts/test/TareRiskOracle.t.sol`

**Interfaces:**
- Consumes: `ILiquidityAdapter` (Task 1).
- Produces (exact):
  - `enum Verdict { HOLD, EXIT, MOVE }`
  - `struct Post { address vault; Verdict verdict; uint16 confidenceBps; uint16 riskBps; bytes32 stateHash; uint64 postedAt; uint256 ppsAtPost; uint256 assetsAtPost; uint256 liquidityAtPost; }`
  - `struct Resolution { bool resolved; bool adverse; uint8 reasons; uint64 resolvedAt; }`
  - `constructor(address owner_, address attester_, uint64 resolveWindow_)`
  - `function post(address vault, Verdict verdict, uint16 confidenceBps, uint16 riskBps, bytes32 stateHash) external returns (uint256 id)`; ids start at 1, so `latest(vault) == 0` means none
  - `function registerVault(address vault, address adapter) external`, `function setAttester(address) external`
  - views: `latest(address) returns (uint256)`, `getPost(uint256) returns (Post memory)`, `getResolution(uint256) returns (Resolution memory)`, `postCount() returns (uint256)`, `registered(address) returns (bool)`, `adapterOf(address) returns (address)`, `owner()`, `attester()`, `resolveWindow()`
  - errors: `NotOwner()`, `NotAttester()`, `VaultNotRegistered()`, `AdapterLocked()`, `BpsOutOfRange()`
  - events: `VerdictPosted(uint256 indexed id, address indexed vault, Verdict verdict, uint16 confidenceBps, uint16 riskBps, bytes32 stateHash, uint64 postedAt)`, `VaultRegistered(address indexed vault, address adapter)`, `AttesterChanged(address attester)`

- [ ] **Step 1: Write failing tests:**
  - `test_post_onlyAttester` (other → `NotAttester`)
  - `test_post_requiresRegisteredVault` (→ `VaultNotRegistered`)
  - `test_post_rejectsBpsOver10000` (→ `BpsOutOfRange`)
  - `test_post_snapshotsMetrics` (asserts `ppsAtPost == vault.convertToAssets(10**vault.decimals())`, `assetsAtPost == vault.totalAssets()`, `liquidityAtPost == adapter.availableLiquidity(vault)`, `latest(vault) == id == 1`, the event emitted)
  - `test_post_noAdapter_liquidityMax` (== `type(uint256).max`)
  - `test_registerVault_onlyOwner`
  - `test_registerVault_adapterLockedAfterFirstPost` (re-register → `AdapterLocked`; before any post it's allowed)
  - `test_setAttester_onlyOwner_rotates` (old attester then reverts)
- [ ] **Step 2: Run** `forge test --match-path test/TareRiskOracle.t.sol`. Expected: FAIL.
- [ ] **Step 3: Implement** `TareRiskOracle.sol` (`resolve` comes in Task 3).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(contracts): TareRiskOracle posts and vault registry`.

### Task 3: Oracle `resolve()` (permissionless grading)

**Files:**
- Modify: `contracts/src/TareRiskOracle.sol`
- Test: `contracts/test/OracleResolve.t.sol`

**Interfaces:**
- Produces: `function resolve(uint256 id) external returns (bool adverse)`; reasons bitmask `REASON_PPS = 1`, `REASON_TVL = 2`, `REASON_LIQ = 4`; errors `UnknownPost()`, `WindowOpen()`, `AlreadyResolved()`; event `VerdictResolved(uint256 indexed id, bool adverse, uint8 reasons)`.
- Rules (spec §4.1):
  - adverse if `ppsNow * 10000 < ppsAtPost * (10000 - 50)`
  - or `assetsNow * 10000 < assetsAtPost * (10000 - 2000)`
  - or (adapter set and `liqNow * 10000 < assetsNow * 500`)

- [ ] **Step 1: Write failing tests** (MirrorVault + MirrorAdapter, warp past window):
  - `test_resolve_revertsBeforeWindow` → `WindowOpen`
  - `test_resolve_unknownId` → `UnknownPost`
  - `test_resolve_twice` → `AlreadyResolved`
  - `test_resolve_clear` (nothing moved → `adverse == false`, `reasons == 0`)
  - `test_resolve_tvlDrop` (withdraw 25% → reasons == 2)
  - `test_resolve_liquidityFloor` (setStats util 9600 → reasons == 4)
  - `test_resolve_ppsDrop` (a `LossyVault` test helper that burns 1% of assets → reasons == 1)
  - `test_resolve_noAdapter_ignoresLiquidity`
  - `test_resolve_anyoneCanCall` (prank random address)
  - `test_resolve_all` (reasons == 7)
- [ ] **Step 2: Run** `forge test --match-path test/OracleResolve.t.sol`. Expected: FAIL.
- [ ] **Step 3: Implement `resolve`.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(contracts): permissionless onchain verdict grading`.

### Task 4: GuardianV2

**Files:**
- Create: `contracts/src/GuardianV2.sol`
- Test: `contracts/test/GuardianV2.t.sol`

**Interfaces:**
- Consumes: `TareRiskOracle` views and `Verdict` (Tasks 2-3).
- Produces (exact):
  - `struct Rule { bool enabled; uint16 minConfidenceBps; uint32 maxAge; uint64 enabledAt; }`
  - `constructor(address admin_, TareRiskOracle oracle_)`
  - `function enable(address vault, uint16 minConfidenceBps, uint32 maxAge) external`, `function disable(address vault) external`
  - `function exit(address vault, address owner) external returns (uint256 assets)`, `function setVaultApproved(address vault, bool ok) external`
  - views: `rules(owner, vault)`, `approvedVault(vault)`, `admin()`, `oracle()`
  - errors: `NotAdmin()`, `VaultNotApproved()`, `RuleOutOfRange()`, `NotEnabled()`, `NoVerdict()`, `NotExitVerdict()`, `BelowThreshold()`, `StaleVerdict()`, `VerdictPredatesEnable()`, `NothingToExit()`
  - events: `Enabled(address indexed owner, address indexed vault, uint16 minConfidenceBps, uint32 maxAge)`, `Disabled(address indexed owner, address indexed vault)`, `Exited(address indexed owner, address indexed vault, uint256 indexed verdictId, address caller, uint256 shares, uint256 assets, uint256 remainingShares)`, `VaultApproved(address indexed vault, bool ok)`

- [ ] **Step 1: Write failing tests**, one per revert, in the order of spec §4.3 conditions:
  - `test_enable_rejects7999`, `test_enable_rejects9901`, `test_enable_rejectsMaxAge59`, `test_enable_rejectsMaxAge3601`, `test_enable_requiresApprovedVault`
  - `test_exit_notEnabled`, `test_exit_noVerdict`, `test_exit_holdVerdict` → `NotExitVerdict`
  - `test_exit_belowThreshold` (post 8999, rule 9000)
  - `test_exit_stale` (warp maxAge+1)
  - `test_exitRevertsWhenVerdictPredatesEnable` (post, then enable, then exit)
  - `test_exit_nothingToExit` (no allowance)
  - `test_exit_anyoneCanCall_fundsToOwner` (random caller; owner USDC up by `assets`, caller USDC unchanged, guardian USDC and shares 0, event fields incl. `verdictId` and `caller`)
  - `test_exit_partialLiquidity_reportsRemaining` (util 9900 → `remainingShares > 0`)
  - `test_disable_blocksExit`
  - `test_setVaultApproved_onlyAdmin`
- [ ] **Step 2: Write the fuzz test** `testFuzz_exit_onlyOwnerReceives(address caller, uint96 amount, uint16 conf, uint16 minConf)`. Bound inputs, and when the exit succeeds assert: owner asset balance delta == returned `assets`, caller asset balance unchanged (caller != owner), guardian asset and share balances == 0.
- [ ] **Step 3: Run** `forge test --match-path test/GuardianV2.t.sol`. Expected: FAIL.
- [ ] **Step 4: Implement `GuardianV2.sol`.** Shares = `min(balanceOf, maxRedeem, allowance)`, then `remainingShares = balanceOf(owner)` after the redeem.
- [ ] **Step 5: Run** the whole suite with `forge test`. Expected: all PASS, including v1 tests.
- [ ] **Step 6: Commit** `feat(contracts): GuardianV2 permissionless rule-checked exits`.

### Task 5: Real mainnet vaults and fork test

**Files:**
- Create: `contracts/script/vaults.mainnet.json`, `contracts/test/Fork.t.sol`

**Interfaces:**
- Produces: `vaults.mainnet.json` = `{ "vaults": [ { "address", "name", "protocol": "euler"|"morpho", "poolId", "adapter": "euler"|null } ] }` with 1 Euler USDC vault and 1 Morpho USDC vault.

- [ ] **Step 1: Find candidate addresses.** Use the `poolId`s in `contracts/script/mirrors.json` (Clearstar USDC · Euler `d711af54-…`, August USDC v2 · Morpho `0b033747-…`) against `https://yields.llama.fi/pools` (the `pool`/`poolMeta` fields), and the `monad-crypto/protocols` repo `mainnet/euler*.jsonc` / `mainnet/morpho*.jsonc`. Never guess an address.
- [ ] **Step 2: Verify each address on mainnet:** `cast code <addr> --rpc-url https://rpc.monad.xyz` is non-empty, `cast call <addr> "asset()(address)"` == USDC `0x7547…b603`, and for Euler `cast call <addr> "cash()(uint256)"` succeeds. Record the results in the JSON.
- [ ] **Step 3: Write the fork test** `testFork_realVault_redeemByAllowance` for each vault. `vm.createSelectFork("https://rpc.monad.xyz")`, deploy the oracle, EulerAdapter and GuardianV2 locally, register and approve, `deal` 100e6 USDC to user, deposit, approve shares, enable 8000/600, attester posts EXIT at 9500, a random caller exits. Assert USDC returned ≥ 99.9e6 and guardian holds nothing. Then `testFork_resolve_realVault`: warp the window and `resolve` returns without revert.
- [ ] **Step 4: Run** `forge test --match-path test/Fork.t.sol -vv`. Expected: PASS. If a vault fails redeem-by-allowance, drop it from the JSON and note why in the commit message.
- [ ] **Step 5: Commit** `test(contracts): mainnet fork test against real Euler and Morpho vaults`.

### Task 6: DeployV2 script and deployments

**Files:**
- Create: `contracts/script/DeployV2.s.sol`
- Modify: `shared/addresses.testnet.json`, `shared/addresses.mainnet.json` (add fields; keep the v1 fields)

**Interfaces:**
- Produces, in each addresses file: `"oracle"`, `"guardianV2"`, `"usdc"`, `"deployBlockV2"`, and `"vaults": [{ "address", "name", "poolId", "protocol", "adapter" }]`.
  - Testnet: `vaults` = the 4 existing mirrors with `adapter` = the deployed MirrorAdapter, and `usdc` = existing `mockUsdc`.
  - Mainnet: from `vaults.mainnet.json`, and `usdc` = real USDC.

- [ ] **Step 1: Implement `DeployV2.s.sol`.** It is chain-aware like `Deploy.s.sol`. It reads `OWNER`, `ATTESTER` and `EXECUTOR` from env, deploys the adapters + oracle (`resolveWindow` 3600 or 86400) + GuardianV2 with `admin = OWNER`, registers and approves the vaults, and writes JSON only when `WRITE_ADDRESSES=true`. It merges into the existing file with `vm.serializeJson` so the v1 fields stay.
- [ ] **Step 2: Dry run on both chains:** `forge script script/DeployV2.s.sol --rpc-url <rpc>` (no broadcast). Expected: logs addresses, no revert.
- [ ] **Step 3: Testnet broadcast** with the existing operator key: `WRITE_ADDRESSES=true forge script … --rpc-url https://testnet-rpc.monad.xyz --broadcast --private-key $OPERATOR_PRIVATE_KEY`. Then verify sources with `contracts/script/verify.py` (extend it to the new contracts).
- [ ] **Step 4: Mainnet broadcast: STOP and ask Ganadhish for an explicit "deploy mainnet"** and the deployer key. Then run as in Step 3 against mainnet and verify.
- [ ] **Step 5: Commit** `chore(contracts): deploy oracle and GuardianV2` with the addresses files and broadcast logs.

---

## Phase B: Shared code

### Task 7: Network config, ABIs, verdict mapping, generalized position state

**Files:**
- Create: `shared/networks.ts`, `shared/verdict.ts`, `shared/networks.test.ts`, `shared/verdict.test.ts`
- Modify: `shared/contracts.ts` (add `abis.oracle`, `abis.guardianV2`, `abis.erc4626`), `lib/judge/state.ts`, `lib/judge/index.test.ts`

**Interfaces:**
- Produces:
  - `type Network = 'testnet' | 'mainnet'`
  - `interface VaultConfig { address: Address; name: string; poolId: string | null; protocol: 'mirror' | 'euler' | 'morpho'; adapter: Address | null }`
  - `interface NetworkConfig { network: Network; chain: Chain; usdc: Address; oracle: Address; guardian: Address; vaults: VaultConfig[]; explorer: string; deployBlock: bigint; features: { faucet: boolean; demoControls: boolean; launch: boolean; softCapUsd: number | null } }`
  - `NETWORKS: Record<Network, NetworkConfig>`, `vaultForPool(network, poolId): VaultConfig | null`
  - `enum OracleVerdict { HOLD = 0, EXIT = 1, MOVE = 2 }`
  - `toOraclePost(j: PositionJudgment): { verdict: OracleVerdict; confidenceBps: number; riskBps: number }`: maps hold/exit/rotate → HOLD/EXIT/MOVE, `confidenceBps = round(j.action.confidence × 10000)`, `riskBps = round(j.withdrawalRisk × 10000)`, both clamped 0..10000
  - `interface StateDocument { v: 1; network: Network; vault: Address; state: string; questions: unknown; answers: unknown; model: string; at: string; drill: boolean }`
  - `stateHash(doc: StateDocument): Hex` = `keccak256(toBytes(canonicalJson(doc)))`, where canonicalJson sorts keys
  - `renderPositionState(input)` now takes `PositionInput & { protocolName: string; isMirror: boolean; flows: { netOutUsd: number; netOutPctTvl: number; largestOutUsd: number } | null; liquidityPct: number | null }`. It drops the hard-coded "(mirror)" when `isMirror` is false, adds a flow sentence or "flow data unavailable", and states liquidity from `liquidityPct` when present, else utilization-implied.

- [ ] **Step 1: Write failing tests:**
  - `NETWORKS.mainnet.features.faucet === false`
  - `NETWORKS.mainnet.features.softCapUsd === 1000`
  - `NETWORKS.testnet.features.demoControls === true`
  - `vaultForPool('testnet', 'd711af54-e736-470f-8a22-431a23de76df')?.protocol === 'mirror'`
  - `toOraclePost` maps `rotate` → `MOVE`, `0.95` → `9500`, `1.2` clamps to `10000`
  - `stateHash` is stable across key order
  - `renderPositionState` for a non-mirror vault contains no "(mirror)" and contains "net outflow"; with `flows: null` it contains "flow data unavailable"
- [ ] **Step 2: Run** `pnpm test shared lib/judge`. Expected: FAIL.
- [ ] **Step 3: Implement.** Keep existing callers compiling. Update `worker/` call sites to pass `isMirror: true, flows: null, liquidityPct: null`, so the old worker still runs for local dev.
- [ ] **Step 4: Run** `pnpm test && pnpm lint && npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(shared): network config, oracle ABIs and verdict mapping`.

---

## Phase C: Cloudflare backend

All backend tests run with `@cloudflare/vitest-pool-workers` (Miniflare). Chain and Jev are injected through small interfaces, so tests use fakes, not network.

### Task 8: Backend scaffold, D1 schema, read API

**Files:**
- Create: `backend/wrangler.toml`, `backend/package.json`, `backend/tsconfig.json`, `backend/vitest.config.ts`, `backend/migrations/0001_init.sql`, `backend/src/index.ts`, `backend/src/env.ts`, `backend/src/api.ts`, `backend/test/api.test.ts`
- Modify: `pnpm-workspace.yaml` (create if absent: packages `.`, `backend`, `indexer`)

**Interfaces:**
- Produces:
  - D1 tables (exact columns):
    - `pools(network, id, json, updated_at)`
    - `pool_verdicts(network, pool_id, json, judged_at)`
    - `posts(network, id INTEGER, vault, verdict, confidence_bps, risk_bps, state_hash, posted_at, tx_hash, resolved INTEGER, adverse INTEGER, reasons INTEGER, drill INTEGER, PRIMARY KEY(network,id))`
    - `exits(network, verdict_id, owner, tx_hash, status, error, assets, remaining_shares, at, PRIMARY KEY(network, verdict_id, owner))`
    - `events(network, id, owner, vault, type, message, tx_hash, confidence, at)`, index `(network, owner, at)`
    - `tx_log(network, key_role, nonce, hash, kind, status, at)`
    - `vault_health(network, vault, last_post_at, last_error, updated_at)`
  - `wrangler.toml` bindings: D1 `DB`, R2 `STATE` (bucket `tare-ledger`), Queue producer/consumer `EXITS`, DOs `VAULT_WATCHER` (class `VaultWatcher`) and `TX_SENDER` (class `TxSender`), crons `*/10 * * * *` (pool scan) and `*/5 * * * *` (resolver), `compatibility_flags = ["nodejs_compat"]`
  - `Env` type plus `secretFor(env, 'attester'|'executor', network): Hex` and `rpcFor(env, network): string`
  - API: `GET /v1/pools`, `GET /v1/pools/:id`, `GET /v1/verdicts?network&vault&cursor&limit` (limit max 100, newest first), `GET /v1/vaults/:network/:vault/latest`, `GET /v1/events/:network/:owner?since`, `GET /v1/ledger/score?network` (calls `scoreLedger` from `shared/score.ts`; create it here as a stub returning `{ n: 0, brier: null, early: true, bands: [] }`, Task 21 fills it in). All JSON, CORS `*`, unknown network → 400.
- [ ] **Step 1: Write failing tests** against a seeded D1:
  - `/v1/verdicts?network=testnet` returns newest-first and honours `limit=2` with a cursor
  - `network=foo` → 400
  - `/v1/vaults/testnet/0x…/latest` → 404 when empty, 200 with the row when seeded
  - CORS header present
- [ ] **Step 2: Run** `pnpm -C backend test`. Expected: FAIL.
- [ ] **Step 3: Implement** the scaffold, migration and handlers.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): Cloudflare worker scaffold, D1 schema and read API`.

### Task 9: TxSender Durable Object

**Files:**
- Create: `backend/src/txSender.ts`, `backend/test/txSender.test.ts`

**Interfaces:**
- Produces: DO `TxSender`, named `${network}:${role}`, with RPC method `send(req: { to: Address; data: Hex; kind: 'post'|'exit'|'resolve'|'admin' }): Promise<{ hash: Hex; status: 'success'|'reverted'; blockNumber: bigint; gasUsed: bigint }>`. Internally it uses `blockConcurrencyWhile` to serialize, tracks the nonce in DO storage (re-synced from `getTransactionCount(pending)` on start or on a nonce error), sets the gas limit to `ceil(estimate × 1.15)`, waits for the receipt, and writes `tx_log`.
- Chain access goes through an injected `ChainClient` interface (`estimateGas`, `getTransactionCount`, `sendRawTransaction`, `waitForReceipt`, `signTransaction`), so tests use a fake.

- [ ] **Step 1: Write failing tests:**
  - `TxSender assigns sequential nonces under 5 concurrent sends`
  - `TxSender sets gas limit to ceil(estimate*1.15)`
  - `TxSender resyncs nonce after "nonce too low"`
  - `TxSender records reverted receipts as status reverted`
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): serialized transaction sender`.

### Task 10: State archive and oracle posting

**Files:**
- Create: `backend/src/archive.ts`, `backend/test/archive.test.ts`

**Interfaces:**
- Consumes: `StateDocument`, `stateHash`, `toOraclePost` (Task 7); `TxSender.send` (Task 9).
- Produces:
  - `archiveState(env, doc: StateDocument): Promise<Hex>`: puts `state/${hash}.json` in R2 with `content-type: application/json` and returns the hash. Idempotent: an existing key is not rewritten.
  - `postVerdict(env, network, vault, judgment: PositionJudgment, doc: StateDocument): Promise<{ id: bigint; txHash: Hex }>`: archives first, then sends `oracle.post`, decodes the `VerdictPosted` id from the receipt logs, and inserts into `posts`.

- [ ] **Step 1: Write failing tests:**
  - `archiveState: re-hashing the stored R2 body equals the returned hash`
  - `archiveState twice writes once`
  - `postVerdict archives before sending` (the fake TxSender asserts the R2 key exists at send time)
  - `postVerdict stores the decoded id and drill flag in D1`
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): public state archive and oracle posting`.

### Task 11: VaultWatcher (decision function + DO alarm)

**Files:**
- Create: `backend/src/decide.ts`, `backend/src/watcher.ts`, `backend/test/decide.test.ts`, `backend/test/watcher.test.ts`

**Interfaces:**
- Consumes: `shouldRejudge`, `ALERT_CONFIDENCE` (`lib/judge/gating.ts`); `judgePosition` (`lib/judge`); `postVerdict` (Task 10); `readFlows`, `readProtections` (Task 16; until then inject `null` / `[]`).
- Produces:
  - `decide(input: { stats: VaultStats & { liquidityPct: number | null }; last: VaultStats | null; flows: Flows | null; hasPost: boolean }): 'rejudge' | 'skip'`. Rejudge if `!hasPost`, `shouldRejudge(last, stats)`, or `flows.netOutPctTvl > 10`.
  - `afterJudgment(post: { verdict: OracleVerdict; confidenceBps: number }, protections: { owner: Address; minConfidenceBps: number }[]): { enqueue: Address[]; alert: boolean }`. Enqueue owners with `minConfidenceBps <= confidenceBps` when the verdict is EXIT. `alert` when EXIT and `confidenceBps >= 6000`.
  - DO `VaultWatcher`, named `${network}:${vault}`. Method `start()` schedules the alarm. `alarm()`:
    1. read stats (for mirrors, `apyBps`/`utilizationBps`; for all vaults, pps, totalAssets, adapter liquidity)
    2. `decide`
    3. on rejudge: `judgePosition` → `postVerdict` → `afterJudgment` → `EXITS.send` per owner + `events` rows
    4. update `vault_health`
    5. on a Jev error: write a `jev_unavailable` event, and an `alert` if utilization ≥ 9500
    6. reschedule (5 s testnet, 30 s mainnet)
- [ ] **Step 1: Write failing tests:**
  - `decide: first run rejudges`
  - `decide: util +600 bps rejudges`
  - `decide: util +400 bps skips`
  - `decide: outflow 12% rejudges`
  - `afterJudgment: EXIT 9200 enqueues owners with min 9000 but not 9500`
  - `afterJudgment: HOLD enqueues nobody`
  - `watcher: Jev throws → no post, jev_unavailable event, alarm rescheduled`
  - `watcher: util 9600 + Jev down → alert event`
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** The `/v1/admin/watchers/start` route (ADMIN_TOKEN) calls `start()` for every vault in `NETWORKS`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): vault watcher durable object`.

### Task 12: Exit queue consumer

**Files:**
- Create: `backend/src/exits.ts`, `backend/test/exits.test.ts`

**Interfaces:**
- Consumes: queue message `ExitJob = { network: Network; vault: Address; owner: Address; verdictId: string }`; `TxSender.send`.
- Produces: `handleExitBatch(batch: MessageBatch<ExitJob>, env)`. Per message:
  1. if `exits` already has a row for `(network, verdictId, owner)` with status `sent|confirmed`, ack
  2. otherwise `eth_call` simulate `guardianV2.exit`; on revert, record the decoded error name in `exits.error` with status `skipped`, add an event, ack
  3. otherwise send, record `confirmed` with `assets` and `remainingShares` decoded from `Exited`, add an event `exit_confirmed` (message "You're out" or "Partly out: N USDC still locked")
  4. on a thrown error, `retry({ delaySeconds: 2 ** attempts })`
  5. after 3 attempts, mark `failed` and add an `exit_failed` event (wrangler `max_retries = 3`, `dead_letter_queue = "tare-exits-dlq"`)
- [ ] **Step 1: Write failing tests:**
  - `exit consumer: same message twice sends one tx`
  - `simulated StaleVerdict → skipped with reason, no send`
  - `partial exit → event says "Partly out"`
  - `send throws → retried with backoff`
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): idempotent exit queue`.

### Task 13: Crons (pool scan, resolver), admin stats, health

**Files:**
- Create: `backend/src/crons.ts`, `backend/test/crons.test.ts`
- Modify: `backend/src/api.ts`, `backend/test/api.test.ts`

**Interfaces:**
- Consumes: `lib/indexer` (`fetchPools`, or whatever `lib/jobs/refreshPools.ts` exports; reuse it, do not fork), `judgePool`.
- Produces:
  - `scanPools(env)`: fetches, judges with concurrency 4 and upserts `pools` + `pool_verdicts` for `network='mainnet'`. The data is mainnet data shared by both networks; the API serves it for either.
  - `resolveDue(env, network, now)`: selects `posts` where `resolved=0 AND posted_at + window <= now`, oldest first, max 20 per run. Sends `oracle.resolve(id)` via the executor TxSender and updates the row from the `VerdictResolved` event. Ids already resolved onchain (by anyone) are synced via `getResolution` without sending.
  - `POST /v1/admin/stats {network, vault, apyBps, utilBps}`: requires `Authorization: Bearer ADMIN_TOKEN`; mainnet → 404; sends `setStats` via the attester TxSender (attester = mirror admin on testnet).
  - `POST /v1/admin/drill {network, vault}`: requires ADMIN_TOKEN; posts EXIT at 9500 with `drill: true` in the R2 state document and `drill=1` in D1; used only for the labelled mainnet proof (Task 23)
  - `GET /health`: `{ ok, vaults: [{network, vault, lastPostAgeS, lastError}], queueBacklog, balances: {attester, executor} }`. Status 503 if any vault's `lastPostAgeS > 3 × alarm interval` while its `last_error` is null, or any balance is below 0.05 MON.
- [ ] **Step 1: Write failing tests:**
  - `resolveDue picks only posts past their window`
  - `resolveDue syncs already-resolved posts without sending`
  - `admin stats: mainnet returns 404`
  - `admin stats: missing token 401`
  - `health: stale vault → 503`
  - `drill route: requires token; writes drill=1 and drill:true in R2`
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Wire the `scheduled` handler: the 10-min cron → `scanPools`, the 5-min cron → `resolveDue` for both networks.
- [ ] **Step 4: Run** `pnpm -C backend test`. Expected: all PASS.
- [ ] **Step 5: Commit** `feat(backend): pool scan, onchain resolver, demo controls and health`.

### Task 14: Deploy the backend

**Files:**
- Modify: `backend/wrangler.toml` (real D1/R2/Queue ids), `README.md` (backend section)

- [ ] **Step 1: Ask Ganadhish** for Cloudflare access and the per-network Alchemy URLs. Generate fresh attester and executor keys locally and ask Ganadhish to fund them. Never commit keys.
- [ ] **Step 2: Create resources:**
  - `wrangler d1 create tare`
  - `wrangler d1 migrations apply tare --remote`
  - `wrangler r2 bucket create tare-ledger` (public access on, custom domain `ledger.tarefi.xyz` if DNS is on Cloudflare, else the r2.dev URL)
  - `wrangler queues create tare-exits`
  - `wrangler queues create tare-exits-dlq`
- [ ] **Step 3: Set secrets** (spec §5.2) with `wrangler secret put`, then `wrangler deploy`.
- [ ] **Step 4: Rotate the oracle attester** on each network to the new attester key: `cast send <oracle> "setAttester(address)" <attester> --private-key <owner>` (testnet now; mainnet with Ganadhish's owner wallet).
- [ ] **Step 5: Start the watchers** with `curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" https://<worker>/v1/admin/watchers/start`, then `curl https://<worker>/health`. Expected: 200 and all testnet vaults with `lastPostAgeS` under 30.
- [ ] **Step 6: Commit** `chore(backend): deploy to Cloudflare`.

---

## Phase D: Envio

### Task 15: HyperIndex project

**Files:**
- Create: `indexer/config.yaml`, `indexer/schema.graphql`, `indexer/src/EventHandlers.ts`, `indexer/test/handlers.test.ts`, `indexer/package.json`

**Interfaces:**
- Consumes: the oracle and GuardianV2 ABIs and addresses (Task 6); vault lists from `shared/addresses.*.json`.
- Produces GraphQL entities (exact fields):
  - `Verdict { id: "<chainId>-<postId>", chainId, postId, vault, verdict, confidenceBps, riskBps, stateHash, postedAt, txHash, resolved, adverse, reasons, resolvedAt }`
  - `Protection { id: "<chainId>-<owner>-<vault>", chainId, owner, vault, enabled, minConfidenceBps, maxAge, updatedAt }`
  - `Exit { id: "<chainId>-<txHash>-<logIndex>", chainId, owner, vault, verdict: Verdict, caller, shares, assets, remainingShares, txHash, at }`
  - `VaultFlowHour { id: "<chainId>-<vault>-<hourTs>", chainId, vault, hourTs, inAssets, outAssets, largestOut }`
  - `LargeWithdrawal { id, chainId, vault, owner, assets, at }`: assets ≥ 1% of the vault's last-seen totalAssets, tracked from cumulative flows
- Config: networks 10143 and 143. Contracts: `TareRiskOracle`, `GuardianV2`, `ERC4626Vault` (shared ABI: `Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)` and `Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)`), with addresses from the files. `start_block` = `deployBlockV2` for Tare contracts, and the same block for vaults.

- [ ] **Step 1: Load the `indexer` skill** and follow its setup (`pnpx envio init` template "contract import" off; write the files by hand).
- [ ] **Step 2: Write failing handler tests** with Envio's `TestHelpers.MockDb`:
  - `VerdictPosted creates Verdict`
  - `VerdictResolved updates it`
  - `Enabled then Disabled flips Protection.enabled`
  - `Exited links to Verdict by latest id`
  - `two Withdraws in one hour sum into one VaultFlowHour and track largestOut`
- [ ] **Step 3: Run** `pnpm -C indexer test`. Expected: FAIL.
- [ ] **Step 4: Implement** the handlers. Then `pnpm -C indexer codegen && pnpm -C indexer dev` against testnet. Expected: the entities appear for the Task 6 deploy.
- [ ] **Step 5: Deploy to Envio Cloud** (ask Ganadhish to sign in). Record the GraphQL URL as the `ENVIO_GRAPHQL_URL` secret and `NEXT_PUBLIC_ENVIO_URL`.
- [ ] **Step 6: Commit** `feat(indexer): Envio HyperIndex for verdicts, protections, exits and vault flows`.

### Task 16: Backend reads Envio (with fallback)

**Files:**
- Create: `backend/src/envio.ts`, `backend/test/envio.test.ts`
- Modify: `backend/src/watcher.ts` (replace the injected `null`/`[]`)

**Interfaces:**
- Produces:
  - `readFlows(env, network, vault, now): Promise<Flows | null>`: sums the last hour of `VaultFlowHour` and computes `netOutPctTvl` against the current totalAssets. Returns `null` on any error.
  - `readProtections(env, network, vault): Promise<{ owner: Address; minConfidenceBps: number }[]>`: Envio first. On error, falls back to `getLogs` for GuardianV2 `Enabled`/`Disabled` from `deployBlockV2`, in 100-block chunks like `worker/index.ts`.
- [ ] **Step 1: Write failing tests:**
  - `readFlows: GraphQL error → null`
  - `readFlows: sums in/out and computes pct`
  - `readProtections: Envio down → getLogs fallback returns the enabled owners`
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement and wire into the watcher.**
- [ ] **Step 4: Run** `pnpm -C backend test`. Expected: PASS.
- [ ] **Step 5: Redeploy** with `wrangler deploy`. Commit `feat(backend): vault flows and protections from Envio`.

---

## Phase E: App

### Task 17: Network provider, switch, wagmi on both chains

**Files:**
- Create: `components/network/NetworkProvider.tsx`, `components/network/NetworkSwitch.tsx`, `components/network/RealFundsBanner.tsx`, `components/network/resolve.ts`, `components/network/resolve.test.ts`
- Modify: `lib/wagmi.ts` (chains `[monadTestnet, monadMainnet]`), `app/providers.tsx`, `components/ui/AppHeader.tsx`, `components/ui/FaucetButton.tsx` (render nothing unless `features.faucet`), `components/ui/navItems.ts` (Launch and Demo controls only when their feature is on; add Ledger)

**Interfaces:**
- Produces:
  - `resolveNetwork(urlParam: string | null, stored: string | null): Network` (order per Global Constraints)
  - `useNetwork(): { network: Network; config: NetworkConfig; setNetwork(n: Network): void; walletOnRightChain: boolean; switchWalletChain(): Promise<void> }`. `setNetwork` writes localStorage `tare.network` and replaces `?network=`.
- [ ] **Step 1: Write failing tests:**
  - `resolveNetwork('mainnet', 'testnet') === 'mainnet'`
  - `resolveNetwork(null, 'mainnet') === 'mainnet'`
  - `resolveNetwork('bogus', null) === 'testnet'`
  - `navItems(mainnet) has no Launch or Demo controls and has Ledger`
- [ ] **Step 2: Run** `pnpm test components/network components/ui`. Expected: FAIL.
- [ ] **Step 3: Implement.** The switch is a two-segment control in the header, and the banner shows only on mainnet.
- [ ] **Step 4: Run** `pnpm test && npx tsc --noEmit && pnpm lint`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(app): testnet/mainnet switch`.

### Task 18: Backend client and data wiring

**Files:**
- Create: `lib/backend.ts`, `lib/backend.test.ts`
- Modify: `lib/api.ts` (`readMarket` reads the backend when `BACKEND_URL` is set, else today's cache, else fixtures), `app/api/watch/stream/route.ts` (proxy to `/v1/events` or remove if Watch polls directly), `.env.example` (`BACKEND_URL`, `NEXT_PUBLIC_BACKEND_URL`, `NEXT_PUBLIC_ENVIO_URL`)

**Interfaces:**
- Produces: `backend = { pools(), pool(id), verdicts({network, vault?, cursor?, limit?}), latest(network, vault), events(network, owner, since?), score(network) }`, typed with the D1 row shapes from Task 8. It throws `BackendUnavailable` on non-2xx.
- [ ] **Step 1: Write failing tests** (mocked fetch):
  - `backend.verdicts builds the query string`
  - `non-2xx throws BackendUnavailable`
  - `readMarket prefers fixtures when DATA_SOURCE=fixtures even if BACKEND_URL is set`
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test`. Expected: PASS, including `lib/offline.test.ts`.
- [ ] **Step 5: Commit** `feat(app): read pools and events from the backend`.

### Task 19: Deposit + Protect flow

**Files:**
- Modify: `components/advisor/DepositFlow.tsx`, `components/slip/VerdictSlip.tsx` (action: Deposit vs "Open on protocol" via `vaultForPool`), `components/tx/validateAmount.ts` (soft cap)
- Create: `components/advisor/ProtectStep.tsx`, `components/advisor/DepositFlow.test.tsx` (Vitest + Testing Library; add `@testing-library/react` and `jsdom` as dev deps and set the test file's environment with `// @vitest-environment jsdom`)

**Interfaces:**
- Consumes: `useNetwork`, `NETWORKS`, `abis.guardianV2`, `abis.erc4626`, `useTx` (existing).
- Produces:
  - `validateAmount(amount, balance, { softCapUsd, alreadyDepositedUsd })` returns `'over_soft_cap'` when it would exceed the cap
  - `ProtectStep` props `{ vault: Address; onDone(): void }`: slider 80-99 (default 90) → `minConfidenceBps`, select 5/10/30/60 min (default 10) → `maxAge` seconds. Sends `vault.approve(guardianV2, maxUint256)`, then `guardianV2.enable(vault, bps, maxAge)`.
- [ ] **Step 1: Write failing tests:**
  - `DepositFlow blocks when wallet chain != selected network` (buttons disabled, "Switch to Monad Mainnet" shown)
  - `mainnet first deposit shows the real-funds confirmation`
  - `validateAmount returns over_soft_cap above $1,000 on mainnet and never on testnet`
  - `slip shows "Open on protocol" for a pool with no vault on the current network`
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test && npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(app): deposit and protect with GuardianV2 on both networks`.

### Task 20: Watch v2

**Files:**
- Modify: `components/watch/PositionCard.tsx`, `components/watch/AutopilotToggle.tsx` (now opens `ProtectStep` / calls `disable`), `components/watch/EventFeed.tsx`, `app/(app)/app/watch/page.tsx`, `lib/positions.ts` (read positions for `NETWORKS[network].vaults` on that chain, plus `rules(owner, vault)` from GuardianV2)
- Test: `lib/positions.test.ts`, `components/watch/EventFeed.test.tsx`

**Interfaces:**
- Produces: `readPositions(network, owner): Promise<PositionV2[]>`, where `PositionV2 = { vault: VaultConfig; shares: bigint; assets: bigint; rule: { enabled: boolean; minConfidenceBps: number; maxAge: number } | null; latest: { id: string; verdict: 'HOLD'|'EXIT'|'MOVE'; confidenceBps: number; postedAt: number; txHash: Hex; stateUrl: string } | null }`. "Exit now" calls `vault.redeem(shares, owner, owner)` from the user's wallet.
- [ ] **Step 1: Write failing tests:**
  - `readPositions skips vaults with zero shares`
  - `readPositions attaches the rule and latest verdict`
  - `EventFeed renders "Partly out" with the locked amount for a partial exit event`
  - `EventFeed links tx hashes to the selected network's explorer`
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(app): Watch shows onchain verdicts, rules and Exit now`.

### Task 21: Ledger page and scoring

**Files:**
- Create: `shared/score.ts`, `shared/score.test.ts`, `components/ledger/LedgerTable.tsx`, `components/ledger/Scoreboard.tsx`, `app/(app)/app/ledger/page.tsx`
- Modify: `backend/src/api.ts` (`/v1/ledger/score` uses the real `scoreLedger`)

**Interfaces:**
- Produces: `scoreLedger(rows: { verdict: 'HOLD'|'EXIT'|'MOVE'; confidenceBps: number; riskBps: number; resolved: boolean; adverse: boolean }[]): { n: number; brier: number | null; early: boolean; bands: { band: '80-89'|'90-94'|'95-100'|'<80'; n: number; hitRate: number | null }[] }`.
  - Only resolved rows count.
  - `brier = mean((riskBps/10000 - adverse)^2)`.
  - A hit is an EXIT with adverse, or a HOLD/MOVE without adverse.
  - `early = n < 30`.
- Page: network filter, vault filter, verdict filter. Columns per spec §7: oracle tx link, "What Jev saw" → `${R2_PUBLIC_URL}/state/${stateHash}.json`, outcome pending/adverse/clear with reasons decoded from the bitmask (1 = price drop, 2 = TVL drop, 4 = liquidity), and a "drill" tag. A Method section quotes the three criteria, the windows (1 h testnet, 24 h mainnet), the endpoint-only limitation, and "anyone can call `resolve`".
- [ ] **Step 1: Write failing tests:**
  - `scoreLedger ignores unresolved rows`
  - `brier of perfect forecasts is 0`
  - `EXIT+adverse counts as a hit, HOLD+adverse as a miss`
  - `n=12 → early true`
  - `band boundaries 8999→80-89, 9000→90-94, 9500→95-100`
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the score, page and components (Field visual tokens, Geist Mono numbers, phone width).
- [ ] **Step 4: Run** `pnpm test && pnpm -C backend test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(app): public verdict ledger and scoreboard`.

### Task 22: Playwright smoke on both networks

**Files:**
- Create: `playwright.config.ts`, `e2e/smoke.spec.ts`
- Modify: `package.json` (devDependency `@playwright/test`, script `"e2e": "playwright test"`)

- [ ] **Step 1: Write** `smoke: <page> renders on <network>` for `/`, `/app/explore`, `/app/advisor`, `/app/watch`, `/app/ledger`, each with `?network=testnet` and `?network=mainnet`, against `DATA_SOURCE=fixtures pnpm build && pnpm start`. Assert: no console errors; on mainnet the "Real funds" banner is visible and there is no faucet button; on testnet the faucet is visible. Use the preinstalled Chromium (`executablePath: '/opt/pw-browsers/chromium'` if versions differ; never run `playwright install`).
- [ ] **Step 2: Run** `pnpm e2e`. Expected: fails until fixtures cover `/v1/verdicts`. Add `fixtures/verdicts-ledger.json` and make `lib/backend.ts` serve fixtures when `DATA_SOURCE=fixtures`.
- [ ] **Step 3: Run** `pnpm e2e`. Expected: PASS (10 tests).
- [ ] **Step 4: Commit** `test(e2e): smoke both networks`.

---

## Phase F: Proof

### Task 23: Testnet stress run and mainnet proof

**Files:**
- Modify: `README.md` (new deployed-contracts tables for v2 on both networks, architecture diagram from spec §3, the "Try the full demo" steps on GuardianV2, mainnet proof tx links, the ledger URL)

- [ ] **Step 1: Testnet:**
  1. deposit 500 USDC via the app
  2. Protect at 90% / 10 min
  3. Demo controls Stress 95%/0.5%
  4. confirm on Watch: a verdict tx, then an exit tx whose `Exited` names that `verdictId`
  5. confirm `/app/ledger` shows the verdict, and after 1 h shows it graded
- [ ] **Step 2: Mainnet** (Ganadhish's wallet, a few USDC):
  1. deposit into the approved Euler vault via the app
  2. Protect at 80%
  3. if no natural EXIT arrives, ask Ganadhish to approve a drill, then call `POST /v1/admin/drill` (Task 13)
  4. the exit lands
  5. record both tx links
- [ ] **Step 3: Verify:**
  - `forge test` all green
  - `pnpm test` all green
  - `pnpm -C backend test` green
  - `pnpm -C indexer test` green
  - `pnpm e2e` green
  - `curl https://<worker>/health` → 200
- [ ] **Step 4: Commit** `docs: Guardian v2 deployments, ledger and proof transactions`.

