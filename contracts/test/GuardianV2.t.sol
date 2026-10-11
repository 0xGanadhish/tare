// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {MockToken} from "../src/MockToken.sol";
import {MirrorVault} from "../src/MirrorVault.sol";
import {MirrorAdapter} from "../src/adapters/MirrorAdapter.sol";
import {TareRiskOracle} from "../src/TareRiskOracle.sol";
import {GuardianV2} from "../src/GuardianV2.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// Mimics real mainnet vaults whose maxRedeem under-reports what redeem accepts:
/// Morpho Vault V2 always returns 0; Euler Earn returns balance - 1. `locked` makes redeem revert.
contract QuirkyVault is ERC4626 {
    enum Mode { ZeroMax, OneShort }
    Mode public mode;
    bool public locked;

    constructor(IERC20 asset_, Mode mode_) ERC20("Quirky", "qUSDC") ERC4626(asset_) {
        mode = mode_;
    }

    function setLocked(bool l) external {
        locked = l;
    }

    function maxRedeem(address owner) public view override returns (uint256) {
        uint256 b = balanceOf(owner);
        if (locked || mode == Mode.ZeroMax || b == 0) return 0;
        return b - 1;
    }

    function redeem(uint256 shares, address receiver, address owner) public override returns (uint256 assets) {
        require(!locked, "locked");
        assets = previewRedeem(shares);
        _withdraw(_msgSender(), receiver, owner, assets, shares);
    }
}

contract GuardianV2Test is Test {
    event Exited(
        address indexed owner,
        address indexed vault,
        uint256 indexed verdictId,
        address caller,
        uint256 shares,
        uint256 assets,
        uint256 remainingShares
    );

    MockToken usdc;
    MirrorVault vault;
    TareRiskOracle oracle;
    GuardianV2 guardian;
    address admin = makeAddr("admin");
    address oracleOwner = makeAddr("oracleOwner");
    address attester = makeAddr("attester");
    address vaultAdmin = makeAddr("vaultAdmin");
    address user = makeAddr("user");
    address caller = makeAddr("caller");

    function setUp() public {
        vm.warp(1_000_000);
        usdc = new MockToken("Mock USDC", "USDC", 6);
        vault = new MirrorVault(usdc, "Mirror Vault", "mUSDC", unicode"Clearstar USDC · Euler", 0, 0, vaultAdmin);
        oracle = new TareRiskOracle(oracleOwner, attester, 3600);
        guardian = new GuardianV2(admin, oracle);
        MirrorAdapter adapter = new MirrorAdapter();
        vm.prank(oracleOwner);
        oracle.registerVault(address(vault), address(adapter));
        vm.prank(admin);
        guardian.setVaultApproved(address(vault), true);
    }

    function _deposit(address who, uint256 amt) internal {
        usdc.mint(who, amt);
        vm.startPrank(who);
        usdc.approve(address(vault), amt);
        vault.deposit(amt, who);
        vm.stopPrank();
    }

    function _arm(address who, uint16 minConf, uint32 maxAge) internal {
        vm.startPrank(who);
        vault.approve(address(guardian), type(uint256).max);
        guardian.enable(address(vault), minConf, maxAge);
        vm.stopPrank();
    }

    function _post(TareRiskOracle.Verdict v, uint16 conf) internal returns (uint256) {
        vm.prank(attester);
        return oracle.post(address(vault), v, conf, 8000, keccak256("state"));
    }

    function _ready() internal returns (uint256 id) {
        _deposit(user, 1_000e6);
        _arm(user, 9000, 600);
        id = _post(TareRiskOracle.Verdict.EXIT, 9500);
    }

    // --- enable ---

    function test_enable_storesRule() public {
        _arm(user, 9000, 600);
        (bool enabled, uint16 minConf, uint32 maxAge, uint64 enabledAt) = guardian.rules(user, address(vault));
        assertTrue(enabled);
        assertEq(minConf, 9000);
        assertEq(maxAge, 600);
        assertEq(enabledAt, block.timestamp);
        assertEq(guardian.admin(), admin);
        assertEq(address(guardian.oracle()), address(oracle));
    }

    function test_enable_rejects7999() public {
        vm.prank(user);
        vm.expectRevert(GuardianV2.RuleOutOfRange.selector);
        guardian.enable(address(vault), 7999, 600);
    }

    function test_enable_rejects9901() public {
        vm.prank(user);
        vm.expectRevert(GuardianV2.RuleOutOfRange.selector);
        guardian.enable(address(vault), 9901, 600);
    }

    function test_enable_rejectsMaxAge59() public {
        vm.prank(user);
        vm.expectRevert(GuardianV2.RuleOutOfRange.selector);
        guardian.enable(address(vault), 9000, 59);
    }

    function test_enable_rejectsMaxAge3601() public {
        vm.prank(user);
        vm.expectRevert(GuardianV2.RuleOutOfRange.selector);
        guardian.enable(address(vault), 9000, 3601);
    }

    function test_enable_requiresApprovedVault() public {
        vm.prank(user);
        vm.expectRevert(GuardianV2.VaultNotApproved.selector);
        guardian.enable(makeAddr("unapproved"), 9000, 600);
    }

    // --- exit: the six conditions, in spec order ---

    function test_exit_vaultNotApproved() public {
        _ready();
        vm.prank(admin);
        guardian.setVaultApproved(address(vault), false);
        vm.expectRevert(GuardianV2.VaultNotApproved.selector);
        guardian.exit(address(vault), user);
    }

    function test_exit_notEnabled() public {
        _deposit(user, 1_000e6);
        _post(TareRiskOracle.Verdict.EXIT, 9500);
        vm.expectRevert(GuardianV2.NotEnabled.selector);
        guardian.exit(address(vault), user);
    }

    function test_exit_noVerdict() public {
        _deposit(user, 1_000e6);
        _arm(user, 9000, 600);
        vm.expectRevert(GuardianV2.NoVerdict.selector);
        guardian.exit(address(vault), user);
    }

    function test_exit_holdVerdict() public {
        _deposit(user, 1_000e6);
        _arm(user, 9000, 600);
        _post(TareRiskOracle.Verdict.EXIT, 9500);
        _post(TareRiskOracle.Verdict.HOLD, 9500); // a newer HOLD supersedes the EXIT
        vm.expectRevert(GuardianV2.NotExitVerdict.selector);
        guardian.exit(address(vault), user);
    }

    function test_exit_belowThreshold() public {
        _deposit(user, 1_000e6);
        _arm(user, 9000, 600);
        _post(TareRiskOracle.Verdict.EXIT, 8999);
        vm.expectRevert(GuardianV2.BelowThreshold.selector);
        guardian.exit(address(vault), user);
    }

    function test_exit_atThresholdAndMaxAgeSucceeds() public {
        _deposit(user, 1_000e6);
        _arm(user, 9000, 600);
        _post(TareRiskOracle.Verdict.EXIT, 9000);
        vm.warp(block.timestamp + 600);
        assertEq(guardian.exit(address(vault), user), 1_000e6);
    }

    function test_exit_stale() public {
        _ready();
        vm.warp(block.timestamp + 601);
        vm.expectRevert(GuardianV2.StaleVerdict.selector);
        guardian.exit(address(vault), user);
    }

    function test_exitRevertsWhenVerdictPredatesEnable() public {
        _deposit(user, 1_000e6);
        _post(TareRiskOracle.Verdict.EXIT, 9500);
        vm.warp(block.timestamp + 1);
        _arm(user, 9000, 600);
        vm.expectRevert(GuardianV2.VerdictPredatesEnable.selector);
        guardian.exit(address(vault), user);
    }

    function test_reEnableResetsEnabledAt() public {
        _ready();
        vm.warp(block.timestamp + 1);
        vm.prank(user);
        guardian.enable(address(vault), 9000, 600);
        vm.expectRevert(GuardianV2.VerdictPredatesEnable.selector);
        guardian.exit(address(vault), user);
    }

    function test_exit_nothingToExit() public {
        _deposit(user, 1_000e6);
        vm.prank(user);
        guardian.enable(address(vault), 9000, 600); // no share allowance
        _post(TareRiskOracle.Verdict.EXIT, 9500);
        vm.expectRevert(GuardianV2.NothingToExit.selector);
        guardian.exit(address(vault), user);
    }

    function test_exit_anyoneCanCall_fundsToOwner() public {
        uint256 id = _ready();
        uint256 userBefore = usdc.balanceOf(user);
        vm.expectEmit(address(guardian));
        emit Exited(user, address(vault), id, caller, 1_000e6, 1_000e6, 0);
        vm.prank(caller);
        uint256 assets = guardian.exit(address(vault), user);
        assertEq(assets, 1_000e6);
        assertEq(usdc.balanceOf(user) - userBefore, assets);
        assertEq(usdc.balanceOf(caller), 0);
        assertEq(usdc.balanceOf(address(guardian)), 0);
        assertEq(vault.balanceOf(address(guardian)), 0);
        assertEq(vault.balanceOf(user), 0);
    }

    function test_exit_partialLiquidity_reportsRemaining() public {
        _ready();
        vm.prank(vaultAdmin);
        vault.setStats(0, 9900);
        vm.recordLogs();
        uint256 assets = guardian.exit(address(vault), user);
        assertEq(assets, 10e6);
        assertGt(vault.balanceOf(user), 0);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        (,,, uint256 remaining) = abi.decode(logs[logs.length - 1].data, (address, uint256, uint256, uint256));
        assertEq(remaining, vault.balanceOf(user));
    }

    function test_disable_blocksExit() public {
        _ready();
        vm.prank(user);
        guardian.disable(address(vault));
        (bool enabled,,,) = guardian.rules(user, address(vault));
        assertFalse(enabled);
        vm.expectRevert(GuardianV2.NotEnabled.selector);
        guardian.exit(address(vault), user);
    }

    function test_setVaultApproved_onlyAdmin() public {
        vm.prank(caller);
        vm.expectRevert(GuardianV2.NotAdmin.selector);
        guardian.setVaultApproved(address(vault), false);
    }

    // --- review fixes ---

    function test_exit_verdictPostedEarlierInSameSecondDoesNotCount() public {
        _deposit(user, 1_000e6);
        _post(TareRiskOracle.Verdict.EXIT, 9500);
        _arm(user, 9000, 600); // same block timestamp as the post
        vm.expectRevert(GuardianV2.VerdictAlreadyUsed.selector);
        guardian.exit(address(vault), user);
    }

    function test_exit_fullExitConsumesVerdict_reDepositIsSafe() public {
        _ready();
        guardian.exit(address(vault), user);
        _deposit(user, 500e6);
        vm.warp(block.timestamp + 10);
        vm.expectRevert(GuardianV2.VerdictAlreadyUsed.selector);
        guardian.exit(address(vault), user);
        // A fresh EXIT verdict still protects the new deposit.
        uint256 id2 = _post(TareRiskOracle.Verdict.EXIT, 9500);
        assertEq(guardian.verdictFloor(user, address(vault)), id2 - 1);
        assertEq(guardian.exit(address(vault), user), 500e6);
    }

    function test_exit_partialExitCanContinueOnSameVerdict() public {
        _ready();
        vm.prank(vaultAdmin);
        vault.setStats(0, 9900);
        guardian.exit(address(vault), user);
        vm.prank(vaultAdmin);
        vault.setStats(0, 0);
        assertGt(guardian.exit(address(vault), user), 0);
        assertEq(vault.balanceOf(user), 0);
    }

    function test_disable_noEventWhenNotEnabled() public {
        vm.recordLogs();
        vm.prank(user);
        guardian.disable(address(vault));
        assertEq(vm.getRecordedLogs().length, 0);
    }

    function test_constructor_rejectsZeroArgs() public {
        vm.expectRevert(GuardianV2.ZeroArg.selector);
        new GuardianV2(address(0), oracle);
        vm.expectRevert(GuardianV2.ZeroArg.selector);
        new GuardianV2(admin, TareRiskOracle(address(0)));
    }

    // --- invariant: assets only ever move vault -> owner ---

    function testFuzz_exit_onlyOwnerReceives(address who, uint96 amount, uint16 conf, uint16 minConf) public {
        vm.assume(who != user && who != address(0) && who != address(vault) && who != address(guardian));
        uint256 amt = bound(uint256(amount), 1, 1e15);
        conf = uint16(bound(conf, 0, 10_000));
        minConf = uint16(bound(minConf, 8000, 9900));
        _deposit(user, amt);
        _arm(user, minConf, 600);
        _post(TareRiskOracle.Verdict.EXIT, conf);

        uint256 userBefore = usdc.balanceOf(user);
        uint256 callerBefore = usdc.balanceOf(who);
        uint256 vaultBefore = usdc.balanceOf(address(vault));
        vm.prank(who);
        if (conf < minConf) {
            vm.expectRevert(GuardianV2.BelowThreshold.selector);
            guardian.exit(address(vault), user);
            return;
        }
        uint256 assets = guardian.exit(address(vault), user);
        assertEq(usdc.balanceOf(user) - userBefore, assets);
        assertEq(vaultBefore - usdc.balanceOf(address(vault)), assets);
        assertEq(usdc.balanceOf(who), callerBefore);
        assertEq(usdc.balanceOf(address(guardian)), 0);
        assertEq(vault.balanceOf(address(guardian)), 0);
    }

    // --- vaults whose maxRedeem under-reports (Morpho Vault V2, Euler Earn) ---

    function _quirky(QuirkyVault.Mode mode) internal returns (QuirkyVault q, uint256 id) {
        q = new QuirkyVault(usdc, mode);
        vm.prank(oracleOwner);
        oracle.registerVault(address(q), address(0));
        vm.prank(admin);
        guardian.setVaultApproved(address(q), true);
        usdc.mint(user, 1_000e6);
        vm.startPrank(user);
        usdc.approve(address(q), 1_000e6);
        q.deposit(1_000e6, user);
        q.approve(address(guardian), type(uint256).max);
        guardian.enable(address(q), 9000, 600);
        vm.stopPrank();
        vm.prank(attester);
        id = oracle.post(address(q), TareRiskOracle.Verdict.EXIT, 9500, 8000, keccak256("state"));
    }

    function test_exit_vaultReportingZeroMaxRedeem_exitsInFull() public {
        (QuirkyVault q, uint256 id) = _quirky(QuirkyVault.Mode.ZeroMax);
        uint256 before = usdc.balanceOf(user);
        vm.prank(caller);
        assertEq(guardian.exit(address(q), user), 1_000e6);
        assertEq(usdc.balanceOf(user) - before, 1_000e6);
        assertEq(q.balanceOf(user), 0);
        assertEq(guardian.verdictFloor(user, address(q)), id);
    }

    function test_exit_vaultUnderReportingMaxRedeemByOne_exitsInFull() public {
        (QuirkyVault q, uint256 id) = _quirky(QuirkyVault.Mode.OneShort);
        vm.expectEmit(address(guardian));
        emit Exited(user, address(q), id, caller, 1_000e6, 1_000e6, 0);
        vm.prank(caller);
        guardian.exit(address(q), user);
        assertEq(q.balanceOf(user), 0);
        assertEq(guardian.verdictFloor(user, address(q)), id);
    }

    function test_exit_lockedVault_nothingToExit() public {
        (QuirkyVault q,) = _quirky(QuirkyVault.Mode.OneShort);
        q.setLocked(true);
        vm.expectRevert(GuardianV2.NothingToExit.selector);
        guardian.exit(address(q), user);
        assertEq(q.balanceOf(user), 1_000e6);
    }
}
