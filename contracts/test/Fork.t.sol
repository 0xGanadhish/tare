// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {TareRiskOracle} from "../src/TareRiskOracle.sol";
import {GuardianV2} from "../src/GuardianV2.sol";
import {EulerAdapter} from "../src/adapters/EulerAdapter.sol";

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

    function _vaults() internal returns (address[] memory vaults, bool[] memory euler) {
        string memory rpc = vm.envOr("MONAD_MAINNET_RPC", string(""));
        string memory cfg = vm.readFile("script/vaults.mainnet.json");
        uint256 n;
        while (vm.keyExistsJson(cfg, string.concat(".vaults[", vm.toString(n), "]"))) n++;
        if (bytes(rpc).length == 0 || n == 0) {
            vm.skip(true);
            return (vaults, euler);
        }
        vm.createSelectFork(rpc);
        vaults = new address[](n);
        euler = new bool[](n);
        for (uint256 i = 0; i < n; i++) {
            string memory p = string.concat(".vaults[", vm.toString(i), "].");
            vaults[i] = vm.parseJsonAddress(cfg, string.concat(p, "address"));
            euler[i] = keccak256(bytes(vm.parseJsonString(cfg, string.concat(p, "adapter")))) == keccak256("euler");
        }
    }

    function _setup(address vault, bool euler) internal returns (TareRiskOracle oracle, GuardianV2 guardian) {
        oracle = new TareRiskOracle(owner, attester, 86_400);
        guardian = new GuardianV2(owner, oracle);
        address adapter = euler ? address(new EulerAdapter()) : address(0);
        vm.startPrank(owner);
        oracle.registerVault(vault, adapter);
        guardian.setVaultApproved(vault, true);
        vm.stopPrank();
    }

    function testFork_realVault_redeemByAllowance() public {
        (address[] memory vaults, bool[] memory euler) = _vaults();
        for (uint256 i = 0; i < vaults.length; i++) {
            address vault = vaults[i];
            assertEq(IERC4626(vault).asset(), USDC, "vault asset");
            (TareRiskOracle oracle, GuardianV2 guardian) = _setup(vault, euler[i]);
            deal(USDC, user, AMOUNT);
            vm.startPrank(user);
            IERC20(USDC).approve(vault, AMOUNT);
            IERC4626(vault).deposit(AMOUNT, user);
            IERC20(vault).approve(address(guardian), type(uint256).max);
            guardian.enable(vault, 8000, 600);
            vm.stopPrank();
            vm.prank(attester);
            oracle.post(vault, TareRiskOracle.Verdict.EXIT, 9500, 9000, keccak256("fork"));

            uint256 before = IERC20(USDC).balanceOf(user);
            vm.prank(caller);
            uint256 assets = guardian.exit(vault, user);
            assertGe(IERC20(USDC).balanceOf(user) - before, 99.9e6, "usdc returned");
            assertEq(IERC20(USDC).balanceOf(user) - before, assets);
            assertEq(IERC20(USDC).balanceOf(address(guardian)), 0);
            assertEq(IERC20(vault).balanceOf(address(guardian)), 0);
            assertEq(IERC20(USDC).balanceOf(caller), 0);
            assertEq(IERC20(vault).balanceOf(user), 0, "full exit, no dust");
            assertEq(guardian.verdictFloor(user, vault), oracle.latest(vault), "verdict consumed");
        }
    }

    function testFork_resolve_realVault() public {
        (address[] memory vaults, bool[] memory euler) = _vaults();
        for (uint256 i = 0; i < vaults.length; i++) {
            (TareRiskOracle oracle,) = _setup(vaults[i], euler[i]);
            vm.prank(attester);
            uint256 id = oracle.post(vaults[i], TareRiskOracle.Verdict.HOLD, 9000, 1000, keccak256("fork"));
            TareRiskOracle.Post memory p = oracle.getPost(id);
            assertGt(p.ppsAtPost, 0, "pps snapshot");
            if (euler[i]) assertLe(p.liquidityAtPost, p.assetsAtPost, "euler cash <= assets");
            vm.warp(block.timestamp + 86_400);
            oracle.resolve(id);
            assertTrue(oracle.getResolution(id).resolved);
        }
    }
}
