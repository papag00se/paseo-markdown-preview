import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createPreviewService } from '../server/service';

// Capture actual preview pages; never inject styles or replace rendered UI.
// Tasks are exercised in a disposable workspace, leaving the fixture pristine.
const repo = fileURLToPath(new URL('../', import.meta.url));
const destination = path.resolve(process.argv[2] ?? path.join(repo, 'docs/media'));
const workspace = await mkdtemp(path.join(tmpdir(), 'paseo-md-showcase-'));
let service: Awaited<ReturnType<typeof createPreviewService>> | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;

try {
  await cp(path.join(repo, 'docs/showcase'), workspace, { recursive: true });
  await mkdir(destination, { recursive: true });
  service = await createPreviewService();
  const url = await service.open(workspace);
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1500 }, colorScheme: 'light', deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', async response => {
    if (response.url().includes('/file?') && !response.ok()) console.error('Workspace image failed:', response.status(), await response.text());
  });

  async function ready() {
    await page.getByRole('heading', { name: 'Atlas · Delivery brief', exact: true }).waitFor();
    await page.getByRole('status').filter({ hasText: 'Live' }).waitFor();
    await page.getByRole('img', { name: 'Mermaid diagram', exact: true }).waitFor();
    await page.locator('.katex-display').waitFor();
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images).filter(image => image.getAttribute('src')).map(image => image.decode()));
    });
    assert.equal(await page.getByRole('alert').innerText(), '');
    assert.deepEqual(errors, []);
  }

  await page.goto(url);
  await ready();
  assert.equal(await page.getByRole('table').getByText('112 ms', { exact: true }).isVisible(), true);
  const approval = page.getByRole('checkbox', { name: 'Approve the global rollout', exact: true });
  await approval.check();
  await page.getByRole('status').filter({ hasText: 'Live' }).waitFor();
  assert.match(await readFile(path.join(workspace, 'README.md'), 'utf8'), /- \[x\] Approve the global rollout/);
  await approval.uncheck();
  await page.getByRole('status').filter({ hasText: 'Live' }).waitFor();
  await ready();
  await page.screenshot({ path: path.join(destination, 'desktop-preview.png'), fullPage: true });

  await page.setViewportSize({ width: 680, height: 1500 });
  await ready();
  await page.screenshot({ path: path.join(destination, 'compact-preview.png'), fullPage: true });

  await page.setViewportSize({ width: 1440, height: 1500 });
  const theme = page.waitForResponse(response => response.url().endsWith('/preview_theme/github-dark.css') && response.status() === 200);
  await page.emulateMedia({ colorScheme: 'dark' });
  await theme;
  await ready();
  assert.equal(await page.locator('body').evaluate(body => getComputedStyle(body).backgroundColor), 'rgb(23, 26, 32)');
  await page.screenshot({ path: path.join(destination, 'dark-preview.png'), fullPage: true });

  // The useful local image remains an ordinary clickable workspace asset.
  await page.getByRole('img', { name: /^Global delivery latency:/ }).click();
  await page.getByRole('dialog').waitFor();
  assert.equal(await page.getByRole('dialog').getByRole('img').isVisible(), true);
  await page.getByRole('button', { name: 'Close image' }).click();
  await page.getByRole('link', { name: 'Read the rollout playbook →', exact: true }).click();
  await page.getByRole('heading', { name: 'Rollout playbook', exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log(`Captured wide, compact, and dark previews in ${destination}`);
  console.log('Verified Mermaid, KaTeX, local image, saved checkbox, local navigation, and browser errors.');
} finally {
  await browser?.close();
  await service?.close();
  await rm(workspace, { recursive: true, force: true });
}
