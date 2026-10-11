import { expect, test, type Page } from '@playwright/test';

const PAGES = ['/', '/app/explore', '/app/advisor', '/app/watch', '/app/ledger'];
const NETWORKS = ['testnet', 'mainnet'] as const;

/** Console errors and uncaught page errors, ignoring third-party noise the app does not control. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

for (const network of NETWORKS) {
  for (const path of PAGES) {
    test(`smoke: ${path} renders on ${network}`, async ({ page }) => {
      const errors = collectErrors(page);
      await page.goto(`${path}?network=${network}`);
      await expect(page.locator('body')).toBeVisible();
      await page.waitForLoadState('networkidle');

      if (path.startsWith('/app')) {
        // App pages carry the header switch; the URL param selects the network.
        await expect(page.getByRole('radio', { name: network === 'mainnet' ? 'Mainnet' : 'Testnet' })).toHaveAttribute('aria-checked', 'true');
        const banner = page.getByTestId('real-funds-banner');
        if (network === 'mainnet') await expect(banner).toBeVisible();
        else await expect(banner).toHaveCount(0);
        // No wallet in the test browser, so the faucet never renders; on mainnet its feature flag also keeps it off.
        await expect(page.getByRole('button', { name: 'Get test USDC' })).toHaveCount(0);
        await expect(page.getByRole('link', { name: 'Launch' }).first()).toHaveCount(network === 'mainnet' ? 0 : 1);
        await expect(page.getByRole('link', { name: 'Ledger' }).first()).toBeVisible();
      }
      if (path === '/app/ledger') {
        await expect(page.getByRole('heading', { name: 'Method' })).toBeVisible();
        await expect(page.getByLabel('Scoreboard')).toBeVisible();
      }
      expect(errors).toEqual([]);
    });
  }
}
