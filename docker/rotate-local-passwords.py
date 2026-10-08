"""Rotate current Compose MySQL credentials without printing or copying them outside this repo."""

import os
import re
import secrets
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parent.parent
env_file = root / '.env'
if not env_file.is_file():
    raise SystemExit('缺少 .env，请先运行 sh docker/setup-env.sh')
original = env_file.read_text(encoding='utf-8')
values = dict(re.findall(r'^([A-Z_]+)=(.*)$', original, re.MULTILINE))
username = values.get('MYSQL_USER', '')
if not re.fullmatch(r'[a-zA-Z0-9_]+', username):
    raise SystemExit('MYSQL_USER 格式不支持自动轮换，请手动检查。')

command = ['docker', 'compose', 'exec', '-T', 'db', 'sh', '-c',
           'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot --batch --skip-column-names']
accounts = subprocess.run(command, input='SELECT user, host FROM mysql.user;',
                          text=True, capture_output=True, cwd=root, check=True)
targets = [tuple(line.split('\t')) for line in accounts.stdout.splitlines() if '\t' in line]
app_hosts = [host for user, host in targets if user == username]
root_hosts = [host for user, host in targets if user == 'root']
if not app_hosts or not root_hosts or any(not re.fullmatch(r'[a-zA-Z0-9_.%\-]+', host) for _, host in targets):
    raise SystemExit('未找到预期 MySQL 账号，未作修改。')

app_password = secrets.token_hex(24)
root_password = secrets.token_hex(24)
updated = re.sub(r'^MYSQL_PASSWORD=.*$', 'MYSQL_PASSWORD=' + app_password, original, flags=re.MULTILINE)
updated = re.sub(r'^MYSQL_ROOT_PASSWORD=.*$', 'MYSQL_ROOT_PASSWORD=' + root_password,
                 updated, flags=re.MULTILINE)
if updated == original or 'MYSQL_PASSWORD=' not in updated or 'MYSQL_ROOT_PASSWORD=' not in updated:
    raise SystemExit('.env 缺少密码字段，未作修改。')

sql = ''.join(f"ALTER USER '{username}'@'{host}' IDENTIFIED BY '{app_password}';\n"
              for host in app_hosts)
# 当前 root 连接通常来自 localhost，最后修改它。
sql += ''.join(f"ALTER USER 'root'@'{host}' IDENTIFIED BY '{root_password}';\n"
               for host in root_hosts if host != 'localhost')
if 'localhost' in root_hosts:
    sql += f"ALTER USER 'root'@'localhost' IDENTIFIED BY '{root_password}';\n"

stage = root / 'tmp' / 'rotated-env.pending'
stage.parent.mkdir(exist_ok=True)
fd = os.open(stage, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
try:
    with os.fdopen(fd, 'w', encoding='utf-8') as output:
        output.write(updated)
    result = subprocess.run(command, input=sql, text=True, capture_output=True, cwd=root)
    if result.returncode:
        raise SystemExit('数据库口令更新失败。请检查数据库状态；口令未输出到日志。')
    os.replace(stage, env_file)
    os.chmod(env_file, 0o600)
    subprocess.run(['docker', 'compose', 'up', '-d', '--force-recreate', '--wait',
                    '--wait-timeout', '300'], cwd=root, check=True)
    print('数据库口令已轮换，两个容器恢复健康。')
finally:
    stage.unlink(missing_ok=True)
