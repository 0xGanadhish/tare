// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {MirrorAdapter} from "../src/adapters/MirrorAdapter.sol";
import {EulerAdapter} from "../src/adapters/EulerAdapter.sol";
import {EulerEarnAdapter} from "../src/adapters/EulerEarnAdapter.sol";
import {IMorphoMarketAdapter, IMorphoVaultV2, MorphoV2Adapter} from "../src/adapters/MorphoV2Adapter.sol";

/// @notice Maps a vault config's "adapter" kind to a liquidity adapter, deploying each kind once.
/// Shared by DeployV2 and the fork tests so both register vaults the same way.
library AdapterKinds {
    struct Cache {
        address mirror;
        address euler;
        address eulerEarn;
        address morphoV2;
    }

    /// @dev "none" means liquidity is not graded. Any other unknown kind reverts, so a config typo fails the
    /// simulation before anything is broadcast.
    function adapterFor(string memory kind, Cache memory cache) internal returns (address adapter) {
        bytes32 k = keccak256(bytes(kind));
        if (k == keccak256("none")) return address(0);
        if (k == keccak256("mirror")) {
            if (cache.mirror == address(0)) cache.mirror = address(new MirrorAdapter());
            return cache.mirror;
        }
        if (k == keccak256("euler")) {
            if (cache.euler == address(0)) cache.euler = address(new EulerAdapter());
            return cache.euler;
        }
        if (k == keccak256("euler-earn")) {
            if (cache.eulerEarn == address(0)) cache.eulerEarn = address(new EulerEarnAdapter());
            return cache.eulerEarn;
        }
        if (k == keccak256("morpho-v2")) {
            if (cache.morphoV2 == address(0)) cache.morphoV2 = address(new MorphoV2Adapter());
            return cache.morphoV2;
        }
        revert(string.concat("unknown adapter kind: ", kind));
    }

    /// @dev Deploy-time checks a kind needs beyond its adapter's read. The Morpho V2 adapter reads an unknown liquidity
    /// adapter as idle-only (so a later allocator switch can't brick a locked adapter), so the deploy is where a vault
    /// whose liquidity market Tare can't read is rejected.
    function check(string memory kind, address vault) internal view {
        if (keccak256(bytes(kind)) != keccak256("morpho-v2")) return;
        address liqAdapter = IMorphoVaultV2(vault).liquidityAdapter();
        if (liqAdapter == address(0)) return;
        (bool ok, bytes memory ret) = liqAdapter.staticcall(abi.encodeCall(IMorphoMarketAdapter.morpho, ()));
        require(
            ok && ret.length == 32 && abi.decode(ret, (address)).code.length > 0,
            "liquidity adapter is not a Morpho market adapter"
        );
    }
}
