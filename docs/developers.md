# Building on Tare

Tare's verdicts, exits and grades are public. You can read them from the contracts, from the REST API, or from the Envio indexer, and you can protect your own users with GuardianV2 without running a keeper. Contract addresses for each network are in [`shared/addresses.testnet.json`](../shared/addresses.testnet.json) and [`shared/addresses.mainnet.json`](../shared/addresses.mainnet.json).

## TareRiskOracle

Source: [`contracts/src/TareRiskOracle.sol`](../contracts/src/TareRiskOracle.sol). ABI: `abis.oracle` in [`shared/contracts.ts`](../shared/contracts.ts).

### Reading a verdict

```solidity
enum Verdict { HOLD, EXIT, MOVE }

struct Post {
    address vault;
    Verdict verdict;
    uint16 confidenceBps;   // how sure Jev is, 0–10,000
    uint16 riskBps;         // Jev's risk score, 0–10,000
    bytes32 stateHash;      // keccak256 of the state document Jev was shown
    uint64 postedAt;
    uint256 ppsAtPost;      // share price snapshot: convertToAssets(10 ** decimals)
    uint256 assetsAtPost;   // totalAssets snapshot
    uint256 liquidityAtPost; // withdrawable now, from the vault's adapter
}

function latest(address vault) external view returns (uint256 id);   // 0 = no verdict yet
function getPost(uint256 id) external view returns (Post memory);
function getResolution(uint256 id) external view returns (Resolution memory);
function getSample(uint256 id) external view returns (Sample memory);
function metricsOf(address vault) external view returns (uint256 pps, uint256 assets, uint256 liquidity);
function postCount() external view returns (uint256);
```

A consumer that should refuse new deposits after a confident EXIT verdict needs only two calls:

```solidity
uint256 id = oracle.latest(vault);
if (id != 0) {
    TareRiskOracle.Post memory p = oracle.getPost(id);
    bool risky = p.verdict == TareRiskOracle.Verdict.EXIT
        && p.confidenceBps >= 9_000
        && block.timestamp - p.postedAt <= 1 hours;
    require(!risky, "Tare: exit verdict");
}
```

From TypeScript with viem:

```ts
import { createPublicClient, http } from 'viem';
import { abis } from './shared/contracts';

const client = createPublicClient({ transport: http('https://rpc.monad.xyz') });
const id = await client.readContract({ address: oracle, abi: abis.oracle, functionName: 'latest', args: [vault] });
const post = await client.readContract({ address: oracle, abi: abis.oracle, functionName: 'getPost', args: [id] });
```

### Grading

Every post is graded from onchain data alone, by anyone.

| Phase | When (mainnet) | Call | What it does |
|---|---|---|---|
| Open | first 24 h after `postedAt` | none | `sample` and `resolve` revert with `WindowOpen` |
| Sampling | the hour after that | `sample(id)` | keeps the worst share price, total assets and liquidity seen; a read that reverts sets `broken` |
| Gradable | after sampling closes | `resolve(id)` | grades on the worst values (or reads once if nobody sampled) |

Testnet has a 1 h window and no sampling (`sampleWindow() == 0`), so `resolve` reads once.

`Resolution.reasons` is a bitmask. Any bit set means `adverse = true`:

| Bit | Constant | Condition, against the post's snapshot |
|---|---|---|
| 1 | `REASON_PPS` | share price fell more than 0.5% |
| 2 | `REASON_TVL` | total assets fell more than 20% |
| 4 | `REASON_LIQ` | withdrawable liquidity under 5% of total assets (vaults with an adapter only) |
| 8 | `REASON_BROKEN` | the vault's views reverted |

An adverse grade on an EXIT verdict means Jev was right to warn; on a HOLD it means Jev missed something. The Ledger's scorecard (`/v1/ledger/score`) turns this into a Brier score and hit rates per confidence band.

### Events

```solidity
event VerdictPosted(uint256 indexed id, address indexed vault, Verdict verdict, uint16 confidenceBps, uint16 riskBps, bytes32 stateHash, uint64 postedAt);
event VerdictSampled(uint256 indexed id, bool broken, uint256 pps, uint256 assets, uint16 liquidityBps);
event VerdictResolved(uint256 indexed id, bool adverse, uint8 reasons);
event VaultRegistered(address indexed vault, address adapter);
event AttesterChanged(address attester);
```

### Checking what Jev saw

Each `stateHash` is the keccak256 of a canonical JSON document (keys sorted at every depth) archived at `https://ledger.tarefi.xyz/state/{stateHash}.json`. The file holds the exact bytes that were hashed:

```bash
H=0xc3cc0186cbf60a625a37ea8a40994f937586175aa8059d221cd1c9dafdbae607
cast keccak "$(curl -s https://ledger.tarefi.xyz/state/$H.json)"   # prints $H
```

The document contains the network, vault, the state text Jev was shown, the questions, Jev's answers, the model, and a timestamp.

## GuardianV2

Source: [`contracts/src/GuardianV2.sol`](../contracts/src/GuardianV2.sol). ABI: `abis.guardianV2` in [`shared/contracts.ts`](../shared/contracts.ts).

### Protecting a position

A user (or your wallet on their behalf) sends two transactions:

```ts
// 1. Let Guardian redeem the vault shares. The allowance caps how much can be exited.
await wallet.writeContract({ address: vault, abi: erc20Abi, functionName: 'approve', args: [guardianV2, maxUint256] });
// 2. Opt in: exit on EXIT verdicts at ≥ 85% confidence that are at most 10 minutes old.
await wallet.writeContract({ address: guardianV2, abi: abis.guardianV2, functionName: 'enable', args: [vault, 8_500, 600] });
```

| Rule field | Range |
|---|---|
| `minConfidenceBps` | 8,000–9,900 |
| `maxAge` (seconds) | 60–3,600 |

`enable` only works on vaults the Guardian admin approved (`approvedVault(vault)`). Calling it again updates the rule and resets the start time. `disable(vault)` turns it off at any time.

### Triggering an exit

```solidity
function exit(address vault, address owner) external returns (uint256 assets);
```

Anyone can call it. It reverts unless every condition holds: the vault is approved, the owner's rule is enabled, the oracle's latest verdict on the vault is an EXIT at or above the owner's confidence, no older than their `maxAge`, posted after they enabled, and not already used to fully exit them. It redeems the owner's shares (capped by the allowance) **to the owner**. If the vault can't pay everything, it redeems what it can (`maxRedeem`) and the same verdict can finish the job later. Tare's backend calls `exit` within seconds of an EXIT verdict, but you can run your own caller as a backup:

```ts
await client.simulateContract({ address: guardianV2, abi: abis.guardianV2, functionName: 'exit', args: [vault, owner], account });
```

Events: `Enabled(owner, vault, minConfidenceBps, maxAge)`, `Disabled(owner, vault)`, `Exited(owner, vault, verdictId, caller, shares, assets, remainingShares)`.

## Liquidity adapters

The oracle reads withdrawable liquidity through `ILiquidityAdapter.availableLiquidity(vault)`. Adapters are stateless and shared by every vault of their type:

| Adapter | Counts |
|---|---|
| `EulerEarnAdapter` | Σ `maxWithdraw(vault)` over the Euler Earn withdraw queue |
| `MorphoV2Adapter` | idle USDC, plus what the vault's liquidity market can return (`min(position, supply − borrow)`) |
| `MirrorAdapter` | the testnet mirror vaults' own withdrawable amount |

Neither real-vault adapter counts USDC donated straight to the vault, and neither reverts: an unreadable market counts as 0. A vault's adapter is locked at its first verdict. To support a new vault type, implement the interface without reverts and add a kind to [`contracts/script/AdapterKinds.sol`](../contracts/script/AdapterKinds.sol).

## REST API

Base URL `https://api.tarefi.xyz`. Read-only, no key, JSON. `GET /` lists every route.

| Route | Returns |
|---|---|
| `GET /v1/health` | per-vault watcher freshness, exit queue backlog, signer balances |
| `GET /v1/pools`, `/v1/pools/{poolId}` | every Monad pool Tare tracks, with Jev's pool verdict |
| `GET /v1/verdicts?network=mainnet` | recent oracle verdicts with their grades |
| `GET /v1/vaults/{network}/{vault}/latest` | the latest verdict on one vault |
| `GET /v1/events/{network}/{owner}?since={iso}` | the Watch feed for one wallet: judgments, posted verdicts, alerts and exits |
| `GET /v1/ledger/score?network=mainnet` | `n`, Brier score, hit rate per confidence band |

```bash
curl https://api.tarefi.xyz/v1/vaults/testnet/0x7504b078d1f2b90fb9fcaf3d22753311013ea0ac/latest
```

```json
{"verdict":{"network":"testnet","id":15,"vault":"0x7504…a0ac","verdict":0,"confidenceBps":7900,"riskBps":4800,
 "stateHash":"0xc3cc…e607","postedAt":1791797490,"txHash":"0x0d57…f074","resolved":true,"adverse":false,"reasons":0,"drill":false}}
```

`verdict` uses the contract's enum (0 HOLD, 1 EXIT, 2 MOVE). `drill: true` marks testnet stress-demo verdicts, which the scorecard leaves out.

## Envio indexer

[`indexer/`](../indexer) indexes both networks into one GraphQL schema ([`schema.graphql`](../indexer/schema.graphql)). Ids are prefixed with the chain id (143 mainnet, 10143 testnet) and addresses are lowercase. Run it locally with `pnpm -C indexer dev` (GraphQL at `http://localhost:8080/v1/graphql`). The hosted endpoint is set in the backend's `ENVIO_GRAPHQL_URL` secret; the app reads Envio data through the backend's public API, not directly.

The latest graded verdicts on a vault:

```graphql
query {
  Verdict(where: { chainId: { _eq: 143 }, vault: { _eq: "0xe1bca19baa63894d374578320551633320436523" } },
          order_by: { postId: desc }, limit: 5) {
    postId verdict confidenceBps resolved adverse reasons txHash
    exits { owner assets remainingShares txHash }
  }
}
```

Net flows over the last hours, the same data Jev is shown:

```graphql
query ($since: numeric!) {
  VaultFlowHour(where: { chainId: { _eq: 143 }, vault: { _eq: "0x80017bf0f793ebbe9679cd61ff0e395b62cabb59" }, hourTs: { _gte: $since } }) {
    hourTs inAssets outAssets largestOut
  }
}
```

Other entities: `Protection` (each user's Guardian rule), `Exit`, and `LargeWithdrawal` (single withdrawals of at least 1% of a vault).

## Running your own

Everything is MIT. To run your own feed with your own judge:

1. Deploy with `contracts/script/DeployV2.s.sol` and your own `ATTESTER` address (see the README).
2. Point the backend's `ATTESTER_KEY_*` and `EXECUTOR_KEY_*` secrets at your keys, and replace the Jev calls in `lib/judge/index.ts` with your model. Fixed rules in `lib/judge/gating.ts` turn answers into verdicts.
3. Point the indexer at your addresses with `pnpm -C indexer gen-config --strict`.

Your verdicts are graded by the same contract rules as Tare's, so two feeds can be compared on the same scorecard.
