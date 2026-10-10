// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockToken} from "../src/MockToken.sol";
import {MirrorVault} from "../src/MirrorVault.sol";

contract MirrorVaultTest is Test {
    MockToken usdc;
    MirrorVault vault;
    address admin = makeAddr("admin");
    address user = makeAddr("user");

    function setUp() public {
        usdc = new MockToken("Mock USDC", "USDC", 6);
        vault = new MirrorVault(usdc, "Mirror Vault", "mUSDC", unicode"Clearstar USDC · Euler", 1_000, 0, admin);
        usdc.mint(user, 1_000e6);
        vm.startPrank(user);
        usdc.approve(address(vault), type(uint256).max);
        vault.deposit(1_000e6, user);
        vm.stopPrank();
    }

    function test_accrualRaisesSharePrice() public {
        vm.warp(block.timestamp + 365 days);
        assertApproxEqAbs(vault.convertToAssets(vault.balanceOf(user)), 1_100e6, 1e6);
        // realised on withdraw
        uint256 shares = vault.balanceOf(user);
        vm.prank(user);
        vault.redeem(shares, user, user);
        assertApproxEqAbs(usdc.balanceOf(user), 1_100e6, 1e6);
    }

    function test_maxWithdrawFollowsUtilization() public {
        vm.prank(admin);
        vault.setStats(500, 9_200);
        assertApproxEqAbs(vault.maxWithdraw(user), 80e6, 1);
        assertApproxEqAbs(vault.maxRedeem(user), vault.convertToShares(80e6), 1);
        assertEq(vault.availableLiquidity(), vault.totalAssets() * 800 / 10_000);
    }

    function test_setStatsOnlyAdmin() public {
        vm.expectRevert(MirrorVault.NotAdmin.selector);
        vm.prank(user);
        vault.setStats(1, 1);
    }

    function test_setStatsEmitsEvent() public {
        vm.expectEmit();
        emit MirrorVault.StatsUpdated(700, 8_000, block.timestamp);
        vm.prank(admin);
        vault.setStats(700, 8_000);
        assertEq(vault.apyBps(), 700);
        assertEq(vault.utilizationBps(), 8_000);
    }

    function test_totalAssetsIncludesPendingInterest() public {
        vm.warp(block.timestamp + 30 days);
        assertGt(vault.totalAssets(), usdc.balanceOf(address(vault)));
    }
}
