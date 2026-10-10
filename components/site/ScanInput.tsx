'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { isAddress } from 'viem';

const DEMO_WHALE = process.env.NEXT_PUBLIC_DEMO_WHALE ?? '0xf70da97812cb96acdf810712aa562db8dfa3dbef';

export function ScanInput() {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const go = (raw: string) => {
    const addr = raw.trim();
    if (!isAddress(addr, { strict: false })) {
      setError('Not a valid Monad address');
      return;
    }
    setError(null);
    router.push(`/app/scan/${addr}`);
  };

  return (
    <div className="w-full sm:max-w-[400px]">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(value);
        }}
        className="flex items-center gap-1 rounded-full border border-hairline bg-white py-1 pl-4 pr-1 shadow-[0_1px_2px_rgba(0,0,0,0.04)] focus-within:border-ink/40"
      >
        <label htmlFor="scan-address" className="sr-only">
          Wallet address to scan
        </label>
        <input
          id="scan-address"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          placeholder="Paste a wallet address"
          spellCheck={false}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          className="min-w-0 flex-1 bg-transparent py-2 font-mono text-[12px] text-ink outline-none placeholder:font-sans placeholder:text-[12.5px] placeholder:text-soft"
        />
        <button
          type="submit"
          className="shrink-0 rounded-full bg-ink px-4 py-2 text-[12.5px] font-medium text-white transition-opacity hover:opacity-85"
        >
          Scan a wallet →
        </button>
      </form>
      <div className="mt-2 min-h-4 pl-4 text-[11px]">
        {error ? (
          <span role="alert" className="text-avoid">
            {error}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => {
              setValue(DEMO_WHALE);
              go(DEMO_WHALE);
            }}
            className="mono text-muted underline decoration-hairline underline-offset-4 transition-colors hover:text-ink"
          >
            or try a demo wallet
          </button>
        )}
      </div>
    </div>
  );
}
