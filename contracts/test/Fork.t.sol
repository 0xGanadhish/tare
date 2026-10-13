// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {TareRiskOracle} from "../src/TareRiskOracle.sol";
import {GuardianV2} from "../src/GuardianV2.sol";
import {ILiquidityAdapter} from "../src/interfaces/ILiquidityAdapter.sol";
import {AdapterKinds} from "../script/AdapterKinds.sol";
import {IMorphoMarketAdapter, IMorphoVaultV2} from "../src/adapters/MorphoV2Adapter.sol";

struct MarketParams {
    address loanToken;
    address collateralToken;
    address oracle;
    address irm;
    uint256 lltv;
}

interface IMorphoFlash {
    function flashLoan(address token, uint256 assets, bytes calldata data) external;
    function supply(MarketParams memory mp, uint256 assets, uint256 shares, address onBehalf, bytes memory data)
        external
        returns (uint256, uint256);
    function withdraw(MarketParams memory mp, uint256 assets, uint256 shares, address onBehalf, address receiver)
        external
        returns (uint256, uint256);
}

/// The attack from the security review: flash-borrow USDC from Morpho, park it in the vault's liquidity market,
/// take a reading, and take the money back, all in one transaction.
contract FlashSampler {
    TareRiskOracle immutable oracle;
    IMorphoFlash immutable morpho;
    IERC20 immutable usdc;
    MarketParams mp;
    uint256 id;

    constructor(TareRiskOracle oracle_, IMorphoFlash morpho_, IERC20 usdc_, MarketParams memory mp_) {
        (oracle, morpho, usdc, mp) = (oracle_, morpho_, usdc_, mp_);
    }

    function boostedSample(uint256 id_, uint256 amount) external {
        id = id_;
        morpho.flashLoan(address(usdc), amount, "");
    }

    function onMorphoFlashLoan(uint256 assets, bytes calldata) external {
        usdc.approve(address(morpho), type(uint256).max);
        (, uint256 shares) = morpho.supply(mp, assets, 0, address(this), "");
        oracle.sample(id);
        morpho.withdraw(mp, 0, shares, address(this), address(this));
    }
}

/// Mainnet fork: the full Guardian v2 path against the real vaults in script/vaults.mainnet.json.
/// Run: MONAD_MAINNET_RPC=https://rpc.monad.xyz forge test --match-path test/Fork.t.sol -vv
/// Skips when the RPC env var is unset or the vault list is empty.
contract ForkTest is Test {
    address constant USDC = 0x754704Bc059F8C67012fEd69BC8A327a5aafb603;
    /// Spec rule 4: Guardian fully exits a 1,000 USDC position.
    uint256 constant AMOUNT = 1_000e6;

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
        oracle = new TareRiskOracle(owner, attester, 86_400, 3_600); // mainnet's windows, as DeployV2 sets them
        guardian = new GuardianV2(owner, oracle);
        AdapterKinds.check(kind, vault);
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
            _exitFlow(vaults[i], kinds[i], AMOUNT, 999e6);
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
            _assertWithdrawable(vault, liq, holder);
        }
    }

    /// USDC sent straight to a vault (by accident or to fake liquidity) must not raise the adapter's number above
    /// what can actually be withdrawn.
    function testFork_donationDoesNotInflateLiquidity() public {
        (address[] memory vaults, string[] memory kinds) = _vaults();
        address holder = makeAddr("holder");
        for (uint256 i = 0; i < vaults.length; i++) {
            address vault = vaults[i];
            (,, address adapter) = _setup(vault, kinds[i]);
            deal(USDC, vault, IERC20(USDC).balanceOf(vault) + 1_000_000e6);
            _assertWithdrawable(vault, ILiquidityAdapter(adapter).availableLiquidity(vault), holder);
        }
    }

    /// A holder with enough shares can withdraw just under `liq`, and 1 USDC over it fails.
    function _assertWithdrawable(address vault, uint256 liq, address holder) internal {
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
            oracle.sample(id);
            assertEq(oracle.getSample(id).count, 1, "sampled");
            vm.warp(block.timestamp + 3_600);
            oracle.resolve(id);
            assertTrue(oracle.getResolution(id).resolved);
        }
    }

    /// Spec §2b: after one honest sample, a flash-boosted sample can't raise the worst values the grade uses.
    function testFork_flashBoostedSample_cannotFlatter() public {
        (address[] memory vaults, string[] memory kinds) = _vaults();
        for (uint256 i = 0; i < vaults.length; i++) {
            if (keccak256(bytes(kinds[i])) != keccak256("morpho-v2")) continue;
            address vault = vaults[i];
            address liqAdapter = IMorphoVaultV2(vault).liquidityAdapter();
            if (liqAdapter == address(0)) continue;

            TareRiskOracle oracle = new TareRiskOracle(owner, attester, 86_400, 3_600);
            AdapterKinds.Cache memory cache;
            address adapter = AdapterKinds.adapterFor(kinds[i], cache);
            vm.prank(owner);
            oracle.registerVault(vault, adapter);
            vm.prank(attester);
            uint256 id = oracle.post(vault, TareRiskOracle.Verdict.HOLD, 9000, 1000, keccak256("fork"));
            vm.warp(block.timestamp + 86_400);

            oracle.sample(id);
            TareRiskOracle.Sample memory honest = oracle.getSample(id);

            MarketParams memory mp = abi.decode(IMorphoVaultV2(vault).liquidityData(), (MarketParams));
            IMorphoFlash morpho = IMorphoFlash(IMorphoMarketAdapter(liqAdapter).morpho());
            FlashSampler attacker = new FlashSampler(oracle, morpho, IERC20(USDC), mp);
            deal(USDC, address(attacker), 1e6); // covers Morpho's 1-wei rounding on the way out
            attacker.boostedSample(id, 5_000_000e6);

            TareRiskOracle.Sample memory after_ = oracle.getSample(id);
            assertEq(after_.count, 2, "both readings recorded");
            assertEq(after_.liquidityBps, honest.liquidityBps, "worst liquidity unchanged");
            assertEq(after_.assets, honest.assets, "worst assets unchanged");
            assertEq(after_.pps, honest.pps, "worst share price unchanged");
        }
    }

    /// The attack ordering on a real vault: the flash-boosted sample lands first, the honest one second.
    function testFork_flashSampleFirst_honestSampleWins() public {
        (address[] memory vaults, string[] memory kinds) = _vaults();
        for (uint256 i = 0; i < vaults.length; i++) {
            if (keccak256(bytes(kinds[i])) != keccak256("morpho-v2")) continue;
            address vault = vaults[i];
            address liqAdapter = IMorphoVaultV2(vault).liquidityAdapter();
            if (liqAdapter == address(0)) continue;

            TareRiskOracle oracle = new TareRiskOracle(owner, attester, 86_400, 3_600);
            AdapterKinds.Cache memory cache;
            address adapter = AdapterKinds.adapterFor(kinds[i], cache);
            vm.prank(owner);
            oracle.registerVault(vault, adapter);
            vm.prank(attester);
            uint256 id = oracle.post(vault, TareRiskOracle.Verdict.HOLD, 9000, 1000, keccak256("fork"));
            vm.warp(block.timestamp + 86_400);

            (, uint256 assetsNow, uint256 liqNow) = oracle.metricsOf(vault);
            uint256 honestBps = liqNow * 10_000 / assetsNow;

            MarketParams memory mp = abi.decode(IMorphoVaultV2(vault).liquidityData(), (MarketParams));
            IMorphoFlash morpho = IMorphoFlash(IMorphoMarketAdapter(liqAdapter).morpho());
            FlashSampler attacker = new FlashSampler(oracle, morpho, IERC20(USDC), mp);
            deal(USDC, address(attacker), 1e6);
            attacker.boostedSample(id, 5_000_000e6);
            assertGt(oracle.getSample(id).liquidityBps, honestBps, "the flash sample read flattered liquidity");

            oracle.sample(id);
            assertEq(oracle.getSample(id).liquidityBps, honestBps, "the honest reading replaced it");
        }
    }
}
