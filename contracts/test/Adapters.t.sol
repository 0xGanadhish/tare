// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockToken} from "../src/MockToken.sol";
import {MirrorVault} from "../src/MirrorVault.sol";
import {MirrorAdapter} from "../src/adapters/MirrorAdapter.sol";
import {EulerAdapter} from "../src/adapters/EulerAdapter.sol";
import {EulerEarnAdapter} from "../src/adapters/EulerEarnAdapter.sol";

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

contract MockStrategy {
    uint256 internal max;

    constructor(uint256 max_) {
        max = max_;
    }

    function maxWithdraw(address) external view returns (uint256) {
        return max;
    }
}

contract RevertingStrategy {
    function maxWithdraw(address) external pure returns (uint256) {
        revert("paused");
    }
}

contract MockEarn {
    address public asset;
    address[] internal queue;

    constructor(address asset_, address[] memory queue_) {
        asset = asset_;
        queue = queue_;
    }

    function withdrawQueueLength() external view returns (uint256) {
        return queue.length;
    }

    function withdrawQueue(uint256 i) external view returns (address) {
        return queue[i];
    }
}

contract EulerEarnAdapterTest is Test {
    MockToken usdc;
    EulerEarnAdapter adapter;

    function setUp() public {
        usdc = new MockToken("Mock USDC", "USDC", 6);
        adapter = new EulerEarnAdapter();
    }

    function _earn(address[] memory queue, uint256 idle) internal returns (address earn) {
        earn = address(new MockEarn(address(usdc), queue));
        usdc.mint(earn, idle);
    }

    function test_eulerEarn_sumsIdleAndStrategies() public {
        address[] memory q = new address[](3);
        q[0] = address(new MockStrategy(0));
        q[1] = address(new MockStrategy(430_817_453_885));
        q[2] = address(new MockStrategy(0));
        assertEq(adapter.availableLiquidity(_earn(q, 7e6)), 7e6 + 430_817_453_885);
    }

    function test_eulerEarn_emptyQueue_idleOnly() public {
        assertEq(adapter.availableLiquidity(_earn(new address[](0), 5e6)), 5e6);
    }

    function test_eulerEarn_revertingStrategy_countsZero() public {
        address[] memory q = new address[](3);
        q[0] = address(new MockStrategy(1e6));
        q[1] = address(new RevertingStrategy());
        q[2] = address(new MockStrategy(2e6));
        assertEq(adapter.availableLiquidity(_earn(q, 0)), 3e6);
    }

    function test_eulerEarn_eoaStrategy_countsZero() public {
        address[] memory q = new address[](2);
        q[0] = address(0xBEEF);
        q[1] = address(new MockStrategy(4e6));
        assertEq(adapter.availableLiquidity(_earn(q, 0)), 4e6);
    }
}
