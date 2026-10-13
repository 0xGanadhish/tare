import type { SelectHTMLAttributes } from 'react';

type Props = SelectHTMLAttributes<HTMLSelectElement> & { wrapperClassName?: string };

/** Native select with the browser arrow hidden and a chevron drawn inside the right padding, so it sits the same in every browser. */
export function Select({ className = '', wrapperClassName = 'inline-flex', children, ...props }: Props) {
  return (
    <span className={`relative ${wrapperClassName}`}>
      <select {...props} className={`w-full cursor-pointer appearance-none pr-8 disabled:cursor-not-allowed ${className}`}>
        {children}
      </select>
      <svg aria-hidden="true" viewBox="0 0 12 12" className="pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 4.5 6 7.5 9 4.5" />
      </svg>
    </span>
  );
}
