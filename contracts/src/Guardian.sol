// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Keeper-triggered auto-exit. Assets always go to the position owner; Guardian never holds funds.
contract Guardian {
    error NotAdmin();
    error NotKeeper();
    error VaultNotApproved();
    error NotEnabled();
    error NothingToExit();

    event Enabled(address indexed owner, address indexed vault);
    event Disabled(address indexed owner, address indexed vault);
    event Exited(address indexed owner, address indexed vault, uint256 shares, uint256 assets);

    address public immutable admin;
    address public immutable keeper;

    mapping(address vault => bool) public approvedVault;
    mapping(address owner => mapping(address vault => bool)) public enabled;

    constructor(address admin_, address keeper_) {
        admin = admin_;
        keeper = keeper_;
    }

    function setVaultApproved(address vault, bool ok) external {
        if (msg.sender != admin) revert NotAdmin();
        approvedVault[vault] = ok;
    }

    function enable(address vault) external {
        enabled[msg.sender][vault] = true;
        emit Enabled(msg.sender, vault);
    }

    function disable(address vault) external {
        enabled[msg.sender][vault] = false;
        emit Disabled(msg.sender, vault);
    }

    function exit(address vault, address owner) external returns (uint256 assets) {
        if (msg.sender != keeper) revert NotKeeper();
        if (!approvedVault[vault]) revert VaultNotApproved();
        if (!enabled[owner][vault]) revert NotEnabled();

        uint256 shares = IERC20(vault).balanceOf(owner);
        uint256 m = IERC4626(vault).maxRedeem(owner);
        if (m < shares) shares = m;
        uint256 a = IERC20(vault).allowance(owner, address(this));
        if (a < shares) shares = a;
        if (shares == 0) revert NothingToExit();

        assets = IERC4626(vault).redeem(shares, owner, owner);
        emit Exited(owner, vault, shares, assets);
    }
}
