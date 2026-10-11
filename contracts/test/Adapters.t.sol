// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockToken} from "../src/MockToken.sol";
import {MirrorVault} from "../src/MirrorVault.sol";
import {MirrorAdapter} from "../src/adapters/MirrorAdapter.sol";
import {EulerAdapter} from "../src/adapters/EulerAdapter.sol";

contract MockEVault {
    uint256 public cash;

    constructor(uint256 cash_) {
        cash = cash_;
    }
}

contract AdaptersTest is Test {
    MockToken usdc;
    MirrorVault vault;
    MirrorAdapter mirrorAdapter;
    EulerAdapter eulerAdapter;
    address admin = makeAddr("admin");
    address user = makeAddr("user");

    function setUp() public {
        usdc = new MockToken("Mock USDC", "USDC", 6);
        vault = new MirrorVault(usdc, "Mirror Vault", "mUSDC", unicode"Clearstar USDC · Euler", 0, 7100, admin);
        mirrorAdapter = new MirrorAdapter();
        eulerAdapter = new EulerAdapter();
        usdc.mint(user, 40_000e6);
        vm.startPrank(user);
        usdc.approve(address(vault), 40_000e6);
        vault.deposit(40_000e6, user);
        vm.stopPrank();
    }

    function test_mirrorAdapter_matchesVault() public view {
        assertEq(mirrorAdapter.availableLiquidity(address(vault)), vault.availableLiquidity());
        assertEq(mirrorAdapter.availableLiquidity(address(vault)), 11_600e6);
    }

    function test_mirrorAdapter_tracksUtilization() public {
        vm.prank(admin);
        vault.setStats(0, 9500);
        assertEq(mirrorAdapter.availableLiquidity(address(vault)), vault.totalAssets() * 5 / 100);
    }

    function test_eulerAdapter_returnsCash() public {
        MockEVault ev = new MockEVault(123e6);
        assertEq(eulerAdapter.availableLiquidity(address(ev)), 123e6);
    }
}
