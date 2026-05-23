#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/nbcoin-auto-miner}"
REPO_URL="${REPO_URL:-}"
SERVICE_NAME="${SERVICE_NAME:-nbcoin-vps}"
NODE_MAJOR="${NODE_MAJOR:-20}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "请用 root 运行：sudo bash vps/install-vps.sh"
  exit 1
fi

if [[ -z "$REPO_URL" ]]; then
  echo "请先设置仓库地址，例如："
  echo "REPO_URL=https://github.com/chyq01/NBMINING.git sudo -E bash vps/install-vps.sh"
  exit 1
fi

echo "==> 安装系统依赖"
apt-get update
apt-get install -y curl ca-certificates git

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/^v//' | cut -d. -f1)" -lt "$NODE_MAJOR" ]]; then
  echo "==> 安装 Node.js ${NODE_MAJOR}"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi

echo "==> 拉取项目到 ${APP_DIR}"
if [[ -d "$APP_DIR/.git" ]]; then
  git -C "$APP_DIR" pull --ff-only
else
  rm -rf "$APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"

echo "==> 安装 npm 依赖"
npm install --registry=https://registry.npmmirror.com

echo "==> 安装 Chromium 运行环境"
npx playwright install --with-deps chromium

if [[ ! -f vps/accounts.json ]]; then
  cp vps/accounts.example.json vps/accounts.json
  echo "==> 已生成 vps/accounts.json，请填入账号并设置密码环境变量"
fi

echo "==> 构建项目"
npm run build

cat >/etc/systemd/system/${SERVICE_NAME}.service <<SERVICE
[Unit]
Description=NBCOIN VPS Auto Miner
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
EnvironmentFile=-${APP_DIR}/vps/nbcoin.env
ExecStart=/usr/bin/npm run vps:start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
SERVICE

if [[ ! -f vps/nbcoin.env ]]; then
  cat >vps/nbcoin.env <<'ENV'
# 在这里填写账号密码环境变量，变量名要和 vps/accounts.json 里的 passwordEnv 一致
NBCOIN_PASSWORD_1=请改成你的密码
NBCOIN_MONITOR_PASSWORD=请改成监控面板密码
ENV
  chmod 600 vps/nbcoin.env
fi

systemctl daemon-reload
systemctl enable "${SERVICE_NAME}"

echo
echo "安装完成。下一步："
echo "1. 编辑 ${APP_DIR}/vps/accounts.json"
echo "2. 编辑 ${APP_DIR}/vps/nbcoin.env"
echo "3. 启动服务：systemctl start ${SERVICE_NAME}"
echo "4. 查看日志：journalctl -u ${SERVICE_NAME} -f"
echo "5. 监控面板：http://你的VPS-IP:8787"
