# NBCOIN Auto Miner

Electron/Chromium 版是当前主线版本。`NativeAutoCheckin/` 是实验性的原生 SwiftUI/WebKit 版本，NBCOIN 站点在 WebKit 下兼容性不稳定，暂不建议日常使用。

macOS menu bar app for running NBCOIN mining tasks against:

- `https://nbposer.com/#/home`
- `https://nbposer.com/#/mining`

The app uses a Chinese-only interface, stores account passwords in macOS Keychain, keeps one Chromium session per account, reads the mining countdown, waits for the button to change from `Mining...` to `Start`, then clicks it.

## Development

```sh
npm install --registry=https://registry.npmmirror.com
npm run build
npm test
```

## VPS Headless Version

VPS 版不启动 Electron 界面，使用 Playwright/Chromium 在后台运行。它会读取倒计时，写入 `nextRunAt`，然后只在到点时唤醒访问 NBCOIN 页面；到点后每 2 秒检查一次按钮是否变成 `Start`。

1. 准备配置：

```sh
cp vps/accounts.example.json vps/accounts.json
```

编辑 `vps/accounts.json`，把 `username` 改成你的账号。密码建议放到环境变量，不写进配置文件：

```sh
export NBCOIN_PASSWORD_1='你的密码'
```

2. 安装依赖和 Chromium：

```sh
npm install --registry=https://registry.npmmirror.com
npx playwright install chromium
```

3. 前台测试运行一次：

```sh
npm run vps:once
```

4. 常驻运行：

```sh
npm run vps
```

日志会写到 `vps/vps-data/logs/nbcoin-vps.log`，每个账号的独立浏览器登录态会放在 `vps/vps-data/sessions/<账号ID>/`。

### VPS 一键安装

在 Ubuntu/Debian VPS 上运行：

```sh
git clone https://github.com/chyq01/NBMINING.git
cd NBMINING
REPO_URL=https://github.com/chyq01/NBMINING.git sudo -E bash vps/install-vps.sh
```

脚本会安装 Node.js、项目依赖、Playwright Chromium，并创建 `nbcoin-vps` systemd 服务。安装后编辑：

```sh
sudo nano /opt/nbcoin-auto-miner/vps/accounts.json
sudo nano /opt/nbcoin-auto-miner/vps/nbcoin.env
sudo systemctl start nbcoin-vps
sudo journalctl -u nbcoin-vps -f
```

## Security Note

NBCOIN currently presents an expired HTTPS certificate in Chrome. VPS 版固定只访问 `https://nbposer.com/#/mining`，但 Playwright 的证书忽略是浏览器上下文级别；不要把这个 VPS 进程用于访问其他网站。
