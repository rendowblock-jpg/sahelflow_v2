import {chromium, type Browser, type BrowserContext, type Page} from '@playwright/test';
import {mkdir, rm, copyFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

const baseURL = process.env.SAHELFLOW_CAPTURE_BASE_URL ?? 'http://127.0.0.1:3000';
const root = process.cwd();
const outputDir = path.resolve(root, 'marketing/remotion/public/captures');
const authStatePath = path.join(outputDir, '.auth-state.json');

const desktop = {width: 1920, height: 1080};
const vertical = {width: 1080, height: 1920};

type Locale = 'fr' | 'ar' | 'en';
type CaptureSpec = {
  name: string;
  route: string;
  locale: Locale;
  viewport?: {width: number; height: number};
  video?: boolean;
  dwellMs?: number;
};

const captures: CaptureSpec[] = [
  {name: 'dashboard-fr', route: '/dashboard', locale: 'fr', video: true, dwellMs: 5200},
  {name: 'orders-fr', route: '/orders?status=pending', locale: 'fr', video: true, dwellMs: 5600},
  {name: 'confirmation-fr', route: '/orders/confirmation-queue', locale: 'fr'},
  {name: 'inbox-ar', route: '/inbox', locale: 'ar', video: true, dwellMs: 5200},
  {name: 'deliveries-fr', route: '/deliveries', locale: 'fr', video: true, dwellMs: 4800},
  {name: 'automations-en', route: '/automations', locale: 'en', video: true, dwellMs: 5000},
  {name: 'analytics-fr', route: '/analytics', locale: 'fr'},
  {name: 'products-fr', route: '/products', locale: 'fr'},
  {name: 'customers-fr', route: '/customers', locale: 'fr'},
  {name: 'dashboard-ar', route: '/dashboard', locale: 'ar'},
  {name: 'dashboard-en', route: '/dashboard', locale: 'en'},
  {name: 'dashboard-vertical-ar', route: '/dashboard', locale: 'ar', viewport: vertical},
  {name: 'orders-vertical-fr', route: '/orders?status=pending', locale: 'fr', viewport: vertical},
];

const hideForCapture = `
  [data-sonner-toaster], nextjs-portal, [data-nextjs-toast], [data-next-badge-root] { display: none !important; }
  * { caret-color: transparent !important; }
  html { scroll-behavior: auto !important; }
`;

async function setCaptureState(context: BrowserContext, locale: Locale) {
  await context.addCookies([
    {
      name: 'sahelflow-locale',
      value: locale,
      url: baseURL,
      sameSite: 'Lax',
    },
  ]);
  await context.addInitScript(() => {
    localStorage.setItem('theme', 'dark');
    localStorage.setItem('sahelflow-sidebar-collapsed', 'false');
  });
}

async function waitForProduct(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#main-content').waitFor({state: 'visible', timeout: 45_000});
  await page.addStyleTag({content: hideForCapture});
  await page.waitForTimeout(2200);
}

async function animateProduct(page: Page, durationMs: number) {
  const start = Date.now();
  await page.mouse.move(1340, 145, {steps: 28});
  await page.waitForTimeout(500);
  await page.mouse.move(1010, 380, {steps: 36});
  await page.waitForTimeout(650);

  const main = page.locator('#main-content');
  const maxScroll = await main.evaluate((element) => Math.max(0, element.scrollHeight - element.clientHeight));
  const target = Math.min(maxScroll, 520);
  if (target > 0) {
    for (let i = 0; i <= 36; i++) {
      const eased = 1 - Math.pow(1 - i / 36, 3);
      await main.evaluate((element, y) => {
        element.scrollTop = y;
      }, Math.round(target * eased));
      await page.waitForTimeout(28);
    }
    await page.waitForTimeout(450);
    for (let i = 0; i <= 30; i++) {
      const eased = i / 30;
      await main.evaluate((element, y) => {
        element.scrollTop = y;
      }, Math.round(target * (1 - eased)));
      await page.waitForTimeout(25);
    }
  }

  await page.mouse.move(1660, 845, {steps: 38});
  const remaining = durationMs - (Date.now() - start);
  if (remaining > 0) await page.waitForTimeout(remaining);
}

async function authenticate(browser: Browser) {
  const context = await browser.newContext({viewport: desktop, colorScheme: 'dark'});
  await setCaptureState(context, 'fr');
  const page = await context.newPage();
  await page.goto(`${baseURL}/login`, {waitUntil: 'domcontentloaded', timeout: 60_000});
  const result = await page.evaluate(async () => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({pin: '12345678'}),
    });
    return {ok: response.ok, status: response.status, body: await response.text()};
  });
  if (!result.ok) {
    throw new Error(`SahelFlow capture login failed (${result.status}): ${result.body}`);
  }
  await context.storageState({path: authStatePath});
  await context.close();
}

async function captureOne(browser: Browser, spec: CaptureSpec) {
  const viewport = spec.viewport ?? desktop;
  const videoDir = path.join(outputDir, '.recordings', spec.name);
  if (spec.video) await mkdir(videoDir, {recursive: true});

  const context = await browser.newContext({
    viewport,
    colorScheme: 'dark',
    locale: spec.locale === 'ar' ? 'ar-DZ' : spec.locale === 'fr' ? 'fr-DZ' : 'en-US',
    storageState: authStatePath,
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference',
    recordVideo: spec.video ? {dir: videoDir, size: viewport} : undefined,
  });
  await setCaptureState(context, spec.locale);
  const page = await context.newPage();
  await page.goto(`${baseURL}${spec.route}`, {waitUntil: 'domcontentloaded', timeout: 60_000});
  await waitForProduct(page);

  await page.screenshot({
    path: path.join(outputDir, `${spec.name}.png`),
    type: 'png',
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
  });

  if (spec.video) {
    await animateProduct(page, spec.dwellMs ?? 4800);
  }

  const recording = page.video();
  await context.close();
  if (recording) {
    const sourcePath = await recording.path();
    await copyFile(sourcePath, path.join(outputDir, `${spec.name}.webm`));
  }
}

async function main() {
  await rm(outputDir, {recursive: true, force: true});
  await mkdir(outputDir, {recursive: true});

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage', '--font-render-hinting=none'],
  });

  try {
    await authenticate(browser);
    for (const spec of captures) {
      process.stdout.write(`Capturing ${spec.name}... `);
      await captureOne(browser, spec);
      console.log('done');
    }
  } finally {
    await browser.close();
  }

  await writeFile(
    path.join(outputDir, 'manifest.json'),
    JSON.stringify({
      capturedAt: new Date().toISOString(),
      baseURL,
      captures: captures.map(({name, route, locale, viewport, video}) => ({
        name,
        route,
        locale,
        viewport: viewport ?? desktop,
        screenshot: `${name}.png`,
        video: video ? `${name}.webm` : null,
      })),
    }, null, 2),
  );

  await rm(authStatePath, {force: true});
  await rm(path.join(outputDir, '.recordings'), {recursive: true, force: true});
  console.log(`Product capture complete: ${outputDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
