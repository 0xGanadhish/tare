// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockToken} from "../src/MockToken.sol";
import {MirrorVault} from "../src/MirrorVault.sol";
import {MirrorAdapter} from "../src/adapters/MirrorAdapter.sol";
import {EulerAdapter} from "../src/adapters/EulerAdapter.sol";
import {TareRiskOracle} from "../src/TareRiskOracle.sol";
import {BreakableVault, LossyVault} from "./OracleResolve.t.sol";

/// Grading on the worst sample (spec §2b): readings taken after the resolve window can only make a grade harsher.
contract OracleSampleTest is Test {
    event VerdictSampled(uint256 indexed id, bool broken, uint256 pps, uint256 assets, uint16 liquidityBps);

    uint64 constant WINDOW = 3600;
    uint64 constant SAMPLING = 600;
    MockToken usdc;
    MirrorVault vault;
    LossyVault lossy;
    TareRiskOracle oracle;
    address owner = makeAddr("owner");
    address attester = makeAddr("attester");
    address admin = makeAddr("admin");
    address user = makeAddr("user");

    function setUp() public {
        usdc = new MockToken("Mock USDC", "USDC", 6);
        vault = new MirrorVault(usdc, "Mirror Vault", "mUSDC", unicode"Clearstar USDC · Euler", 0, 7100, admin);
        lossy = new LossyVault(usdc);
        oracle = new TareRiskOracle(owner, attester, WINDOW, SAMPLING);
        usdc.mint(user, 100_000e6);
        vm.startPrank(user);
        usdc.approve(address(vault), 50_000e6);
        vault.deposit(40_000e6, user);
        usdc.approve(address(lossy), 40_000e6);
        lossy.deposit(40_000e6, user);
        vm.stopPrank();
        lossy.setCash(40_000e6);
        vm.startPrank(owner);
        oracle.registerVault(address(vault), address(new MirrorAdapter()));
        oracle.registerVault(address(lossy), address(new EulerAdapter()));
        vm.stopPrank();
    }

    function _post(address v) internal returns (uint256) {
        vm.prank(attester);
        return oracle.post(v, TareRiskOracle.Verdict.HOLD, 9200, 1000, keccak256("state"));
    }

    function _toSampling() internal {
        vm.warp(block.timestamp + WINDOW);
    }

    function _toResolve() internal {
        vm.warp(block.timestamp + SAMPLING);
    }

    function test_sample_onlyInsideSamplingWindow() public {
        uint256 id = _post(address(vault));
        vm.warp(block.timestamp + WINDOW - 1);
        vm.expectRevert(TareRiskOracle.WindowOpen.selector);
        oracle.sample(id);
        vm.warp(block.timestamp + 1);
        oracle.sample(id);
        vm.warp(block.timestamp + SAMPLING - 1);
        oracle.sample(id);
        vm.warp(block.timestamp + 1);
        vm.expectRevert(TareRiskOracle.SamplingClosed.selector);
        oracle.sample(id);
        assertEq(oracle.getSample(id).count, 2);
    }

    function test_sample_unknownOrResolved() public {
        vm.expectRevert(TareRiskOracle.UnknownPost.selector);
        oracle.sample(1);
        TareRiskOracle no = new TareRiskOracle(owner, attester, WINDOW, 0);
        vm.prank(owner);
        no.registerVault(address(vault), address(0));
        vm.prank(attester);
        uint256 id = no.post(address(vault), TareRiskOracle.Verdict.HOLD, 9000, 1000, bytes32(0));
        vm.warp(block.timestamp + WINDOW);
        vm.expectRevert(TareRiskOracle.SamplingClosed.selector);
        no.sample(id); // a zero sampling window never opens
        no.resolve(id);
        vm.expectRevert(TareRiskOracle.AlreadyResolved.selector);
        no.sample(id);
    }

    function test_resolve_waitsForSamplingWindow() public {
        uint256 id = _post(address(vault));
        _toSampling();
        vm.expectRevert(TareRiskOracle.SamplingOpen.selector);
        oracle.resolve(id);
        _toResolve();
        oracle.resolve(id);
        assertTrue(oracle.getResolution(id).resolved);
    }

    function test_sample_emitsTheReading() public {
        uint256 id = _post(address(vault));
        _toSampling();
        vm.expectEmit(address(oracle));
        emit VerdictSampled(id, false, 1e6, 40_000e6, 2900); // 71% utilised → 29% can leave
        oracle.sample(id);
    }

    /// The flash-loan case: cash dips during the window, then a later, better reading can't undo it.
    function test_worstLiquidity_sticks() public {
        uint256 id = _post(address(vault));
        _toSampling();
        vm.prank(admin);
        vault.setStats(0, 9600);
        oracle.sample(id);
        vm.prank(admin);
        vault.setStats(0, 1000);
        oracle.sample(id);
        assertEq(oracle.getSample(id).liquidityBps, 400);
        _toResolve();
        assertTrue(oracle.resolve(id));
        assertEq(oracle.getResolution(id).reasons, oracle.REASON_LIQ());
    }

    function test_worstAssets_sticks() public {
        uint256 id = _post(address(vault));
        _toSampling();
        vm.prank(user);
        vault.withdraw(10_000e6, user, user);
        oracle.sample(id);
        vm.prank(user);
        vault.deposit(10_000e6, user);
        oracle.sample(id);
        assertEq(oracle.getSample(id).assets, 30_000e6);
        _toResolve();
        assertTrue(oracle.resolve(id));
        assertEq(oracle.getResolution(id).reasons, oracle.REASON_TVL());
    }

    function test_worstSharePrice_sticks() public {
        uint256 id = _post(address(lossy));
        _toSampling();
        lossy.lose(400e6); // 1% of assets
        oracle.sample(id);
        usdc.mint(address(lossy), 400e6); // made whole again
        oracle.sample(id);
        _toResolve();
        assertTrue(oracle.resolve(id));
        assertEq(oracle.getResolution(id).reasons, oracle.REASON_PPS());
    }

    function test_brokenRead_sticks() public {
        BreakableVault b = new BreakableVault(usdc);
        vm.prank(owner);
        oracle.registerVault(address(b), address(0));
        uint256 id = _post(address(b));
        _toSampling();
        b.setBroken(true);
        oracle.sample(id);
        b.setBroken(false);
        oracle.sample(id);
        assertTrue(oracle.getSample(id).broken);
        _toResolve();
        assertTrue(oracle.resolve(id));
        assertEq(oracle.getResolution(id).reasons, oracle.REASON_BROKEN());
    }

    function test_healthySamples_resolveClear() public {
        uint256 id = _post(address(vault));
        _toSampling();
        oracle.sample(id);
        _toResolve();
        vm.prank(admin);
        vault.setStats(0, 9600); // after sampling closed: not graded
        assertFalse(oracle.resolve(id));
    }

    function test_noSamples_readsAtResolve() public {
        uint256 id = _post(address(vault));
        _toSampling();
        _toResolve();
        vm.prank(admin);
        vault.setStats(0, 9600);
        assertTrue(oracle.resolve(id));
        assertEq(oracle.getResolution(id).reasons, oracle.REASON_LIQ());
        assertEq(oracle.getSample(id).count, 1);
    }

    function test_noAdapter_liquidityNotGraded() public {
        MirrorVault bare = new MirrorVault(usdc, "Bare", "bUSDC", "Bare", 0, 10_000, admin);
        vm.startPrank(user);
        usdc.approve(address(bare), 1_000e6);
        bare.deposit(1_000e6, user);
        vm.stopPrank();
        vm.prank(owner);
        oracle.registerVault(address(bare), address(0));
        uint256 id = _post(address(bare));
        _toSampling();
        oracle.sample(id);
        assertEq(oracle.getSample(id).liquidityBps, 10_000);
        _toResolve();
        assertFalse(oracle.resolve(id));
    }
}
