import { mkdir, appendFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { nextRunFromCountdown, parseCountdownToMs } from "../shared/mining.js";
import { MINING_URL, MiningSnapshot, NBCOIN_HOST, RunResult } from "../shared/types.js";
import { VpsAccountConfig, VpsConfig } from "./types.js";
import { TelegramNotifier } from "./telegram.js";
import { formatBeijingTime } from "./time.js";

type BrowserContextLike = {
  newPage(): Promise<PageLike>;
  close(): Promise<void>;
};

type PageLike = {
  goto(url: string, options?: Record<string, unknown>): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  evaluate<T>(pageFunction: string | (() => T | Promise<T>), arg?: unknown): Promise<T>;
  screenshot(options: Record<string, unknown>): Promise<Buffer>;
  close(): Promise<void>;
  isClosed(): boolean;
};

type ChromiumLike = {
  launchPersistentContext(userDataDir: string, options: Record<string, unknown>): Promise<BrowserContextLike>;
};

const dynamicImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<unknown>;

export class VpsAutomationService {
  private readonly dataDir: string;
  private readonly logFile: string;
  private readonly telegram = new TelegramNotifier();

  constructor(
    private readonly config: VpsConfig,
    private readonly saveConfig: () => Promise<void>,
    dataDir: string
  ) {
    this.dataDir = dataDir;
    this.logFile = path.join(dataDir, "logs", "nbcoin-vps.log");
  }

  async runDueAccounts(): Promise<void> {
    const now = Date.now();
    const dueAccounts = this.config.accounts.filter((account) => {
      if (!account.enabled) return false;
      if (account.lastStatus === "waitingStartButton") return true;
      if (!account.nextRunAt) return this.config.settings.autoRefreshOnStart;
      return new Date(account.nextRunAt).getTime() <= now;
    });

    if (dueAccounts.length === 0) return;
    for (const account of dueAccounts) {
      await this.runAccount(account);
      await delay(this.config.settings.accountIntervalSeconds * 1000);
    }
  }

  async runAccount(account: VpsAccountConfig): Promise<RunResult> {
    const attempts = Math.max(1, this.config.settings.maxRetryAttempts + 1);
    let result: RunResult | null = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      if (attempt > 1) {
        await this.log(account, "warn", `第 ${attempt}/${attempts} 次重试`);
        await delay(2500);
      }
      result = await this.runSingleAttempt(account);
      if (!["failed", "needsManual"].includes(result.status)) return result;
      if (result.status === "needsManual") return result;
    }
    return result ?? this.result(account, "failed", null, null, "未知执行失败");
  }

  private async runSingleAttempt(account: VpsAccountConfig): Promise<RunResult> {
    await this.updateAccount(account, "readingCountdown", "正在打开挖矿页并读取状态。");
    await this.log(account, "info", "开始执行账号");

    const { context, page } = await this.openAccountPage(account);
    try {
      let snapshot = await this.readSnapshot(page);
      if (snapshot.pageKind === "login" || snapshot.hasPasswordInput) {
        const password = this.resolvePassword(account);
        if (!password) {
          return await this.needsManual(account, "没有找到密码。请设置 passwordEnv 对应的环境变量。", page);
        }
        await this.updateAccount(account, "loggingIn", "检测到登录页，正在自动登录。");
        const didLogin = await this.performLogin(page, account.username, password);
        if (!didLogin) {
          return await this.needsManual(account, "自动填写或点击登录失败。", page);
        }
        await page.goto(MINING_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
        await page.waitForTimeout(2500);
        snapshot = await this.readSnapshot(page);
      }

      if (snapshot.hasCaptchaHint) {
        return await this.needsManual(account, "检测到验证码或人机验证。", page);
      }

      if (snapshot.hasCompletedReward) {
        return await this.markAlreadyCompleted(account, snapshot);
      }

      const countdownMs = parseCountdownToMs(snapshot.countdownText);
      if (countdownMs !== null && countdownMs > 0) {
        const nextRunAt = nextRunFromCountdown(snapshot.countdownText);
        await this.updateAccount(account, "waitingCountdown", `等待倒计时结束：${snapshot.countdownText}`, nextRunAt);
        await this.log(account, "info", `倒计时 ${snapshot.countdownText}，已安排北京时间 ${formatBeijingTime(nextRunAt)}`);
        return this.result(account, "waitingCountdown", snapshot.countdownText, nextRunAt, "等待倒计时结束");
      }

      if (snapshot.hasStartButton) {
        return await this.clickStartAndConfirm(account, page);
      }

      return await this.waitForStartButton(account, page, snapshot);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const screenshotPath = await this.captureScreenshot(account, page, "failed");
      await this.updateAccount(account, "failed", message);
      await this.log(account, "error", message);
      await this.telegram.sendFailure(account, message, screenshotPath);
      return this.result(account, "failed", null, null, message);
    } finally {
      if (!page.isClosed()) await page.close();
      await context.close();
    }
  }

  private async openAccountPage(account: VpsAccountConfig): Promise<{ context: BrowserContextLike; page: PageLike }> {
    const playwright = (await dynamicImport("playwright")) as { chromium: ChromiumLike };
    const sessionDir = path.join(this.dataDir, "sessions", account.id);
    await mkdir(sessionDir, { recursive: true });
    const context = await playwright.chromium.launchPersistentContext(sessionDir, {
      headless: this.config.settings.headless,
      ignoreHTTPSErrors: true,
      viewport: { width: 430, height: 780 },
      args: ["--no-sandbox", "--disable-dev-shm-usage"]
    });
    const page = await context.newPage();
    await page.goto(MINING_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(2500);
    return { context, page };
  }

  private resolvePassword(account: VpsAccountConfig): string | null {
    if (account.passwordEnv && process.env[account.passwordEnv]) return process.env[account.passwordEnv] as string;
    return account.password ?? null;
  }

  private async performLogin(page: PageLike, username: string, password: string): Promise<boolean> {
    const didSubmit = await page.evaluate<boolean>(
      `
      (() => {
        const visible = (el) => {
          const style = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
        };
        const inputs = Array.from(document.querySelectorAll('input')).filter(visible);
        const userInput = inputs.find((input) => /text|email|tel|number/.test(input.type || 'text')) || inputs[0];
        const passInput = inputs.find((input) => input.type === 'password');
        const setValue = (input, value) => {
          input.focus();
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        };
        if (userInput) setValue(userInput, ${JSON.stringify(username)});
        if (passInput) setValue(passInput, ${JSON.stringify(password)});
        const buttons = Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"]')).filter(visible);
        const loginButton = buttons.find((button) => /login|sign in|登录/i.test(button.innerText || button.value || '')) || buttons[buttons.length - 1];
        if (loginButton) loginButton.click();
        return Boolean(userInput && passInput && loginButton);
      })()
      `
    );
    await page.waitForTimeout(5000);
    return didSubmit;
  }

  private async waitForStartButton(account: VpsAccountConfig, page: PageLike, initialSnapshot: MiningSnapshot): Promise<RunResult> {
    if (!initialSnapshot.hasMiningButton && !initialSnapshot.hasStartButton && !initialSnapshot.countdownText) {
      return await this.needsManual(account, `没有读到倒计时或按钮。页面片段：${initialSnapshot.textSample ?? "未知"}`, page);
    }

    await this.updateAccount(account, "waitingStartButton", "倒计时已结束，等待 Start 按钮出现。", null);
    const deadline = Date.now() + this.config.settings.maxStartWaitMinutes * 60 * 1000;
    let pollCount = 0;

    while (Date.now() < deadline) {
      const snapshot = await this.readSnapshot(page);
      if (snapshot.hasCompletedReward) {
        return await this.markAlreadyCompleted(account, snapshot);
      }

      const countdownMs = parseCountdownToMs(snapshot.countdownText);
      if (countdownMs !== null && countdownMs > 0) {
        const nextRunAt = nextRunFromCountdown(snapshot.countdownText);
        await this.updateAccount(account, "waitingCountdown", `等待倒计时结束：${snapshot.countdownText}`, nextRunAt);
        await this.log(account, "info", `重新读到倒计时 ${snapshot.countdownText}，已安排北京时间 ${formatBeijingTime(nextRunAt)}`);
        return this.result(account, "waitingCountdown", snapshot.countdownText, nextRunAt, "等待倒计时结束");
      }

      if (snapshot.hasStartButton) {
        return await this.clickStartAndConfirm(account, page);
      }

      if (pollCount > 0 && pollCount % 15 === 0) {
        await this.log(account, "info", "仍未看到 Start，刷新挖矿页后继续等待。");
        await page.goto(MINING_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
        await page.waitForTimeout(2500);
      }

      pollCount += 1;
      await delay(this.config.settings.pollIntervalSeconds * 1000);
    }

    return await this.needsManual(account, `${this.config.settings.maxStartWaitMinutes} 分钟内没有等到 Start 按钮。`, page);
  }

  private async clickStartAndConfirm(account: VpsAccountConfig, page: PageLike): Promise<RunResult> {
    const clicked = await page.evaluate<boolean>(
      `
      (() => {
        const visible = (el) => {
          const style = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
        };
        const clickable = (el) => {
          const tag = el.tagName.toLowerCase();
          const role = (el.getAttribute('role') || '').toLowerCase();
          const className = String(el.className || '');
          const style = window.getComputedStyle(el);
          return tag === 'button' || tag === 'a' || role === 'button' || style.cursor === 'pointer' || /\\b(btn|button|van-button|adm-button)\\b/i.test(className) || typeof el.onclick === 'function';
        };
        const candidates = Array.from(document.querySelectorAll('button, [role="button"], a, div, span'))
          .filter(visible)
          .filter((el) => (el.innerText || el.textContent || '').trim().toLowerCase() === 'start')
          .sort((a, b) => {
            const ar = a.getBoundingClientRect();
            const br = b.getBoundingClientRect();
            return (ar.width * ar.height) - (br.width * br.height);
          });
        const textNode = candidates[0];
        if (!textNode) return false;
        const target = textNode.closest('button, [role="button"], a') || textNode;
        target.scrollIntoView({ block: 'center', inline: 'center' });
        const rect = target.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
          target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y }));
        }
        return true;
      })()
      `
    );

    if (!clicked) {
      return await this.needsManual(account, "找到 Start 状态后点击失败。", page);
    }

    let snapshot = await this.readSnapshot(page);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await delay(2500);
      snapshot = await this.readSnapshot(page);
      if (parseCountdownToMs(snapshot.countdownText) !== null) break;
    }

    const nextRunAt = nextRunFromCountdown(snapshot.countdownText);
    await this.updateAccount(
      account,
      "miningStarted",
      nextRunAt ? `已点击 Start，刷新到剩余时间：${snapshot.countdownText}` : "已点击 Start，等待下次识别。",
      nextRunAt
    );
    await this.log(account, "info", `已点击 Start，下一次北京时间 ${formatBeijingTime(nextRunAt)}`);
    await this.telegram.sendSuccess(account, nextRunAt);
    return this.result(account, "miningStarted", snapshot.countdownText, nextRunAt, "已开始挖矿");
  }

  private async markAlreadyCompleted(account: VpsAccountConfig, snapshot: MiningSnapshot): Promise<RunResult> {
    const nextRunAt = nextRunFromCountdown(snapshot.countdownText) ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await this.updateAccount(account, "miningStarted", "页面显示 Mining Reward Completed，已视为签到成功。", nextRunAt);
    await this.log(account, "info", `页面显示已完成签到，下一次北京时间 ${formatBeijingTime(nextRunAt)}`);
    await this.telegram.sendSuccess(account, nextRunAt);
    return this.result(account, "miningStarted", snapshot.countdownText, nextRunAt, "页面显示已完成签到");
  }

  private async readSnapshot(page: PageLike): Promise<MiningSnapshot> {
    let latest = await this.readSnapshotOnce(page);
    for (let attempt = 0; attempt < 12; attempt += 1) {
      if (
        latest.pageKind === "login" ||
        latest.hasPasswordInput ||
        latest.hasStartButton ||
        latest.hasMiningButton ||
        parseCountdownToMs(latest.countdownText) !== null
      ) {
        return latest;
      }
      await delay(1000);
      latest = await this.readSnapshotOnce(page);
    }
    return latest;
  }

  private async readSnapshotOnce(page: PageLike): Promise<MiningSnapshot> {
    return await page.evaluate<MiningSnapshot>(
      `
      (() => {
        const url = location.href;
        const host = location.hostname;
        const text = document.body ? document.body.innerText : '';
        const inputs = Array.from(document.querySelectorAll('input'));
        const hasPasswordInput = inputs.some((input) => input.type === 'password');
        const isVisible = (el) => {
          const style = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
        };
        const toSeconds = (value) => {
          const match = value.match(/\\b(\\d{1,2}):(\\d{2}):(\\d{2})\\b/);
          if (!match) return null;
          const hours = Number(match[1]);
          const minutes = Number(match[2]);
          const seconds = Number(match[3]);
          if (minutes > 59 || seconds > 59 || hours > 23) return null;
          return hours * 3600 + minutes * 60 + seconds;
        };
        const visibleCountdowns = Array.from(document.querySelectorAll('body *'))
          .filter(isVisible)
          .map((el) => (el.innerText || el.textContent || '').trim())
          .filter((value) => value.length > 0 && value.length <= 80)
          .flatMap((value) => Array.from(value.matchAll(/\\b\\d{1,2}:\\d{2}:\\d{2}\\b/g)).map((match) => match[0]))
          .map((value) => ({ value, seconds: toSeconds(value) }))
          .filter((item) => item.seconds !== null);
        const nonZeroCountdowns = visibleCountdowns.filter((item) => item.seconds > 0);
        const selectedCountdown = (nonZeroCountdowns.length ? nonZeroCountdowns : visibleCountdowns)
          .sort((a, b) => b.seconds - a.seconds)[0]?.value || null;
        const elements = Array.from(document.querySelectorAll('button, [role="button"], a, input[type="button"], input[type="submit"], div, span')).filter(isVisible);
        const buttonTexts = elements
          .map((el) => (el.innerText || '').trim())
          .filter(Boolean)
          .filter((value) => value.length <= 40);
        const hasStartButton = buttonTexts.some((value) => value.toLowerCase() === 'start');
        const miningButton = buttonTexts.find((value) => value.toLowerCase().includes('mining')) || null;
        const hasCompletedReward = /Mining\\s+Reward\\s+Completed/i.test(text) || /挖矿奖励\\s*已完成/i.test(text);
        const hasCaptchaHint = /captcha|verify|verification|human|滑块|验证码|人机/i.test(text);
        const looksLogin = hasPasswordInput || /login|sign in|登录/i.test(text);
        const looksMining = host === ${JSON.stringify(NBCOIN_HOST)} && (url.includes('#/mining') || /\\bMining\\b/i.test(text) || selectedCountdown || hasStartButton || miningButton);
        let pageKind = 'unknown';
        if (looksLogin) pageKind = 'login';
        else if (looksMining) pageKind = 'mining';
        else if (/NBCOIN/i.test(text)) pageKind = 'home';
        return {
          pageKind,
          urlText: url,
          countdownText: selectedCountdown,
          buttonText: hasStartButton ? 'Start' : miningButton,
          hasStartButton,
          hasMiningButton: Boolean(miningButton),
          hasPasswordInput,
          hasCaptchaHint,
          hasCompletedReward,
          textSample: text.replace(/\\s+/g, ' ').trim().slice(0, 260)
        };
      })()
      `
    );
  }

  private async needsManual(account: VpsAccountConfig, message: string, page?: PageLike): Promise<RunResult> {
    const screenshotPath = page ? await this.captureScreenshot(account, page, "needs-manual") : null;
    await this.updateAccount(account, "needsManual", message);
    await this.log(account, "warn", message);
    await this.telegram.sendFailure(account, message, screenshotPath);
    return this.result(account, "needsManual", null, null, message);
  }

  private async captureScreenshot(account: VpsAccountConfig, page: PageLike, reason: string): Promise<string | null> {
    try {
      const safeReason = reason.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const screenshotsDir = path.join(this.dataDir, "screenshots");
      await mkdir(screenshotsDir, { recursive: true });
      const screenshotPath = path.join(screenshotsDir, `${account.id}-${safeReason}-${stamp}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      account.lastScreenshotPath = screenshotPath;
      await this.saveConfig();
      return screenshotPath;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.log(account, "warn", `保存异常截图失败：${message}`);
      return null;
    }
  }

  private async updateAccount(account: VpsAccountConfig, status: VpsAccountConfig["lastStatus"], message: string, nextRunAt = account.nextRunAt): Promise<void> {
    account.lastStatus = status;
    account.lastMessage = message;
    account.nextRunAt = nextRunAt;
    account.updatedAt = new Date().toISOString();
    await this.saveConfig();
  }

  private async log(account: VpsAccountConfig | null, level: "info" | "warn" | "error", message: string): Promise<void> {
    const line = `${formatBeijingTime(new Date().toISOString())} ${level} ${account ? `[${account.label}] ` : ""}${message}`;
    console.log(line);
    await mkdir(path.dirname(this.logFile), { recursive: true });
    await appendFile(this.logFile, `${line}\n`);
  }

  private result(account: VpsAccountConfig, status: RunResult["status"], countdownText: string | null, nextRunAt: string | null, message: string): RunResult {
    return {
      accountId: account.id,
      status,
      countdownText,
      nextRunAt,
      message,
      timestamp: new Date().toISOString()
    };
  }
}
