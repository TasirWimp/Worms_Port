import type { Page } from '@playwright/test';

export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const ZERO_SAFE_AREA: SafeAreaInsets = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0
};

export const SYNTHETIC_SAFE_AREA: SafeAreaInsets = {
  top: 18,
  right: 14,
  bottom: 22,
  left: 12
};

export async function applySyntheticSafeArea(
  page: Page,
  insets: SafeAreaInsets
): Promise<void> {
  await page.evaluate((next) => {
    const root = document.documentElement;
    root.style.setProperty('--native-safe-area-top', `${next.top}px`);
    root.style.setProperty('--native-safe-area-right', `${next.right}px`);
    root.style.setProperty('--native-safe-area-bottom', `${next.bottom}px`);
    root.style.setProperty('--native-safe-area-left', `${next.left}px`);
    window.dispatchEvent(new Event('resize'));
  }, insets);
  await page.waitForFunction((expected) => {
    const style = getComputedStyle(document.documentElement);
    return Number.parseFloat(style.getPropertyValue('--safe-area-top')) === expected.top &&
      Number.parseFloat(style.getPropertyValue('--safe-area-right')) === expected.right &&
      Number.parseFloat(style.getPropertyValue('--safe-area-bottom')) === expected.bottom &&
      Number.parseFloat(style.getPropertyValue('--safe-area-left')) === expected.left;
  }, insets);
}

export async function readSafeArea(page: Page): Promise<SafeAreaInsets> {
  return page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return {
      top: Number.parseFloat(style.getPropertyValue('--safe-area-top')),
      right: Number.parseFloat(style.getPropertyValue('--safe-area-right')),
      bottom: Number.parseFloat(style.getPropertyValue('--safe-area-bottom')),
      left: Number.parseFloat(style.getPropertyValue('--safe-area-left'))
    };
  });
}
