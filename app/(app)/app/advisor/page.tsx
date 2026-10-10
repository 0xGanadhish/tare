import { Suspense } from 'react';
import { AdvisorClient } from '@/components/advisor/AdvisorClient';

export default function AdvisorPage() {
  return (
    <Suspense fallback={null}>
      <AdvisorClient />
    </Suspense>
  );
}
