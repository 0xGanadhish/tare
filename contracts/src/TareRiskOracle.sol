// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {ILiquidityAdapter} from "./interfaces/ILiquidityAdapter.sol";

/// @title TareRiskOracle
/// @notice Public, append-only record of Jev's verdicts on ERC-4626 vaults. Each post snapshots the vault's
/// share price, total assets and withdrawable liquidity so the verdict can later be graded from onchain data
/// alone. `stateHash` commits to the exact state document Jev was shown (archived publicly offchain).
contract TareRiskOracle {
    enum Verdict {
        HOLD,
        EXIT,
        MOVE
    }

    struct Post {
        address vault;
        Verdict verdict;
        uint16 confidenceBps;
        uint16 riskBps;
        bytes32 stateHash;
        uint64 postedAt;
        uint256 ppsAtPost;
        uint256 assetsAtPost;
        uint256 liquidityAtPost;
    }

    struct Resolution {
        bool resolved;
        bool adverse;
        uint8 reasons;
        uint64 resolvedAt;
    }

    uint16 internal constant MAX_BPS = 10_000;

    address public immutable owner;
    uint64 public immutable resolveWindow;
    address public attester;
    uint256 public postCount;

    mapping(address vault => bool) public registered;
    mapping(address vault => address) public adapterOf;
    mapping(address vault => uint256) public latest;
    mapping(uint256 id => Post) internal _posts;
    mapping(uint256 id => Resolution) internal _resolutions;

    error NotOwner();
    error NotAttester();
    error VaultNotRegistered();
    error AdapterLocked();
    error BpsOutOfRange();

    event VerdictPosted(
        uint256 indexed id,
        address indexed vault,
        Verdict verdict,
        uint16 confidenceBps,
        uint16 riskBps,
        bytes32 stateHash,
        uint64 postedAt
    );
    event VaultRegistered(address indexed vault, address adapter);
    event AttesterChanged(address attester);

    constructor(address owner_, address attester_, uint64 resolveWindow_) {
        owner = owner_;
        attester = attester_;
        resolveWindow = resolveWindow_;
        emit AttesterChanged(attester_);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @notice Register a vault for verdicts, with an optional liquidity adapter (zero = liquidity not graded).
    /// The adapter is fixed once the vault has a verdict, so past verdicts are always graded by the same rule.
    function registerVault(address vault, address adapter) external onlyOwner {
        if (latest[vault] != 0) revert AdapterLocked();
        registered[vault] = true;
        adapterOf[vault] = adapter;
        emit VaultRegistered(vault, adapter);
    }

    function setAttester(address attester_) external onlyOwner {
        attester = attester_;
        emit AttesterChanged(attester_);
    }

    function post(address vault, Verdict verdict, uint16 confidenceBps, uint16 riskBps, bytes32 stateHash)
        external
        returns (uint256 id)
    {
        if (msg.sender != attester) revert NotAttester();
        if (!registered[vault]) revert VaultNotRegistered();
        if (confidenceBps > MAX_BPS || riskBps > MAX_BPS) revert BpsOutOfRange();
        (uint256 pps, uint256 assets, uint256 liquidity) = _metrics(vault);
        id = ++postCount;
        _posts[id] = Post({
            vault: vault,
            verdict: verdict,
            confidenceBps: confidenceBps,
            riskBps: riskBps,
            stateHash: stateHash,
            postedAt: uint64(block.timestamp),
            ppsAtPost: pps,
            assetsAtPost: assets,
            liquidityAtPost: liquidity
        });
        latest[vault] = id;
        emit VerdictPosted(id, vault, verdict, confidenceBps, riskBps, stateHash, uint64(block.timestamp));
    }

    function getPost(uint256 id) external view returns (Post memory) {
        return _posts[id];
    }

    function getResolution(uint256 id) external view returns (Resolution memory) {
        return _resolutions[id];
    }

    function _metrics(address vault) internal view returns (uint256 pps, uint256 assets, uint256 liquidity) {
        IERC4626 v = IERC4626(vault);
        pps = v.convertToAssets(10 ** v.decimals());
        assets = v.totalAssets();
        address adapter = adapterOf[vault];
        liquidity = adapter == address(0) ? type(uint256).max : ILiquidityAdapter(adapter).availableLiquidity(vault);
    }
}
