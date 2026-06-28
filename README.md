# Blog Platform

个人博客平台，前端使用 Next.js，后端使用 Go + SQLite，支持 Markdown 写作、文章管理、图片上传、自定义首页配置、项目/分享/图片/摘录等内容管理。

## 功能

- Markdown 文章发布、编辑、删除、预览
- 文章封面和正文图片上传，按 SHA256 哈希去重
- 首页主题、卡片布局、头像、背景、社交按钮等配置持久化
- 项目、优秀博客、推荐分享、图片墙、摘录等列表管理
- LaTeX 数学公式、Shiki 代码高亮、文章目录生成
- JWT 管理后台认证
- Docker Compose 一键部署

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | Next.js 16, React 19, Tailwind CSS 4, Zustand, Motion |
| Markdown | marked, Shiki, KaTeX, html-react-parser |
| 后端 | Go, chi/v5 |
| 数据库 | SQLite, modernc.org/sqlite, WAL 模式 |
| 认证 | JWT Bearer token |
| 部署 | Docker Compose，可配合 Nginx/Caddy 反向代理 |

## 项目结构

```text
blog-platform/
├── frontend/                # Next.js 前端
│   └── src/
│       ├── app/             # App Router 页面
│       ├── components/      # 通用组件
│       ├── hooks/           # 自定义 hooks
│       ├── lib/             # API 客户端、认证、Markdown 渲染
│       ├── config/          # 默认配置 JSON
│       └── layout/          # 全局布局
├── backend/                 # Go 后端 API
│   ├── cmd/server/          # 服务入口
│   └── internal/
│       ├── handler/         # HTTP handler
│       ├── store/           # SQLite 迁移和事务
│       ├── auth/            # JWT 和 bcrypt
│       ├── config/          # 环境变量配置
│       ├── middleware/      # Auth/CORS/日志/限流/安全头
│       ├── upload/          # 上传校验和哈希去重
│       └── apperror/        # 统一错误响应
└── docker-compose.yml
```

## 安全说明

本项目默认按公网部署做了基础加固：

- `JWT_SECRET` 必须显式设置，且长度至少 32 字符；拒绝开发默认值。
- `INITIAL_PASSWORD` 必须显式设置；拒绝 `admin123` 等弱默认值。
- 首次初始化管理员密码只来自服务端环境变量，不能被第一次登录请求抢占。
- 登录接口按来源 IP 做基础限流。
- 可选接入 Cloudflare Turnstile 门禁，Token 会通过后端调用 Cloudflare Siteverify 验证。
- Markdown 渲染会过滤危险标签、事件属性和危险 URL。
- 新上传文件不允许 SVG；已有 SVG 访问时强制下载。
- `/uploads` 不允许目录列表。
- 前后端默认添加 `Content-Security-Policy`、`X-Content-Type-Options`、`X-Frame-Options`、`Referrer-Policy`、`Permissions-Policy`。CSP 已按 Cloudflare Turnstile 官方要求放行 `https://challenges.cloudflare.com` 的脚本和 iframe。

仍建议在生产反向代理层继续配置 HTTPS、HSTS、访问日志、请求体大小限制和备份。

## 环境变量

### 后端

| 变量 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- |
| `LISTEN_ADDR` | 否 | `:8080` | 后端监听地址 |
| `JWT_SECRET` | 是 | 随机 32 字符以上 | JWT 签名密钥 |
| `INITIAL_PASSWORD` | 是 | 强管理员密码 | 首次初始化后台密码 |
| `TOKEN_EXPIRY` | 否 | `24h` | JWT 有效期 |
| `TURNSTILE_SECRET_KEY` | 否 | Cloudflare Secret Key | Turnstile 服务端验证密钥；配置后启用门禁验证 |
| `DB_PATH` | 否 | `/app/data/blog.db` | SQLite 文件路径 |
| `UPLOAD_DIR` | 否 | `/app/uploads` | 上传文件目录 |
| `CORS_ORIGINS` | 否 | `https://example.com` | 允许访问 API 的前端域名，多个用逗号分隔 |
| `LOG_LEVEL` | 否 | `info` | `debug/info/warn/error` |

### 前端

| 变量 | 示例 | 说明 |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `https://example.com/api` | 浏览器访问后端 API 的地址 |
| `NEXT_PUBLIC_UPLOADS_URL` | `https://example.com/uploads` | 浏览器访问上传文件的地址 |
| `NEXT_PUBLIC_SITE_URL` | `https://example.com` | RSS / Sitemap 使用的网站地址 |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Site Key | Turnstile 前端站点密钥；为空时前端跳过门禁 |

`NEXT_PUBLIC_*` 会打进浏览器包里，不能填 Docker 内部地址。生产环境推荐用同源反向代理，即浏览器访问 `/api` 和 `/uploads`。

## 本地开发

后端：

```bash
cd backend
export JWT_SECRET="dev-secret-at-least-32-characters-long"
export INITIAL_PASSWORD="dev-admin-password"
export LISTEN_ADDR=":3326"
go run ./cmd/server
```

前端：

```bash
cd frontend
pnpm install
pnpm dev
```

本地前端默认跑在 `:2025`。如果使用 `.env.local`，确保指向本地后端：

```env
NEXT_PUBLIC_API_URL=http://localhost:3326/api
NEXT_PUBLIC_UPLOADS_URL=http://localhost:3326/uploads
```

如果本地要测试 Turnstile，需要在 Cloudflare Turnstile 控制台添加本地域名，例如 `localhost`，然后设置：

```env
NEXT_PUBLIC_TURNSTILE_SITE_KEY=你的本地测试 Site Key
TURNSTILE_SECRET_KEY=你的本地测试 Secret Key
```

## 生产部署

下面按一台全新服务器部署来写。假设你的域名是 `example.com`，服务器公网 IP 是 `1.2.3.4`，实际操作时替换成自己的值。

### 1. 服务器准备

安装 Docker、Docker Compose、Git，并准备域名解析到服务器公网 IP。

```bash
docker --version
docker compose version
git --version
```

建议同时准备 Nginx 和 Certbot：

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

如果使用云服务器安全组/防火墙，只开放：

- `80/tcp`
- `443/tcp`
- `22/tcp`，建议限制来源 IP

不要把后端 `8080` 和前端 `3000` 直接暴露给公网；公网入口交给 Nginx 和 Cloudflare。`docker-compose.yml` 默认只绑定 `127.0.0.1:3000` 和 `127.0.0.1:8080`，供本机 Nginx 反代使用。

### 2. 接入 Cloudflare DNS

1. 在 Cloudflare 添加你的域名。
2. 按 Cloudflare 提示把域名 NS 改到 Cloudflare。
3. 在 Cloudflare DNS 中添加记录：

```text
Type: A
Name: @
Content: 1.2.3.4
Proxy status: Proxied / 橙云

Type: CNAME
Name: www
Target: example.com
Proxy status: Proxied / 橙云
```

DNS 生效后，Cloudflare 会作为浏览器和服务器之间的代理。后续 Nginx 仍然照常监听服务器本地 `80/443`。

### 3. 创建 Cloudflare Turnstile Key

如果只想使用 Cloudflare WAF/Managed Challenge，可以跳过本节，直接在 Cloudflare WAF 里配置 Challenge 规则。

如果要使用项目内置 Turnstile 门禁：

1. Cloudflare Dashboard -> `Turnstile`
2. `Add widget`
3. Widget name 填 `blog-platform`
4. Hostnames 添加：

```text
example.com
www.example.com
```

5. Widget mode 可选 `Managed`
6. 创建后保存：

```text
Site Key
Secret Key
```

后面 `.env` 会用到这两个值。

### 4. 拉取代码

首次部署：

```bash
git clone git@github.com:Shuitonton/blog-platform.git
cd blog-platform
```

已有目录更新：

```bash
cd /path/to/blog-platform
git pull origin main
```

如果服务器没有 GitHub SSH key，也可以使用 HTTPS：

```bash
git clone https://github.com/Shuitonton/blog-platform.git
```

### 5. 创建生产环境变量

在项目根目录创建 `.env`：

```env
JWT_SECRET=替换为随机32字符以上密钥
INITIAL_PASSWORD=替换为强管理员密码
CORS_ORIGINS=https://example.com,https://www.example.com
NEXT_PUBLIC_API_URL=https://example.com/api
NEXT_PUBLIC_UPLOADS_URL=https://example.com/uploads
NEXT_PUBLIC_SITE_URL=https://example.com

# 可选：配置后启用项目内置 Turnstile 门禁
NEXT_PUBLIC_TURNSTILE_SITE_KEY=替换为 Cloudflare Turnstile Site Key
TURNSTILE_SECRET_KEY=替换为 Cloudflare Turnstile Secret Key
```

生成密钥示例：

```bash
openssl rand -base64 32
```

不要使用 `admin123`、`change-me`、`password` 这类弱值；后端会拒绝启动。

如果暂时不使用项目内置 Turnstile，可以保留为空：

```env
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
```

### 6. 启动容器

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f backend
```

默认容器端口：

- 前端：`127.0.0.1:3000`
- 后端：`127.0.0.1:8080`
- 上传文件：后端 `/uploads`

数据库和上传文件保存在 Docker volume：

- `blog_db_data`
- `blog_uploads`

### 7. 配置 Nginx 外网访问

推荐只对外暴露 HTTPS 反向代理，后端端口不要直接暴露公网。

Nginx 示例：

```nginx
server {
    listen 80;
    server_name example.com www.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name example.com www.example.com;

    ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    client_max_body_size 100m;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location /api/ {
        proxy_pass http://127.0.0.1:8080/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:8080/uploads/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

申请证书可用 Certbot：

```bash
sudo certbot --nginx -d example.com -d www.example.com
```

Nginx 配置修改后检查并重载：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 8. 配置 Cloudflare SSL/TLS 和安全规则

Cloudflare Dashboard 中建议：

1. `SSL/TLS` -> mode 选择 `Full (strict)`。
2. `SSL/TLS` -> `Always Use HTTPS` 打开。
3. `Security` -> `WAF` -> 可选创建规则，对全站或敏感路径加 `Managed Challenge`。

如果你使用项目内置 Turnstile 门禁，Cloudflare WAF 不是必须的；但更强的“进入网站前先验证”应优先使用 Cloudflare WAF Managed Challenge 或 Cloudflare Access，因为它们在 CDN 边缘层生效。

### 9. 首次登录和配置

1. 访问 `https://example.com`。
2. 如果配置了 Turnstile，先完成 Cloudflare 人机验证。
3. 进入写作或配置入口，输入 `.env` 中的 `INITIAL_PASSWORD`。
4. 登录成功后先修改站点信息、头像、背景、社交按钮等配置。
5. 发布一篇测试文章，上传一张 jpg/png/webp 图片，确认 `/uploads/...` 可访问。
6. 确认 `/rss.xml` 和 `/sitemap.xml` 正常生成。

### 10. 上线后验证清单

逐项执行：

```bash
curl -I https://example.com
curl -i https://example.com/api/health
docker compose ps
docker compose logs --tail=100 backend
docker compose logs --tail=100 frontend
```

浏览器检查：

1. 首页能打开。
2. Turnstile 能加载并验证通过。
3. 打开浏览器 DevTools，没有 CSP 拦截 `https://challenges.cloudflare.com`。
4. 登录后台成功。
5. 上传 jpg/png/webp 成功。
6. 上传 SVG 被拒绝，这是预期行为。

## 更新部署

```bash
cd /path/to/blog-platform
git pull origin main
docker compose up -d --build
docker compose logs -f backend
```

更新前建议备份：

```bash
docker run --rm -v blog-platform_blog_db_data:/data -v "$PWD":/backup alpine tar czf /backup/blog-db-backup.tgz /data
docker run --rm -v blog-platform_blog_uploads:/uploads -v "$PWD":/backup alpine tar czf /backup/blog-uploads-backup.tgz /uploads
```

Volume 名称可能带项目目录前缀，可用 `docker volume ls` 确认。

## 测试

后端：

```bash
cd backend
go test ./...
```

前端：

```bash
cd frontend
pnpm build
```

当前 `next.config.ts` 配置了跳过 TypeScript 构建校验。若运行 `pnpm exec tsc --noEmit`，需要先处理项目里已有的类型问题和 Cloudflare 类型依赖。

## Cloudflare Turnstile 工作方式

当前内置 Turnstile 门禁用于访问体验层：

1. 前端读取 `NEXT_PUBLIC_TURNSTILE_SITE_KEY`。
2. 有 Site Key 时渲染 Turnstile。
3. 用户完成验证后，前端拿到 token。
4. 前端调用 `/api/verify-turnstile`。
5. 后端使用 `TURNSTILE_SECRET_KEY` 调用 Cloudflare Siteverify API。
6. 验证通过后，前端在当前会话中记录已验证状态。

注意：这不是绝对安全边界。用户理论上可以绕过前端会话状态。真正的强制门禁建议使用 Cloudflare WAF Managed Challenge 或 Cloudflare Access，把验证放在 Cloudflare 边缘层。

## 常见问题

### 后端启动失败：`JWT_SECRET must be set`

生产环境必须在 `.env` 中设置 `JWT_SECRET`，并且长度至少 32 字符。

### 后端启动失败：`INITIAL_PASSWORD must be changed`

不能使用 `admin123` 等弱密码。换成强密码后重新启动：

```bash
docker compose up -d --build
```

### 上传提示 `missing or malformed authorization header`

说明请求没有带 `Authorization` 头。通常是没有登录、登录 token 过期，或 `NEXT_PUBLIC_API_URL` 指向了错误后端。

处理方式：

1. 重新登录后台。
2. 确认浏览器能访问 `https://你的域名/api/health`。
3. 确认 `.env` 中 `NEXT_PUBLIC_API_URL` 是浏览器可访问的公网地址。
4. 修改 `.env` 后需要重新 `docker compose up -d --build`。

### 上传 SVG 失败

这是预期行为。为避免 SVG 脚本注入，新上传只允许 jpg、jpeg、png、gif、webp。

### 页面能打开，但 API 失败

检查：

```bash
docker compose ps
docker compose logs backend
curl -i https://你的域名/api/health
```

如果是 CORS 错误，确认：

```env
CORS_ORIGINS=https://你的域名
NEXT_PUBLIC_API_URL=https://你的域名/api
```

### Turnstile 不显示或一直验证失败

检查：

```bash
docker compose logs backend
curl -i https://你的域名/api/health
```

确认 `.env`：

```env
NEXT_PUBLIC_TURNSTILE_SITE_KEY=Cloudflare Site Key
TURNSTILE_SECRET_KEY=Cloudflare Secret Key
```

确认 Cloudflare Turnstile widget 的 Hostnames 包含当前访问域名，例如：

```text
example.com
www.example.com
```

浏览器 DevTools 如果看到 CSP 报错，确认响应头中允许：

```text
script-src https://challenges.cloudflare.com
frame-src https://challenges.cloudflare.com
```

### 配了 Turnstile 但想临时关闭

清空 `.env` 中两个变量并重建：

```env
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
```

```bash
docker compose up -d --build
```

### 数据迁移/备份

数据库是 SQLite，位于 Docker volume 的 `/app/data/blog.db`。上传文件位于 `/app/uploads`。上线后应定期备份这两个 volume。
