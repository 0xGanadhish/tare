// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ILiquidityAdapter} from "../interfaces/ILiquidityAdapter.sol";

/// @dev Minimal slice of the Morpho Vault V2 interface.
interface IMorphoVaultV2 {
    function asset() external view returns (address);
    function liquidityAdapter() external view returns (address);
    function liquidityData() external view returns (bytes memory);
}

/// @dev Morpho Vault V2 adapter that supplies to a Morpho Blue market.
interface IMorphoMarketAdapter {
    function morpho() external view returns (address);
}

/// @dev Minimal slice of Morpho Blue.
interface IMorphoBlue {
    function market(bytes32 id)
        external
        view
        returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128, uint128, uint128);
    function position(bytes32 id, address user) external view returns (uint256 supplyShares, uint128, uint128);
}

/// @notice Liquidity adapter for Morpho Vault V2: idle assets plus what a withdrawal can pull from the vault's
/// liquidity market. V2 only deallocates from `liquidityAdapter()` (with `liquidityData()`) on withdraw; other
/// allocations need curator action, so they are not instant liquidity. Reverts if the liquidity adapter is not
/// a Morpho market adapter, so such a vault fails the deploy check instead of being graded wrongly.
contract MorphoV2Adapter is ILiquidityAdapter {
    function availableLiquidity(address vault) external view returns (uint256 liquidity) {
        IMorphoVaultV2 v = IMorphoVaultV2(vault);
        liquidity = IERC20(v.asset()).balanceOf(vault);
        address liqAdapter = v.liquidityAdapter();
        if (liqAdapter == address(0)) return liquidity;

        IMorphoBlue morpho = IMorphoBlue(IMorphoMarketAdapter(liqAdapter).morpho());
        bytes32 id = keccak256(v.liquidityData());
        (uint128 supplyAssets, uint128 supplyShares, uint128 borrowAssets,,,) = morpho.market(id);
        if (supplyShares == 0 || borrowAssets >= supplyAssets) return liquidity;
        (uint256 shares,,) = morpho.position(id, liqAdapter);
        uint256 ours = Math.mulDiv(shares, supplyAssets, supplyShares);
        liquidity += Math.min(ours, supplyAssets - borrowAssets);
    }
}
