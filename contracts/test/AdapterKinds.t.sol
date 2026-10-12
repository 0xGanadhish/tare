// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {AdapterKinds} from "../script/AdapterKinds.sol";

/// The library is internal, so tests call it through this harness, which keeps one cache across calls.
contract AdapterKindsHarness {
    AdapterKinds.Cache internal cache;

    function adapterFor(string memory kind) external returns (address adapter) {
        AdapterKinds.Cache memory c = cache;
        adapter = AdapterKinds.adapterFor(kind, c);
        cache = c;
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
}
