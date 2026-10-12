// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {ILiquidityAdapter} from "../interfaces/ILiquidityAdapter.sol";

/// @dev Minimal slice of the Euler Earn vault interface.
interface IEulerEarn {
    function asset() external view returns (address);
    function withdrawQueueLength() external view returns (uint256);
    function withdrawQueue(uint256 index) external view returns (address);
}

/// @notice Liquidity adapter for Euler Earn vaults: idle assets plus what the vault can pull from each
/// strategy in its withdraw queue right now (each strategy's maxWithdraw for the vault).
contract EulerEarnAdapter is ILiquidityAdapter {
    function availableLiquidity(address vault) external view returns (uint256 liquidity) {
        IEulerEarn earn = IEulerEarn(vault);
        liquidity = IERC20(earn.asset()).balanceOf(vault);
        uint256 n = earn.withdrawQueueLength();
        for (uint256 i = 0; i < n; i++) {
            // A low-level call, so a paused (reverting) or codeless strategy counts as 0 instead of
            // reverting the whole read, which would grade the verdict as broken.
            (bool ok, bytes memory ret) =
                earn.withdrawQueue(i).staticcall(abi.encodeCall(IERC4626.maxWithdraw, (vault)));
            if (ok && ret.length == 32) liquidity += abi.decode(ret, (uint256));
        }
    }
}
