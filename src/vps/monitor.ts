import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { VpsConfig } from "./types.js";
import { formatBeijingTime } from "./automation.js";

type SaveConfig = () => Promise<void>;

export function startMonitorServer(config: VpsConfig, saveConfig: SaveConfig, dataDir: string): void {
  if (!config.settings.monitorEnabled) return;

  const host = config.settings.monitorHost || "0.0.0.0";
  const port = config.settings.monitorPort || 8787;
  const password = config.settings.monitorPasswordEnv ? process.env[config.settings.monitorPasswordEnv] : undefined;

  const server = createServer(async (req, res) => {
    try {
      if (password && !isAuthorized(req, password)) {
        sendBasicAuth(res);
        return;
      }

      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      if (url.pathname === "/api/state") {
        await sendJson(res, await buildState(config, dataDir));
        return;
      }
      if (url.pathname === "/") {
        sendHtml(res, renderPage());
        return;
      }
      res.writeHead(404).end("Not Found");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" }).end(message);
    }
  });

  server.listen(port, host, () => {
    console.log(`监控面板已启动：http://${host}:${port}`);
  });
}

async function buildState(config: VpsConfig, dataDir: string): Promise<unknown> {
  await Promise.resolve();
  const logs = await readRecentLogs(path.join(dataDir, "logs", "nbcoin-vps.log"));
  return {
    now: new Date().toISOString(),
    nowText: formatBeijingTime(new Date().toISOString()),
    accounts: config.accounts.map((account) => ({
      id: account.id,
      label: account.label,
      username: maskUsername(account.username),
      enabled: account.enabled,
      lastStatus: account.lastStatus,
      lastMessage: account.lastMessage,
      nextRunAt: account.nextRunAt,
      nextRunAtText: formatBeijingTime(account.nextRunAt),
      remainingText: formatRemaining(account.nextRunAt),
      updatedAtText: formatBeijingTime(account.updatedAt)
    })),
    logs
  };
}

async function readRecentLogs(filePath: string): Promise<string[]> {
  try {
    const raw = await readFile(filePath, "utf8");
    return raw.trim().split("\n").slice(-80).reverse();
  } catch {
    return [];
  }
}

function formatRemaining(nextRunAt: string | null): string {
  if (!nextRunAt) return "待识别";
  const diff = new Date(nextRunAt).getTime() - Date.now();
  if (!Number.isFinite(diff)) return "待识别";
  if (diff <= 0) return "已到点";
  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function maskUsername(username: string): string {
  const [name, domain] = username.split("@");
  if (!domain) return username.length <= 4 ? username : `${username.slice(0, 2)}***${username.slice(-2)}`;
  const visible = name.length <= 3 ? name.slice(0, 1) : name.slice(0, 3);
  return `${visible}***@${domain}`;
}

function isAuthorized(req: IncomingMessage, password: string): boolean {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Basic ")) return false;
  const decoded = Buffer.from(auth.slice("Basic ".length), "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  const provided = separator >= 0 ? decoded.slice(separator + 1) : "";
  return provided === password;
}

function sendBasicAuth(res: ServerResponse): void {
  res.writeHead(401, {
    "www-authenticate": 'Basic realm="NBCOIN Monitor"',
    "content-type": "text/plain; charset=utf-8"
  });
  res.end("需要监控密码");
}

async function sendJson(res: ServerResponse, payload: unknown): Promise<void> {
  res.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function sendHtml(res: ServerResponse, html: string): void {
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(html);
}

function renderPage(): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>NBCOIN VPS 监控</title><style>*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f6f3ef;color:#222}header{padding:24px 28px;border-bottom:1px solid #ddd6ce;background:#fffaf4;display:flex;justify-content:space-between;gap:16px;align-items:end}h1{margin:0;font-size:28px}main{padding:24px 28px;max-width:1180px;margin:0 auto}.meta{color:#6e6861;font-size:14px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}.card{background:white;border:1px solid #ded8d0;border-radius:8px;padding:18px}.name{font-size:22px;font-weight:800;margin-bottom:4px}.user{color:#777;margin-bottom:14px}.badge{display:inline-flex;padding:5px 10px;border-radius:999px;background:#e4f0ff;color:#0767c8;font-weight:700;font-size:13px}.row{margin-top:12px;display:flex;justify-content:space-between;gap:14px}.label{color:#777}.value{font-weight:750;text-align:right}.message{margin-top:14px;color:#625d56;min-height:20px}.logs{margin-top:22px;background:#161616;color:#e7e0d6;border-radius:8px;padding:16px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;overflow:auto;max-height:420px}.log-line{white-space:pre-wrap;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.06)}</style></head><body><header><div><h1>NBCOIN VPS 监控</h1><div class="meta" id="now">正在加载</div></div><div class="meta">每 5 秒自动刷新</div></header><main><section class="grid" id="accounts"></section><section class="logs" id="logs"></section></main><script>const statusText={loggedOut:"未登录",loggingIn:"登录中",readingCountdown:"读取状态",waitingCountdown:"等待倒计时",waitingStartButton:"等待 Start",miningStarted:"已签到",needsManual:"需要处理",failed:"失败"};async function load(){const res=await fetch('/api/state',{cache:'no-store'});const data=await res.json();document.getElementById('now').textContent='北京时间 '+data.nowText;document.getElementById('accounts').innerHTML=data.accounts.map((account)=>`<article class="card"><div class="name">${escapeHtml(account.label)}</div><div class="user">${escapeHtml(account.username)}</div><span class="badge">${escapeHtml(statusText[account.lastStatus]||account.lastStatus)}</span><div class="row"><span class="label">实时剩余</span><span class="value">${escapeHtml(account.remainingText)}</span></div><div class="row"><span class="label">下次执行</span><span class="value">${escapeHtml(account.nextRunAtText)}</span></div><div class="row"><span class="label">最后更新</span><span class="value">${escapeHtml(account.updatedAtText)}</span></div><div class="message">${escapeHtml(account.lastMessage||'暂无消息')}</div></article>`).join('');document.getElementById('logs').innerHTML=(data.logs.length?data.logs:['暂无日志']).map((line)=>`<div class="log-line">${escapeHtml(line)}</div>`).join('')}function escapeHtml(value){return String(value).replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}load();setInterval(load,5000)</script></body></html>`;
}
