// Only for the disposable local session gateway; never use production credentials.
import assert from 'node:assert/strict';
import { chromium } from '../../web/node_modules/playwright/index.mjs';
const origin = 'http://localhost:3043';
const browser = await chromium.launch();
try {
  const contexts = await Promise.all([0, 1, 2].map(() => browser.newContext()));
  const pages = await Promise.all(contexts.map(context => context.newPage()));
  for (const page of pages) {
    await page.goto(origin);
    assert.equal(new URL(page.url()).pathname, '/login');
    await page.getByLabel('Username').fill('local-demo');
    await page.getByLabel('Password').fill('local-demo-only');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('button', { name: 'Sign out' }).waitFor();
    await page.reload();
    await page.getByRole('button', { name: 'Sign out' }).waitFor();
  }
  assert.equal((await contexts[0].request.get(origin + '/api/tree')).status(), 200);
  assert.equal((await contexts[0].request.post(origin + '/api/resources', {
    headers: { Origin: 'https://evil.example' }, data: {},
  })).status(), 403);
  await pages[0].getByRole('button', { name: 'Sign out' }).click();
  await pages[0].getByRole('button', { name: 'Sign in' }).waitFor();
  assert.equal((await contexts[0].request.get(origin + '/api/tree')).status(), 401);
  assert.equal((await contexts[1].request.get(origin + '/api/tree')).status(), 200);
  console.log('PASS: three independent sessions, refresh, cross-origin denial, sign-out and API denial');
} finally {
  await browser.close();
}
