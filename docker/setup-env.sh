#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ -e .env ]; then
  echo '.env 已存在，保留现有配置。'
  exit 0
fi
if ! command -v openssl >/dev/null 2>&1; then
  echo '需要 openssl 生成数据库随机口令。' >&2
  exit 1
fi
umask 077
app_password=$(openssl rand -hex 24)
root_password=$(openssl rand -hex 24)
cat > .env <<EOF
MYSQL_DATABASE=webdev
MYSQL_USER=webdev
MYSQL_PASSWORD=$app_password
MYSQL_ROOT_PASSWORD=$root_password
DB_PORT=3307
API_PORT=3000
FRONTEND_PORT=5173
WEB_HOST=127.0.0.1
EOF
echo '已生成本地 .env（被 Git 忽略，权限仅限当前用户）。'
