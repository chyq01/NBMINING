import { VpsConfig } from "./types.js";
import { formatBeijingTime, formatRemainingText } from "./time.js";

const statusLabels: Record<string, string> = {
  loggedOut: "未登录",
  loggingIn: "登录中",
  readingCountdown: "读取状态",
  waitingCountdown: "等待倒计时",
  waitingStartButton: "等待 Start",
  miningStarted: "已签到",
  needsManual: "需要处理",
  failed: "失败"
};

export function formatStatusMessage(config: VpsConfig): string {
  const now = Date.now();
  const enabledAccounts = config.accounts.filter((account) => account.enabled);
  const dueAccounts = enabledAccounts.filter((account) => account.lastStatus === "waitingStartButton" || (account.nextRunAt && new Date(account.nextRunAt).getTime() <= now));
  const nextWake = enabledAccounts
    .filter((account) => account.nextRunAt)
    .map((account) => ({ account, time: new Date(account.nextRunAt as string).getTime() }))
    .filter((item) => Number.isFinite(item.time) && item.time > now)
    .sort((a, b) => a.time - b.time)[0];

  const lines = [
    "NBCOIN VPS 状态",
    `北京时间：${formatBeijingTime(new Date().toISOString())}`,
    `账号：${config.accounts.length} 个，启用 ${enabledAccounts.length} 个`,
    dueAccounts.length
      ? `下次唤醒：已有 ${dueAccounts.length} 个账号到点，正在/即将处理`
      : nextWake
      ? `下次唤醒：${formatBeijingTime(nextWake.account.nextRunAt)}（${nextWake.account.label}，剩余 ${formatRemainingText(nextWake.account.nextRunAt)}）`
      : "下次唤醒：待识别",
    ""
  ];

  for (const account of config.accounts) {
    lines.push(
      [
        `【${account.label}】${account.enabled ? "启用" : "暂停"} / ${statusLabels[account.lastStatus] ?? account.lastStatus}`,
        `剩余：${formatRemainingText(account.nextRunAt)}`,
        `下次：${formatBeijingTime(account.nextRunAt)}`,
        `消息：${account.lastMessage || "暂无"}`
      ].join("\n")
    );
  }

  return lines.join("\n");
}
