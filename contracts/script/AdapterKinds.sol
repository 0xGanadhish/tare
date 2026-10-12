// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {MirrorAdapter} from "../src/adapters/MirrorAdapter.sol";
import {EulerAdapter} from "../src/adapters/EulerAdapter.sol";
import {EulerEarnAdapter} from "../src/adapters/EulerEarnAdapter.sol";
import {MorphoV2Adapter} from "../src/adapters/MorphoV2Adapter.sol";

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
}
