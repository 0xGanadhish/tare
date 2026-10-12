# Mainnet depth: liquidity adapters and three real vaults

Date: 2026-10-13 · Branch: `feat/guardian-v2` · Deadline: 14 Oct 09:29 IST (Monad Metropolis Track 01)

## Intent

At submission, a judge should come away believing **"it works for real"**: a few mainnet vaults, watched correctly, with an honest live track record. Depth over breadth.

The blocker is not the number of vaults; it's that Jev is blind to liquidity on real vaults. `backend/src/vaultReader.ts` gets `available = null` for a real vault with no liquidity adapter, so utilization reads **0%**, and `TareRiskOracle.resolve()` never grades the liquidity criterion. Both configured mainnet vaults have no adapter today. A bank run on them would be invisible to Jev and to the Ledger.

## Constraints

- **No mainnet transaction** until the user says "deploy mainnet". Everything before step 1 of the deploy order is code, tests and fork simulation.
- **One wallet per role per network, never reused.** The user creates and funds all three mainnet wallets (deployer/owner, attester, executor). The user sends all funds, and keys never appear in chat or in the repo.
- **A vault's adapter locks at its first verdict** (`AdapterLocked`). Adapters must be registered at deploy, before any watcher posts.
- **The mainnet resolve window stays 24 h** (`86_400`, immutable). Mainnet grades will land after the deadline, during judging; that's accepted.
- Work happens directly on `feat/guardian-v2` in the main checkout, test-first, and is committed by explicit path.

## 1. Liquidity adapters

Two stateless, view-only contracts implement the existing `ILiquidityAdapter.availableLiquidity(address vault)`. Each is deployed once per network and shared by every vault of its type. They have no owner and no storage.

**`EulerEarnAdapter`** (`contracts/src/adapters/EulerEarnAdapter.sol`)
- Formula: `Σ strategy.maxWithdraw(vault)` over `withdrawQueue(0 … withdrawQueueLength-1)`. Euler Earn pays withdrawals only from its strategies, so USDC sent straight to the vault is stranded and not counted (final review: a 1M USDC donation on a fork did not change what could be withdrawn).
- A strategy whose `maxWithdraw` reverts counts as 0. One paused market must not make `metricsOf` revert, because that would grade the verdict `REASON_BROKEN`.
- Today, Clearstar Earn USDC: 0 + 430.8k + 0 across 3 strategies, against a TVL of 5.79M (7.4%).

**`MorphoV2Adapter`** (`contracts/src/adapters/MorphoV2Adapter.sol`)
- Formula: `asset.balanceOf(vault)`, plus whatever the vault can pull from its liquidity market. Morpho V2 only deallocates from `liquidityAdapter()` with `liquidityData()` on a withdraw; other allocations need curator action, so they don't count.
- If `liquidityAdapter() == 0`, it returns idle only.
- Otherwise:
  - Decode `liquidityData` as Morpho Blue `MarketParams`, with `id = keccak256(liquidityData)`.
  - Read `morpho = liquidityAdapter.morpho()`, `market(id)` and `position(id, liquidityAdapter)`.
  - Add `min(supplyShares × totalSupplyAssets / totalSupplyShares, totalSupplyAssets − totalBorrowAssets)`, rounding down. Cash (supply − borrow) is exact between interest accruals.
- If the liquidity adapter is not a readable Morpho market adapter (no `morpho()`, or a market or position read that fails), the market counts as 0 and the adapter returns idle only. It must not revert: the allocator can switch the liquidity adapter without a timelock, and the oracle locks the adapter at the first verdict, so a revert would stop verdicts on that vault for good. The deploy check (`AdapterKinds.check`) rejects such a vault up front, so it is left out.
- Today:
  - August USDC V2: min(8.03M, 699.7k) = 699.7k (8.7%).
  - Hyperithm USDC Apex: idle only, 2.98M of 51.7M (5.8%).

**Tests (written first)**
- Unit tests with mocks:
  - mixed strategy `maxWithdraw` values
  - a reverting strategy
  - an empty queue
  - Morpho with cash below our position, and above it
  - no liquidity market
  - a non-Morpho liquidity adapter, an EOA one, and a `morpho()` that isn't Morpho Blue (idle only; the deploy check reverts)
  - a USDC donation on the fork must not raise the adapter above what can be withdrawn
- Fork tests on rpc.monad.xyz for all three vaults:
  - the adapter value equals a total computed independently in the test
  - the value is greater than 0 and no more than `totalAssets`

## 2. Vault selection

**Rules.** A mainnet vault is watched only if it passes all five:
1. Its asset is USDC (`0x7547…b603`) and it passes `contracts/script/check-vault.sh`.
2. It is an Euler Earn or Morpho V2 vault, so one of the two adapters covers it.
3. Its TVL is at least $1M.
4. Guardian can fully exit a 1,000 USDC position on a mainnet fork: deposit, enable, post EXIT, `exit()`, with the balance at 0 and the verdict consumed. This extends the existing `Fork.t.sol`.
5. The adapter returns a value greater than 0 and no more than TVL on the fork.

**Selected (about $14M TVL):**

| Vault | Type | Address | DefiLlama pool | Adapter kind |
|---|---|---|---|---|
| Clearstar Earn USDC | Euler Earn | `0xE1BcA19baA63894D374578320551633320436523` | `d711af54-e736-470f-8a22-431a23de76df` | `euler-earn` |
| August USDC V2 | Morpho V2 | `0x80017bF0f793EBbE9679Cd61ff0e395B62CAbB59` | `0b033747-3a22-486b-a600-9958b878bef7` | `morpho-v2` |

**Excluded:**
- **Hyperithm USDC Apex** (`0x7899…F371`, 51.2M, `morpho-v2`) passes all five rules but is left out of the first deploy (user decision, 2026-10-13): it has no liquidity market and only 3.7% idle, under the oracle's 5% `LIQ_FLOOR_BPS`, so its HOLD verdicts would grade adverse. It can be registered later, once it is back above 5%.
- **Saturn USDC** (`0x7575…C079`, 3.02M) fails rule 4: idle cash is about $9 and it has no liquidity market, so Guardian couldn't get anyone out.
- Other Euler USDC pools on Monad are under $1M (rule 3).

The Docs tab lists the selected vaults and the rules, and uses Saturn as the example of a vault Guardian can't protect.

## 3. Deploy order

**Script change (`contracts/script/DeployV2.s.sol`):**
- Add adapter kinds `euler-earn` and `morpho-v2` to the existing `euler`, `mirror` and `none`.
- An unknown kind fails the run.
- After registering, the script requires every vault's `oracle.metricsOf(vault)` to succeed with liquidity `!= type(uint256).max`. Forge simulates before broadcasting, so a bad adapter stops the run with nothing sent.

`script/vaults.mainnet.json` gets the three vaults above with those kinds.

| # | Step | Who | Reversible |
|---|---|---|---|
| 0 | Fork tests green for all 3 vaults; dry run of `DeployV2` on a mainnet fork prints addresses, total gas and each vault's liquidity | Claude | yes |
| 1 | User says **"deploy mainnet"**, adds `MAINNET_DEPLOYER_PRIVATE_KEY` to `.env`, sets `ATTESTER_KEY_MAINNET` and `EXECUTOR_KEY_MAINNET` with `wrangler secret put`, funds all three, and shares the three public addresses | user | n/a |
| 2 | One broadcast from the deployer (`ATTESTER` = the attester's address): adapters → oracle (window 86,400) → GuardianV2 → `registerVault` and `setVaultApproved` per vault | Claude | yes, until the first verdict |
| 3 | Verify contracts on MonadVision and Monadscan (`verify.py`); commit `shared/addresses.mainnet.json` | Claude | yes |
| 4 | Indexer: add the mainnet oracle, GuardianV2, vaults and start block; push; wait for the Envio sync; update `ENVIO_GRAPHQL_URL` if the endpoint changes | Claude | yes |
| 5 | Make sure all 3 pool ids have rows in the backend `pools` table (run or wait for the 10-minute scan), so no verdict is judged with APY 0 | Claude | yes |
| 6 | **Gate:** read back `adapterOf(vault)` and live `metricsOf(vault)` from the deployed oracle and show the user the table | Claude → user | **last stop** |
| 7 | Deploy the backend and start the watchers (mainnet now arms, because its oracle exists). The first verdicts post here. | Claude | no |
| 8 | Push so the Vercel preview gets the mainnet addresses | Claude | yes |

If step 6 shows a problem, redeploy the oracle and GuardianV2 only. No verdict history exists yet.

## 4. Verification

1. **Watchers:** `/v1/health` lists the 3 mainnet vaults ticking with `lastError: null`.
   - **Code change:** `MIN_BALANCE_WEI` becomes per network.
   - Testnet stays at 0.05 MON.
   - Mainnet becomes 0.5 MON, about 15 posts at the measured ~0.028 MON each, so health goes red hours before verdicts stop.
2. **First verdicts:** one per vault within minutes. For each one, check that:
   - the onchain verdict matches `/v1/verdicts?network=mainnet`
   - the `ledger.tarefi.xyz/state/{hash}.json` file re-hashes to the onchain `stateHash`
   - the liquidity in that file matches the adapter's onchain value and the independent calculation
3. **Mainnet proof (user):**
   - deposit a few USDC into one vault through the app
   - enable Guardian at 80%
   - a real EXIT at 80% or higher exits for real
   - if none arrives in time, a labelled drill runs only on the user's explicit yes
4. **App:**
   - the mainnet tab shows the 3 vaults with real liquidity
   - testnet-only features stay hidden on mainnet
   - `pnpm e2e` passes
5. **Docs:** add the vault list, the five rules, and the Saturn example.

## Wallets and funding (measured)

**Measured costs** (mainnet gas 102 gwei; Monad charges the gas limit, so the backend keeps limits tight):
- verdict post: 274,545 gas, about 0.028 MON
- Guardian exit: 225,192 gas, about 0.023 MON (≤ ~0.05 MON for multi-market vaults)
- deploy: about 0.5–0.6 MON (exact figure from step 0)

| Wallet | Role | Fund |
|---|---|---|
| Deployer / owner (new, user-held) | deploys; owns the oracle and GuardianV2 | ~1.5 MON |
| Attester (new) | posts verdicts (~0.85 MON/day at ~10 posts per vault per day, to be confirmed on day one) | ~4 MON |
| Executor (new) | sends exits and every `resolve` call (one per verdict, ~0.3 MON/day, plus ~0.05 MON per exit) | ~2 MON |
| User's own wallet | mainnet proof deposit | a few USDC + ~0.2 MON |

The operator (`0x1A99…70e4`, 18.64 mainnet MON, v1 owner and testnet attester) is not used in any v2 mainnet role. The user may fund the new wallets from it.

## Out of scope

- More vaults, or other assets (AUSD and others).
- Adapters for other vault types (MetaMorpho V1, plain EVK on mainnet).
- Testnet changes (it stays at 4 mirrors; the watcher tick speed is a separate decision).
- Shortening the mainnet resolve window.
