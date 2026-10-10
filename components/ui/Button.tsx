import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'purple';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ink text-white hover:opacity-85',
  secondary: 'border border-hairline bg-white text-ink hover:border-ink/40',
  purple: 'bg-deposit text-white hover:opacity-90',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md';
}

export function Button({ variant = 'primary', size = 'md', className, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition disabled:cursor-not-allowed disabled:opacity-45 ${
        size === 'sm' ? 'px-3.5 py-1.5 text-[12px]' : 'px-5 py-2.5 text-[13px]'
      } ${VARIANTS[variant]} ${className ?? ''}`}
      {...rest}
    />
  );
}
