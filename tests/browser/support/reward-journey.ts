import { expect, type Page } from '@playwright/test';

export async function completeCurrentClash(page: Page): Promise<void> {
  const ui = page.locator('.combat-ui');
  for (let shot = 0; shot < 10; shot += 1) {
    await expect.poll(() => page.evaluate(() => {
      if (document.querySelector('.result-shell')) return 'result';
      const combat = document.querySelector<HTMLElement>('.combat-ui');
      return combat?.dataset.presenting === 'false' &&
        combat.dataset.activeActor === 'player' ? 'ready' : 'waiting';
    }), { timeout: 30_000 }).toMatch(/^(ready|result)$/);
    if (await page.locator('.result-shell').count()) return;
    if (await ui.getAttribute('data-selected-relic') !== 'threadball') {
      await page.locator('.relic-trigger').tap();
      await expect(page.locator('.relic-chooser')).toBeVisible();
      await page.getByRole('button', { name: 'Select Threadball' }).tap();
      await expect(ui).toHaveAttribute('data-selected-relic', 'threadball');
    }
    await aimAt(page, 40, shot + 200);
    await expect(page.locator('.fire-button')).toBeEnabled();
    const turn = Number(await ui.getAttribute('data-turn'));
    await page.locator('.fire-button').tap();
    await expect.poll(() => page.evaluate((minimumTurn) => {
      if (document.querySelector('.result-shell')) return 'result';
      const combat = document.querySelector<HTMLElement>('.combat-ui');
      return Number(combat?.dataset.turn) > minimumTurn &&
        combat?.dataset.presenting === 'false' &&
        combat.dataset.activeActor === 'player' ? 'ready' : 'waiting';
    }, turn), { timeout: 30_000 }).toMatch(/^(ready|result)$/);
    if (await page.locator('.result-shell').count()) return;
  }
  throw new Error('Reward Clash did not reach a terminal result within ten player shots.');
}

async function aimAt(page: Page, angleDegrees: number, pointerId: number): Promise<void> {
  await page.locator('.aim-zone').evaluate((element, args) => {
    const rect = element.getBoundingClientRect();
    const radius = Math.max(24, Math.min(rect.width, rect.height) * 0.34);
    const radians = args.angleDegrees * Math.PI / 180;
    const origin = {
      x: rect.left + rect.width * 0.5,
      y: rect.top + rect.height * 0.55
    };
    const target = {
      x: origin.x + Math.cos(radians) * radius,
      y: origin.y - Math.sin(radians) * radius
    };
    for (const type of ['pointerdown', 'pointermove', 'pointerup'] as const) {
      const point = type === 'pointerdown' ? origin : target;
      element.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: args.pointerId,
        pointerType: 'touch',
        isPrimary: true,
        button: 0,
        buttons: type === 'pointerup' ? 0 : 1,
        clientX: point.x,
        clientY: point.y
      }));
    }
  }, { angleDegrees, pointerId });
}
