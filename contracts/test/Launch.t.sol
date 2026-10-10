// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {LaunchFactory} from "../src/LaunchFactory.sol";
import {CurveToken} from "../src/CurveToken.sol";
import {MirrorVault} from "../src/MirrorVault.sol";
import {Guardian} from "../src/Guardian.sol";
import {MockToken} from "../src/MockToken.sol";

contract LaunchTest is Test {
    MockToken internal quote;
    MirrorVault internal vault;
    Guardian internal guardian;
    LaunchFactory internal factory;
    CurveToken internal token;
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    function setUp() public {
        quote = new MockToken("Mock USDC", "USDC", 6);
        vault = new MirrorVault(IERC20(address(quote)), "Mirror", "mUSDC", "Launch reserve", 1000, 0, address(this));
        guardian = new Guardian(address(this), address(this));
        guardian.setVaultApproved(address(vault), true);
        factory = new LaunchFactory(address(guardian));
        token = CurveToken(factory.create("Launch token", "LAUNCH", address(vault)));
        quote.mint(address(this), 1_000_000e6);
        quote.mint(alice, 1_000_000e6);
        quote.mint(bob, 1_000_000e6);
        quote.approve(address(token), type(uint256).max);
        vm.prank(alice);
        quote.approve(address(token), type(uint256).max);
        vm.prank(bob);
        quote.approve(address(token), type(uint256).max);
    }

    function test_buyFirstMillionCostsAbout150() public {
        uint256 beforeBalance = quote.balanceOf(address(this));
        uint256 out = token.buy(150e6, 0);
        assertApproxEqRel(out, 1_000_000e18, 0.001e18);
        assertEq(token.balanceOf(address(this)), out);
        assertEq(token.totalSupply(), out);
        assertEq(beforeBalance - quote.balanceOf(address(this)), 150e6);
        assertEq(token.reserveAssets(), 150e6);
        assertEq(quote.balanceOf(address(token)), 0);
        assertEq(token.price(), 200);
        assertEq(token.floorPrice(), 150);
    }

    function test_sellReturnsCurveIntegral() public {
        uint256 out = token.buy(150e6, 0);
        uint256 beforeBalance = quote.balanceOf(address(this));
        uint256 received = token.sell(out, 150e6 - 2);
        assertApproxEqAbs(received, 150e6, 2);
        assertEq(quote.balanceOf(address(this)) - beforeBalance, received);
        assertEq(token.totalSupply(), 0);
        assertEq(token.balanceOf(address(this)), 0);
        assertLe(token.reserveAssets(), 2);
        assertEq(token.floorPrice(), 0);
        assertEq(token.price(), 100);
    }

    function test_floorRisesWithVaultYield() public {
        token.buy(150e6, 0);
        uint256 beforeFloor = token.floorPrice();
        vm.warp(block.timestamp + 365 days);
        assertApproxEqAbs(token.reserveAssets(), 165e6, 1);
        assertGt(token.floorPrice(), beforeFloor);
        assertApproxEqAbs(token.floorPrice(), 165, 1);
        assertEq(token.price(), 200);
    }

    function test_surplusStaysForHolders() public {
        vm.prank(alice);
        uint256 aliceTokens = token.buy(150e6, 0);
        vm.prank(bob);
        uint256 bobTokens = token.buy(250e6, 0);
        // A descending-supply sale lowers the curve's average price. At 30% accrued
        // yield the retained surplus also outweighs that drop, as required by the plan.
        vm.warp(block.timestamp + 3 * 365 days);
        uint256 beforeFloor = token.floorPrice();
        uint256 beforeBob = quote.balanceOf(bob);
        vm.prank(alice);
        uint256 received = token.sell(aliceTokens, 250e6 - 2);
        assertApproxEqAbs(received, 250e6, 2);
        assertEq(token.totalSupply(), bobTokens);
        assertGe(token.floorPrice(), beforeFloor);
        assertApproxEqAbs(token.reserveAssets(), 270e6, 2);
        assertEq(quote.balanceOf(bob), beforeBob);
        assertEq(token.balanceOf(alice), 0);
    }

    function test_createRejectsUnapprovedVault() public {
        vm.expectRevert(LaunchFactory.VaultNotApproved.selector);
        factory.create("Rejected", "NO", address(0xDEAD));
        guardian.setVaultApproved(address(vault), false);
        vm.expectRevert(LaunchFactory.VaultNotApproved.selector);
        factory.create("Revoked", "NO", address(vault));
    }

    function test_slippageGuards() public {
        uint256 beforeBalance = quote.balanceOf(address(this));
        vm.expectRevert(CurveToken.SlippageExceeded.selector);
        token.buy(150e6, 1_000_001e18);
        assertEq(quote.balanceOf(address(this)), beforeBalance);
        assertEq(token.totalSupply(), 0);
        assertEq(vault.balanceOf(address(token)), 0);
        uint256 out = token.buy(150e6, 0);
        uint256 shares = vault.balanceOf(address(token));
        vm.expectRevert(CurveToken.SlippageExceeded.selector);
        token.sell(out, 150e6 + 1);
        assertEq(token.balanceOf(address(this)), out);
        assertEq(token.totalSupply(), out);
        assertEq(vault.balanceOf(address(token)), shares);
        assertEq(quote.balanceOf(address(this)), beforeBalance - 150e6);
    }

    function test_cappedRedeemRevertsWithoutBurningOrPayingLess() public {
        uint256 out = token.buy(150e6, 0);
        vault.setStats(1000, 7100);
        assertEq(vault.maxWithdraw(address(token)), 43_500_000);
        uint256 shares = vault.balanceOf(address(token));
        uint256 beforeBalance = quote.balanceOf(address(this));
        vm.expectRevert(abi.encodeWithSelector(
            CurveToken.InsufficientLiquidity.selector, vault.previewWithdraw(150e6), vault.maxRedeem(address(token))
        ));
        token.sell(out, 150e6);
        assertEq(token.balanceOf(address(this)), out);
        assertEq(token.totalSupply(), out);
        assertEq(vault.balanceOf(address(token)), shares);
        assertEq(quote.balanceOf(address(this)), beforeBalance);
        // A permissive minimum must not turn a curve sale into a partial payment either.
        vm.expectRevert(abi.encodeWithSelector(
            CurveToken.InsufficientLiquidity.selector, vault.previewWithdraw(150e6), vault.maxRedeem(address(token))
        ));
        token.sell(out, 0);
        assertEq(token.balanceOf(address(this)), out);
        vault.setStats(1000, 0);
        assertEq(token.sell(out, 150e6), 150e6);
    }

    function test_saleWithinLiquidityCapPaysFullIntegral() public {
        token.buy(150e6, 0);
        vault.setStats(1000, 7100);
        uint256 beforeBalance = quote.balanceOf(address(this));
        // Integral from 900,000 to 1,000,000 tokens is 19.5 USDC.
        uint256 received = token.sell(100_000e18, 19_500_000);
        assertEq(received, 19_500_000);
        assertEq(quote.balanceOf(address(this)) - beforeBalance, received);
        assertEq(token.totalSupply(), 900_000e18);
        assertEq(token.reserveAssets(), 130_500_000);
    }

    function test_transferredTokensCanSellButCannotBurnAnotherHolder() public {
        token.buy(150e6, 0);
        token.transfer(bob, 100_000e18);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSignature(
            "ERC20InsufficientBalance(address,uint256,uint256)", bob, 100_000e18, 100_001e18
        ));
        token.sell(100_001e18, 0);
        vm.prank(bob);
        uint256 received = token.sell(100_000e18, 19_500_000);
        assertEq(received, 19_500_000);
        assertEq(quote.balanceOf(bob), 1_000_000e6 + received);
        assertEq(token.balanceOf(bob), 0);
        assertEq(token.balanceOf(address(this)), 900_000e18);
    }

    function testFuzz_roundTripCannotExtractMoreThanDeposit(uint256 quoteIn) public {
        quoteIn = bound(quoteIn, 1, 1_000_000e6);
        uint256 beforeBalance = quote.balanceOf(address(this));
        uint256 out = token.buy(quoteIn, 0);
        uint256 received = token.sell(out, 0);
        assertLe(received, quoteIn);
        assertApproxEqAbs(received, quoteIn, 1);
        assertEq(quote.balanceOf(address(this)), beforeBalance - quoteIn + received);
        assertEq(token.totalSupply(), 0);
    }

    function testFuzz_partialSalesPreserveRemainingBacking(uint256 firstIn, uint256 secondIn, uint256 fraction) public {
        firstIn = bound(firstIn, 1, 500_000e6);
        secondIn = bound(secondIn, 1, 500_000e6);
        fraction = bound(fraction, 1, 10_000);
        token.buy(firstIn, 0);
        token.buy(secondIn, 0);
        uint256 supply = token.totalSupply();
        uint256 sold = supply * fraction / 10_000;
        uint256 beforeReserve = token.reserveAssets();
        uint256 paid = token.sell(sold, 0);
        uint256 remaining = supply - sold;
        // Independent cumulative-integral reference, allowing one unit of rounding.
        uint256 remainingCost = remaining * (remaining + 2e24) / 2e40;
        assertGe(token.reserveAssets(), remainingCost);
        assertEq(beforeReserve - token.reserveAssets(), paid);
        assertEq(token.totalSupply(), remaining);
    }
}
