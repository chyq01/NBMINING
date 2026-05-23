import { readFile } from "node:fs/promises";
import path from "node:path";
import { VpsAccountConfig, VpsConfig } from "./types.js";
import { formatStatusMessage } from "./status.js";
import { formatBeijingTime } from "./time.js";

type TelegramUpdate = {
  update_id: number;
  message?: {
    text?: string;
    chat?: {
      id?: number | string;
    };
  };
};

export class TelegramNotifier {
  private readonly token = process.env.NBCOIN_TELEGRAM_BOT_TOKEN;
  private readonly chatId = process.env.NBCOIN_TELEGRAM_CHAT_ID;
  private commandLoopStarted = false;

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

  async sendFailure(account: VpsAccountConfig, message: string, screenshotPath?: string | null): Promise<void> {
    const text = [
      "NBCOIN 需要处理",
      `账号：${account.label}`,
      `时间：${formatBeijingTime(new Date().toISOString())}`,
      `原因：${message}`,
      screenshotPath ? `截图：${screenshotPath}` : null
    ]
      .filter(Boolean)
      .join("\n");

    if (screenshotPath) {
      const sentPhoto = await this.sendPhoto(text, screenshotPath);
      if (sentPhoto) return;
    }

    await this.send(text);
  }

  async sendTest(): Promise<void> {
    await this.send(
      [
        "NBCOIN Telegram 测试",
        `时间：${formatBeijingTime(new Date().toISOString())}`,
        "如果你收到这条消息，说明 VPS 推送配置正常。"
      ].join("\n")
    );
  }

  startCommandLoop(config: VpsConfig): void {
    if (!this.token || !this.chatId || this.commandLoopStarted) return;
    this.commandLoopStarted = true;
    void this.commandLoop(config);
  }

  private async commandLoop(config: VpsConfig): Promise<void> {
    let offset = 0;
    while (true) {
      try {
        const updates = await this.getUpdates(offset);
        for (const update of updates) {
          offset = Math.max(offset, update.update_id + 1);
          const text = update.message?.text?.trim() ?? "";
          const chatId = String(update.message?.chat?.id ?? "");
          if (chatId !== this.chatId) continue;

          if (/^\/status(?:@\w+)?\b/i.test(text)) {
            await this.send(formatStatusMessage(config));
          } else if (/^\/(?:start|help)(?:@\w+)?\b/i.test(text)) {
            await this.send("可用命令：/status\n它只读取 VPS 本地状态，不会访问 NBCOIN 官网。");
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Telegram 命令轮询失败：${message}`);
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }
    }
  }

  private async getUpdates(offset: number): Promise<TelegramUpdate[]> {
    if (!this.token) return [];
    const params = new URLSearchParams({
      offset: String(offset),
      timeout: "25",
      allowed_updates: JSON.stringify(["message"])
    });
    const response = await fetch(`https://api.telegram.org/bot${this.token}/getUpdates?${params.toString()}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as { ok?: boolean; result?: TelegramUpdate[]; description?: string };
    if (!payload.ok) throw new Error(payload.description || "Telegram getUpdates 失败");
    return payload.result ?? [];
  }

  private async sendPhoto(text: string, screenshotPath: string): Promise<boolean> {
    if (!this.token || !this.chatId) return false;
    try {
      const bytes = await readFile(screenshotPath);
      const form = new FormData();
      form.append("chat_id", this.chatId);
      form.append("caption", text);
      form.append("photo", new Blob([new Uint8Array(bytes)], { type: "image/png" }), path.basename(screenshotPath));
      const response = await fetch(`https://api.telegram.org/bot${this.token}/sendPhoto`, {
        method: "POST",
        body: form
      });
      if (!response.ok) {
        console.warn(`Telegram 截图推送失败：HTTP ${response.status}`);
        return false;
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Telegram 截图推送失败：${message}`);
      return false;
    }
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
