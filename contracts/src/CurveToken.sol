// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice An 18-decimal token with a linear curve denominated in six-decimal quote assets.
/// @dev All deposits become vault shares. Sales pay only the curve integral, leaving yield
/// for remaining holders. Gas depends on vault accrual; estimate each trade with a tight
/// limit because Monad charges for the transaction's gas limit, not gas used.
contract CurveToken is ERC20, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error SlippageExceeded();
    error InsufficientLiquidity(uint256 requiredShares, uint256 availableShares);

    // Price in quote base units: 100 + supply / 1e22. Supply is in token base units.
    uint256 private constant P0 = 100;
    uint256 private constant SLOPE_DIVISOR = 1e22;
    uint256 private constant OFFSET = P0 * SLOPE_DIVISOR;
    uint256 private constant INTEGRAL_DIVISOR = 2e40;

    IERC4626 public immutable reserveVault;
    IERC20 public immutable quoteAsset;

    constructor(string memory name_, string memory symbol_, address reserveVault_) ERC20(name_, symbol_) {
        reserveVault = IERC4626(reserveVault_);
        quoteAsset = IERC20(reserveVault.asset());
        quoteAsset.forceApprove(reserveVault_, type(uint256).max);
    }

    /// @notice Deposits the entire quote input and mints the curve's rounded-down token output.
    function buy(uint256 quoteIn, uint256 minTokensOut) external nonReentrant returns (uint256 tokensOut) {
        uint256 shiftedSupply = totalSupply() + OFFSET;
        // Completing the square in the integral gives the new supply directly.
        tokensOut = Math.sqrt(shiftedSupply * shiftedSupply + quoteIn * INTEGRAL_DIVISOR) - shiftedSupply;
        if (tokensOut < minTokensOut) revert SlippageExceeded();

        quoteAsset.safeTransferFrom(msg.sender, address(this), quoteIn);
        reserveVault.deposit(quoteIn, address(this));
        _mint(msg.sender, tokensOut);
    }

    /// @notice Burns caller-owned tokens and pays the full integral, or reverts atomically.
    function sell(uint256 tokensIn, uint256 minQuoteOut) external nonReentrant returns (uint256 quoteOut) {
        uint256 supply = totalSupply();
        _burn(msg.sender, tokensIn);
        quoteOut = Math.mulDiv(tokensIn, 2 * supply - tokensIn + 2 * OFFSET, INTEGRAL_DIVISOR);
        if (quoteOut < minQuoteOut) revert SlippageExceeded();

        uint256 requiredShares = reserveVault.previewWithdraw(quoteOut);
        uint256 availableShares = reserveVault.maxRedeem(address(this));
        if (requiredShares > availableShares) revert InsufficientLiquidity(requiredShares, availableShares);

        // Exact-asset withdrawal redeems rounded-up shares without sending yield or
        // share-rounding dust to the seller. Never truncate to the vault's liquidity cap.
        reserveVault.withdraw(quoteOut, msg.sender, address(this));
    }

    function reserveAssets() public view returns (uint256) {
        return reserveVault.convertToAssets(reserveVault.balanceOf(address(this)));
    }

    /// @notice Quote base units backing one whole token; zero when supply is zero.
    function floorPrice() public view returns (uint256) {
        uint256 supply = totalSupply();
        return supply == 0 ? 0 : Math.mulDiv(reserveAssets(), 1e18, supply);
    }

    /// @notice Marginal price per whole token, rounded down to quote base units.
    function price() public view returns (uint256) {
        return P0 + totalSupply() / SLOPE_DIVISOR;
    }
}
