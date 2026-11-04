import type { Hex } from 'viem';
import type { Network } from '../../shared/networks';

export interface ExitJob { network: Network; vault: `0x${string}`; owner: `0x${string}`; verdictId: string }

export interface Env {
  DB: D1Database;
  STATE: R2Bucket;
  EXITS: Queue<ExitJob>;
  VAULT_WATCHER: DurableObjectNamespace;
  TX_SENDER: DurableObjectNamespace;
  // Secrets (spec §5.2). Never logged, never returned by the API.
  TYPESAFE_API_KEY?: string;
  ALCHEMY_URL_TESTNET?: string;
  ALCHEMY_URL_MAINNET?: string;
  ATTESTER_KEY_TESTNET?: string;
  ATTESTER_KEY_MAINNET?: string;
  EXECUTOR_KEY_TESTNET?: string;
  EXECUTOR_KEY_MAINNET?: string;
  ADMIN_TOKEN?: string;
  ENVIO_GRAPHQL_URL?: string;
  /** Comma-separated networks whose watchers stand down (wrangler.toml [vars]). Their data stays served. */
  PAUSED_NETWORKS?: string;
}

/** True when PAUSED_NETWORKS lists this network: its watchers stop ticking and /health leaves it out. */
export const isPaused = (env: Env, network: Network): boolean =>
  (env.PAUSED_NETWORKS ?? '').split(',').map((s) => s.trim()).includes(network);

export type KeyRole = 'attester' | 'executor';

const PUBLIC_RPC: Record<Network, string> = {
  testnet: 'https://testnet-rpc.monad.xyz',
  mainnet: 'https://rpc.monad.xyz',
};

/** The private key for one role on one network. Mainnet and testnet keys are separate secrets. */
export function secretFor(env: Env, role: KeyRole, network: Network): Hex {
  const name = `${role.toUpperCase()}_KEY_${network.toUpperCase()}` as keyof Env;
  const value = env[name];
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`${name} is not set`);
  return value as Hex;
}

/** The public Monad RPC. Guardian log reads use it: Alchemy's Monad mainnet endpoint rejects those getLogs calls. */
export const publicRpc = (network: Network): string => PUBLIC_RPC[network];

/** Alchemy when configured, else the public Monad RPC. */
export function rpcFor(env: Env, network: Network): string {
  return (network === 'testnet' ? env.ALCHEMY_URL_TESTNET : env.ALCHEMY_URL_MAINNET) || PUBLIC_RPC[network];
}
