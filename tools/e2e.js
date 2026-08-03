#!/usr/bin/env node
/* End-to-end walkthrough of the On It front end, driven against the local mock
 * API in tools/mock-api.js. Two browser contexts stand in for two phones, so
 * the ask -> accept -> complete -> thank loop is exercised the way a couple
 * would actually use it, across devices.
 *
 *   node tools/mock-api.js &
 *   node tools/e2e.js
 *
 * Screenshots land in tools/shots/.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 8787);
const BASE = `http://localhost:${PORT}/onit/?api=http://localhost:${PORT}/api`;
const SHOTS = path.join(__dirname, 'shots');

const results = [];
let failures = 0;

function check(name, condition, detail) {
  const ok = !!condition;
  if (!ok) failures++;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? `  — ${detail}` : ''}`);
  console.log(results[results.length - 1]);
}

async function shot(page, name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });
}

(async () => {
  await fetch(`http://localhost:${PORT}/__reset`);

  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
  });
  const phone = { viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };
  const tablet = { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2 };

  const ctxA = await browser.newContext(phone);
  const ctxB = await browser.newContext(phone);
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();

  const errors = [];
  for (const [label, page] of [['A', A], ['B', B]]) {
    page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
    page.on('console', (m) => {
      // Network failures are expected here: Google Fonts is unreachable from
      // the sandbox, and the offline step deliberately cuts the connection.
      if (m.type() === 'error' && !/net::ERR_|Failed to load resource/.test(m.text())) {
        errors.push(`${label} console: ${m.text()}`);
      }
    });
  }

  /* ---------------------------------------------------- 1. create + join */

  await A.goto(BASE);
  await A.getByRole('button', { name: 'Create a household' }).click();
  await A.getByPlaceholder('The Stone house').fill('The Test House');
  await A.getByPlaceholder('Danielle').fill('Dani');
  await A.getByRole('button', { name: 'Create household' }).click();

  await A.locator('.code-card .code').waitFor({ timeout: 10000 });
  const code = (await A.locator('.code-card .code').textContent()).trim();
  check('household code is shown after creating', /^[A-Z]+-[A-Z]+-\d+$/.test(code), code);
  await shot(A, '01-code');
  await A.getByRole('button', { name: 'Open my list' }).click();
  await A.locator('.topbar').waitFor();
  check('lands on Today after setup',
    await A.getByRole('heading', { name: 'Today', exact: true }).isVisible());

  await B.goto(BASE);
  await B.getByRole('button', { name: 'Join instead' }).click();
  await B.getByPlaceholder('SUNNY-BASIL-4173').fill(code.toLowerCase());
  await B.getByRole('button', { name: 'Continue' }).click();
  await B.getByText("I'm someone new").waitFor();
  check('join screen lists existing members', await B.getByText('Dani').first().isVisible());
  await B.getByPlaceholder('Alex').fill('Marc');
  await B.getByRole('button', { name: 'Join as a new person' }).click();
  await B.locator('.code-card .code').waitFor({ timeout: 10000 });
  await B.getByRole('button', { name: 'Open my list' }).click();
  await B.locator('.topbar').waitFor();
  check('second device joins the same household',
    (await B.locator('.household-name').textContent()).includes('The Test House'));

  /* ------------------------------------------------ 2. add a task for me */

  await A.getByRole('button', { name: 'Add something' }).first().click();
  await A.getByPlaceholder('Call the pharmacy about the refill').fill('Call the plumber');
  await A.locator('.sheet').getByRole('button', { name: 'Morning' }).click();
  await A.locator('.sheet').getByRole('button', { name: '15 min', exact: true }).click();
  await A.getByRole('button', { name: 'Add it' }).click();
  await A.getByText('Call the plumber').waitFor();
  check('own task appears on Today immediately', await A.getByText('Call the plumber').isVisible());
  check('own task is not an ask', (await A.locator('.ask').count()) === 0);

  /* ----------------------------------------- 3. asking is not assigning */

  await A.getByRole('button', { name: 'Add something' }).first().click();
  await A.getByPlaceholder('Call the pharmacy about the refill').fill('Take the bins out');
  await A.locator('.sheet').getByRole('button', { name: 'Marc', exact: false }).first().click();
  const hint = await A.locator('.sheet .hint').first().textContent();
  check('asking someone else explains it is a request', /request/i.test(hint), hint);
  await A.locator('.sheet').getByRole('button', { name: 'Evening' }).click();
  await A.locator('.sheet').getByRole('button', { name: '5 min', exact: true }).click();
  await A.getByRole('switch', { name: /matters a lot to me/ }).click();
  await A.getByRole('button', { name: 'Send the ask' }).click();
  await A.waitForTimeout(400);

  const onATodayAfterAsk = await A.getByText('Take the bins out').count();
  check('an ask does not land on the asker\'s Today board', onATodayAfterAsk === 0);

  await B.reload();
  await B.locator('.topbar').waitFor();
  await B.waitForTimeout(600);
  const pip = await B.locator('.nav .pip').first().textContent();
  check('the other phone shows an ask waiting', pip === '1', `pip=${pip}`);
  const bTodayCount = await B.getByText('Take the bins out').count();
  check('an ask does not appear on the recipient\'s Today until accepted', bTodayCount === 0);

  await B.getByRole('button', { name: 'Asks' }).click();
  await B.getByText('Waiting on you').waitFor();
  await shot(B, '02-asks-waiting');
  check('ask shows who asked', await B.getByText(/Dani asked/).isVisible());
  check('"matters a lot" is carried across', await B.getByText('matters a lot to them').isVisible());

  /* ------------------------------------------------- 4. accept and do it */

  await B.getByRole('button', { name: "Yes — I'll pick a time" }).click();
  await B.getByText('You pick the when').waitFor();
  await shot(B, '03-accept');
  await B.locator('.sheet').getByRole('button', { name: 'Today', exact: true }).click();
  await B.locator('.sheet').getByRole('button', { name: 'Evening' }).click();
  await B.getByRole('button', { name: "It's a deal" }).click();
  await B.waitForTimeout(500);

  await B.getByRole('button', { name: 'Today' }).first().click();
  await B.getByText('Take the bins out').waitFor();
  check('accepted ask moves onto the doer\'s Today', await B.getByText('Take the bins out').isVisible());
  await shot(B, '04-today');

  // Time-fit filter: the 5 min job survives a "got 5 minutes?" filter.
  await B.getByRole('button', { name: '5 min', exact: true }).first().click();
  await B.waitForTimeout(300);
  check('time-fit filter keeps a 5 minute job',
    (await B.getByText('Take the bins out').count()) > 0);
  await B.getByRole('button', { name: 'Any length' }).click();
  await B.waitForTimeout(200);

  await B.locator('.task', { hasText: 'Take the bins out' }).locator('.check').click();
  await B.waitForTimeout(800);
  check('completing removes it from Today', (await B.getByText('Take the bins out').count()) === 0);

  /* ------------------------------------------------------- 5. thank them */

  await A.reload();
  await A.locator('.topbar').waitFor();
  await A.waitForTimeout(800);
  await A.getByRole('button', { name: 'Wins' }).click();
  await A.getByText('Finished this week').waitFor({ timeout: 5000 });
  check('the asker sees the finished job', await A.getByText('Take the bins out').isVisible());
  await A.getByRole('button', { name: 'Say thanks' }).first().click();
  await A.locator('.sheet').waitFor();
  await A.getByPlaceholder('That was a real help today.').fill('Thank you — one less thing.');
  await A.locator('.sheet').getByRole('button', { name: 'Send' }).click();
  await A.waitForTimeout(500);
  check('thank you is recorded', await A.getByText('Thank you — one less thing.').isVisible());
  await shot(A, '05-wins');

  await B.reload();
  await B.locator('.topbar').waitFor();
  await B.waitForTimeout(900);
  const winsPip = await B.locator('.nav .tab', { hasText: 'Wins' }).locator('.pip').count();
  check('the doer is notified of the thank you', winsPip === 1);

  /* ------------------------------------------------- 6. offline handling */

  await B.getByRole('button', { name: 'Today' }).first().click();
  await B.getByRole('button', { name: 'Add something' }).first().click();
  await B.getByPlaceholder('Call the pharmacy about the refill').fill('Offline job');
  await B.getByRole('button', { name: 'Add it' }).click();
  await B.waitForTimeout(600);

  await ctxB.setOffline(true);
  await B.locator('.task', { hasText: 'Offline job' }).locator('.check').click();
  await B.waitForTimeout(900);
  const syncState = await B.locator('.sync').getAttribute('data-state');
  const syncLabel = await B.locator('.sync-label').textContent();
  check('offline is surfaced, not swallowed', syncState === 'offline', `state=${syncState}`);
  check('queued work is counted for the user', /to send/.test(syncLabel), syncLabel);
  check('the tap still took effect locally', (await B.getByText('Offline job').count()) === 0);
  await shot(B, '06-offline');

  await ctxB.setOffline(false);
  await B.evaluate(() => window.dispatchEvent(new Event('online')));
  await B.waitForTimeout(1500);
  const backOnline = await B.locator('.sync').getAttribute('data-state');
  check('queue drains when the connection returns', backOnline === 'idle', `state=${backOnline}`);

  const serverSaysDone = await fetch(`http://localhost:${PORT}/api`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op: 'state.get', token: await B.evaluate(() => JSON.parse(localStorage.getItem('onit.v1.token'))) }),
  }).then((r) => r.json());
  const offlineTask = serverSaysDone.data.tasks.find((t) => t.title === 'Offline job');
  check('the offline completion reached the server', offlineTask && offlineTask.status === 'done',
    offlineTask ? offlineTask.status : 'missing');

  /* ------------------------------------------------ 7. dark + tablet mode */

  await A.emulateMedia({ colorScheme: 'dark' });
  await A.getByRole('button', { name: 'Today' }).first().click();
  await A.waitForTimeout(400);
  const themeAttr = await A.evaluate(() => document.documentElement.dataset.theme);
  check('dark mode follows the device', themeAttr === 'dark', themeAttr);
  await shot(A, '07-dark');

  const ctxK = await browser.newContext(tablet);
  const K = await ctxK.newPage();
  K.on('pageerror', (e) => errors.push(`K: ${e.message}`));
  await K.goto(BASE);
  await K.getByRole('button', { name: 'Join instead' }).click();
  await K.getByPlaceholder('SUNNY-BASIL-4173').fill(code);
  await K.getByRole('button', { name: 'Continue' }).click();
  await K.getByRole('button', { name: 'Use as the household tablet' }).click();
  await K.locator('.code-card .code').waitFor({ timeout: 10000 });
  await K.getByRole('button', { name: 'Open my list' }).click();
  await K.locator('.topbar').waitFor();
  await K.waitForTimeout(800);
  check('tablet mode turns on the kiosk clock', await K.locator('.kiosk-clock').isVisible());
  check('tablet mode offers a person switcher', await K.locator('.who').isVisible());

  await K.locator('.who').click();
  await K.getByText("Who's using this?").waitFor();
  await K.getByRole('button', { name: /Marc/ }).click();
  await K.waitForTimeout(900);
  const acting = await K.locator('.who span').first().textContent();
  check('either spouse can act as themselves at the tablet', /Marc/.test(await K.locator('.who').textContent()), acting);
  await shot(K, '08-tablet');

  await K.getByRole('button', { name: 'Add something' }).first().click();
  await K.waitForTimeout(300);
  await shot(K, '09-add-sheet');
  await K.getByRole('button', { name: 'Cancel' }).click();

  /* ----------------------------------------------------------- 8. timer */

  await A.locator('.task', { hasText: 'Call the plumber' }).locator('button[aria-label*="timer"]').click();
  await A.locator('.focus').waitFor();
  const readout = await A.locator('.focus .readout').textContent();
  check('timer starts from the task estimate', readout.startsWith('15:') || readout.startsWith('14:'), readout);
  await shot(A, '10-timer');
  await A.getByRole('button', { name: 'Stop the timer' }).click();

  /* --------------------------------------------------------- 9. a11y-ish */

  const unlabelled = await A.evaluate(() => {
    const bad = [];
    document.querySelectorAll('button').forEach((b) => {
      const text = (b.textContent || '').trim();
      if (!text && !b.getAttribute('aria-label')) bad.push(b.className || b.outerHTML.slice(0, 60));
    });
    return bad;
  });
  check('every button has a name', unlabelled.length === 0, unlabelled.join(', '));

  check('no uncaught page errors', errors.length === 0, errors.slice(0, 4).join(' | '));

  await browser.close();

  console.log('\n' + '='.repeat(60));
  console.log(`${results.length - failures}/${results.length} checks passed`);
  if (failures) { console.log(`${failures} FAILED`); process.exit(1); }
})().catch((err) => { console.error(err); process.exit(1); });
