FROM public.ecr.aws/docker/library/node:22-bookworm-slim

# 只准备运行环境，项目源代码由 Compose 挂载。
WORKDIR /workspace
# Chromium 的运行库来自 Debian 官方源；临时下载只放在镜像内的 /workspace/tmp。
RUN mkdir -p /workspace/tmp/apt/archives/partial /workspace/tmp/apt/lists/partial \
    && apt-get -o Dir::State::lists=/workspace/tmp/apt/lists -o Dir::Cache::archives=/workspace/tmp/apt/archives update \
    && apt-get -o Dir::State::lists=/workspace/tmp/apt/lists -o Dir::Cache::archives=/workspace/tmp/apt/archives install -y --no-install-recommends \
       libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 \
       libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 libpango-1.0-0 libcairo2 libatspi2.0-0 \
       libx11-6 libxcb1 fonts-liberation fonts-noto-cjk \
    && rm -rf /workspace/tmp/apt
RUN mkdir -p /workspace/node_modules /home/node/.npm && chown -R node:node /workspace /home/node/.npm
USER node
