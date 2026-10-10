import { TokenPage } from '@/components/launch/TokenPage';

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <TokenPage token={token} />;
}
