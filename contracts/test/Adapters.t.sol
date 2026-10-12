// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockToken} from "../src/MockToken.sol";
import {MirrorVault} from "../src/MirrorVault.sol";
import {MirrorAdapter} from "../src/adapters/MirrorAdapter.sol";
import {EulerAdapter} from "../src/adapters/EulerAdapter.sol";
import {EulerEarnAdapter} from "../src/adapters/EulerEarnAdapter.sol";
import {MorphoV2Adapter} from "../src/adapters/MorphoV2Adapter.sol";

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

    /// Euler Earn pays withdrawals only from its strategies; USDC sent to the vault itself is stranded.
    function test_eulerEarn_sumsStrategies_ignoresIdleCash() public {
        address[] memory q = new address[](3);
        q[0] = address(new MockStrategy(0));
        q[1] = address(new MockStrategy(430_817_453_885));
        q[2] = address(new MockStrategy(0));
        assertEq(adapter.availableLiquidity(_earn(q, 7e6)), 430_817_453_885);
    }

    function test_eulerEarn_emptyQueue_zero() public {
        assertEq(adapter.availableLiquidity(_earn(new address[](0), 5e6)), 0);
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

contract MockMorpho {
    struct M {
        uint128 totalSupplyAssets;
        uint128 totalSupplyShares;
        uint128 totalBorrowAssets;
    }

    mapping(bytes32 => M) internal markets;
    mapping(bytes32 => mapping(address => uint256)) internal supplyShares;

    function setMarket(bytes32 id, uint128 supplyAssets, uint128 supplyShares_, uint128 borrowAssets) external {
        markets[id] = M(supplyAssets, supplyShares_, borrowAssets);
    }

    function setPosition(bytes32 id, address user, uint256 shares) external {
        supplyShares[id][user] = shares;
    }

    function market(bytes32 id) external view returns (uint128, uint128, uint128, uint128, uint128, uint128) {
        M memory m = markets[id];
        return (m.totalSupplyAssets, m.totalSupplyShares, m.totalBorrowAssets, 0, 0, 0);
    }

    function position(bytes32 id, address user) external view returns (uint256, uint128, uint128) {
        return (supplyShares[id][user], 0, 0);
    }
}

contract MockMarketAdapter {
    address public morpho;

    constructor(address morpho_) {
        morpho = morpho_;
    }
}

contract NotMorphoAdapter {}

contract MockV2Vault {
    address public asset;
    address public liquidityAdapter;
    bytes public liquidityData;

    constructor(address asset_, address liquidityAdapter_, bytes memory liquidityData_) {
        asset = asset_;
        liquidityAdapter = liquidityAdapter_;
        liquidityData = liquidityData_;
    }
}

contract MorphoV2AdapterTest is Test {
    MockToken usdc;
    MorphoV2Adapter adapter;
    MockMorpho morpho;
    MockMarketAdapter marketAdapter;
    bytes data = abi.encode(address(1), address(2), address(3), address(4), uint256(915e15));
    bytes32 id;

    function setUp() public {
        usdc = new MockToken("Mock USDC", "USDC", 6);
        adapter = new MorphoV2Adapter();
        morpho = new MockMorpho();
        marketAdapter = new MockMarketAdapter(address(morpho));
        id = keccak256(data);
    }

    function _vault(address liqAdapter, uint256 idle) internal returns (address v) {
        v = address(new MockV2Vault(address(usdc), liqAdapter, data));
        usdc.mint(v, idle);
    }

    function test_morphoV2_cashBelowPosition() public {
        morpho.setMarket(id, 8_025_560_406_240, 7_767_264_379_638_300_023, 7_325_879_406_811);
        morpho.setPosition(id, address(marketAdapter), 7_767_151_446_438_365_812);
        assertEq(adapter.availableLiquidity(_vault(address(marketAdapter), 0)), 8_025_560_406_240 - 7_325_879_406_811);
    }

    function test_morphoV2_positionBelowCash() public {
        morpho.setMarket(id, 1_000e6, 1_000e18, 100e6);
        morpho.setPosition(id, address(marketAdapter), 300e18);
        assertEq(adapter.availableLiquidity(_vault(address(marketAdapter), 2e6)), 2e6 + 300e6);
    }

    function test_morphoV2_noLiquidityAdapter_idleOnly() public {
        assertEq(adapter.availableLiquidity(_vault(address(0), 2_984_421_569_240)), 2_984_421_569_240);
    }

    function test_morphoV2_emptyMarket_idleOnly() public {
        morpho.setMarket(id, 0, 0, 0);
        assertEq(adapter.availableLiquidity(_vault(address(marketAdapter), 1e6)), 1e6);
    }

    function test_morphoV2_borrowAtOrAboveSupply_marketZero() public {
        morpho.setMarket(id, 100e6, 100e18, 100e6);
        morpho.setPosition(id, address(marketAdapter), 100e18);
        assertEq(adapter.availableLiquidity(_vault(address(marketAdapter), 3e6)), 3e6);
    }

    /// The allocator can switch the liquidity adapter at any time, and the oracle locks this adapter at the first
    /// verdict, so an unreadable liquidity market must fall back to idle cash instead of reverting every read.
    function test_morphoV2_nonMarketLiquidityAdapter_idleOnly() public {
        assertEq(adapter.availableLiquidity(_vault(address(new NotMorphoAdapter()), 1e6)), 1e6);
    }

    function test_morphoV2_eoaLiquidityAdapter_idleOnly() public {
        assertEq(adapter.availableLiquidity(_vault(address(0xBEEF), 1e6)), 1e6);
    }

    function test_morphoV2_morphoNotMorphoBlue_idleOnly() public {
        MockMarketAdapter odd = new MockMarketAdapter(address(new NotMorphoAdapter()));
        assertEq(adapter.availableLiquidity(_vault(address(odd), 1e6)), 1e6);
    }

    function test_morphoV2_morphoIsEoa_idleOnly() public {
        MockMarketAdapter odd = new MockMarketAdapter(address(0xBEEF));
        assertEq(adapter.availableLiquidity(_vault(address(odd), 1e6)), 1e6);
    }
}
