// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {TareRiskOracle} from "../src/TareRiskOracle.sol";
import {GuardianV2} from "../src/GuardianV2.sol";
import {ILiquidityAdapter} from "../src/interfaces/ILiquidityAdapter.sol";
import {AdapterKinds} from "../script/AdapterKinds.sol";

/// Mainnet fork: the full Guardian v2 path against the real vaults in script/vaults.mainnet.json.
/// Run: MONAD_MAINNET_RPC=https://rpc.monad.xyz forge test --match-path test/Fork.t.sol -vv
/// Skips when the RPC env var is unset or the vault list is empty.
contract ForkTest is Test {
    address constant USDC = 0x754704Bc059F8C67012fEd69BC8A327a5aafb603;
    uint256 constant AMOUNT = 100e6;

    address owner = makeAddr("owner");
    address attester = makeAddr("attester");
    address user = makeAddr("user");
    address caller = makeAddr("caller");

    function _vaults() internal returns (address[] memory vaults, string[] memory kinds) {
        string memory rpc = vm.envOr("MONAD_MAINNET_RPC", string(""));
        string memory cfg = vm.readFile("script/vaults.mainnet.json");
        uint256 n;
        while (vm.keyExistsJson(cfg, string.concat(".vaults[", vm.toString(n), "]"))) n++;
        if (bytes(rpc).length == 0 || n == 0) {
            vm.skip(true);
            return (vaults, kinds);
        }
        vm.createSelectFork(rpc);
        vaults = new address[](n);
        kinds = new string[](n);
        for (uint256 i = 0; i < n; i++) {
            string memory p = string.concat(".vaults[", vm.toString(i), "].");
            vaults[i] = vm.parseJsonAddress(cfg, string.concat(p, "address"));
            kinds[i] = vm.parseJsonString(cfg, string.concat(p, "adapter"));
        }
    }

    /// Same adapter mapping DeployV2 uses (AdapterKinds), so the fork exercises what mainnet will register.
    function _setup(address vault, string memory kind)
        internal
        returns (TareRiskOracle oracle, GuardianV2 guardian, address adapter)
    {
        oracle = new TareRiskOracle(owner, attester, 86_400);
        guardian = new GuardianV2(owner, oracle);
        AdapterKinds.Cache memory cache;
        adapter = AdapterKinds.adapterFor(kind, cache);
        vm.startPrank(owner);
        oracle.registerVault(vault, adapter);
        guardian.setVaultApproved(vault, true);
        vm.stopPrank();
    }

    /// Deposit `amount`, enable Guardian, post an EXIT, and have a stranger trigger the exit: everything comes back.
    function _exitFlow(address vault, string memory kind, uint256 amount, uint256 minBack) internal {
        assertEq(IERC4626(vault).asset(), USDC, "vault asset");
        (TareRiskOracle oracle, GuardianV2 guardian,) = _setup(vault, kind);
        deal(USDC, user, amount);
        vm.startPrank(user);
        IERC20(USDC).approve(vault, amount);
        IERC4626(vault).deposit(amount, user);
        IERC20(vault).approve(address(guardian), type(uint256).max);
        guardian.enable(vault, 8000, 600);
        vm.stopPrank();
        vm.prank(attester);
        oracle.post(vault, TareRiskOracle.Verdict.EXIT, 9500, 9000, keccak256("fork"));

        uint256 before = IERC20(USDC).balanceOf(user);
        vm.prank(caller);
        uint256 assets = guardian.exit(vault, user);
        assertGe(IERC20(USDC).balanceOf(user) - before, minBack, "usdc returned");
        assertEq(IERC20(USDC).balanceOf(user) - before, assets);
        assertEq(IERC20(USDC).balanceOf(address(guardian)), 0);
        assertEq(IERC20(vault).balanceOf(address(guardian)), 0);
        assertEq(IERC20(USDC).balanceOf(caller), 0);
        assertEq(IERC20(vault).balanceOf(user), 0, "full exit, no dust");
        assertEq(guardian.verdictFloor(user, vault), oracle.latest(vault), "verdict consumed");
    }

    function testFork_realVault_redeemByAllowance() public {
        (address[] memory vaults, string[] memory kinds) = _vaults();
        for (uint256 i = 0; i < vaults.length; i++) {
            _exitFlow(vaults[i], kinds[i], AMOUNT, 99.9e6);
        }
    }

    /// Spec rule 4 at the size the mainnet proof uses: a 2.5 USDC position exits in full.
    function testFork_smallPosition_fullExit() public {
        (address[] memory vaults, string[] memory kinds) = _vaults();
        for (uint256 i = 0; i < vaults.length; i++) {
            _exitFlow(vaults[i], kinds[i], 2.5e6, 2.49e6);
        }
    }

    /// Spec rule 5, checked against behaviour rather than the adapter's own formula: a holder can withdraw
    /// just under the adapter's number, and 1 USDC over it fails.
    function testFork_adapterMatchesWithdrawable() public {
        (address[] memory vaults, string[] memory kinds) = _vaults();
        address holder = makeAddr("holder");
        for (uint256 i = 0; i < vaults.length; i++) {
            address vault = vaults[i];
            (,, address adapter) = _setup(vault, kinds[i]);
            uint256 liq = ILiquidityAdapter(adapter).availableLiquidity(vault);
            assertGt(liq, 0, "some liquidity");
            assertLe(liq, IERC4626(vault).totalAssets(), "liquidity <= TVL");
            deal(vault, holder, IERC4626(vault).convertToShares(liq + 2e6) + 1, false);

            uint256 snap = vm.snapshotState();
            vm.prank(holder);
            vm.expectRevert();
            IERC4626(vault).withdraw(liq + 1e6, holder, holder);
            vm.revertToState(snap);

            vm.prank(holder);
            IERC4626(vault).withdraw(liq - 10, holder, holder);
            vm.revertToState(snap);
        }
    }

    function testFork_resolve_realVault() public {
        (address[] memory vaults, string[] memory kinds) = _vaults();
        for (uint256 i = 0; i < vaults.length; i++) {
            (TareRiskOracle oracle,,) = _setup(vaults[i], kinds[i]);
            vm.prank(attester);
            uint256 id = oracle.post(vaults[i], TareRiskOracle.Verdict.HOLD, 9000, 1000, keccak256("fork"));
            TareRiskOracle.Post memory p = oracle.getPost(id);
            assertGt(p.ppsAtPost, 0, "pps snapshot");
            assertLe(p.liquidityAtPost, p.assetsAtPost, "liquidity <= assets");
            vm.warp(block.timestamp + 86_400);
            oracle.resolve(id);
            assertTrue(oracle.getResolution(id).resolved);
        }
    }
}
