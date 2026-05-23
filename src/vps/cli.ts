#!/usr/bin/env node
import { DEFAULT_VPS_CONFIG_PATH, loadVpsConfig, resolveDataPath, saveVpsConfig } from "./config.js";
import { VpsAutomationService } from "./automation.js";
import { VpsRunOptions } from "./types.js";
import { startMonitorServer } from "./monitor.js";
import { TelegramNotifier } from "./telegram.js";
import { runDoctor } from "./doctor.js";
import { formatBeijingTime } from "./time.js";

const args = process.argv.slice(2);

function readOption(name: string): string | undefined {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];
  return undefined;
}

function parseOptions(): { configPath: string; options: VpsRunOptions } {
  return {
    configPath: readOption("--config") ?? process.env.NBCOIN_CONFIG ?? DEFAULT_VPS_CONFIG_PATH,
    options: {
      once: args.includes("--once"),
      testTelegram: args.includes("--test-telegram"),
      doctor: args.includes("--doctor"),
      accountId: readOption("--account")
    }
  };
}

async function main(): Promise<void> {
  const { configPath, options } = parseOptions();
  const config = await loadVpsConfig(configPath);
  const dataDir = resolveDataPath(configPath, config.settings.dataDir);
  const service = new VpsAutomationService(config, () => saveVpsConfig(configPath, config), dataDir);

  if (options.testTelegram) {
    await new TelegramNotifier().sendTest();
    return;
  }

  if (options.doctor) {
    const ok = await runDoctor(configPath, config, dataDir);
    if (!ok) process.exitCode = 1;
    return;
  }

  if (options.accountId) {
    const account = config.accounts.find((item) => item.id === options.accountId || item.label === options.accountId || item.username === options.accountId);
    if (!account) throw new Error(`找不到账号：${options.accountId}`);
    await service.runAccount(account);
    return;
  }

  if (options.once) {
    await service.runDueAccounts();
    return;
  }

  console.log(`NBCOIN VPS 自动签到已启动。配置：${configPath}`);
  startMonitorServer(config, () => saveVpsConfig(configPath, config), dataDir);
  new TelegramNotifier().startCommandLoop(config);
  await service.runDueAccounts();
  scheduleLoop(config, service);
}

function scheduleLoop(config: Awaited<ReturnType<typeof loadVpsConfig>>, service: VpsAutomationService): void {
  const next = config.accounts
    .filter((account) => account.enabled && account.nextRunAt)
    .map((account) => ({ account, time: new Date(account.nextRunAt as string).getTime() }))
    .filter((item) => Number.isFinite(item.time))
    .sort((a, b) => a.time - b.time)[0];

  if (!next) {
    console.log("没有可安排的下次执行时间。10 分钟后重新检查本地配置。");
    setTimeout(() => scheduleLoop(config, service), 10 * 60 * 1000);
    return;
  }

  const delayMs = Math.max(0, next.time - Date.now());
  console.log(`已安排下次唤醒：北京时间 ${formatBeijingTime(next.account.nextRunAt)}（${next.account.label}）`);
  setTimeout(async () => {
    await service.runDueAccounts();
    scheduleLoop(config, service);
  }, delayMs);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
