import { TokenPage } from '@/components/launch/TokenPage';
import { TestnetOnly } from '@/components/network/TestnetOnly';

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <TestnetOnly feature="launch" name="Launch">
      <TokenPage token={token} />
    </TestnetOnly>
  );
}
