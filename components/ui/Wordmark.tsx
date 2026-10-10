import Link from 'next/link';

export function Wordmark({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="text-[15px] font-semibold tracking-[-0.02em] text-ink" aria-label="Tare home">
      Tare
    </Link>
  );
}
