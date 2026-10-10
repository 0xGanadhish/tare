import { Providers } from '@/app/providers';
import { AppHeader } from '@/components/ui/AppHeader';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <div className="min-h-screen bg-bg">
        <AppHeader />
        <main className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-9 sm:py-10">{children}</main>
      </div>
    </Providers>
  );
}
