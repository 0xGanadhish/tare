# Tare Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. On build day the orchestrator dispatches tasks per spec §15; each task's **Agent** line says who runs it.

**Goal:** Build Tare — a Monad yield-intelligence app (Discover, Decide, Idle scan, Deposit + Watch + Guardian auto-exit, yield-backed Launch) — in one 6-hour build (feature freeze 3:30 PM).

**Architecture:** One Next.js App Router project at `~/code/personal/tare` with a Foundry subproject (`contracts/`) and a Node worker (`worker/`). The worker refreshes pools, asks Jev, runs the watchdog/keeper and writes JSON under `cache/`; the Next.js app reads `cache/` (falling back to `fixtures/`) and calls Jev only for user-initiated actions. All user transactions go to Monad testnet; mainnet is read for data, and the contracts are also deployed there for the bonus (F1).

**Tech Stack:** Node ≥ 22 (the laptop runs v26.7), pnpm, Next.js 15 (App Router, TypeScript), Tailwind CSS v4, `geist` fonts, wagmi v2 + viem v2 + @tanstack/react-query, vitest, tsx, Foundry + OpenZeppelin Contracts v5 (Solidity 0.8.24).

**Spec:** `docs/superpowers/specs/2026-10-10-tare-design.md` (copied into the build repo at Task 0). Section references below (§n) point into it.

## Global Constraints

- Build repo: `~/code/personal/tare`. Nothing is built in `monad-blitz-research`.
- Chains: Monad mainnet id `143`, RPC `https://rpc.monad.xyz` (read-only). Monad testnet id `10143`, RPC `https://testnet-rpc.monad.xyz`, explorer `https://testnet.monadexplorer.com`.
- Multicall3 on mainnet: `0xcA11bde05977b3631167028862bE2a173976CA11` (verified 2026-10-10).
- Pools: DeFiLlama, `chain == "Monad"` and `tvlUsd ≥ 100_000`.
- Jev: `POST https://api.typesafe.ai/v1/systemone`, `model: "jev-latest"`, timeout 8 s, server-side only.
- Thresholds: intent chip confidence < 0.6 → "?"; verdict bands high ≥ 0.8, medium ≥ 0.6; auto-exit ≥ 0.9; alert 0.6–0.9; re-judge when |ΔAPY| > 50 bps or |Δutil| > 500 bps; Jev concurrency 4.
- Colors: bg `#F6F5F1`, ink `#16151A`, secondary `#6B6974`, muted `#8B8894`, hairline `#E6E4DE`, deposit `#6E54F5`, avoid `#E2552C`, consider ring `#B9B6C3`, slip paper `#FFFEFB`. Fonts: Geist (headings weight 500, tracking −0.035em) and Geist Mono for numbers/captions.
- Every page works at 375 px width with no horizontal scroll.
- No fake success: a transaction is "confirmed" only after a receipt with `status === 'success'` (§10). Simulated parts are labeled "Testnet mirror · …".
- Secrets only in server `.env`: `TYPESAFE_API_KEY`, `OPERATOR_PRIVATE_KEY`, `ADMIN_TOKEN`. Nothing secret uses a `NEXT_PUBLIC_` prefix.
- Deposits are USDC-only (MockUSDC, 6 decimals). Contracts read the token from `vault.asset()`, never hardcode USDC.
- File ownership per spec §15. Workers never add dependencies; they request them in `reports/<task-id>.md`.
- Every task ends by writing `reports/<task-id>.md` in the format of spec §15.
- Only announce what works: the rubric scores "all announced functions are working", so anything unfinished at 3:30 is hidden from the nav and left out of the pitch.
- **monskills** (`therealharpaljadeja/monskills`, installed at T0 into `.claude/skills/`) is reference material for Monad-specific behavior. A task's **Skills** line names the ones to read. Claude builders load them as skills; GPT briefs give the file path (`.claude/skills/<name>/SKILL.md`). **Where monskills and the spec disagree, the spec wins:**
  - wallets use wagmi with injected wallets, not Para (`wallet-integration`)
  - deploys use `forge script` with the operator key, not Alchemy Agent Wallet or CreateX (`wallet`)
  - no Envio indexer (`indexer`) and no monskills metadata file
- Monad gas: fees are charged on the **gas limit**, not gas used. Use viem's estimate and don't add large manual buffers; a native MON transfer is exactly 21 000.
- Monad reserve balance: every EOA keeps a 10 MON floor, and low-balance accounts get about 1 tx per 1.2 s. The operator and demo wallets each need well over 10 testnet MON.

## Review Focus

1. **Scan input that is not a valid address** (ENS name, missing `0x`, wrong length) → friendly "Not a valid Monad address" and HTTP 400, never a crash. Test in Task B4 and B5.
2. **Free-text amounts in odd formats** ("$1.5k", "2,000 AUSD", "500usdc", no amount at all) → parsed amount or `null`, never `NaN`. Test in Task B2.
3. **DeFiLlama rows with `null`/`0` APY fields** → `realApy = 0`, `incentiveShare = 0`, no `NaN` reaching the chart or ranking. Test in Task B1.
4. **Jev unreachable, slow or returning malformed JSON** → `NOT_JUDGED` verdict and no auto-exit. Test in Task B2.
5. **Exit when the Guardian allowance is 0 or liquidity is 0** → `NothingToExit` revert, watchdog records `exit_failed`, UI shows red alert. Tests in Tasks A2 and A4.

---

## File Structure

```
~/code/personal/tare/
  docs/                      spec + this plan (copied in Task 0)
  shared/                    ORCHESTRATOR — types.ts, chains.ts, tokens.ts, cache.ts, contracts.ts, addresses.testnet.json
  fixtures/                  ORCHESTRATOR — pools.json, verdicts.json, scan-<addr>.json
  scripts/                   ORCHESTRATOR — snapshot.ts, calibrate-jev.ts (B2)
  lib/                       STREAM B — classify, indexer, intent, jev, judge/*, advisor, idle, positions, jobs/refreshPools
  app/api/                   STREAM B — route handlers
  contracts/                 STREAM A — Foundry: src/, test/, script/ (launch/ = LAUNCH)
  worker/                    STREAM A — index.ts, watchdog.ts, operator.ts
  app/(site)/                STREAM C — landing
  app/(app)/app/             STREAM C — explore, pulse, scan, advisor, watch, admin (launch/ = LAUNCH)
  components/                STREAM C — field/, slip/, tx/, ui/, pulse/
  styles/                    STREAM C — tokens.css
  .claude/agents/  .omp/blitz.yml  reports/  cache/ (gitignored)
```

## Task Order (maps to spec §14)

Nothing starts before 11:30 or before the user's go command. Feature work ends at 3:30, two hours before code freeze, so every rubric point can be collected. The dependency arrows are what must hold; the user may reorder within a slot.

| Clock (IST) | Tasks (parallel within a row) |
|---|---|
| 11:30–11:50 | **T0** (includes the public GitHub repo) |
| 11:50–1:15 | A1 → A2 → A3 · B1 → B2 → B3 · C1 → C2 |
| 1:15 | **CP1** + teaser post (P1) |
| 1:15–2:30 | A4 · B4 → B5 · C3 → C4 → C5 · L1 (second GPT tab) · C7 |
| 2:30 | **CP2** |
| 2:30–3:30 | L2 · C6 · fixes from the CP2 run |
| **3:30** | **CP3: feature freeze** |
| 3:30–5:30 | **F1**: mainnet deploy, verification, custom domain, README, videos and posts, rehearsals |
| 5:30 | Code freeze (organizers). Nothing is pushed after this. |
| 5:40 | Submit on the Blitz portal (deadline 5:45) |

**Hard deadlines from the organizers:** code freeze 5:30 PM, submission 5:45 PM, demos 6:00–8:30 PM (3 minutes each). Judging uses a 400-point rubric with no peer voting (spec §14).

---

### Task T0: Bootstrap the build repo

**Agent:** Orchestrator (Opus, high).

**Files:**
- Create: `~/code/personal/tare/` with everything under `shared/`, `fixtures/`, `scripts/snapshot.ts`, `.claude/agents/{builder-light,builder,builder-deep}.md`, `.omp/blitz.yml`, `.env.example`, `.gitignore`, `reports/.gitkeep`, `docs/` (copies of spec and plan)
- Test: `shared/cache.test.ts`, `shared/tokens.test.ts`

**Interfaces:**
- Produces:
  - `shared/types.ts` — exactly the types in spec §7.4, plus `export interface VaultStats { apyBps: number; utilBps: number }` and `export interface MirrorInfo { address: \`0x${string}\`; mirrorOf: string; poolId: string | null }`.
  - `shared/chains.ts` — `monadMainnet` (id 143, `contracts.multicall3` set) and `monadTestnet` (id 10143) as viem `Chain`s; prefer `viem/chains` exports when they exist, else `defineChain`.
  - `shared/tokens.ts` — `MAINNET_TOKENS: { symbol: string; address: \`0x${string}\`; decimals: number; assetClass: AssetClass; earning: boolean }[]` (list below) and `NATIVE_MON` (decimals 18, `mon`, not earning).
  - `shared/cache.ts` — `readPools(): Promise<{ pools: Pool[]; asOf: string }>`, `readVerdicts(): Promise<Record<string, Verdict>>`, `writeCache(name: 'pools' | 'verdicts', data: unknown): Promise<void>`, `appendEvent(e: WatchEvent): Promise<void>`, `readEvents(afterId?: string): Promise<WatchEvent[]>`. Reads `cache/<name>.json`, falls back to `fixtures/<name>.json`; `DATA_SOURCE=fixtures` forces fixtures.
  - `shared/contracts.ts` — `abis` built with viem `parseAbi` from the signatures in spec §8 (MockToken, MirrorVault incl. ERC-4626 + `setStats`/`apyBps`/`utilizationBps`/`mirrorOf`/`availableLiquidity`/`StatsUpdated`, Guardian incl. events and errors, LaunchFactory/CurveToken), and `addresses` loaded from `shared/addresses.testnet.json` (initially `{}` until A3).
  - `fixtures/pools.json` — `{ pools: Pool[], asOf }` produced by `scripts/snapshot.ts`; `fixtures/verdicts.json` — placeholder verdicts marked `"source": "heuristic-placeholder"` (AVOID if `apy > 5 && incentiveShare > 0.5`; DEPOSIT if `tvlUsd > 5e6 && incentiveShare < 0.3 && apy > 0`; else CONSIDER; confidence 0.5). Replaced by real Jev output at CP1.

Mainnet token list (first five verified on-chain 2026-10-10; verify the rest in Step 4):

| symbol | address | decimals | class | earning |
|---|---|---|---|---|
| USDC | `0x754704bc059f8c67012fed69bc8a327a5aafb603` | 6 | stable | no |
| AUSD | `0x00000000efe302beaa2b3e6e1b18d08d69a9012a` | 6 | stable | no |
| USDT0 | `0xe7cd86e13ac4309349f30b3435a9d337750fc82d` | 6 | stable | no |
| WMON | `0x3bd359c1119da7da1d913d1c4d2b7c461115433a` | 18 | mon | no |
| XAUt0 | `0x01bff41798a0bcf287b996046ca68b395dbc1071` | 6 | gold | no |
| shMON | `0x1b68626dca36c7fe922fd2d55e4f631d962de19c` | verify | mon | yes |
| sMON | `0xa3227c5969757783154c60bf0bc1944180ed81b9` | verify | mon | yes |
| gMON | `0x8498312a6b3cbd158bf0c93abdcf29e6e4f55081` | verify | mon | yes |
| WBTC | `0x0555e30da8f98308edb960aa94c0db47230d2b9c` | verify | btc_eth | no |
| WETH | `0xee8c0e9f1bffb4eb878d8f15f368a02a35481242` | verify | btc_eth | no |

- [ ] **Step 1: Create the repo and scaffold**

```bash
mkdir -p ~/code/personal/tare && cd ~/code/personal/tare && git init
pnpm create next-app@15 . --ts --app --tailwind --eslint --no-src-dir --import-alias "@/*" --use-pnpm
pnpm add viem@2 wagmi@2 @tanstack/react-query geist
pnpm add -D vitest tsx @types/node
forge init contracts --no-git && cd contracts && forge install OpenZeppelin/openzeppelin-contracts@v5.1.0 --no-git && cd ..
jq '.compilerOptions.target = "ES2020"' tsconfig.json > tsconfig.tmp && mv tsconfig.tmp tsconfig.json
npx skills add therealharpaljadeja/monskills --skill '*' -a claude-code --copy -y
mkdir -p docs shared fixtures scripts reports cache .claude/agents .omp
cp ~/code/personal/monad-blitz-research/docs/superpowers/specs/2026-10-10-tare-design.md docs/spec.md
cp ~/code/personal/monad-blitz-research/docs/superpowers/plans/2026-10-10-tare.md docs/plan.md
```

The `tsconfig` target goes to ES2020 because viem/wagmi BigInt literals fail to typecheck on Next's default ES2017 (a monskills `scaffold` gotcha). Check `ls .claude/skills` lists `monskill scaffold concepts addresses gas wallet-integration indexer tooling-and-infra why-monad` (the CLI skips `wallet`; we don't need it). If the `skills` CLI fails, run `git clone --depth 1 https://github.com/therealharpaljadeja/monskills /tmp/monskills && cp -R /tmp/monskills/skills/* .claude/skills/` instead. Commit `.claude/skills/` with the repo.

After the first commit, create the public repo and push: `gh repo create tare --public --source . --push` (the user confirms the name first). Push at every checkpoint.

Add `"test": "vitest run"` and `"worker": "tsx watch worker/index.ts"` to `package.json` scripts. `.gitignore` adds `cache/`, `.env`, `contracts/out/`, `contracts/cache/`, `contracts/broadcast/`.

- [ ] **Step 2: Write agent and OMP config**

`.claude/agents/builder-light.md`, `builder.md`, `builder-deep.md`: frontmatter `model: sonnet`, effort `low` / `medium` / `high`; body: "Read docs/spec.md sections named in your brief and your task in docs/plan.md. Touch only the files your task lists. Do not explore the repo. If your brief names monskills, read `.claude/skills/<name>/SKILL.md` first; where it disagrees with docs/spec.md, the spec wins. End by writing reports/<task-id>.md in the spec §15 format."
`.omp/blitz.yml`: exactly the block in spec §15, including `smol: openai-codex/gpt-6.1-sol:medium` and the `bash.patterns` allowlist. Briefs for GPT workers ask for plain shell commands, with no `( ) ; | & $`, so the allowlist applies.
`.env.example`: `TYPESAFE_API_KEY=`, `OPERATOR_PRIVATE_KEY=`, `ADMIN_TOKEN=`, `DATA_SOURCE=`, `NEXT_PUBLIC_DEMO_WHALE=0xf70da97812cb96acdf810712aa562db8dfa3dbef`.

- [ ] **Step 3: Write the failing tests for `shared/cache.ts`**

```ts
test('readPools falls back to fixtures when cache file is missing', async () => {
  process.env.CACHE_DIR = mkdtempSync(join(tmpdir(), 'c-'));
  const { pools } = await readPools();
  expect(pools.length).toBeGreaterThan(100);
});
test('DATA_SOURCE=fixtures ignores a present cache file', async () => { /* write cache/pools.json with [] → still >100 */ });
test('appendEvent then readEvents(afterId) returns only newer events', async () => { /* append e1,e2 → readEvents(e1.id) == [e2] */ });
```

- [ ] **Step 4: Implement `shared/*`, run `scripts/snapshot.ts`, verify tokens**

`scripts/snapshot.ts` fetches DeFiLlama `/pools`, normalizes with a temporary inline copy of the §6.2/§6.3 rules (B1 replaces it with `lib/indexer` at CP1), writes `fixtures/pools.json` and the placeholder `fixtures/verdicts.json`. `shared/tokens.test.ts` (network, tagged `it.skipIf(!process.env.ONLINE)`) calls `symbol()`/`decimals()` on every token and asserts they match the table; fill the `verify` decimals from its output.

- [ ] **Step 5: Run tests and builds**

Run: `pnpm test && ONLINE=1 pnpm vitest run shared/tokens.test.ts && (cd contracts && forge build)`
Expected: all PASS; forge build succeeds.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "chore: bootstrap tare (shared types, cache, fixtures, agent config)"
```

---

### Task A1: MockToken + MirrorVault

**Agent:** `builder-deep` (Sonnet, high).
**Skills:** monskills `gas`.

**Files:**
- Create: `contracts/src/MockToken.sol`, `contracts/src/MirrorVault.sol`
- Test: `contracts/test/MirrorVault.t.sol`

**Interfaces:**
- Produces:
  - `MockToken(string name, string symbol, uint8 decimals)`; `function mint(address to, uint256 amount) external` (open).
  - `MirrorVault(IERC20 asset, string name, string symbol, string mirrorOf, uint16 apyBps, uint16 utilizationBps, address admin)` extends OZ `ERC4626`.
  - `function setStats(uint16 apyBps, uint16 utilizationBps) external` (admin only, accrues first) emitting `event StatsUpdated(uint16 apyBps, uint16 utilizationBps, uint256 timestamp)`.
  - Public getters `mirrorOf()`, `apyBps()`, `utilizationBps()`, `admin()`; `function availableLiquidity() public view returns (uint256)`.
  - `error NotAdmin();`

- [ ] **Step 1: Write the failing tests**

```solidity
function test_accrualRaisesSharePrice() public {
  // apy 1000 bps; user deposits 1_000e6; warp 365 days
  assertApproxEqAbs(vault.convertToAssets(vault.balanceOf(user)), 1_100e6, 1e6);
}
function test_maxWithdrawFollowsUtilization() public {
  // deposit 1_000e6; admin setStats(500, 9_200)
  assertApproxEqAbs(vault.maxWithdraw(user), 80e6, 1);
  assertApproxEqAbs(vault.maxRedeem(user), vault.convertToShares(80e6), 1);
}
function test_setStatsOnlyAdmin() public { vm.expectRevert(MirrorVault.NotAdmin.selector); vm.prank(user); vault.setStats(1, 1); }
function test_setStatsEmitsEvent() public { vm.expectEmit(); emit MirrorVault.StatsUpdated(700, 8_000, block.timestamp); vm.prank(admin); vault.setStats(700, 8_000); }
function test_totalAssetsIncludesPendingInterest() public { /* deposit, warp 30 days, totalAssets() > token.balanceOf(vault) */ }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd contracts && forge test --match-contract MirrorVaultTest`
Expected: FAIL (contracts not found).

- [ ] **Step 3: Implement**

Accrual per spec §8.2: `_accrue()` mints `raw × apyBps × elapsed / (365 days × 10_000)` via `MockToken(asset()).mint(address(this), …)` and updates `lastAccrual`; call it at the start of `deposit`, `mint`, `withdraw`, `redeem`, `setStats`. `totalAssets()` = balance + pending interest. `maxWithdraw`/`maxRedeem` = `min(super, availableLiquidity())` (convert for shares). `availableLiquidity() = totalAssets() * (10_000 - utilizationBps) / 10_000`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `forge test --match-contract MirrorVaultTest -vv`
Expected: 5 PASS.

- [ ] **Step 5: Commit** — `git add contracts/src contracts/test && git commit -m "feat(contracts): MockToken and MirrorVault with accrual and liquidity cap"`; write `reports/A1.md`.

---

### Task A2: Guardian

**Agent:** `builder-deep` (Sonnet, high).
**Skills:** monskills `gas`.

**Files:**
- Create: `contracts/src/Guardian.sol`
- Test: `contracts/test/Guardian.t.sol`

**Interfaces:**
- Consumes: `MirrorVault` (A1).
- Produces: `Guardian(address admin, address keeper)`; `setVaultApproved(address vault, bool ok)` (admin); `enable(address vault)`, `disable(address vault)` (owner); `exit(address vault, address owner) returns (uint256 assets)` (keeper); `enabled(address owner, address vault) view returns (bool)`; `approvedVault(address) view returns (bool)`; events `Enabled(address indexed owner, address indexed vault)`, `Disabled(…)`, `Exited(address indexed owner, address indexed vault, uint256 shares, uint256 assets)`; errors `NotAdmin()`, `NotKeeper()`, `VaultNotApproved()`, `NotEnabled()`, `NothingToExit()`.

- [ ] **Step 1: Write the failing tests**

```solidity
function test_exitPaysOwner() public {
  // user deposits 500e6, approves guardian on shares, enables; keeper exits
  assertApproxEqAbs(usdc.balanceOf(user), 500e6, 1);
  assertEq(usdc.balanceOf(address(guardian)), 0);
  assertEq(vault.balanceOf(user), 0);
}
function test_exitRevertsForNonKeeper() public { vm.expectRevert(Guardian.NotKeeper.selector); guardian.exit(address(vault), user); }
function test_exitRevertsWhenNotEnabled() public { /* approved, not enabled */ vm.expectRevert(Guardian.NotEnabled.selector); }
function test_exitRevertsForUnapprovedVault() public { vm.expectRevert(Guardian.VaultNotApproved.selector); }
function test_exitRevertsWhenNothingToExit() public { /* enabled but share allowance 0 */ vm.expectRevert(Guardian.NothingToExit.selector); }
function test_partialExitWhenLiquidityCapped() public {
  // user 1_000e6 and other 1_000e6 deposited; setStats(500, 9_200) → available 160e6
  // keeper exit → user receives ≈160e6, still holds shares
}
function test_disableStopsExit() public { /* enable, disable → NotEnabled */ }
```

- [ ] **Step 2: Run** `forge test --match-contract GuardianTest` — Expected: FAIL.
- [ ] **Step 3: Implement** per spec §8.3 invariants: `shares = min(balanceOf(owner), maxRedeem(owner), allowance(owner, address(this)))`; `if (shares == 0) revert NothingToExit();`; `assets = IERC4626(vault).redeem(shares, owner, owner)`. No receiver parameter anywhere.
- [ ] **Step 4: Run** `forge test -vv` — Expected: all A1 + A2 tests PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(contracts): Guardian auto-exit with owner-only payout"`; write `reports/A2.md`.

---

### Task A3: Deploy to Monad testnet

**Agent:** `builder` (Sonnet, medium). Needs `OPERATOR_PRIVATE_KEY` in `.env` (operator wallet funded with testnet MON).
**Skills:** monskills `addresses` (testnet explorer, `cast code` check after deploy) and `concepts` → `reserve-balance.md`, `async-execution.md`.

**Files:**
- Create: `contracts/script/Deploy.s.sol`, `contracts/script/mirrors.json`
- Writes: `shared/addresses.testnet.json`

**Interfaces:**
- Consumes: A1, A2.
- Produces: `shared/addresses.testnet.json` = `{ "mockUsdc": "0x…", "guardian": "0x…", "mirrors": [{ "address": "0x…", "mirrorOf": "Clearstar USDC · Euler", "poolId": "<defillama pool id>" }, …4], "launchFactory": null }`.

- [ ] **Step 1: Choose the four mirrors.** From `fixtures/pools.json` (real verdicts after CP1 if available) pick USDC-denominated pools per spec §8.2: Clearstar (Euler), K3 (Euler), one Morpho USDC, one USDC RWA strategy (syrupUSDC or Centrifuge USDC). Write `contracts/script/mirrors.json` with `mirrorOf`, `poolId`, `apyBps = round(apyBase × 100)`, `utilizationBps = 7100`.
- [ ] **Step 2: Implement `Deploy.s.sol`** (chain-aware: it writes `shared/addresses.<testnet|mainnet>.json` from `block.chainid`): deploy `MockToken("Mock USDC","USDC",6)` on testnet, or `MockToken("Tare Demo USD","tareUSD",6)` on mainnet (never name a mainnet token USDC), four `MirrorVault`s from `mirrors.json` (admin = operator), `Guardian(operator, operator)`, `setVaultApproved` for each; seed each mirror with a 40_000e6 operator deposit so liquidity exists; `vm.writeJson` the addresses file.
- [ ] **Step 3: Dry run** `forge script script/Deploy.s.sol --rpc-url https://testnet-rpc.monad.xyz` — Expected: simulation succeeds.
- [ ] **Step 4: Broadcast** the same command with `--broadcast --private-key $OPERATOR_PRIVATE_KEY` — Expected: `shared/addresses.testnet.json` written; `cast call <mirror> "mirrorOf()(string)" --rpc-url …` returns the label.
- [ ] **Step 5: Verify** every deployed contract on the explorers using the verification API in monskills `scaffold` ("Verification (All Explorers)"); fall back to `forge verify-contract` only if that fails. Expected: source shows on testnet MonadVision/Monadscan.
- [ ] **Step 6: Commit** — `git add contracts/script shared/addresses.testnet.json && git commit -m "chore: deploy contracts to Monad testnet"`; `reports/A3.md` lists the addresses (orchestrator owns `shared/` but this file is A3's declared output).

---

### Task A4: Worker — operator, watchdog, scheduler

**Agent:** `builder` (Sonnet, medium).
**Skills:** monskills `gas` and `concepts` → `reserve-balance.md` (keeper transactions), `block-states.md`.

**Files:**
- Create: `worker/operator.ts`, `worker/watchdog.ts`, `worker/index.ts`
- Test: `worker/watchdog.test.ts`

**Interfaces:**
- Consumes: `shared/contracts.ts`, `shared/cache.ts`, `judgePosition` / `decideAction` / `shouldRejudge` (B2), `refreshPools` (B4 — runs in parallel; until B4 lands, `worker/index.ts` imports it behind a try/catch and logs "refreshPools unavailable", the orchestrator confirms the wiring at CP2).
- Produces:
  - `worker/operator.ts`: `sendSetStats(vault: \`0x${string}\`, stats: VaultStats): Promise<{ txHash: \`0x${string}\`; block: bigint; seconds: number }>` and `sendExit(vault, owner): Promise<{ txHash; block; seconds; assets: bigint }>` — both wait for the receipt and throw on `status !== 'success'`.
  - `worker/watchdog.ts`: `createWatchdog(deps: { readStats, readEnabled, judge, exit, emit }): { tick(): Promise<void> }` — dependency-injected so it is testable without a chain.
  - `worker/index.ts`: runs `refreshPools()` at start and every 10 min; runs `watchdog.tick()` every 1 s (no overlapping ticks).

- [ ] **Step 1: Write the failing tests (fake deps)**

```ts
test('auto-exits when exit confidence ≥ 0.9 and autopilot is on', async () => { /* expect exit called once, events: judged, exit_sent, exit_confirmed */ });
test('alerts instead of exiting when confidence is 0.75', async () => { /* exit not called; event type 'alert' */ });
test('does not re-judge when util moved by only 300 bps', async () => { /* judge not called */ });
test('records exit_failed when exit throws NothingToExit, retries at most 2 times', async () => { /* exit called 3 times total, last event exit_failed */ });
test('never exits when judge throws (Jev down); falls back to util > 9_500 alert', async () => { /* exit not called; 'alert' event */ });
```

- [ ] **Step 2: Run** `pnpm vitest run worker` — Expected: FAIL.
- [ ] **Step 3: Implement** per spec §7.3 and §9 watchdog loop. `readStats` uses viem `getLogs` for `StatsUpdated` on the four mirrors from the last seen block; `readEnabled` replays Guardian `Enabled`/`Disabled` logs. Events go through `appendEvent`.
- [ ] **Step 4: Run** `pnpm vitest run worker` — Expected: 5 PASS. Then `pnpm worker` against testnet: changing a mirror with `cast send … setStats` produces `stats_changed` in `cache/watch-events.jsonl` within 2 s.
- [ ] **Step 5: Commit** — `git commit -m "feat(worker): watchdog, keeper and scheduler"`; `reports/A4.md`.

---

### Task B1: classify + indexer

**Agent:** Codex `gpt-6.1-sol` high (OMP).

**Files:**
- Create: `lib/classify.ts`, `lib/indexer.ts`
- Test: `lib/classify.test.ts`, `lib/indexer.test.ts`

**Interfaces:**
- Produces: `assetClass(symbol: string, project: string): AssetClass`; `maturity(symbol: string): string | null` (ISO date); `normalizePool(raw: LlamaPool): Pool`; `fetchMonadPools(fetchImpl?: typeof fetch): Promise<Pool[]>`; `type LlamaPool` (the DeFiLlama row fields listed in spec §6.1).

- [ ] **Step 1: Write the failing tests**

```ts
test.each([
  ['XAUT0', 'neverland', 'gold'], ['PT-AUSD-8OCT2026', 'pendle-v2', 'rwa'], ['SYRUPUSDC', 'aave-v3', 'rwa'],
  ['USDC', 'centrifuge-protocol', 'rwa'], ['SHMON', 'shmonad', 'mon'], ['WMON-SHMON-SMON-GMON', 'curve-dex', 'mon'],
  ['CBBTC', 'morpho-blue', 'btc_eth'], ['USDC', 'euler-v2', 'stable'], ['EARNAUSD', 'upshift', 'stable'], ['YZM', 'x', 'other'],
])('assetClass(%s, %s) = %s', (s, p, c) => expect(assetClass(s, p)).toBe(c));
test('maturity parses PT dates', () => { expect(maturity('PT-AUSD-8OCT2026')).toBe('2026-10-08'); expect(maturity('USDC')).toBeNull(); });
test('normalizePool: null apyBase/apyReward give realApy 0 and incentiveShare 0', () => { /* apy 0, apyBase null → 0, 0, no NaN */ });
test('normalizePool: incentiveShare = apyReward / apy', () => { /* apy 15.68, reward 15.16 → ≈0.967 */ });
test('normalizePool keeps apyPct7D, null when missing', () => { /* … */ });
test('fetchMonadPools keeps only Monad rows with tvlUsd ≥ 100_000', async () => { /* fake fetch with 3 rows → 1 */ });
```

- [ ] **Step 2: Run** `pnpm vitest run lib/classify lib/indexer` — Expected: FAIL.
- [ ] **Step 3: Implement** per spec §6.2 (first match wins, in table order) and §6.3.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(lib): asset classification and pool indexer"`; `reports/B1.md`.

---

### Task B2: Jev client, intent parsing, verdict rules, gating

**Agent:** Codex `gpt-6.1-sol` high (OMP).

**Files:**
- Create: `lib/jev.ts`, `lib/intent.ts`, `lib/judge/state.ts`, `lib/judge/combine.ts`, `lib/judge/gating.ts`, `lib/judge/index.ts`, `scripts/calibrate-jev.ts`
- Test: `lib/intent.test.ts`, `lib/judge/combine.test.ts`, `lib/judge/gating.test.ts`, `lib/judge/index.test.ts`

**Interfaces:**
- Consumes: `Pool`, `Verdict`, `Intent`, `PositionJudgment`, `Choice` (shared/types).
- Produces:
  - `jev(state: string, questions: Record<string, JevQuestion>, opts?: { timeoutMs?: number; fetchImpl?: typeof fetch }): Promise<Record<string, JevAnswer>>`; throws `JevUnavailable` on timeout (8 000 ms default), non-2xx, or malformed JSON. `JevQuestion` = `{ type: 'choice'; instructions: string; criteria: Record<string, string> } | { type: 'score'; instructions: string; criteria: string[] } | { type: 'noul'; instructions: string }`.
  - `parseAmount(text: string): { amount: number | null; asset: string | null }`.
  - `renderPoolState(p: Pool): string`; `renderPositionState(input: PositionInput): string` where `PositionInput = { position: Position; atDeposit: VaultStats; alternative: { name: string; realApy: number } | null }`.
  - `combineVerdict(a: { yieldSource: Choice<'organic' | 'incentive' | 'mixed'>; sustainable: number; risk: { score: number; confidence: number } }): Omit<Verdict, 'poolId' | 'statsHash' | 'judgedAt'>`; `band(confidence: number): 'high' | 'medium' | 'low'`.
  - `decideAction(j: PositionJudgment, autopilot: boolean): 'auto_exit' | 'alert' | 'info' | 'suggest_rotate'`; `shouldRejudge(prev: VaultStats | null, next: VaultStats): boolean`.
  - `parseIntent(text: string): Promise<Intent>`; `judgePool(p: Pool): Promise<Verdict>` (never throws; `NOT_JUDGED` on `JevUnavailable`); `judgePosition(input: PositionInput): Promise<PositionJudgment>` (throws `JevUnavailable`; the watchdog handles it); `statsHash(p: Pool): string`.

- [ ] **Step 1: Write the failing tests**

```ts
test.each([
  ['I have 500 USDC, want something safe', 500, 'USDC'], ['$1.5k for 3 months', 1500, null],
  ['2,000 AUSD', 2000, 'AUSD'], ['500usdc', 500, 'USDC'], ['10 MON staking', 10, 'MON'], ['safe for 3 months', null, null],
])('parseAmount(%s)', (t, a, s) => expect(parseAmount(t)).toEqual({ amount: a, asset: s }));

test('incentive yield that will not persist → AVOID', () => {
  expect(combineVerdict({ yieldSource: { value: 'incentive', confidence: 0.93 }, sustainable: 0.21, risk: { score: 3, confidence: 0.8 } }).label).toBe('AVOID');
});
test('risk 4 → AVOID regardless of source', () => { /* organic 0.9, sustainable 0.9, risk 4 → AVOID */ });
test('organic, sustainable 0.7, risk 2 → DEPOSIT with confidence = min of choice/score confidences', () => {
  const v = combineVerdict({ yieldSource: { value: 'organic', confidence: 0.91 }, sustainable: 0.7, risk: { score: 2, confidence: 0.84 } });
  expect(v.label).toBe('DEPOSIT'); expect(v.confidence).toBe(0.84); expect(v.band).toBe('high'); expect(v.risk).toBe(2);
});
test('mixed source can still be DEPOSIT', () => { /* mixed, 0.7, risk 2 → DEPOSIT */ });
test('organic but sustainable 0.5 → CONSIDER', () => { /* → CONSIDER */ });
test('bands', () => { expect(band(0.8)).toBe('high'); expect(band(0.6)).toBe('medium'); expect(band(0.59)).toBe('low'); });

test('decideAction thresholds', () => {
  const j = (v: 'hold' | 'exit' | 'rotate', c: number) => ({ action: { value: v, confidence: c }, withdrawalRisk: 0, yieldCollapse: 0, statsHash: 'x', at: '' });
  expect(decideAction(j('exit', 0.9), true)).toBe('auto_exit');
  expect(decideAction(j('exit', 0.95), false)).toBe('alert');
  expect(decideAction(j('exit', 0.75), true)).toBe('alert');
  expect(decideAction(j('exit', 0.5), true)).toBe('info');
  expect(decideAction(j('rotate', 0.99), true)).toBe('suggest_rotate');
});
test('shouldRejudge', () => {
  expect(shouldRejudge(null, { apyBps: 500, utilBps: 7100 })).toBe(true);
  expect(shouldRejudge({ apyBps: 500, utilBps: 7100 }, { apyBps: 540, utilBps: 7400 })).toBe(false);
  expect(shouldRejudge({ apyBps: 500, utilBps: 7100 }, { apyBps: 500, utilBps: 9200 })).toBe(true);
});
test('judgePool returns NOT_JUDGED when Jev times out', async () => { /* fetchImpl never resolves, timeoutMs 50 */ });
test('judgePool returns NOT_JUDGED on malformed JSON', async () => { /* fetchImpl returns 200 "oops" */ });
```

- [ ] **Step 2: Run** `pnpm vitest run lib/intent lib/judge` — Expected: FAIL.
- [ ] **Step 3: Implement** questions exactly as spec §7.1–7.3. Map Jev's `score` answer to risk 1–5 by the position of the returned level in our 5-item `criteria` array (check the real response shape once with `scripts/calibrate-jev.ts`). `confidence` excludes noul values.
- [ ] **Step 4: Run** unit tests — Expected: PASS. Then `pnpm tsx scripts/calibrate-jev.ts` (live): prints label/confidence for five golden pools chosen from fixtures (two emission-heavy → expect AVOID; Accountable AUSD → expect DEPOSIT; two others). If two or more disagree, tune thresholds in `combine.ts` and note it in the report.
- [ ] **Step 5: Commit** — `git commit -m "feat(lib): Jev client, intent parsing, verdict and gating rules"`; `reports/B2.md`.

---

### Task B3: Advisor + idle report

**Agent:** Codex `gpt-6.1-sol` high (OMP).

**Files:**
- Create: `lib/advisor.ts`, `lib/idle.ts`
- Test: `lib/advisor.test.ts`, `lib/idle.test.ts`

**Interfaces:**
- Consumes: B1 types/functions, `MAINNET_TOKENS`, `monadMainnet`.
- Produces:
  - `advise(intent: Intent, pools: Pool[], verdicts: Record<string, Verdict>, mirrors: MirrorInfo[]): Recommendation[]` (pure, top 3, spec §7.5; `expectedReturnUsd` per §6.3 with days 30/90/365).
  - `computeIdleReport(address: \`0x${string}\`, holdings: Holding[], pools: Pool[], verdicts: Record<string, Verdict>, mirrors: MirrorInfo[]): IdleReport` (pure).
  - `readHoldings(address: \`0x${string}\`): Promise<Holding[]>` (mainnet multicall + DeFiLlama prices, one retry).
  - `scanAddress(address: string): Promise<IdleReport>` — throws `InvalidAddress` when `!isAddress(address)`.

- [ ] **Step 1: Write the failing tests**

```ts
test('low risk drops pools with Jev risk > 2 and all AVOID verdicts', () => { /* 4 pools → only risk≤2 non-AVOID remain */ });
test('drops PT pools maturing after the horizon end', () => { /* horizon short, maturity in 6 months → dropped */ });
test('ranks by realApy desc, ties broken by tvlUsd', () => { /* order assertion */ });
test('returns at most 3 and sets mirrorVault when the pool is mirrored', () => { /* mirrors[0].poolId matches → address set */ });
test('expectedReturnUsd = amount × realApy/100 × 90/365 for medium horizon', () => { /* 500, 6.5% → 8.01 */ });
test('idle report counts shMON as earning and excludes it from idleUsd', () => { /* … */ });
test('potentialYearlyUsd uses best DEPOSIT realApy in the same asset class', () => { /* 10_000 USDC idle, best stable DEPOSIT 6.5 → 650 */ });
test('scanAddress rejects invalid input', async () => {
  for (const bad of ['vitalik.eth', 'f70da97812cb96acdf810712aa562db8dfa3dbef', '0x123']) await expect(scanAddress(bad)).rejects.toThrow(InvalidAddress);
});
```

- [ ] **Step 2–4:** Run (FAIL) → implement → run (PASS): `pnpm vitest run lib/advisor lib/idle`. Then `ONLINE=1` smoke: `scanAddress('0xf70da97812cb96acdf810712aa562db8dfa3dbef')` returns `idleUsd > 100_000`.
- [ ] **Step 5: Commit** — `git commit -m "feat(lib): advisor ranking and idle scan"`; `reports/B3.md`.

---

### Task C1: Design tokens, fonts, Field chart, landing page

**Agent:** `builder-deep` (Sonnet, high).

**Files:**
- Create: `styles/tokens.css` (imported by `app/globals.css`), `app/layout.tsx` (Geist fonts), `components/field/scales.ts`, `components/field/FieldChart.tsx`, `app/(site)/page.tsx`, `components/site/*`
- Test: `components/field/scales.test.ts`

**Interfaces:**
- Consumes: `readPools`, `readVerdicts` (shared/cache).
- Produces: `xForApy(apy: number, width: number): number` (0–30% clamp), `yForTvl(tvlUsd: number, height: number): number` (log10, 1e5–2e8), `radiusForTvl(tvlUsd: number): number`, `colorForVerdict(label: VerdictLabel): { fill: string | null; stroke: string | null }`; `<FieldChart pools verdicts annotate?: string[] onSelect?: (poolId: string) => void />` (client component, SVG, hover tooltip with pool/verdict/confidence).

- [ ] **Step 1: Write failing tests** — `xForApy(45, 800)` equals `xForApy(30, 800)`; `yForTvl(1e8)` < `yForTvl(1e6)`; `colorForVerdict('DEPOSIT').fill === '#6E54F5'`, `'AVOID'` → `#E2552C`, `'CONSIDER'` → fill `null`, stroke `#B9B6C3`; `NOT_JUDGED` → stroke `#E6E4DE`.
- [ ] **Step 2–4:** FAIL → implement → PASS (`pnpm vitest run components/field`).
- [ ] **Step 5: Add the Weigh-in animation** to `FieldChart` behind `animate?: boolean` (landing `true`, Explore `false`), per spec §5: fade-in delay `(i × 53) % 600` ms over 350 ms; scan line starts at 700 ms and sweeps for 1 400 ms with ease-out cubic `1 − (1 − t)³`; dot recolors with a 320 ms scale pop when the line passes; annotations fade in over 600 ms at the end; `prefers-reduced-motion` renders the final state. Add `scanProgress(elapsedMs: number): number` to `scales.ts` with tests `scanProgress(700) === 0`, `scanProgress(2100) === 1`, `scanProgress(5000) === 1`. Reference prototype: `.superpowers/brainstorm/*/content/field-motion.html` in the research repo (card A).
- [ ] **Step 6: Build the landing page** matching the approved mockup `landing-direction-v4.html` card "Field" (§5): nav (Explore, Advisor, Watch, Launch, "Open app ↗"), headline "Every yield on Monad, weighed." + muted "Know which ones are real before you deposit.", "Scan a wallet →" input routing to `/app/scan/[address]`, Field chart with two annotations (one DEPOSIT, one AVOID), mono caption with live counts from cache, three-step "Judge · Deposit · Watch" section, Launch teaser, footer.
- [ ] **Step 7: Verify** `pnpm dev`, open `/` at 1280 px and 375 px: no horizontal scroll, chart renders ~166 dots, the weigh-in plays once, hover shows a tooltip; with reduced motion enabled the final state shows immediately.
- [ ] **Step 8: Commit** — `git commit -m "feat(site): Field design tokens and landing page"`; `reports/C1.md`.

---

### Task C2: App shell, wallet, transaction state machine

**Agent:** `builder-deep` (Sonnet, high).
**Skills:** monskills `gas` and `concepts` → `block-states.md`, `async-execution.md` (receipt timing). Ignore `wallet-integration`: wagmi with injected wallets only.

**Files:**
- Create: `app/providers.tsx`, `app/(app)/app/layout.tsx`, `components/tx/txReducer.ts`, `components/tx/useTx.ts`, `components/tx/TxButton.tsx`, `components/tx/validateAmount.ts`, `components/ui/*`
- Test: `components/tx/txReducer.test.ts`, `components/tx/validateAmount.test.ts`

**Interfaces:**
- Consumes: `monadTestnet`, `abis`, `addresses`.
- Produces:
  - `type TxState = { status: 'idle' } | { status: 'awaiting_signature' } | { status: 'pending'; hash: \`0x${string}\`; sentAt: number } | { status: 'confirmed'; hash; block: bigint; seconds: number } | { status: 'failed'; hash?: \`0x${string}\`; reason: string } | { status: 'cancelled' }`.
  - `txReducer(s: TxState, e: TxEvent): TxState` with events `start`, `signed(hash)`, `receipt(status, block)`, `error(err)`.
  - `useTx(): { state: TxState; run(write: () => Promise<\`0x${string}\`>): Promise<void> }` (wagmi `waitForTransactionReceipt`).
  - `<TxButton label run disabled? />` rendering the state text: "Waiting for signature…", "Pending · <short hash ↗>", "Confirmed in 0.6s · block N", "Failed: <reason>", "Cancelled in wallet".
  - `validateAmount(input: string, balance: bigint, decimals: number): { ok: true; value: bigint } | { ok: false; error: string }`.
  - App shell: top nav (Explore, Pulse, Advisor, Watch, Launch), wallet connect (injected connector only, switch-to-Monad-testnet prompt), "Get test USDC" button (mints 1_000e6 MockUSDC).

- [ ] **Step 1: Write failing tests**

```ts
test('success only after a success receipt', () => { /* start → signed → status 'pending'; receipt('success', 10n) → 'confirmed' */ });
test('user rejection → cancelled, never confirmed', () => { /* error(new UserRejectedRequestError(...)) → 'cancelled' */ });
test('reverted receipt → failed', () => { /* receipt('reverted') → 'failed' */ });
test.each([['', 'Enter an amount'], ['0', 'Enter an amount'], ['1.1234567', 'Too many decimals'], ['2000', 'Insufficient balance']])
  ('validateAmount(%s) → %s', (i, err) => expect(validateAmount(i, 1_000_000_000n, 6)).toEqual({ ok: false, error: err }));
```

- [ ] **Step 2–4:** FAIL → implement → PASS (`pnpm vitest run components/tx`).
- [ ] **Step 5: Verify manually**: connect wallet, click "Get test USDC", reject once (shows "Cancelled in wallet"), approve once (shows "Confirmed in …s · block …" with explorer link; balance updates).
- [ ] **Step 6: Commit** — `git commit -m "feat(app): shell, wallet, receipt-backed transaction states"`; `reports/C2.md`.

---

### Checkpoint CP1 (1:15 PM)

**Agent:** Orchestrator.
- [ ] Merge reports A1–A3, B1–B3, C1–C2; add any requested deps; push.
- [ ] **P1 teaser post** (user posts; the orchestrator drafts): a 10–15 s screen recording of the Weigh-in landing animation on X and LinkedIn, tagging @monad, @monad_dev, @geeky_kartikey. Posting early gives views time to build toward the 5K target.
- [ ] Replace inline rules in `scripts/snapshot.ts` with `lib/indexer`; run B4's `refreshPools` once to produce real `cache/verdicts.json`; copy it to `fixtures/verdicts.json` (drop the placeholder).
- [ ] `pnpm test && (cd contracts && forge test)` — Expected: all PASS.
- [ ] Commit `chore: checkpoint 1`.

---

### Task B4: Pool refresh job + positions reader

**Agent:** Codex `gpt-6.1-sol` high (OMP).

**Files:**
- Create: `lib/jobs/refreshPools.ts`, `lib/positions.ts`
- Test: `lib/jobs/refreshPools.test.ts`

**Interfaces:**
- Consumes: `fetchMonadPools`, `judgePool`, `statsHash`, `writeCache`, `readVerdicts`, `abis`, `addresses`, `monadTestnet`.
- Produces: `refreshPools(deps?: { fetchPools?; judge?; concurrency?: number }): Promise<{ pools: number; judged: number; reused: number }>` — re-judges only pools whose `statsHash` changed, concurrency 4; `readPositions(owner: \`0x${string}\`): Promise<Position[]>` (testnet reads of the four mirrors + Guardian `enabled` + latest `judged` event for that vault).

- [ ] **Step 1: Failing tests** — reuses cached verdicts when `statsHash` is unchanged (`judge` called 0 times); judges only the 2 changed pools out of 5; never more than 4 `judge` calls in flight (instrumented fake).
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(lib): pool refresh job and positions reader"`; `reports/B4.md`.

---

### Task B5: API routes

**Agent:** Codex `gpt-6.1-sol` high (OMP).

**Files:**
- Create: `app/api/pools/route.ts`, `app/api/pools/[id]/route.ts`, `app/api/intent/route.ts`, `app/api/advise/route.ts`, `app/api/scan/[address]/route.ts`, `app/api/positions/[address]/route.ts`, `app/api/watch/stream/route.ts`, `app/api/admin/stats/route.ts`
- Test: `app/api/routes.test.ts`

**Interfaces:**
- Consumes: B1–B4, `sendSetStats` (A4), shared/cache.
- Produces: exactly the routes and shapes of spec §9. `GET /api/pools/[id]` caches DeFiLlama `/chart/{id}` 90-day history for 1 h in memory. `/api/watch/stream` is SSE (`text/event-stream`), polls `readEvents(lastId)` every 500 ms. `/api/admin/stats` requires header `x-admin-token === process.env.ADMIN_TOKEN`.

- [ ] **Step 1: Failing tests** (import handlers, call with `new Request(...)`):

```ts
test('scan with an invalid address → 400 with friendly message', async () => {
  const res = await GET(new Request('http://x/api/scan/vitalik.eth'), { params: Promise.resolve({ address: 'vitalik.eth' }) });
  expect(res.status).toBe(400); expect((await res.json()).error).toBe('Not a valid Monad address');
});
test('admin stats without the right token → 401 and no transaction', async () => { /* sendSetStats mock not called */ });
test('pools?asset=gold returns only gold pools', async () => { /* … */ });
test('advise returns ≤ 3 recommendations for a parsed intent', async () => { /* with fixture verdicts */ });
```

- [ ] **Step 2–4:** FAIL → implement → PASS (`pnpm vitest run app/api`).
- [ ] **Step 5: Commit** — `git commit -m "feat(api): pools, intent, advise, scan, positions, watch stream, admin"`; `reports/B5.md`.

---

### Task C3: Explore page + verdict slip

**Agent:** `builder` (Sonnet, medium).

**Files:**
- Create: `app/(app)/app/explore/page.tsx`, `components/slip/VerdictSlip.tsx`, `components/slip/SlipDrawer.tsx`, `components/explore/PoolTable.tsx`

**Interfaces:**
- Consumes: `GET /api/pools`, `GET /api/pools/[id]`, `FieldChart`.
- Produces: `<VerdictSlip pool verdict history? action? />` — paper card per spec §5 (stamp DEPOSIT/CONSIDER/AVOID; NOT_JUDGED shows a grey "Not judged" stamp), rows: Real APY, From incentives, Exit risk, TVL, Jev confidence, flags as the "why" list; optional `action` slot for a deposit button.

- [ ] **Step 1:** Build Explore: asset-class tabs (All, Stable, Gold, RWA, MON, BTC/ETH), protocol select, a mono "data as of HH:MM" label from `asOf` (spec §11), Field chart + sortable table; clicking a dot or row opens `SlipDrawer` with the 90-day APY sparkline.
- [ ] **Step 2: Verify** at 1280 px and 375 px: filters change both chart and table; slip opens for a DEPOSIT, an AVOID and a NOT_JUDGED pool.
- [ ] **Step 3: Commit** — `git commit -m "feat(app): explore page and verdict slip"`; `reports/C3.md`.

---

### Task C4: Scan + Advisor pages

**Agent:** `builder` (Sonnet, medium).

**Files:**
- Create: `app/(app)/app/scan/[address]/page.tsx`, `app/(app)/app/advisor/page.tsx`, `components/advisor/IntentChips.tsx`, `components/advisor/DepositFlow.tsx`

**Interfaces:**
- Consumes: `/api/scan/[address]`, `/api/intent`, `/api/advise`, `VerdictSlip`, `TxButton`, `useTx`, `validateAmount`, `abis.MirrorVault`, `abis.MockToken`.
- Produces: `<DepositFlow vault: \`0x${string}\` mirrorOf: string />` — amount input → `approve` TxButton → `deposit` TxButton (enabled only after approve is confirmed); label "Testnet mirror · {mirrorOf}".

- [ ] **Step 1:** Scan page: holdings table, big "$X idle · could earn $Y a year", suggestions as slips linking to Advisor prefilled. Invalid address shows the API's 400 message inline.
- [ ] **Step 2:** Advisor: text input → chips for risk / horizon / asset (confidence < 0.6 renders "?" and becomes a picker) → top 3 slips with `DepositFlow` in the slip's action slot.
- [ ] **Step 3: Verify** the demo path: "500 USDC, safe, 3 months" → 3 slips → approve → deposit → "Confirmed in …s"; the position appears on `/app/watch` after C5.
- [ ] **Step 4: Commit** — `git commit -m "feat(app): scan and advisor with real deposits"`; `reports/C4.md`.

---

### Task C5: Watch + Admin pages

**Agent:** `builder` (Sonnet, medium).

**Files:**
- Create: `app/(app)/app/watch/page.tsx`, `components/watch/PositionCard.tsx`, `components/watch/EventFeed.tsx`, `components/watch/AutopilotToggle.tsx`, `app/(app)/app/admin/page.tsx`

**Interfaces:**
- Consumes: `/api/positions/[address]`, `/api/watch/stream` (EventSource), `/api/admin/stats`, `TxButton`, `abis.Guardian`, `abis.MirrorVault`.
- Produces: Autopilot ON = share `approve(guardian, maxUint256)` then `Guardian.enable(vault)` (two TxButtons); OFF = `disable(vault)`. Alert events show a one-click "Exit" (user-signed `redeem`). `exit_confirmed` shows "You're out · confirmed in Xs" with explorer link; `exit_failed` shows a red alert with the reason.
- Admin: token input (kept in `sessionStorage`), per-mirror APY and utilization sliders + "Apply" → `POST /api/admin/stats`, shows returned tx hash and seconds. Page is not linked from nav.

- [ ] **Step 1:** Build both pages.
- [ ] **Step 2: Verify** with the worker running: enable autopilot on a deposited position; in `/app/admin` set utilization 9_200 → within ~2 s the feed shows `judged` → `exit_sent` → `exit_confirmed`, USDC balance increases; set 10_000 → a second depositor cannot withdraw.
- [ ] **Step 3: Commit** — `git commit -m "feat(app): watch page with autopilot and admin controls"`; `reports/C5.md`.

---

### Checkpoint CP2 (2:30 PM)

**Agent:** Orchestrator.
- [ ] Run the full demo script (spec §13) end to end on testnet, including a wallet rejection ("Cancelled in wallet").
- [ ] Capture `fixtures/scan-0xf70da97812cb96acdf810712aa562db8dfa3dbef.json` from the live scan (offline fallback for §11).
- [ ] `pnpm test && (cd contracts && forge test)` PASS; commit `chore: checkpoint 2`.

---

### Task L1: LaunchFactory + CurveToken

**Agent:** Codex `gpt-6.1-sol` high (OMP), in a second GPT tab during 1:15–2:30.
**Skills:** monskills `gas` (path: `.claude/skills/gas/SKILL.md`). Verify on the explorers after deploying, as in A3 Step 5.

**Files:**
- Create: `contracts/src/launch/LaunchFactory.sol`, `contracts/src/launch/CurveToken.sol`, `contracts/script/DeployLaunch.s.sol`
- Test: `contracts/test/Launch.t.sol`

**Interfaces:**
- Consumes: `Guardian.approvedVault`, `MirrorVault`.
- Produces: `LaunchFactory(address guardian)`; `create(string name, string symbol, address reserveVault) returns (address)` — reverts `VaultNotApproved` unless `guardian.approvedVault(reserveVault)`; `event TokenCreated(address indexed token, address indexed creator, address reserveVault, string name, string symbol)`. `CurveToken`: quote asset = `IERC4626(reserveVault).asset()`; `buy(uint256 quoteIn, uint256 minTokensOut) returns (uint256)`, `sell(uint256 tokensIn, uint256 minQuoteOut) returns (uint256)`, `reserveAssets() view`, `floorPrice() view` = `reserveAssets() * 1e18 / totalSupply()`, `price() view`.
- Curve: price per whole token = `0.0001 + 1e-10 × supplyTokens` quote units (i.e. `P0 = 100` units at 6 decimals, rising 0.0001 per 1 000 000 tokens). Cost(s1→s2) is the integral; `buy` solves the quadratic with OZ `Math.sqrt`.

- [ ] **Step 1: Failing tests**

```solidity
function test_buyFirstMillionCostsAbout150() public { uint256 out = token.buy(150e6, 0); assertApproxEqRel(out, 1_000_000e18, 0.001e18); }
function test_sellReturnsCurveIntegral() public { /* buy 150e6 then sell all → ≈150e6 back (±2 units) */ }
function test_floorRisesWithVaultYield() public { /* buy, record floorPrice, warp 365 days at apy 1000 → floorPrice higher */ }
function test_surplusStaysForHolders() public { /* two buyers, warp, A sells all → B's floorPrice ≥ before */ }
function test_createRejectsUnapprovedVault() public { /* expectRevert VaultNotApproved */ }
function test_slippageGuards() public { /* buy with minTokensOut too high reverts; sell with minQuoteOut too high reverts */ }
```

- [ ] **Step 2–4:** FAIL → implement → PASS (`forge test --match-contract LaunchTest`). Broadcast `DeployLaunch.s.sol`; set `launchFactory` in `shared/addresses.testnet.json`.
- [ ] **Step 5: Commit** — `git commit -m "feat(contracts): yield-backed launch factory and curve token"`; `reports/L1.md`.

---

### Task L2: Launch page

**Agent:** Codex `gpt-6.1-sol` high (OMP).

**Files:**
- Create: `app/(app)/app/launch/page.tsx`, `app/(app)/app/launch/[token]/page.tsx`, `components/launch/*`

**Interfaces:**
- Consumes: `abis.LaunchFactory`, `abis.CurveToken`, `addresses.launchFactory`, `addresses.mirrors`, `readVerdicts` via `/api/pools`, `TxButton`.
- Produces: create form (name, symbol, reserve vault select pre-selecting the mirror whose real pool has the best verdict, labelled "Jev recommends"); token list from `TokenCreated` logs; token page with live floor price (poll `floorPrice()` every 2 s, show 6+ decimals so it visibly ticks), price, reserve, buy/sell TxButtons with slippage `minOut = 99%` of quote.

- [ ] **Step 1:** Build pages. **Step 2: Verify** create → buy 50 USDC → floor ticks up over ~30 s → sell half. **Step 3: Commit** — `git commit -m "feat(app): launch pages"`; `reports/L2.md`.

---

### Task C7: Pulse dashboard

**Agent:** `builder-deep` (Sonnet, high). Use the `dataviz` skill if it is available.

**Files:**
- Create: `app/(app)/app/pulse/page.tsx`, `components/pulse/aggregate.ts`, `components/pulse/{KpiTiles,ApyGapBars,ProtocolVerdictBars,AssetClassBars,Movers}.tsx`
- Test: `components/pulse/aggregate.test.ts`

**Interfaces:**
- Consumes: `GET /api/pools` (pools + verdicts), `VerdictSlip`/`SlipDrawer` (C3).
- Produces: `pulseStats(pools: Pool[], verdicts: Record<string, Verdict>): PulseStats` where `PulseStats = { tvlTracked: number; poolCount: number; protocolCount: number; medianRealApy: number; emissionHeavyTvlShare: number; byAssetClass: { assetClass: AssetClass; headlineApyMedian: number; realApyMedian: number; tvl: number }[]; byProtocol: { project: string; tvl: number; deposit: number; consider: number; avoid: number; notJudged: number }[]; movers: { poolId: string; symbol: string; project: string; apyPct7D: number }[] }`. Emission-heavy = `incentiveShare > 0.5`; `byProtocol` values are TVL per verdict, sorted by `tvl` desc; `movers` = top 5 by `|apyPct7D|`, nulls excluded.

- [ ] **Step 1: Failing tests** — on a 6-pool hand-built set: `emissionHeavyTvlShare` equals heavy TVL / total TVL; medians handle an even count (mean of the middle two); `byProtocol` sums equal protocol TVL; `movers` sorted by absolute change and skips `null`; empty input returns zeros, never `NaN`.
- [ ] **Step 2–4:** FAIL → implement → PASS (`pnpm vitest run components/pulse`).
- [ ] **Step 5:** Build the page in the Field style (spec §5): KPI tiles row, headline vs real APY paired bars by asset class, stacked TVL-by-verdict bars per protocol (top 10), TVL by asset class, movers list; hand-rolled SVG (no chart library); clicking a bar opens Explore filtered, clicking a mover opens its slip.
- [ ] **Step 6: Verify** at 1280 px and 375 px (tiles stack, bars stay legible); numbers match `/api/pools` totals.
- [ ] **Step 7: Commit** — `git commit -m "feat(app): pulse dashboard"`; `reports/C7.md`.

---

### Task C6: Phone pass + polish

**Agent:** `builder-light` (Sonnet, low).

- [ ] Check every route at 375 px: no horizontal scroll, slip readable, TxButtons full width, Field chart scales; fix layout only (no new features). Commit `fix(ui): phone layout`; `reports/C6.md`.

---

### Checkpoint CP3 + Task F1: Freeze, ship, collect every rubric point (3:30–5:40 PM)

**Agent:** Orchestrator; README and copy by `builder` (Sonnet, medium). The user records the videos and makes the posts.

Rubric (organizers' judging page): Basic 100 + Working 100 + Build in public 100 + Bonus 100.

- [ ] **3:30 Feature freeze.** `pnpm test && (cd contracts && forge test) && pnpm build`. Expected: PASS and a clean production build. Hide any unfinished feature from the nav.
- [ ] **3:35 Mainnet deploy (bonus +25).** Operator wallet holds real MON (10 MON reserve + gas). `forge script script/Deploy.s.sol --rpc-url https://rpc.monad.xyz --broadcast --private-key $OPERATOR_PRIVATE_KEY` → `shared/addresses.mainnet.json`; verify via the API as in A3 Step 5. The app's transactions stay on testnet; the README lists both deployments.
- [ ] **3:50 Vercel production + custom domain (bonus +15).** Deploy with `DATA_SOURCE=fixtures`, `TYPESAFE_API_KEY`, `ADMIN_TOKEN`, `OPERATOR_PRIVATE_KEY`. The user adds the domain in Vercel and sets the DNS record Vercel shows. The Watch page shows "Live watchdog runs on the presenter's machine" when the stream has no events.
- [ ] **4:00 README (Basic 25 + Working 25).** Top section: name, one-line description, live URL (custom domain and the vercel.app URL), network, contract addresses for testnet and mainnet with explorer links. Then "Run it yourself": clone, `pnpm i`, `cp .env.example .env`, `DATA_SOURCE=fixtures pnpm dev` works with no keys; the full setup with keys and the worker. Test it from a fresh clone in a temp folder.
- [ ] **4:15 Demo video (Build in public 25).** 30–60 s screen recording of the product running: Field → scan → advisor deposit with a wallet confirm → Guardian exit. Post on X and LinkedIn with the tags; this is also the backup if the live demo fails.
- [ ] **4:35 Ad video (Build in public 25).** 15–30 s product ad: the Weigh-in animation, "Every yield on Monad, weighed.", three fast cuts and the URL. Post with the tags.
- [ ] **4:50 Launch post (Build in public 25).** Thread with the live URL, repo, and what Jev decides. Ask friends to share; record view counts as screenshots before 5:40 (5K+ combined = 25).
- [ ] **5:00 Rehearse twice** (3 minutes). The pitch must say out loud: repo link, contract address, live URL, network. One live testnet transaction on stage. Offline drill: `DATA_SOURCE=fixtures` with Wi-Fi off still renders landing, explore and the whale scan.
- [ ] **5:25 Final push**, then `chore: code freeze`. Nothing is pushed after 5:30.
- [ ] **5:40 Submit** on the Blitz portal (`blitz.devnads.com/events/monad-blitz-pune-v3`): GitHub URL, demo URL, screenshots of posts and view counts.
