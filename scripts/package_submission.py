"""Create a reviewed source-and-demo ZIP from the current worktree, excluding secrets."""

import hashlib
import os
import re
import subprocess
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parent.parent
folder = root.name
destination = root / 'submission' / '实践作业一-提交包.zip'
required = {
    'README.md', 'package-lock.json', 'compose.yaml', 'docker/Dockerfile',
    'docker/setup-env.sh', 'frontend/src/App.vue', 'backend/src/server.ts',
    'backend/src/init-db.ts', 'backend/sql/001-framework.sql',
    'backend/sql/002-business.sql', 'databases/vul.sql', 'databases/comp.sql',
    'docs/实践作业一说明.md', 'docs/实验报告.md', 'docs/项目演示.webm',
    'docs/演示说明.md', 'docs/验收记录.md', 'docs/复验记录-2026-10-08.md',
}

tracked = subprocess.check_output(['git', 'ls-files', '-z'], cwd=root).split(b'\0')
paths = {os.fsdecode(item) for item in tracked if item}
# These changes may not yet have been committed; explicitly include only reviewed files.
paths.update({'docker/setup-env.sh', 'docker/rotate-local-passwords.py',
              'scripts/package_submission.py', 'docs/复验记录-2026-10-08.md'})
paths = sorted(paths)
missing = sorted(required - set(paths))
if missing:
    raise SystemExit(f'提交材料缺失：{missing}')

actual_passwords = []
local_env = root / '.env'
if local_env.exists():
    for key in ('MYSQL_PASSWORD', 'MYSQL_ROOT_PASSWORD'):
        found = re.search(rf'^{key}=(.+)$', local_env.read_text(encoding='utf-8'),
                          flags=re.MULTILINE)
        if found:
            actual_passwords.append(found.group(1).encode())

secret_patterns = {
    '私钥': re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
    'AWS 访问密钥': re.compile(rb'\bAKIA[0-9A-Z]{16}\b'),
    'GitHub 令牌': re.compile(rb'\bgh[pousr]_[A-Za-z0-9_]{20,}\b'),
    'API 令牌': re.compile(rb'\bsk-[A-Za-z0-9_-]{20,}\b'),
}
for name in paths:
    source = root / name
    if (name.startswith(('tmp/', 'submission/', '.git/', '.aws/'))
            or '/node_modules/' in f'/{name}/' or '/dist/' in f'/{name}/'
            or name == '.env' or (name.startswith('.env.') and name != '.env.example')
            or name.endswith(('.pem', '.key')) or source.is_symlink() or not source.is_file()):
        raise SystemExit(f'拒绝打包不安全路径：{name}')
    data = source.read_bytes()
    for secret in actual_passwords:
        if secret in data:
            raise SystemExit(f'当前有效数据库口令出现在候选文件中：{name}')
    for label, pattern in secret_patterns.items():
        if pattern.search(data):
            raise SystemExit(f'候选文件疑似包含{label}：{name}')
    if name == '.env.example':
        for key in ('MYSQL_PASSWORD', 'MYSQL_ROOT_PASSWORD'):
            if re.search(rf'^{key}=.+$', data.decode(), re.MULTILINE):
                raise SystemExit('配置模板中不能包含可用口令')

destination.parent.mkdir(exist_ok=True)
staged = destination.with_suffix('.zip.pending')
with zipfile.ZipFile(staged, 'w', compression=zipfile.ZIP_DEFLATED,
                     compresslevel=6, allowZip64=True) as archive:
    for name in paths:
        archive.write(root / name, f'{folder}/{name}')
    readme = (
        '《现代 Web 开发》实践作业一提交包\n'
        f'项目目录：{folder}\n'
        '包含：完整源代码、依赖锁文件、数据库原始 SQL 与建表导入脚本、README、'
        '实验报告、API 文档、验收记录、复验记录、截图和 5–8 分钟演示视频。\n'
        '不包含：.env、真实数据库口令、Git 历史、node_modules、tmp 缓存或数据库数据卷。\n'
        '解压后请先在项目根目录运行 sh docker/setup-env.sh，再按 README 使用 Docker Compose。\n'
        '实验报告中的姓名、学号请由提交者本人按课程要求填写。\n'
    )
    archive.writestr(f'{folder}/提交清单.txt', readme)

with zipfile.ZipFile(staged) as archive:
    bad = archive.testzip()
    if bad:
        raise SystemExit(f'ZIP 校验失败：{bad}')
    names = archive.namelist()
    if len(names) != len(paths) + 1:
        raise SystemExit('ZIP 文件数与清单不一致')
    for name in names:
        if name.startswith('/') or '..' in Path(name).parts:
            raise SystemExit(f'ZIP 路径不安全：{name}')

os.replace(staged, destination)
digest = hashlib.sha256(destination.read_bytes()).hexdigest()
destination.with_suffix('.zip.sha256').write_text(
    f'{digest}  {destination.name}\n', encoding='utf-8')
print(f'已生成 {destination.relative_to(root)}：{len(paths)} 个项目文件与 1 份提交清单。')
print(f'文件大小：{destination.stat().st_size:,} 字节。')
print('敏感信息检查：未包含 .env、当前有效数据库口令或常见私钥/令牌格式。')
