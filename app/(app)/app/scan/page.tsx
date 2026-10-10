import { ScanForm } from '@/components/scan/ScanForm';

export default function ScanIndexPage() {
  return (
    <div>
      <h1 className="display text-[30px] sm:text-[38px]">Scan a wallet</h1>
      <p className="mb-6 mt-1 text-[14px] text-secondary">See what is sitting idle on Monad mainnet and what it could earn.</p>
      <ScanForm />
    </div>
  );
}
