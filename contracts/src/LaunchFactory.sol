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

    struct Launch {
        address token;
        address creator;
        address reserveVault;
        string name;
        string symbol;
    }

    Guardian public immutable guardian;
    Launch[] private _launches;

    constructor(address guardian_) {
        guardian = Guardian(guardian_);
    }

    function create(string memory name, string memory symbol, address reserveVault) external returns (address token) {
        if (!guardian.approvedVault(reserveVault)) revert VaultNotApproved();
        token = address(new CurveToken(name, symbol, reserveVault));
        _launches.push(Launch(token, msg.sender, reserveVault, name, symbol));
        emit TokenCreated(token, msg.sender, reserveVault, name, symbol);
    }

    /// @notice Every token launched here, oldest first. One call instead of a log scan.
    function launches() external view returns (Launch[] memory) {
        return _launches;
    }

    function launchCount() external view returns (uint256) {
        return _launches.length;
    }
}
