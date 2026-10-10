// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MockToken} from "../src/MockToken.sol";
import {MirrorVault} from "../src/MirrorVault.sol";
import {Guardian} from "../src/Guardian.sol";

/// @notice Chain-aware deploy: 10143 = Monad testnet, 143 = Monad mainnet.
/// Writes ../shared/addresses.<testnet|mainnet>.json.
contract Deploy is Script {
    uint256 constant SEED = 40_000e6;

    function run() external {
        bool mainnet = block.chainid == 143;
        require(mainnet || block.chainid == 10143, "unsupported chain");

        string memory cfg = vm.readFile("script/mirrors.json");

        vm.startBroadcast();
        address operator = msg.sender;

        MockToken token = mainnet
            ? new MockToken("Tare Demo USD", "tareUSD", 6)
            : new MockToken("Mock USDC", "USDC", 6);
        Guardian guardian = new Guardian(operator, operator);
        token.mint(operator, SEED * 4);

        string memory mirrorsJson = "[";
        for (uint256 i = 0; i < 4; i++) {
            mirrorsJson = string.concat(mirrorsJson, i == 0 ? "" : ",", _deployMirror(cfg, i, token, guardian, operator));
        }
        vm.stopBroadcast();
        mirrorsJson = string.concat(mirrorsJson, "]");

        string memory out = string.concat(
            '{"mockUsdc":"', vm.toString(address(token)),
            '","guardian":"', vm.toString(address(guardian)),
            '","mirrors":', mirrorsJson,
            ',"launchFactory":null}'
        );
        console.log(out);
        // Only persist real runs: simulating must not clobber the committed addresses file.
        if (vm.envOr("WRITE_ADDRESSES", false)) {
            vm.writeFile(mainnet ? "../shared/addresses.mainnet.json" : "../shared/addresses.testnet.json", out);
        }
    }

    function _deployMirror(string memory cfg, uint256 i, MockToken token, Guardian guardian, address operator)
        internal
        returns (string memory)
    {
        string memory p = string.concat(".mirrors[", vm.toString(i), "].");
        string memory label = vm.parseJsonString(cfg, string.concat(p, "mirrorOf"));
        MirrorVault v = new MirrorVault(
            token,
            vm.parseJsonString(cfg, string.concat(p, "name")),
            vm.parseJsonString(cfg, string.concat(p, "symbol")),
            label,
            uint16(vm.parseJsonUint(cfg, string.concat(p, "apyBps"))),
            uint16(vm.parseJsonUint(cfg, string.concat(p, "utilizationBps"))),
            operator
        );
        guardian.setVaultApproved(address(v), true);
        token.approve(address(v), SEED);
        v.deposit(SEED, operator);
        return string.concat(
            '{"address":"', vm.toString(address(v)), '","mirrorOf":"', label, '","poolId":"',
            vm.parseJsonString(cfg, string.concat(p, "poolId")), '"}'
        );
    }
}
