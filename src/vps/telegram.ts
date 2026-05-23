import { VpsAccountConfig } from "./types.js";
import { formatBeijingTime } from "./automation.js";

export class TelegramNotifier {
  private readonly token = process.env.NBCOIN_TELEGRAM_BOT_TOKEN;
  private readonly chatId = process.env.NBCOIN_TELEGRAM_CHAT_ID;

  isConfigured(): boolean {
    return Boolean(this.token && this.chatId);
  }

  async sendSuccess(account: VpsAccountConfig, nextRunAt: string | null): Promise<void> {
    await this.send(
      [
        "NBCOIN 签到成功",
        `账号：${account.label}`,
        `时间：${formatBeijingTime(new Date().toISOString())}`,
        `下次执行：${formatBeijingTime(nextRunAt)}`
      ].join("\n")
    );
  }

  async sendFailure(account: VpsAccountConfig, message: string): Promise<void> {
    await this.send(
      [
        "NBCOIN 需要处理",
        `账号：${account.label}`,
        `时间：${formatBeijingTime(new Date().toISOString())}`,
        `原因：${message}`
      ].join("\n")
    );
  }

  private async send(text: string): Promise<void> {
    if (!this.token || !this.chatId) return;
    try {
      const response = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: this.chatId,
          text,
          disable_web_page_preview: true
        })
      });
      if (!response.ok) {
        console.warn(`Telegram 推送失败：HTTP ${response.status}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Telegram 推送失败：${message}`);
    }
  }
}
