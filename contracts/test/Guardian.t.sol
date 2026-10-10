// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockToken} from "../src/MockToken.sol";
import {MirrorVault} from "../src/MirrorVault.sol";
import {Guardian} from "../src/Guardian.sol";

contract GuardianTest is Test {
    MockToken usdc;
    MirrorVault vault;
    Guardian guardian;
    address admin = makeAddr("admin");
    address keeper = makeAddr("keeper");
    address user = makeAddr("user");
    address other = makeAddr("other");

    function setUp() public {
        usdc = new MockToken("Mock USDC", "USDC", 6);
        vault = new MirrorVault(usdc, "Mirror Vault", "mUSDC", unicode"Clearstar USDC · Euler", 0, 0, admin);
        guardian = new Guardian(admin, keeper);
    }

    function _deposit(address who, uint256 amt) internal {
        usdc.mint(who, amt);
        vm.startPrank(who);
        usdc.approve(address(vault), amt);
        vault.deposit(amt, who);
        vm.stopPrank();
    }

    function _arm(address who) internal {
        vm.prank(admin);
        guardian.setVaultApproved(address(vault), true);
        vm.startPrank(who);
        vault.approve(address(guardian), type(uint256).max);
        guardian.enable(address(vault));
        vm.stopPrank();
    }

    function test_exitPaysOwner() public {
        _deposit(user, 500e6);
        _arm(user);
        vm.expectEmit();
        emit Guardian.Exited(user, address(vault), 500e6, 500e6);
        vm.prank(keeper);
        uint256 assets = guardian.exit(address(vault), user);
        assertEq(assets, 500e6);
        assertApproxEqAbs(usdc.balanceOf(user), 500e6, 1);
        assertEq(usdc.balanceOf(address(guardian)), 0);
        assertEq(vault.balanceOf(address(guardian)), 0);
        assertEq(vault.balanceOf(user), 0);
    }

    function test_exitRevertsForNonKeeper() public {
        vm.expectRevert(Guardian.NotKeeper.selector);
        guardian.exit(address(vault), user);
    }

    function test_exitRevertsWhenNotEnabled() public {
        _deposit(user, 500e6);
        vm.prank(admin);
        guardian.setVaultApproved(address(vault), true);
        vm.prank(keeper);
        vm.expectRevert(Guardian.NotEnabled.selector);
        guardian.exit(address(vault), user);
    }

    function test_exitRevertsForUnapprovedVault() public {
        _deposit(user, 500e6);
        vm.prank(user);
        guardian.enable(address(vault)); // enabled, but vault never approved
        vm.prank(keeper);
        vm.expectRevert(Guardian.VaultNotApproved.selector);
        guardian.exit(address(vault), user);
    }

    function test_exitRevertsWhenNothingToExit() public {
        _deposit(user, 500e6);
        vm.prank(admin);
        guardian.setVaultApproved(address(vault), true);
        vm.prank(user);
        guardian.enable(address(vault)); // no share allowance
        vm.prank(keeper);
        vm.expectRevert(Guardian.NothingToExit.selector);
        guardian.exit(address(vault), user);
    }

    function test_partialExitWhenLiquidityCapped() public {
        _deposit(user, 1_000e6);
        _deposit(other, 1_000e6);
        _arm(user);
        vm.prank(admin);
        vault.setStats(500, 9_200); // available = 2000 * 8% = 160
        vm.prank(keeper);
        guardian.exit(address(vault), user);
        assertApproxEqAbs(usdc.balanceOf(user), 160e6, 1);
        assertGt(vault.balanceOf(user), 0);
        assertEq(usdc.balanceOf(address(guardian)), 0);
    }

    function test_disableStopsExit() public {
        _deposit(user, 500e6);
        _arm(user);
        vm.prank(user);
        guardian.disable(address(vault));
        assertFalse(guardian.enabled(user, address(vault)));
        vm.prank(keeper);
        vm.expectRevert(Guardian.NotEnabled.selector);
        guardian.exit(address(vault), user);
    }

    function test_setVaultApprovedOnlyAdmin() public {
        vm.expectRevert(Guardian.NotAdmin.selector);
        guardian.setVaultApproved(address(vault), true);
    }

    function test_revokedAllowanceStopsExit() public {
        _deposit(user, 500e6);
        _arm(user);
        vm.prank(user);
        vault.approve(address(guardian), 0);
        vm.prank(keeper);
        vm.expectRevert(Guardian.NothingToExit.selector);
        guardian.exit(address(vault), user);
    }
}
