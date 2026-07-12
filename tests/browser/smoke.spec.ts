import { expect, test } from '@playwright/test';
import { io as connectClient, type Socket } from 'socket.io-client';

function emitAck(socket: Socket, event: string, payload: unknown): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} acknowledgement timed out.`)), 2_000);
    socket.emit(event, payload, (response: unknown) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}

test('built phone journey renders and accepts touch', async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];

  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto('/');
  await page.waitForTimeout(250);
  expect(pageErrors, `Unexpected page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  expect(consoleErrors, `Unexpected console errors: ${consoleErrors.join(' | ')}`).toEqual([]);

  const canvas = page.locator('#game canvas');
  await expect(canvas).toBeVisible();
  await expect.poll(async () => canvas.evaluate(async (element: HTMLCanvasElement) => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const probe = document.createElement('canvas');
    probe.width = 64;
    probe.height = 64;
    const context = probe.getContext('2d');
    if (!context) return 0;
    context.drawImage(element, 0, 0, probe.width, probe.height);
    const pixels = context.getImageData(0, 0, probe.width, probe.height).data;
    const colors = new Set<string>();
    for (let index = 0; index < pixels.length; index += 16) {
      if (pixels[index + 3] > 0) {
        colors.add(`${pixels[index]}:${pixels[index + 1]}:${pixels[index + 2]}`);
      }
    }
    return colors.size;
  })).toBeGreaterThan(1);

  await expect(page.locator('#b-rand')).toBeVisible({ timeout: 10_000 });
  await page.locator('#b-rand').tap();
  await expect(page.getByRole('heading', { name: 'Prepare the Clash' })).toBeVisible();
  await expect(page.locator('#inp-room-id')).toHaveValue(/^[a-z0-9]+(?:-[a-z0-9]+){2}$/);

  expect(pageErrors, `Unexpected page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  expect(consoleErrors, `Unexpected console errors: ${consoleErrors.join(' | ')}`).toEqual([]);

  if (process.env.PLAYWRIGHT_ARTIFACT_PROBE === '1') {
    expect('artifact-probe').toBe('intentional-failure');
  }
});

test('room reconnect replaces missed peer state from the server snapshot', async ({ page, context }) => {
  test.setTimeout(45_000);
  await page.goto('/');
  await expect(page.locator('#b-rand')).toBeVisible({ timeout: 10_000 });
  await page.locator('#b-rand').tap();
  await expect(page.getByRole('heading', { name: 'Prepare the Clash' })).toBeVisible();
  const roomId = await page.locator('#inp-room-id').inputValue();
  await expect.poll(() => page.locator('#t-room tr').count()).toBeGreaterThan(0);
  const initialPlayerCount = await page.locator('#t-room tr').count();
  expect(initialPlayerCount).toBeLessThan(4);

  await context.setOffline(true);
  await page.waitForTimeout(300);

  const origin = new URL(page.url()).origin;
  const peer = connectClient(origin, {
    transports: ['websocket'],
    reconnection: false,
    extraHeaders: { Origin: origin }
  });
  try {
    await new Promise<void>((resolve, reject) => {
      peer.once('connect', () => resolve());
      peer.once('connect_error', reject);
    });
    const opened = await emitAck(peer, 'v1:session.open', {
      requestId: 'browser_peer_session_01',
      action: 'create'
    });
    expect(opened.ok).toBe(true);
    const joined = await emitAck(peer, 'client:room#join', {
      requestId: 'browser_peer_join_01',
      roomId
    });
    expect(joined.ok).toBe(true);
    const ready = await emitAck(peer, 'client:room#ready', {
      requestId: 'browser_peer_ready_01',
      ready: true
    });
    expect(ready.ok).toBe(true);
    await expect(page.locator('#t-room tr')).toHaveCount(initialPlayerCount);

    await context.setOffline(false);
    await expect(page.locator('#t-room tr')).toHaveCount(
      initialPlayerCount + 1,
      { timeout: 10_000 }
    );
    await expect(page.locator('#t-room')).toContainText('Ready');
  } finally {
    await context.setOffline(false);
    peer.close();
  }
});
