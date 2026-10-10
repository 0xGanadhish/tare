'use client';

import { useState } from 'react';
import { formatUnits } from 'viem';
import { useAccount, useChainId, usePublicClient, useReadContract, useSimulateContract, useWriteContract } from 'wagmi';
import { abis } from '@/shared/contracts';
import type { Address } from '@/shared/types';
import { useTx } from '@/components/tx/useTx';
import { TxStatus } from '@/components/tx/TxStatus';
import { validateAmount } from '@/components/tx/validateAmount';
import { Button } from '@/components/ui/Button';
import { WalletButton } from '@/components/ui/WalletButton';

export function TradeForm({ token, asset, quoteDecimals, quoteSymbol, tokenSymbol, paused }: {
  token: Address; asset: Address; quoteDecimals: number; quoteSymbol: string; tokenSymbol: string; paused: boolean;
}) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const client = usePublicClient({ chainId: 10143 });
  const { writeContractAsync } = useWriteContract();
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const approval = useTx();
  const trade = useTx();
  const busy = [approval.state.status, trade.state.status].some((status) => status === 'awaiting_signature' || status === 'pending');
  const connected = isConnected && !!address && chainId === 10143;
  const balance = useReadContract({ address: side === 'buy' ? asset : token, abi: abis.mockToken, functionName: 'balanceOf', args: address ? [address] : undefined, chainId: 10143, query: { enabled: !!address, refetchInterval: 2_000 } });
  const allowance = useReadContract({ address: asset, abi: abis.mockToken, functionName: 'allowance', args: address ? [address, token] : undefined, chainId: 10143, query: { enabled: !!address, refetchInterval: 2_000 } });
  const decimals = side === 'buy' ? quoteDecimals : 18;
  const currency = side === 'buy' ? quoteSymbol : tokenSymbol;
  const parsed = validateAmount(amount, balance.data ?? 0n, decimals);
  const input = parsed.ok ? parsed.value : 0n;
  const needsApproval = side === 'buy' && parsed.ok && allowance.data !== undefined && allowance.data < input;
  const ready = connected && parsed.ok && !paused && !balance.isError && (side === 'sell' || (!allowance.isError && allowance.data !== undefined && !needsApproval));
  const quote = useSimulateContract({
    address: token, abi: abis.curveToken, functionName: side, args: [input, 0n], account: address, chainId: 10143,
    query: { enabled: ready, refetchInterval: 2_000, retry: false },
  });
  const output = ready ? quote.data?.result : undefined;
  const minimum = output === undefined ? undefined : output * 99n / 100n;
  const outputDecimals = side === 'buy' ? 18 : quoteDecimals;
  const outputCurrency = side === 'buy' ? tokenSymbol : quoteSymbol;

  return (
    <section className="min-w-0 border-t border-hairline pt-6" aria-labelledby="trade-title">
      <h2 id="trade-title" className="display text-2xl">Trade {tokenSymbol}</h2>
      <div className="mt-5 flex gap-2" role="group" aria-label="Trade direction">
        <Button variant={side === 'buy' ? 'primary' : 'secondary'} size="sm" disabled={busy} aria-pressed={side === 'buy'} onClick={() => { setSide('buy'); setAmount(''); }}>Buy</Button>
        <Button variant={side === 'sell' ? 'primary' : 'secondary'} size="sm" disabled={busy} aria-pressed={side === 'sell'} onClick={() => { setSide('sell'); setAmount(''); }}>Sell</Button>
      </div>
      <label className="mt-6 block text-sm">{side === 'buy' ? `Spend ${quoteSymbol}` : `Sell ${tokenSymbol}`}
        <input value={amount} onChange={(event) => setAmount(event.target.value)} disabled={busy} inputMode="decimal" placeholder="0.00" aria-describedby="trade-validation" className="mono mt-2 block w-full rounded-lg border border-hairline bg-paper px-3 py-3 text-lg outline-none focus:border-deposit disabled:opacity-50" />
      </label>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="mono break-all text-[11px] text-muted">Balance {balance.data === undefined ? '—' : formatUnits(balance.data, decimals)} {currency}</p>
        <Button size="sm" variant="secondary" disabled={busy || balance.data === undefined || balance.isError} onClick={() => { if (balance.data !== undefined) setAmount(formatUnits(balance.data, decimals)); }}>Max</Button>
      </div>
      <p id="trade-validation" className="mt-3 min-h-4 text-xs text-secondary">{balance.isError ? 'Balance unavailable. Trading is paused.' : connected && amount && !parsed.ok ? parsed.error : paused ? 'Live token reads are unavailable. Trading is paused.' : '1% slippage protection · testnet only'}</p>
      <dl className="mt-5 space-y-3 border-y border-hairline py-4 text-xs">
        <div className="flex flex-wrap justify-between gap-2"><dt className="text-secondary">Estimated receive</dt><dd className="mono break-all">{output === undefined ? '—' : `${formatUnits(output, outputDecimals)} ${outputCurrency}`}</dd></div>
        <div className="flex flex-wrap justify-between gap-2"><dt className="text-secondary">Minimum receive</dt><dd className="mono break-all">{minimum === undefined ? '—' : `${formatUnits(minimum, outputDecimals)} ${outputCurrency}`}</dd></div>
      </dl>
      {needsApproval && <p className="mt-4 text-xs leading-relaxed text-secondary">First approve exactly {formatUnits(input, quoteDecimals)} {quoteSymbol}. The buy quote is read after the approval receipt; approval does not buy tokens.</p>}
      {ready && quote.isFetching && !quote.data && <p role="status" className="mt-4 text-xs text-secondary">Simulating the trade…</p>}
      {ready && quote.isError && <p role="alert" className="mt-4 break-words text-xs text-avoid">Trade simulation failed: {quote.error && 'shortMessage' in quote.error ? String(quote.error.shortMessage) : quote.error?.message}. Selling requires available reserve liquidity.</p>}
      {side === 'buy' && allowance.isError && <p role="alert" className="mt-4 text-xs text-avoid">Could not read approval. Buying is paused.</p>}
      {!connected ? <div className="mt-6"><WalletButton /></div> : <div className="mt-6 space-y-5">
        {side === 'buy' && <div>
          <Button variant="secondary" className="w-full" disabled={busy || !needsApproval || paused || balance.isError} onClick={() => void approval.run(() => writeContractAsync({ address: asset, abi: abis.mockToken, functionName: 'approve', args: [token, input], chainId: 10143 }))}>{busy && approval.state.status === 'awaiting_signature' ? 'Waiting for signature…' : approval.state.status === 'pending' ? 'Approval pending…' : '1. Approve reserve asset'}</Button>
        </div>}
        <div>
          <Button className="w-full" disabled={busy || !ready || output === undefined || output === 0n || minimum === 0n || quote.isError} onClick={() => void trade.run(async () => {
            if (!client || !address || !ready || minimum === undefined || minimum === 0n) throw new Error('Connect to Monad testnet and enter a valid amount');
            await client.simulateContract({ address: token, abi: abis.curveToken, functionName: side, args: [input, minimum], account: address });
            return writeContractAsync({ address: token, abi: abis.curveToken, functionName: side, args: [input, minimum], account: address, chainId: 10143 });
          })}>{trade.state.status === 'awaiting_signature' ? 'Waiting for signature…' : trade.state.status === 'pending' ? 'Trade pending…' : side === 'buy' ? `2. Buy ${tokenSymbol}` : `Sell ${tokenSymbol}`}</Button>
        </div>
      </div>}
      {approval.state.status !== 'idle' && <div className="mt-4"><p className="mono text-[10px] uppercase tracking-wider text-muted">Reserve approval</p><TxStatus state={approval.state} className="mt-1" /></div>}
      {trade.state.status !== 'idle' && <div className="mt-4"><p className="mono text-[10px] uppercase tracking-wider text-muted">Token trade</p><TxStatus state={trade.state} className="mt-1" /></div>}
    </section>
  );
}
