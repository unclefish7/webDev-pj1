# 项目开发约定

- 所有临时下载文件、下载归档及解压后的临时内容统一放在仓库根目录的 `tmp/` 下，不使用宿主机 `/tmp` 或其他仓库外目录。下载时显式指定目标路径；需要临时目录的命令将 `TMPDIR` 指向该目录。容器内对应路径为 `/workspace/tmp`。尽量避免下载文件外溢。
- 技术栈为 Vue 3、Vite、TypeScript、Element Plus、Express、mysql2、MySQL。
- 前后端必须在同一个 Compose `app` 容器内运行，源码以 bind mount 挂载，不复制到镜像。
- 安装依赖、运行、构建、类型检查和测试均通过 Docker Compose 在容器内执行，不在宿主机运行 npm/Node。
- 使用 `network_mode: host`；浏览器经 Vite 的 `/api` 代理访问后端。保留 README 的 SSH 转发访问方式。
- 镜像使用正规来源；当前采用 AWS ECR Public 的 Docker 官方镜像，不从 Docker Hub 直接拉取。
- 数据库存储在命名卷中。不得为日常调试删除数据卷。
- 业务要求以 `docs/实践作业一说明.md` 为准；CVE 不要求新增，组件要求 CRUD，应用不加入 Agent 能力。
- 常用检查：`docker compose exec app npm run check`、`docker compose exec app npm run build`、`docker compose exec app npm test`。测试前先执行 `docker compose exec app npm run db:init`。
