// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockToken} from "../src/MockToken.sol";
import {MirrorVault} from "../src/MirrorVault.sol";
import {MirrorAdapter} from "../src/adapters/MirrorAdapter.sol";
import {EulerAdapter} from "../src/adapters/EulerAdapter.sol";
import {TareRiskOracle} from "../src/TareRiskOracle.sol";

/// Vault whose assets can be lost (share price falls) and whose idle cash is set directly (Euler-style).
contract LossyVault is ERC4626 {
    uint256 public cash;

    constructor(IERC20 asset_) ERC20("Lossy", "lUSDC") ERC4626(asset_) {}

    function lose(uint256 amount) external {
        IERC20(asset()).transfer(address(0xdead), amount);
    }

    function setCash(uint256 cash_) external {
        cash = cash_;
    }
}

contract OracleResolveTest is Test {
    event VerdictResolved(uint256 indexed id, bool adverse, uint8 reasons);

    uint64 constant WINDOW = 3600;
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
        oracle = new TareRiskOracle(owner, attester, WINDOW);
        usdc.mint(user, 80_000e6);
        vm.startPrank(user);
        usdc.approve(address(vault), 40_000e6);
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
        return oracle.post(v, TareRiskOracle.Verdict.EXIT, 9200, 8000, keccak256("state"));
    }

    function _resolveAfterWindow(uint256 id) internal returns (bool) {
        vm.warp(block.timestamp + WINDOW);
        return oracle.resolve(id);
    }

    function _assertResolution(uint256 id, bool adverse, uint8 reasons) internal view {
        TareRiskOracle.Resolution memory r = oracle.getResolution(id);
        assertTrue(r.resolved);
        assertEq(r.adverse, adverse);
        assertEq(r.reasons, reasons);
        assertEq(r.resolvedAt, block.timestamp);
    }

    function test_resolve_revertsBeforeWindow() public {
        uint256 id = _post(address(vault));
        vm.warp(block.timestamp + WINDOW - 1);
        vm.expectRevert(TareRiskOracle.WindowOpen.selector);
        oracle.resolve(id);
    }

    function test_resolve_unknownId() public {
        vm.expectRevert(TareRiskOracle.UnknownPost.selector);
        oracle.resolve(1);
        _post(address(vault));
        vm.expectRevert(TareRiskOracle.UnknownPost.selector);
        oracle.resolve(0);
        vm.expectRevert(TareRiskOracle.UnknownPost.selector);
        oracle.resolve(2);
    }

    function test_resolve_twice() public {
        uint256 id = _post(address(vault));
        _resolveAfterWindow(id);
        vm.expectRevert(TareRiskOracle.AlreadyResolved.selector);
        oracle.resolve(id);
    }

    function test_resolve_clear() public {
        uint256 id = _post(address(vault));
        vm.warp(block.timestamp + WINDOW);
        vm.expectEmit(address(oracle));
        emit VerdictResolved(id, false, 0);
        assertFalse(oracle.resolve(id));
        _assertResolution(id, false, 0);
    }

    function test_resolve_tvlDrop() public {
        uint256 id = _post(address(vault));
        vm.prank(user);
        vault.withdraw(10_000e6, user, user);
        assertTrue(_resolveAfterWindow(id));
        _assertResolution(id, true, oracle.REASON_TVL());
    }

    function test_resolve_tvlDrop_boundaryIsNotAdverse() public {
        uint256 id = _post(address(vault));
        vm.prank(user);
        vault.withdraw(8_000e6, user, user); // exactly 20%
        assertFalse(_resolveAfterWindow(id));
    }

    function test_resolve_liquidityFloor() public {
        uint256 id = _post(address(vault));
        vm.prank(admin);
        vault.setStats(0, 9600);
        assertTrue(_resolveAfterWindow(id));
        _assertResolution(id, true, oracle.REASON_LIQ());
    }

    function test_resolve_ppsDrop() public {
        uint256 id = _post(address(lossy));
        lossy.lose(400e6); // 1% of assets
        assertTrue(_resolveAfterWindow(id));
        _assertResolution(id, true, oracle.REASON_PPS());
    }

    function test_resolve_noAdapter_ignoresLiquidity() public {
        MirrorVault bare = new MirrorVault(usdc, "Bare", "bUSDC", "Bare", 0, 7100, admin);
        usdc.mint(user, 1_000e6);
        vm.startPrank(user);
        usdc.approve(address(bare), 1_000e6);
        bare.deposit(1_000e6, user);
        vm.stopPrank();
        vm.prank(owner);
        oracle.registerVault(address(bare), address(0));
        uint256 id = _post(address(bare));
        vm.prank(admin);
        bare.setStats(0, 10_000);
        assertFalse(_resolveAfterWindow(id));
        _assertResolution(id, false, 0);
    }

    function test_resolve_anyoneCanCall() public {
        uint256 id = _post(address(vault));
        vm.warp(block.timestamp + WINDOW);
        vm.prank(makeAddr("random"));
        oracle.resolve(id);
        assertTrue(oracle.getResolution(id).resolved);
    }

    function test_resolve_all() public {
        uint256 id = _post(address(lossy));
        lossy.lose(10_000e6);
        lossy.setCash(0);
        assertTrue(_resolveAfterWindow(id));
        _assertResolution(id, true, 7);
    }
}
