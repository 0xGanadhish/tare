// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {AdapterKinds} from "../script/AdapterKinds.sol";
import {MockToken} from "../src/MockToken.sol";
import {MockMarketAdapter, MockMorpho, MockV2Vault, NotMorphoAdapter} from "./Adapters.t.sol";

/// The library is internal, so tests call it through this harness, which keeps one cache across calls.
contract AdapterKindsHarness {
    AdapterKinds.Cache internal cache;

    function adapterFor(string memory kind) external returns (address adapter) {
        AdapterKinds.Cache memory c = cache;
        adapter = AdapterKinds.adapterFor(kind, c);
        cache = c;
    }

    function check(string memory kind, address vault) external view {
        AdapterKinds.check(kind, vault);
    }
}

contract AdapterKindsTest is Test {
    AdapterKindsHarness harness;

    function setUp() public {
        harness = new AdapterKindsHarness();
    }

    function test_kinds_known() public {
        assertEq(harness.adapterFor("none"), address(0));
        string[4] memory kinds = ["mirror", "euler", "euler-earn", "morpho-v2"];
        for (uint256 i = 0; i < kinds.length; i++) {
            assertGt(harness.adapterFor(kinds[i]).code.length, 0, kinds[i]);
        }
        assertEq(harness.adapterFor("morpho-v2"), harness.adapterFor("morpho-v2"), "cached");
        assertTrue(harness.adapterFor("euler") != harness.adapterFor("euler-earn"), "distinct per kind");
    }

    function test_kinds_typo_reverts() public {
        vm.expectRevert(bytes("unknown adapter kind: morpho_v2"));
        harness.adapterFor("morpho_v2");
    }

    /// The Morpho V2 adapter reads an unknown liquidity adapter as idle-only, so the deploy is where a vault whose
    /// liquidity market Tare can't read gets rejected.
    function test_check_morphoV2_rejectsNonMarketLiquidityAdapter() public {
        address usdc = address(new MockToken("Mock USDC", "USDC", 6));
        address v = address(new MockV2Vault(usdc, address(new NotMorphoAdapter()), ""));
        vm.expectRevert(bytes("liquidity adapter is not a Morpho market adapter"));
        harness.check("morpho-v2", v);
    }

    function test_check_morphoV2_acceptsMarketAdapterOrNone() public {
        address usdc = address(0xC0FFEE);
        harness.check("morpho-v2", address(new MockV2Vault(usdc, address(0), "")));
        harness.check("morpho-v2", address(new MockV2Vault(usdc, address(new MockMarketAdapter(address(new MockMorpho()))), "")));
        harness.check("euler-earn", address(0xE));
    }
}
