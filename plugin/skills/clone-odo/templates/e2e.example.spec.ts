/*
MIT License

Copyright (c) 2026 Jake Schincariol

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
// Optional web example. Adapt the route/seed/labels to YOUR local clone.
// Needs Playwright >=1.31 and @axe-core/playwright in the target project.
// This HTTP example uses a direct-response fixture: even local redirects fail.
// Not a backend-idempotency/isolation test or a native-platform test.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const base = new URL(process.env.CLONE_BASE_URL || 'http://127.0.0.1:3000');
if (!['http:', 'https:'].includes(base.protocol)
    || !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) {
  throw new Error('This example runs only against a local seeded clone.');
}
test.use({ baseURL: base.origin, serviceWorkers: 'block' });

test('FL01-H1 guest books a seeded slot', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push('console error'); });
  page.on('response', res => { if (res.status() >= 500) errors.push('server 5xx'); });
  await page.context().route('**/*', async route => {
    if (new URL(route.request().url()).origin !== base.origin) {
      errors.push('external request blocked');
      await route.abort();
      return;
    }
    // Do not let the browser follow an unchecked redirect chain.
    const response = await route.fetch({ maxRedirects: 0 });
    if (response.status() >= 300 && response.status() < 400) {
      errors.push('HTTP redirect blocked: use a direct-response seeded fixture');
      await route.abort();
      return;
    }
    await route.fulfill({ response });
  });
  await page.goto('/u/demo/30min');
  await page.getByRole('button', { name: /next available day/i }).click();
  await page.getByRole('button', { name: /10:00/ }).click();
  await page.getByLabel('Name').fill('Test Guest');
  await page.getByLabel('Email').fill('guest@example.test');
  await page.getByRole('button', { name: /confirm/i }).click();
  await expect(page.getByRole('heading', { name: /you are booked/i })).toBeVisible();
  const a11y = await new AxeBuilder({ page }).analyze();
  expect(a11y.violations).toEqual([]);
  expect(errors).toEqual([]);
});
