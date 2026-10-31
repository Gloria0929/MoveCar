# syntax=docker/dockerfile:1

# ============ 构建阶段：编译前端 ============
FROM node:22-alpine AS build
WORKDIR /app

# 先复制依赖清单，充分利用层缓存
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
COPY scripts/ scripts/
RUN npm ci

# 复制源码并构建前端（产出 web/dist）
COPY server/ server/
COPY web/ web/
RUN npm run build

# ============ 运行阶段：只带后端生产依赖 ============
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# 只安装生产依赖（server 的 express/jsonwebtoken/qrcode）
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev

# 后端源码 + 已构建的前端静态资源
COPY server/ ./server/
COPY --from=build /app/web/dist ./web/dist

# 数据目录归 node 用户所有（SQLite 落盘处）
RUN mkdir -p /app/server/data && chown -R node:node /app
USER node

EXPOSE 3000 3443
VOLUME ["/app/server/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=8s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/src/index.js"]
