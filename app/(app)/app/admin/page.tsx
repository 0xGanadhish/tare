import { AdminPanel } from '@/components/admin/AdminPanel';
import { TestnetOnly } from '@/components/network/TestnetOnly';

export const metadata = { robots: { index: false, follow: false } };

export default function AdminPage() {
  return (
    <TestnetOnly feature="demoControls" name="Demo controls">
      <AdminPanel />
    </TestnetOnly>
  );
}
