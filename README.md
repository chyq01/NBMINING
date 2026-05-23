# NBCOIN Auto Miner

VPS 版不启动 Electron 界面，使用 Playwright/Chromium 在后台运行。它会读取倒计时，写入 `nextRunAt`，然后只在到点时唤醒访问 NBCOIN 页面；到点后每 2 秒检查一次按钮是否变成 `Start`。

## VPS 一键安装

在 Ubuntu/Debian VPS 上运行：

```sh
git clone https://github.com/chyq01/NBMINING.git
cd NBMINING
REPO_URL=https://github.com/chyq01/NBMINING.git sudo -E bash vps/install-vps.sh
```

脚本会安装 Node.js、项目依赖、Playwright Chromium，并创建 `nbcoin-vps` systemd 服务。

## 配置账号

编辑账号：

```sh
sudo nano /opt/nbcoin-auto-miner/vps/accounts.json
```

编辑密码和监控面板密码：

```sh
sudo nano /opt/nbcoin-auto-miner/vps/nbcoin.env
```

密码文件示例：

```bash
NBCOIN_PASSWORD_1=你的账号密码
NBCOIN_MONITOR_PASSWORD=你的监控面板密码
```

## 启动和日志

```sh
sudo systemctl start nbcoin-vps
sudo journalctl -u nbcoin-vps -f
```

## 监控面板

VPS 服务会同时启动一个只读监控面板：

```text
http://你的VPS-IP:8787
```

面板显示账号状态、实时剩余时间、下次执行时间和最近日志。默认使用 `NBCOIN_MONITOR_PASSWORD` 作为访问密码。

如果 VPS 防火墙开启了 `ufw`，需要放行端口：

```sh
sudo ufw allow 8787/tcp
```

## 手动运行

```sh
npm install --registry=https://registry.npmmirror.com
npx playwright install chromium
npm run vps:once
npm run vps
```

## Security Note

NBCOIN currently presents an expired HTTPS certificate in Chrome. VPS 版固定只访问 `https://nbposer.com/#/mining`，但 Playwright 的证书忽略是浏览器上下文级别；不要把这个 VPS 进程用于访问其他网站。
