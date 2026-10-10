import { Wordmark } from '@/components/ui/Wordmark';

export function SiteFooter() {
  return (
    <footer className="mx-auto mt-20 w-full max-w-[1200px] border-t border-hairline px-5 py-8 sm:px-9">
      <div className="flex flex-col gap-3 text-[12px] text-muted sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Wordmark />
          <span>Every yield on Monad, weighed.</span>
        </div>
        <div className="mono text-[10.5px] leading-relaxed">
          Real data from DeFiLlama · Judgments by Jev (TypeSafe) · Transactions on Monad testnet
        </div>
      </div>
    </footer>
  );
}
