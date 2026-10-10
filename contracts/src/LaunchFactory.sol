// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Guardian} from "./Guardian.sol";
import {CurveToken} from "./CurveToken.sol";

/// @notice Creates linear-curve tokens backed by Guardian-approved reserve vaults.
contract LaunchFactory {
    error VaultNotApproved();

    event TokenCreated(
        address indexed token, address indexed creator, address reserveVault, string name, string symbol
    );

    Guardian public immutable guardian;

    constructor(address guardian_) {
        guardian = Guardian(guardian_);
    }

    function create(string memory name, string memory symbol, address reserveVault) external returns (address token) {
        if (!guardian.approvedVault(reserveVault)) revert VaultNotApproved();
        token = address(new CurveToken(name, symbol, reserveVault));
        emit TokenCreated(token, msg.sender, reserveVault, name, symbol);
    }
}
