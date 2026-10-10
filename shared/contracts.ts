import { parseAbi } from 'viem';
import type { Address, MirrorInfo } from './types';
import testnet from './addresses.testnet.json';

export const abis = {
  mockToken: parseAbi([
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
    'function balanceOf(address) view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function transfer(address to, uint256 amount) returns (bool)',
    'function mint(address to, uint256 amount)',
    'event Transfer(address indexed from, address indexed to, uint256 value)',
    'event Approval(address indexed owner, address indexed spender, uint256 value)',
  ]),
  mirrorVault: parseAbi([
    'function asset() view returns (address)',
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
    'function totalAssets() view returns (uint256)',
    'function totalSupply() view returns (uint256)',
    'function balanceOf(address) view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function convertToAssets(uint256 shares) view returns (uint256)',
    'function convertToShares(uint256 assets) view returns (uint256)',
    'function previewDeposit(uint256 assets) view returns (uint256)',
    'function maxWithdraw(address owner) view returns (uint256)',
    'function maxRedeem(address owner) view returns (uint256)',
    'function deposit(uint256 assets, address receiver) returns (uint256)',
    'function withdraw(uint256 assets, address receiver, address owner) returns (uint256)',
    'function redeem(uint256 shares, address receiver, address owner) returns (uint256)',
    'function setStats(uint16 apyBps, uint16 utilizationBps)',
    'function mirrorOf() view returns (string)',
    'function apyBps() view returns (uint16)',
    'function utilizationBps() view returns (uint16)',
    'function admin() view returns (address)',
    'function lastAccrual() view returns (uint256)',
    'function availableLiquidity() view returns (uint256)',
    'event StatsUpdated(uint16 apyBps, uint16 utilizationBps, uint256 timestamp)',
    'event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)',
    'event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)',
    'error NotAdmin()',
    'error ERC4626ExceededMaxRedeem(address owner, uint256 shares, uint256 max)',
    'error ERC4626ExceededMaxWithdraw(address owner, uint256 assets, uint256 max)',
  ]),
  guardian: parseAbi([
    'function admin() view returns (address)',
    'function keeper() view returns (address)',
    'function setVaultApproved(address vault, bool ok)',
    'function enable(address vault)',
    'function disable(address vault)',
    'function exit(address vault, address owner) returns (uint256 assets)',
    'function enabled(address owner, address vault) view returns (bool)',
    'function approvedVault(address vault) view returns (bool)',
    'event Enabled(address indexed owner, address indexed vault)',
    'event Disabled(address indexed owner, address indexed vault)',
    'event Exited(address indexed owner, address indexed vault, uint256 shares, uint256 assets)',
    'error NotAdmin()',
    'error NotKeeper()',
    'error VaultNotApproved()',
    'error NotEnabled()',
    'error NothingToExit()',
  ]),
  // Launch ABIs follow plan Task L1; L1 reports any difference and the orchestrator updates these.
  launchFactory: parseAbi([
    'function guardian() view returns (address)',
    'function create(string name, string symbol, address reserveVault) returns (address)',
    'event TokenCreated(address indexed token, address indexed creator, address reserveVault, string name, string symbol)',
    'error VaultNotApproved()',
  ]),
  curveToken: parseAbi([
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
    'function totalSupply() view returns (uint256)',
    'function balanceOf(address) view returns (uint256)',
    'function reserveVault() view returns (address)',
    'function buy(uint256 quoteIn, uint256 minTokensOut) returns (uint256)',
    'function sell(uint256 tokensIn, uint256 minQuoteOut) returns (uint256)',
    'function reserveAssets() view returns (uint256)',
    'function floorPrice() view returns (uint256)',
    'function price() view returns (uint256)',
  ]),
} as const;

export interface Addresses {
  mockUsdc?: Address;
  guardian?: Address;
  mirrors?: MirrorInfo[];
  launchFactory?: Address | null;
}

export const addresses: Addresses = testnet as Addresses;
