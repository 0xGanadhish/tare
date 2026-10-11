import { LaunchPage } from '@/components/launch/LaunchPage';
import { TestnetOnly } from '@/components/network/TestnetOnly';

export default function Page() {
  return (
    <TestnetOnly feature="launch" name="Launch">
      <LaunchPage />
    </TestnetOnly>
  );
}
