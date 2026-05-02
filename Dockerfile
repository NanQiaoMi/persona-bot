# Dockerfile

# 基础镜像
FROM node:20-alpine AS base

# 安装依赖阶段
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# 构建阶段
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# 生产阶段
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# 安装Python（用于解析器）
RUN apk add --no-cache python3 py3-pip

# 创建非root用户
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# 复制构建产物
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# 复制Python工具和Prompt
COPY lib/ex-skill/tools ./lib/ex-skill/tools
COPY lib/ex-skill/prompts ./lib/ex-skill/prompts

# 安装Python依赖
COPY lib/ex-skill/requirements.txt ./lib/ex-skill/requirements.txt
RUN pip3 install --no-cache-dir -r lib/ex-skill/requirements.txt

# 创建必要目录
RUN mkdir -p uploads exes backups
RUN chown -R nextjs:nodejs uploads exes backups

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
