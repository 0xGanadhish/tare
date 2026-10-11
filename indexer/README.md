# Tare indexer (Envio HyperIndex)

Indexes Tare's risk oracle verdicts, GuardianV2 protections and exits, and ERC-4626 vault flows on Monad testnet (10143) and mainnet (143). The backend and the app read it over GraphQL.

| Entity | From | Notes |
|---|---|---|
| `Verdict` | `TareRiskOracle.VerdictPosted`, `VerdictResolved` | id `<chainId>-<postId>`; `verdict` is `HOLD` / `EXIT` / `MOVE` |
| `Protection` | `GuardianV2.Enabled`, `Disabled` | id `<chainId>-<owner>-<vault>`; disabling keeps the last rule's numbers |
| `Exit` | `GuardianV2.Exited` | links to its `Verdict` by the event's `verdictId` |
| `VaultFlowHour` | ERC-4626 `Deposit`, `Withdraw` | in, out and largest withdrawal per vault per UTC hour |
| `LargeWithdrawal` | ERC-4626 `Withdraw` | at least 1% of the vault's tracked total assets |
| `VaultState` | internal | running total-assets estimate behind `LargeWithdrawal` |

All addresses are stored lowercase.

## Addresses

`config.yaml` is generated from `shared/addresses.{testnet,mainnet}.json`; never edit it by hand.

```bash
pnpm gen-config            # placeholders allowed while v2 is not deployed
pnpm gen-config --strict   # before deploying: fails unless oracle, guardianV2, deployBlockV2 and vaults exist
pnpm codegen
```

Until Task 6 writes the v2 fields, the oracle and guardian are placeholder addresses with no code, and testnet indexes the v1 mirror vaults.

## Develop

```bash
pnpm install
pnpm codegen
pnpm test                 # simulated events, no network
pnpm typecheck
TUI_OFF=true pnpm dev     # needs Docker and ENVIO_API_TOKEN (see .env.example)
```
