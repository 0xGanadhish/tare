# Mainnet Depth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Jev and the Verdict Ledger see real liquidity on three mainnet vaults (Clearstar, August, Hyperithm), then deploy and verify mainnet.

**Architecture:**
- Two new view-only `ILiquidityAdapter` contracts, one for Euler Earn and one for Morpho V2, are plugged into the existing `TareRiskOracle.registerVault(vault, adapter)`.
- A shared Solidity library maps a config "adapter kind" to an adapter, and both `DeployV2` and the fork tests use it.
- The backend needs no reader change, because `vaultReader` already reads liquidity through `oracle.metricsOf`. Only the health balance threshold becomes per network.

**Tech Stack:** Foundry (solc 0.8.24, forge-std), Cloudflare Workers + vitest-pool-workers, Next.js + vitest/testing-library, Envio HyperIndex.

**Spec:** `docs/superpowers/specs/2026-10-13-mainnet-depth-design.md`

## Global Constraints

- Work directly on `feat/guardian-v2` in `/Users/ganadhish/code/personal/tare`. No worktrees. Commit by explicit path, never `git add -A`. Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **No mainnet transaction before the user says "deploy mainnet".** Tasks 1–7 are code, tests and fork simulation only.
- Mainnet keys: the deployer is in `.env` as `MAINNET_DEPLOYER_PRIVATE_KEY`, and `ATTESTER_KEY_MAINNET` and `EXECUTOR_KEY_MAINNET` are Wrangler secrets. The user sets all three. Never print a key; derive and show addresses only.
- Mainnet USDC: `0x754704Bc059F8C67012fEd69BC8A327a5aafb603`. Mainnet resolve window: `86_400` (unchanged).
- Adapters are stateless, have no owner, and are view-only. They implement `ILiquidityAdapter.availableLiquidity(address vault) external view returns (uint256)`.
- Fork tests need `MONAD_MAINNET_RPC=https://rpc.monad.xyz`. Without it they skip, as they do today.
- Root app tests run with `npx vitest run --exclude '.claude/**'`. Backend tests run with `npx vitest run` inside `backend/`. Contract tests run with `forge test` inside `contracts/`.

## Review Focus

1. **Empty Morpho market** (`totalSupplyShares == 0`): the Morpho adapter returns idle only and doesn't revert on a zero division. Pinned in Task 2.
2. **Morpho market with borrow ≥ supply:** the market contributes 0, with no underflow revert. Pinned in Task 2.
3. **Euler Earn strategy that is an EOA or reverts:** that strategy counts 0. A plain `try` can't catch a decode failure on empty returndata, so use a low-level `staticcall` with a length check. Pinned in Task 1.
4. **Adapter kind typo in `vaults.mainnet.json`** (e.g. `morpho_v2`): fails in simulation before any broadcast. Pinned in Task 3.
5. **Mainnet keys not configured yet** (balance `null`): `/v1/health` stays green for that key. The 0.5 MON threshold applies only to a configured key. Pinned in Task 5.

---

### Task 1: EulerEarnAdapter

**Files:**
- Create: `contracts/src/adapters/EulerEarnAdapter.sol`
- Test: `contracts/test/Adapters.t.sol` (add a `EulerEarnAdapterTest` contract, following the existing adapter tests)

**Interfaces:**
- Produces: `contract EulerEarnAdapter is ILiquidityAdapter { function availableLiquidity(address vault) external view returns (uint256); }`
- Reads from the vault: `asset()`, `withdrawQueueLength() returns (uint256)`, `withdrawQueue(uint256) returns (address)`. Reads from each strategy: `maxWithdraw(address owner) returns (uint256)`, with owner = the vault.

- [ ] **Step 1: Write failing tests.** Use mocks: a `MockEarn` with a settable queue and asset, a `MockStrategy` with a settable `maxWithdraw`, and a `RevertingStrategy`. Tests:
  - `test_eulerEarn_sumsIdleAndStrategies`: idle 7e6; strategies return 0, 430_817_453_885 and 0. `assertEq(adapter.availableLiquidity(earn), 7e6 + 430_817_453_885)`.
  - `test_eulerEarn_emptyQueue_idleOnly`: queue length 0, idle 5e6. Expect `5e6`.
  - `test_eulerEarn_revertingStrategy_countsZero`: strategies [returns 1e6, reverts, returns 2e6], idle 0. Expect `3e6`.
  - `test_eulerEarn_eoaStrategy_countsZero`: strategies [`address(0xBEEF)` with no code, returns 4e6]. Expect `4e6`.
- [ ] **Step 2: Run them to verify they fail.** `cd contracts && forge test --match-contract EulerEarnAdapterTest`. Expected: compilation fails, because `EulerEarnAdapter` doesn't exist yet.
- [ ] **Step 3: Implement `availableLiquidity`.** The formula is `IERC20(asset).balanceOf(vault)` plus, for each `i < withdrawQueueLength()`, the decoded `maxWithdraw(vault)` of `withdrawQueue(i)`. Read each strategy through `staticcall(abi.encodeCall(IERC4626.maxWithdraw, (vault)))`. Add it only when `ok && ret.length == 32`; otherwise add 0. Write a NatSpec line explaining why (spec §1).
- [ ] **Step 4: Run tests to verify they pass.** Same command. Expected: 4 passed.
- [ ] **Step 5: Commit** `contracts/src/adapters/EulerEarnAdapter.sol` and `contracts/test/Adapters.t.sol` with the message `feat(contracts): Euler Earn liquidity adapter`.

### Task 2: MorphoV2Adapter

**Files:**
- Create: `contracts/src/adapters/MorphoV2Adapter.sol`
- Test: `contracts/test/Adapters.t.sol` (add a `MorphoV2AdapterTest` contract)

**Interfaces:**
- Produces: `contract MorphoV2Adapter is ILiquidityAdapter { function availableLiquidity(address vault) external view returns (uint256); }`
- Reads from the vault: `asset()`, `liquidityAdapter() returns (address)`, `liquidityData() returns (bytes memory)`.
- Reads from the liquidity adapter: `morpho() returns (address)`.
- Reads from Morpho Blue:
  - `market(bytes32 id)`, returning `(uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)`
  - `position(bytes32 id, address user)`, returning `(uint256 supplyShares, uint128 borrowShares, uint128 collateral)`
- The market id is `keccak256(liquidityData)`.

- [ ] **Step 1: Write failing tests.** Use mocks: a `MockV2Vault` with settable asset, liquidity adapter and liquidity data; a `MockMarketAdapter` with `morpho()`; a `MockMorpho` with settable market and position by id; and a `NotMorphoAdapter` with no `morpho()`. Tests:
  - `test_morphoV2_cashBelowPosition`: idle 0; market supply 8_025_560_406_240 assets and 7_767_264_379_638_300_023 shares; borrow 7_325_879_406_811; position supply shares 7_767_151_446_438_365_812. Expect `8_025_560_406_240 - 7_325_879_406_811`, which is the cash.
  - `test_morphoV2_positionBelowCash`: supply 1_000e6 assets and 1_000e18 shares; borrow 100e6; position 300e18 shares; idle 2e6. Expect `2e6 + 300e6`.
  - `test_morphoV2_noLiquidityAdapter_idleOnly`: liquidity adapter `address(0)`, idle 2_984_421_569_240. Expect `2_984_421_569_240`.
  - `test_morphoV2_emptyMarket_idleOnly` (Review Focus 1): `totalSupplyShares` 0, idle 1e6. Expect `1e6`, with no revert.
  - `test_morphoV2_borrowAtOrAboveSupply_marketZero` (Review Focus 2): supply 100e6, borrow 100e6, idle 3e6. Expect `3e6`.
  - `test_morphoV2_nonMorphoLiquidityAdapter_reverts`: the liquidity adapter is a `NotMorphoAdapter`. `vm.expectRevert()`.
- [ ] **Step 2: Run them to verify they fail.** `forge test --match-contract MorphoV2AdapterTest`. Expected: compilation fails.
- [ ] **Step 3: Implement `availableLiquidity`.**
  - If `totalSupplyShares == 0` or `totalBorrowAssets >= totalSupplyAssets`, the market part is 0.
  - Otherwise the market part is `min(Math.mulDiv(supplyShares, totalSupplyAssets, totalSupplyShares), totalSupplyAssets - totalBorrowAssets)`, using OpenZeppelin `Math.mulDiv`, which rounds down.
  - Return idle plus the market part.
  - Let `morpho()` revert naturally when the adapter isn't a Morpho market adapter (spec §1).
- [ ] **Step 4: Run tests to verify they pass.** Expected: 6 passed. Also run `forge test` for the whole suite. Expected: all pass, fork tests skipped without an RPC.
- [ ] **Step 5: Commit** `contracts/src/adapters/MorphoV2Adapter.sol` and `contracts/test/Adapters.t.sol` with the message `feat(contracts): Morpho V2 liquidity adapter`.

### Task 3: Adapter kinds in the deploy script

**Files:**
- Create: `contracts/script/AdapterKinds.sol`
- Modify: `contracts/script/DeployV2.s.sol:44-58` (the adapter mapping and the post-registration check)
- Modify: `contracts/script/vaults.mainnet.json`
- Test: `contracts/test/AdapterKinds.t.sol`

**Interfaces:**
- Produces: `library AdapterKinds { struct Cache { address mirror; address euler; address eulerEarn; address morphoV2; } function adapterFor(string memory kind, Cache memory cache) internal returns (address adapter); }`
  - The kinds are `"none"` (returns `address(0)`), `"mirror"`, `"euler"`, `"euler-earn"` and `"morpho-v2"`.
  - Each adapter is deployed on first use and cached in `cache`.
  - Any other string reverts `"unknown adapter kind: <kind>"`.
- Consumed by Task 4 (`Fork.t.sol`) and by `DeployV2`.

- [ ] **Step 1: Write failing tests** in `AdapterKinds.t.sol`. Call through a small harness contract, because the library is internal.
  - `test_kinds_known`: `"none"` returns `address(0)`. Each of the other 4 kinds returns non-zero code. Asking for `"morpho-v2"` twice returns the same address.
  - `test_kinds_typo_reverts` (Review Focus 4): `"morpho_v2"` reverts with `"unknown adapter kind: morpho_v2"`.
- [ ] **Step 2: Run them to verify they fail.** `forge test --match-contract AdapterKindsTest`. Expected: compilation fails.
- [ ] **Step 3: Implement `AdapterKinds`, and use it in `DeployV2`.**
  - Replace the `if/else` mapping in the vault loop with `AdapterKinds.adapterFor(vaults[i].adapterKind, cache)`.
  - After the loop, still inside the broadcast block, for each vault: `(, , uint256 liq) = oracle.metricsOf(vault)`, then `require(liq != type(uint256).max, "vault has no liquidity adapter")` and `require(liq <= assets, "liquidity above TVL")`.
  - Update the header comment's kinds list.
- [ ] **Step 4: Update `vaults.mainnet.json`.** Clearstar becomes `"adapter": "euler-earn"` and August becomes `"adapter": "morpho-v2"`. Add `{"address": "0x78999cc96d2Ba0341588C60CcB0E91c6C33CF371", "name": "Hyperithm USDC Apex", "protocol": "morpho", "poolId": "ec6a71a7-41ae-4e72-942f-b4bc99c3b3cb", "adapter": "morpho-v2"}`.
- [ ] **Step 5: Run tests to verify they pass.** `forge test --match-contract AdapterKindsTest`, then `forge build`. Expected: pass and a clean build.
- [ ] **Step 6: Commit** the four files with the message `feat(contracts): adapter kinds for Euler Earn and Morpho V2; mainnet vault list`.

### Task 4: Mainnet fork tests for the three vaults

**Files:**
- Modify: `contracts/test/Fork.t.sol`

**Interfaces:**
- Consumes: `AdapterKinds.adapterFor` (Task 3), `vaults.mainnet.json` (Task 3).

- [ ] **Step 1: Refactor the setup.** `_vaults()` returns `(address[] vaults, string[] kinds)`. `_setup(vault, kind)` registers `AdapterKinds.adapterFor(kind, cache)`. Existing tests use these; replace the `euler` bool with a check `kind != "none"` where the liquidity assertion is.
- [ ] **Step 2: Write the new failing tests.** Each loops over every configured vault.
  - `testFork_adapterMatchesWithdrawable`:
    - `liq = adapter.availableLiquidity(vault)`, then `assertGt(liq, 0)` and `assertLe(liq, IERC4626(vault).totalAssets())`.
    - Give `holder` shares worth more than `liq + 1e6` with `deal(vault, holder, IERC4626(vault).convertToShares(liq + 2e6) + 1, false)`.
    - Take `uint256 snap = vm.snapshotState()`. As `holder`, `vm.expectRevert()` then `IERC4626(vault).withdraw(liq + 1e6, holder, holder)`.
    - `vm.revertToState(snap)`. As `holder`, `IERC4626(vault).withdraw(liq - 10, holder, holder)` succeeds.
  - `testFork_smallPosition_fullExit`: the existing redeem-by-allowance flow with `AMOUNT = 2.5e6`. Assert that the user's vault balance is 0, the USDC returned is at least `2.49e6`, and `verdictFloor == latest`.
- [ ] **Step 3: Run with the RPC.** `cd contracts && MONAD_MAINNET_RPC=https://rpc.monad.xyz forge test --match-contract ForkTest -vv`. Expected: all fork tests pass for all 3 vaults. If one vault's withdraw check fails, stop and report it. That vault fails spec rule 4 or 5, and the user decides whether to drop it.
- [ ] **Step 4: Commit** `contracts/test/Fork.t.sol` with the message `test(contracts): fork-check adapters and small exits on all mainnet vaults`.

### Task 5: Per-network minimum balance in health

**Files:**
- Modify: `backend/src/health.ts:9,53`
- Test: `backend/test/admin.test.ts`

**Interfaces:**
- Produces: `export const MIN_BALANCE_WEI: Record<Network, bigint> = { testnet: 5n * 10n ** 16n, mainnet: 5n * 10n ** 17n };` The health check compares against `MIN_BALANCE_WEI[network]`.

- [ ] **Step 1: Write failing tests.** Follow the `healthy` deps pattern, with `networks: () => ['testnet', 'mainnet']`.
  - `health: mainnet attester below 0.5 MON → 503`: mainnet attester at `4n * 10n ** 17n`, everything else at `10n ** 18n`. Expect 503.
  - `health: testnet key at 0.4 MON stays green`: testnet attester at `4n * 10n ** 17n`. Expect 200.
  - `health: mainnet keys not configured stay green` (Review Focus 5): mainnet `balanceOf` returns `null`. Expect 200 and `balances.mainnet.attester === null`.
- [ ] **Step 2: Run them to verify they fail.** `cd backend && npx vitest run test/admin.test.ts`. Expected: the mainnet 0.5 MON test fails.
- [ ] **Step 3: Implement the per-network threshold.** Update the existing `0.05 MON` test name and value if it references the constant.
- [ ] **Step 4: Run the whole backend suite and the typecheck.** `npx vitest run && npx tsc --noEmit -p .` Expected: all pass, and tsc exits 0.
- [ ] **Step 5: Commit** both files with the message `feat(backend): mainnet keys warn below 0.5 MON`.

### Task 6: Docs, covered vaults and the Saturn example

**Files:**
- Modify: `components/docs/articles.tsx` (the `Guardian()` and `Networks()` articles; `CHECK_EVERY` at line 23)
- Test: `components/docs/docs.test.tsx`

- [ ] **Step 1: Write failing tests** in `docs.test.tsx`.
  - The Networks article renders "Clearstar Earn USDC", "August USDC V2" and "Hyperithm USDC Apex".
  - The Guardian article renders the five vault rules, and a sentence naming "Saturn USDC" as a vault Guardian can't protect because withdrawals wait on its curator.
  - The networks article shows testnet checks every "15 seconds".
- [ ] **Step 2: Run them to verify they fail.** `npx vitest run --exclude '.claude/**' components/docs`. Expected: fail.
- [ ] **Step 3: Implement.**
  - Set `CHECK_EVERY.testnet` to `'15 seconds'` (matching `ALARM_MS` after `7a600b4`).
  - Render the mainnet vault list from `NETWORKS.mainnet.vaults`, so it follows the config. Until the deploy fills `addresses.mainnet.json`, fall back to a static list of the three names from the spec.
  - Add the rules list and the Saturn paragraph in plain words. Never call the mainnet demo token USDC; real Circle USDC is "USDC".
- [ ] **Step 4: Run tests, typecheck and lint.** `npx vitest run --exclude '.claude/**'`, `pnpm -s typecheck`, and `npx eslint components/docs`. Expected: all pass.
- [ ] **Step 5: Commit** `components/docs/articles.tsx` and `components/docs/docs.test.tsx` with the message `docs(app): mainnet vaults, selection rules, Saturn example`.

### Task 7: Deploy dry run on a mainnet fork (no broadcast)

**Files:** none changed.

- [ ] **Step 0: Spec rule 1.** Run `cd contracts && script/check-vault.sh <vault>` for each of the three vaults. Expected: no `FAIL` lines.
- [ ] **Step 1: Simulate.**

  ```bash
  cd contracts && ATTESTER=0x00000000000000000000000000000000000a77e5 forge script script/DeployV2.s.sol --fork-url https://rpc.monad.xyz --sender 0x00000000000000000000000000000000000d3910 -vv
  ```

  Don't set `--broadcast` or `WRITE_ADDRESSES`. Expected: the simulation succeeds, the post-registration checks pass, and it prints the addresses JSON and the total estimated gas.
- [ ] **Step 2: Report to the user** each vault's adapter and live liquidity percentage, and the deploy cost in MON at the current `cast gas-price`. Confirm `git status` shows `shared/addresses.mainnet.json` unchanged.

### Task 8: Mainnet deploy (gated: only after the user says "deploy mainnet" and has set the keys and funds)

**Files:**
- Modify: `shared/addresses.mainnet.json` (written by the script)
- Modify: `indexer/config.yaml` (chain 143: oracle, guardianV2, vault addresses)
- Modify: `indexer/src/startBlocks.ts` (mainnet start block = `deployBlockV2`)

- [ ] **Step 1: Pre-check.** Derive and show only addresses:
  - `cast wallet address --private-key "$MAINNET_DEPLOYER_PRIVATE_KEY"`
  - the deployer's balance
  - the attester's and executor's balances, using the public addresses the user shared
  - Expected: deployer at least 1.5 MON, attester at least 4, executor at least 2.
- [ ] **Step 2: Broadcast.**

  ```bash
  cd contracts && ATTESTER=<attester address> WRITE_ADDRESSES=true forge script script/DeployV2.s.sol --rpc-url https://rpc.monad.xyz --private-key "$MAINNET_DEPLOYER_PRIVATE_KEY" --broadcast
  ```

  Expected: success, and `shared/addresses.mainnet.json` has `oracle`, `guardianV2`, `deployBlockV2` and 3 `vaults` with adapters.
- [ ] **Step 3: Verify contracts.** Run `contracts/script/verify.py` for the oracle, GuardianV2 and both adapters, on MonadVision and Monadscan. Expected: verified.
- [ ] **Step 4: Indexer.** Fill in the chain 143 addresses and start block. Run `pnpm -C indexer test` and expect a pass.
- [ ] **Step 5: Commit** the address file and the indexer files with the message `chore: mainnet v2 addresses and indexer config`. Push. Wait for Envio to show the new deployment synced. If the GraphQL endpoint changed, update `ENVIO_GRAPHQL_URL`.
- [ ] **Step 6: Pools.** `curl -s https://api.tarefi.xyz/v1/pools | grep -c` on each of the three pool ids. Expected: 1 each. If any is missing, wait for the 10-minute scan and check again.
- [ ] **Step 7: Gate. Stop and show the user** a table built from `cast call <oracle> "adapterOf(address)(address)"` and `cast call <oracle> "metricsOf(address)(uint256,uint256,uint256)"` per vault, with the liquidity percentage of TVL. Continue only on the user's yes.

### Task 9: Go live and verify

- [ ] **Step 1: Deploy the backend and start the watchers.** Run `cd backend && npx wrangler deploy`, then `POST /v1/admin/watchers/start` with the `ADMIN_TOKEN` from `.env` (never printed). Expected: `started` lists 3 mainnet vaults.
- [ ] **Step 2: Health.** Wait about 60 s, then check `/v1/health`. Expected: the 3 mainnet vaults are ticking with `lastError: null`, mainnet balances are shown, and `ok: true`.
- [ ] **Step 3: First verdicts.** Check `/v1/verdicts?network=mainnet`. Expected: one per vault. For each one:
  - fetch `ledger.tarefi.xyz/state/{stateHash}.json`, compute `cast keccak` of the raw bytes, and expect it to equal the onchain `stateHash` from `getPost(id)`
  - the liquidity in the document matches `metricsOf`
- [ ] **Step 4: App.** Push. When the Vercel preview is ready, run `pnpm e2e`. Expected: pass. Then check `v2.tarefi.xyz` on mainnet: 3 vaults with liquidity, and no faucet, demo controls or Launch.
- [ ] **Step 5: Hand the proof to the user.** Tell them to fund their new proof wallet, deposit about 2.5 USDC each into Clearstar and August, and enable Guardian at 80%. A drill runs only on their explicit yes.
