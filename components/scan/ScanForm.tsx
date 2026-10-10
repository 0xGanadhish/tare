'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { isAddress } from 'viem';
import { Button } from '@/components/ui/Button';

const DEMO_WHALE = process.env.NEXT_PUBLIC_DEMO_WHALE ?? '0xf70da97812cb96acdf810712aa562db8dfa3dbef';

export function ScanForm({ initial = '' }: { initial?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
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
    <div className="w-full max-w-[560px]">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(value);
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <label htmlFor="scan-input" className="sr-only">
          Wallet address to scan
        </label>
        <input
          id="scan-input"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          placeholder="Paste a wallet address (0x…)"
          spellCheck={false}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          className="mono min-w-0 flex-1 rounded-full border border-hairline bg-white px-4 py-2.5 text-[12px] outline-none placeholder:font-sans placeholder:text-soft focus:border-ink/40"
        />
        <Button type="submit">Scan wallet →</Button>
      </form>
      <div className="mt-2 min-h-4 pl-4 text-[11.5px]">
        {error ? (
          <span role="alert" className="text-avoid">
            {error}
          </span>
        ) : (
          DEMO_WHALE && (
            <button
              type="button"
              onClick={() => {
                setValue(DEMO_WHALE);
                go(DEMO_WHALE);
              }}
              className="mono text-muted underline decoration-hairline underline-offset-4 hover:text-ink"
            >
              Try the demo whale
            </button>
          )
        )}
      </div>
    </div>
  );
}
