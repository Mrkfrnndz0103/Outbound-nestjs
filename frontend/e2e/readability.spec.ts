import { expect, test } from "@playwright/test";
import { mockShellSession } from "./helpers/shell-session";

for (const width of [1280, 390, 683]) {
  test(`login stays readable and usable without scaling at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 683 ? 360 : 800 });
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
    await page.route("**/api/**", (route) => route.fulfill({ json: { data: [] } }));
    await page.goto("/login");
    const dialog = page.getByRole("dialog", { name: "Sign in to SOC 5 Outbound" });
    await expect(dialog).toBeVisible();
    const metrics = await dialog.evaluate((element) => {
      const input = element.querySelector<HTMLInputElement>('#email-input')!;
      const button = element.querySelector<HTMLButtonElement>('button[type="submit"]')!;
      const bounds = element.getBoundingClientRect();
      return {
        scale: Number(getComputedStyle(element).zoom),
        inputFont: Number.parseFloat(getComputedStyle(input).fontSize),
        buttonHeight: button.getBoundingClientRect().height,
        bounds: { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom },
        width: window.innerWidth, height: window.innerHeight,
      };
    });
    expect(metrics.scale).toBe(1);
    expect(metrics.inputFont).toBeGreaterThanOrEqual(16);
    expect(metrics.buttonHeight).toBeGreaterThanOrEqual(44);
    expect(metrics.bounds.left).toBeGreaterThanOrEqual(0);
    expect(metrics.bounds.right).toBeLessThanOrEqual(metrics.width);
    expect(metrics.bounds.top).toBeGreaterThanOrEqual(0);
    expect(metrics.bounds.bottom).toBeLessThanOrEqual(metrics.height);
    await page.getByLabel("Work email").fill("operator@spxexpress.com");
    await page.getByRole("button", { name: "Continue with Google" }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeInViewport();
    await page.getByRole("tab", { name: "Backroom" }).click();
    await page.getByLabel("Ops ID").fill("OPS123");
    await page.getByRole("button", { name: "Forgot password?" }).scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: "Forgot password?" }).click();
    await expect(page.getByRole("dialog", { name: "Forgot password" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.screenshot({ path: testInfo.outputPath("readable-login.png") });
  });
}

test("login text and primary action have readable colors independent of shell theme", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  await page.route("**/api/**", (route) => route.fulfill({ json: { data: [] } }));
  await page.goto("/login");
  const dialog = page.getByRole("dialog", { name: "Sign in to SOC 5 Outbound" });
  await expect(dialog).toBeVisible();
  const contrast = await dialog.evaluate((element) => {
    const channels = (color: string) => color.match(/[\d.]+/g)!.slice(0, 3).map(Number);
    const luminance = (rgb: number[]) => rgb.map((v) => {
      v /= 255;
      return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
    }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    const ratio = (a: number[], b: number[]) => {
      const values = [luminance(a), luminance(b)].sort((x, y) => x - y);
      return (values[1] + .05) / (values[0] + .05);
    };
    const label = element.querySelector('label[for="email-input"]')!;
    const description = element.querySelector('form p')!;
    const button = element.querySelector('button[type="submit"]')!;
    const background = channels(getComputedStyle(element).backgroundColor);
    const probe = document.createElement("span");
    probe.style.color = "var(--color-auth-accent)";
    element.append(probe);
    const actionBackground = channels(getComputedStyle(probe).color);
    probe.remove();
    return {
      label: ratio(channels(getComputedStyle(label).color), background),
      description: ratio(channels(getComputedStyle(description).color), background),
      action: ratio(channels(getComputedStyle(button).color), actionBackground),
    };
  });
  expect(contrast.label).toBeGreaterThanOrEqual(4.5);
  expect(contrast.description).toBeGreaterThanOrEqual(4.5);
  expect(contrast.action).toBeGreaterThanOrEqual(4.5);
});

test("the workspace keeps natural text sizing and portal menus follow the selected theme", async ({ page }, testInfo) => {
  await mockShellSession(page);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Hourly Throughput" })).toBeVisible();
  await expect(page.locator(".app-shell")).toHaveCSS("zoom", "1");
  const account = page.getByRole("button", { name: "Shell test user" });
  await account.click();
  const menu = page.getByRole("menu");
  const lightBackground = await menu.evaluate((element) => getComputedStyle(element).backgroundColor);
  await page.getByRole("menuitem", { name: "Dark Mode" }).click();
  await account.click();
  const darkBackground = await menu.evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(darkBackground).not.toBe(lightBackground);
  await page.getByRole("menuitem", { name: "Light Mode" }).click();
  await page.screenshot({ path: testInfo.outputPath("readable-workspace.png") });
});
