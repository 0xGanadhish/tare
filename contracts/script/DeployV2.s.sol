// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {TareRiskOracle} from "../src/TareRiskOracle.sol";
import {GuardianV2} from "../src/GuardianV2.sol";
import {AdapterKinds} from "./AdapterKinds.sol";

/// @notice Chain-aware Guardian v2 deploy: 10143 = Monad testnet, 143 = Monad mainnet.
/// Testnet guards the existing mirrors (MirrorAdapter); mainnet guards script/vaults.mainnet.json.
/// vaults.mainnet.json entries: {address, name, poolId, protocol: euler|morpho, adapter: <kind>}, where kind is one of
/// none | mirror | euler | euler-earn | morpho-v2 (see AdapterKinds). Every vault must end up with a liquidity adapter.
/// Env: ATTESTER (required), OWNER (defaults to the broadcaster and must equal it, since it registers vaults).
/// Merges oracle, guardianV2, usdc, deployBlockV2 and vaults into ../shared/addresses.<net>.json, keeping
/// the v1 fields, only when WRITE_ADDRESSES=true.
contract DeployV2 is Script {
    address constant MAINNET_USDC = 0x754704Bc059F8C67012fEd69BC8A327a5aafb603;

    struct VaultIn {
        address vault;
        string name;
        string poolId;
        string protocol;
        string adapterKind;
    }

    function run() external {
        bool mainnet = block.chainid == 143;
        require(mainnet || block.chainid == 10143, "unsupported chain");
        string memory path = mainnet ? "../shared/addresses.mainnet.json" : "../shared/addresses.testnet.json";
        string memory existing = vm.readFile(path);
        address attester = vm.envAddress("ATTESTER");

        (VaultIn[] memory vaults, address usdc) = mainnet ? _mainnetVaults() : _testnetVaults(existing);
        require(vaults.length > 0, "no vaults");

        vm.startBroadcast();
        address owner = vm.envOr("OWNER", msg.sender);
        require(owner == msg.sender, "OWNER must be the broadcaster");
        TareRiskOracle oracle = new TareRiskOracle(owner, attester, mainnet ? 86_400 : 3_600);
        GuardianV2 guardian = new GuardianV2(owner, oracle);
        AdapterKinds.Cache memory cache;
        address[] memory adapters = new address[](vaults.length);
        for (uint256 i = 0; i < vaults.length; i++) {
            AdapterKinds.check(vaults[i].adapterKind, vaults[i].vault);
            adapters[i] = AdapterKinds.adapterFor(vaults[i].adapterKind, cache);
            oracle.registerVault(vaults[i].vault, adapters[i]);
            guardian.setVaultApproved(vaults[i].vault, true);
        }
        // An adapter locks at a vault's first verdict, so prove each one reads sensibly before anything is sent.
        for (uint256 i = 0; i < vaults.length; i++) {
            (, uint256 assets, uint256 liq) = oracle.metricsOf(vaults[i].vault);
            require(liq != type(uint256).max, "vault has no liquidity adapter");
            require(liq <= assets, "liquidity above TVL");
            console.log(vaults[i].name, "liquidity bps of TVL:", assets == 0 ? 0 : liq * 10_000 / assets);
        }
        vm.stopBroadcast();

        string memory out = vm.serializeJson("root", existing);
        out = vm.serializeAddress("root", "oracle", address(oracle));
        out = vm.serializeAddress("root", "guardianV2", address(guardian));
        out = vm.serializeAddress("root", "usdc", usdc);
        out = vm.serializeUint("root", "deployBlockV2", block.number);
        out = vm.serializeString("root", "vaults", _vaultsJson(vaults, adapters));
        console.log(out);
        // Only persist real runs: simulating must not clobber the committed addresses file.
        if (vm.envOr("WRITE_ADDRESSES", false)) vm.writeJson(out, path);
    }

    function _testnetVaults(string memory existing) internal view returns (VaultIn[] memory vaults, address usdc) {
        usdc = vm.parseJsonAddress(existing, ".mockUsdc");
        uint256 n;
        while (vm.keyExistsJson(existing, string.concat(".mirrors[", vm.toString(n), "]"))) n++;
        vaults = new VaultIn[](n);
        for (uint256 i = 0; i < n; i++) {
            string memory p = string.concat(".mirrors[", vm.toString(i), "].");
            vaults[i] = VaultIn({
                vault: vm.parseJsonAddress(existing, string.concat(p, "address")),
                name: vm.parseJsonString(existing, string.concat(p, "mirrorOf")),
                poolId: vm.parseJsonString(existing, string.concat(p, "poolId")),
                protocol: "mirror",
                adapterKind: "mirror"
            });
        }
    }

    function _mainnetVaults() internal view returns (VaultIn[] memory vaults, address usdc) {
        usdc = MAINNET_USDC;
        string memory cfg = vm.readFile("script/vaults.mainnet.json");
        uint256 n;
        while (vm.keyExistsJson(cfg, string.concat(".vaults[", vm.toString(n), "]"))) n++;
        vaults = new VaultIn[](n);
        for (uint256 i = 0; i < n; i++) {
            string memory p = string.concat(".vaults[", vm.toString(i), "].");
            vaults[i] = VaultIn({
                vault: vm.parseJsonAddress(cfg, string.concat(p, "address")),
                name: vm.parseJsonString(cfg, string.concat(p, "name")),
                poolId: vm.parseJsonString(cfg, string.concat(p, "poolId")),
                protocol: vm.parseJsonString(cfg, string.concat(p, "protocol")),
                adapterKind: vm.parseJsonString(cfg, string.concat(p, "adapter"))
            });
            // Never guard a vault that isn't a real USDC ERC-4626 on this chain.
            require(vaults[i].vault.code.length > 0, "vault has no code");
            require(IERC4626(vaults[i].vault).asset() == MAINNET_USDC, "vault asset is not USDC");
        }
    }

    function _vaultsJson(VaultIn[] memory vaults, address[] memory adapters)
        internal
        pure
        returns (string[] memory out)
    {
        out = new string[](vaults.length);
        for (uint256 i = 0; i < vaults.length; i++) {
            out[i] = string.concat(
                '{"address":"', vm.toString(vaults[i].vault),
                '","name":"', vaults[i].name,
                '","poolId":"', vaults[i].poolId,
                '","protocol":"', vaults[i].protocol,
                '","adapter":', adapters[i] == address(0) ? "null" : string.concat('"', vm.toString(adapters[i]), '"'),
                "}"
            );
        }
    }
}
