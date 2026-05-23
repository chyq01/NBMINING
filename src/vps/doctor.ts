import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { VpsConfig } from "./types.js";

const dynamicImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<unknown>;

export async function runDoctor(configPath: string, config: VpsConfig, dataDir: string): Promise<boolean> {
  const results: Array<{ ok: boolean; message: string }> = [];

  const nodeMajor = Number(process.versions.node.split(".")[0]);
  results.push({
    ok: nodeMajor >= 20,
    message: `Node.js ${process.version}${nodeMajor >= 20 ? "" : "，建议升级到 20 或更高"}`
  });

  results.push({
    ok: config.accounts.length > 0,
    message: `账号配置：${config.accounts.length} 个账号，${config.accounts.filter((account) => account.enabled).length} 个启用`
  });

  for (const account of config.accounts.filter((item) => item.enabled)) {
    const hasPassword = Boolean(account.password || (account.passwordEnv && process.env[account.passwordEnv]));
    results.push({
      ok: hasPassword,
      message: `${account.label} 密码环境变量：${hasPassword ? "已配置" : `缺少 ${account.passwordEnv || "password"}`}`
    });
  }

  const monitorPasswordEnv = config.settings.monitorPasswordEnv || "NBCOIN_MONITOR_PASSWORD";
  results.push({
    ok: Boolean(process.env[monitorPasswordEnv]),
    message: `监控面板密码：${process.env[monitorPasswordEnv] ? "已配置" : `缺少 ${monitorPasswordEnv}`}`
  });

  const telegramReady = Boolean(process.env.NBCOIN_TELEGRAM_BOT_TOKEN && process.env.NBCOIN_TELEGRAM_CHAT_ID);
  results.push({
    ok: telegramReady,
    message: `Telegram：${telegramReady ? "已配置" : "未配置，自动签到仍可运行但不会推送手机通知"}`
  });

  try {
    await dynamicImport("playwright");
    results.push({ ok: true, message: "Playwright：可导入" });
  } catch (error) {
    results.push({ ok: false, message: `Playwright：不可用，${error instanceof Error ? error.message : String(error)}` });
  }

  try {
    await mkdir(dataDir, { recursive: true });
    const probeFile = path.join(dataDir, ".doctor-write-test");
    await writeFile(probeFile, "ok");
    await unlink(probeFile);
    results.push({ ok: true, message: `数据目录可写：${dataDir}` });
  } catch (error) {
    results.push({ ok: false, message: `数据目录不可写：${error instanceof Error ? error.message : String(error)}` });
  }

  console.log(`NBCOIN VPS 自检：${configPath}`);
  for (const item of results) {
    console.log(`${item.ok ? "OK" : "FAIL"} ${item.message}`);
  }

  return results.every((item) => item.ok || item.message.startsWith("Telegram"));
}
