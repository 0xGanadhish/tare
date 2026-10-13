#!/usr/bin/env bash
# Checks a candidate mainnet vault before it goes in vaults.mainnet.json.
# Usage (from contracts/): script/check-vault.sh <vault-address> [rpc]
set -euo pipefail
V=$1; RPC=${2:-https://rpc.monad.xyz}
USDC=0x754704Bc059F8C67012fEd69BC8A327a5aafb603
code=$(cast code "$V" --rpc-url "$RPC"); [ "$code" != "0x" ] || { echo "FAIL: no code at $V"; exit 1; }
asset=$(cast call "$V" "asset()(address)" --rpc-url "$RPC")
echo "name:        $(cast call "$V" "name()(string)" --rpc-url "$RPC")"
echo "asset:       $asset"
[ "$(echo "$asset" | tr A-F a-f)" = "$(echo $USDC | tr A-F a-f)" ] || { echo "FAIL: asset is not USDC"; exit 1; }
echo "totalAssets: $(cast call "$V" "totalAssets()(uint256)" --rpc-url "$RPC")"
if cash=$(cast call "$V" "cash()(uint256)" --rpc-url "$RPC" 2>/dev/null); then
  echo "cash():      $cash  -> Euler EVK vault, adapter: euler"
else
  echo "cash():      not available -> adapter: none (Euler Earn / MetaMorpho)"
fi
