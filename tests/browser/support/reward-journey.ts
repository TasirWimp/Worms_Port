import { expect, type Locator, type Page } from '@playwright/test';

type JourneyBoundary = { kind: 'input-epoch' | 'turn'; value: number };

export async function completeCurrentClash(page: Page): Promise<void> {
  for (let shot = 0; shot < 10; shot += 1) {
    if (await playCurrentRound(page, shot + 200)) return;
  }
  throw new Error('Reward Clash did not reach a terminal result within ten player shots.');
}

/** Fires once and waits until the Loomkeeper has answered or the match ends. */
export async function playCurrentRound(page: Page, pointerId = 200): Promise<boolean> {
  const ui = page.locator('.combat-ui');
  await expect.poll(() => currentJourneyState(page), { timeout: 45_000 })
    .toMatch(/^(ready|result)$/);
  if (await page.locator('.result-shell').count()) return true;
  if (await ui.getAttribute('data-selected-relic') !== 'threadball') {
    await selectThreadball(page, ui);
    await expect(ui).toHaveAttribute('data-selected-relic', 'threadball');
  }
  await aimAt(page, 40, pointerId);
  await expect(page.locator('.fire-button')).toBeEnabled();
  const boundary = await ui.evaluate((combat) => {
    const resourceTurns = combat.classList.contains('combat-v9');
    return {
      kind: resourceTurns ? 'input-epoch' as const : 'turn' as const,
      value: Number(resourceTurns
        ? (combat as HTMLElement).dataset.inputEpoch
        : (combat as HTMLElement).dataset.turn)
    };
  });
  await page.locator('.fire-button').tap();
  await expect.poll(() => currentJourneyState(page, boundary), { timeout: 45_000 })
    .toMatch(/^(ready|result)$/);
  return Boolean(await page.locator('.result-shell').count());
}

async function currentJourneyState(
  page: Page,
  minimum: JourneyBoundary | null = null
): Promise<'ready' | 'result' | 'waiting'> {
  return page.evaluate((boundary) => {
    if (document.querySelector('.result-shell')) return 'result';
    const root = document.querySelector<HTMLElement>('.combat-ui');
    if (!root) return 'waiting';
    const resourceTurns = root.classList.contains('combat-v9');
    const currentBoundary = Number(resourceTurns
      ? root.dataset.inputEpoch
      : root.dataset.turn);
    const boundaryAdvanced = !boundary ||
      (boundary.kind === (resourceTurns ? 'input-epoch' : 'turn') &&
        currentBoundary > boundary.value);
    const presentationComplete = resourceTurns
      ? root.dataset.presentation === 'none'
      : root.dataset.presenting === 'false';
    const actionPhase = !resourceTurns || root.dataset.combatPhase === 'action';
    const offenseReady = !resourceTurns || root.dataset.offenseAllowed === 'true';
    return boundaryAdvanced && presentationComplete && actionPhase && offenseReady && root.dataset.activeActor === 'player'
      ? 'ready'
      : 'waiting';
  }, minimum);
}

async function selectThreadball(page: Page, ui: Locator): Promise<void> {
  if (await ui.evaluate((combat) => combat.classList.contains('combat-v9'))) {
    await page.getByRole('button', { name: 'Actions', exact: true }).tap();
    await page.getByRole('button', { name: 'Attack', exact: true }).tap();
    await page.getByRole('button', { name: /^Threadball · 2(?: · Lob)?$/ }).tap();
    return;
  }
  await page.locator('.relic-trigger').tap();
  await expect(page.locator('.relic-chooser')).toBeVisible();
  await page.getByRole('button', { name: 'Select Threadball' }).tap();
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
