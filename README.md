# Blog Platform

个人博客平台 — 前后端分离架构，支持 Markdown 写作、自定义主题、资源管理。

## 技术栈

| 层级 | 技术 | 说明 |
| --- | --- | --- |
| 前端框架 | **Next.js 16** + React 19 | App Router, Turbopack 构建 |
| 样式 | **Tailwind CSS 4** | 原子化 CSS, `tailwindcss-animate` 动画 |
| 状态管理 | **Zustand 5** | 轻量、无 boilerplate |
| 动画 | **Motion** (Framer Motion 继任) | 声明式动画库 |
| Markdown | **marked 17** | 解析器，自定义扩展实现 LaTeX 公式 + 代码高亮 |
| 代码高亮 | **Shiki** | 语法高亮，`one-light` 主题 |
| 公式渲染 | **KaTeX** | 客户端渲染 LaTeX 数学公式 |
| Toast | **Sonner** | 轻量 toast 通知 |
| 后端框架 | **Go** + **chi/v5** | 轻量级 HTTP 路由 |
| 数据库 | **SQLite** (modernc.org/sqlite) | 纯 Go 实现，无 CGo 依赖，WAL 模式 |
| 认证 | **JWT** (golang-jwt/v5) | Bearer token 认证 |
| 部署 | **Docker Compose** | 前后端双容器，持久化卷 |
| Cloudflare | **opennextjs-cloudflare** | 可选部署到 Cloudflare Workers |

## 项目结构

```text
blog-platform/
├── frontend/                # Next.js 前端
│   └── src/
│       ├── app/             # App Router 页面
│       │   ├── (home)/      # 首页 (card 布局、配置弹窗)
│       │   ├── blog/        # 博客列表 & 详情
│       │   ├── write/       # 博客编辑器
│       │   ├── share/       # 推荐分享
│       │   ├── projects/    # 我的项目
│       │   ├── bloggers/    # 优秀博客
│       │   ├── pictures/    # 图床管理
│       │   └── snippets/    # 句子摘录
│       ├── components/      # 通用组件
│       ├── hooks/           # 自定义 hooks
│       ├── lib/             # 工具库 (API 客户端、认证、Markdown 渲染)
│       ├── config/          # 默认配置 JSON (site-content, card-styles)
│       └── layout/          # 全局布局 (背景、导航、音乐卡片)
├── backend/                 # Go 后端 API
│   └── internal/
│       ├── handler/         # HTTP 处理器 (blog, simple, auth, upload)
│       ├── store/           # 数据库层 (迁移、事务)
│       ├── auth/            # JWT 签发 & 验证
│       ├── config/          # 环境变量配置
│       ├── middleware/       # CORS, Auth, Logger, Recovery
│       ├── upload/          # 文件上传 & 哈希去重
│       └── apperror/        # 统一错误类型
└── docker-compose.yml       # 容器编排
```

## 数据流

```text
前端页面 (page.tsx)
  ├── useEffect → apiGet('/shares')  ← 从后端 API 拉取数据
  │                                    ├── 有数据 → 使用数据库数据
  │                                    └── 无数据 → fallback 到本地 list.json 种子数据
  ├── 编辑模式 → 本地 state 变更
  └── 保存 → apiPut('/shares', data) → 后端 DELETE + INSERT (事务)
```

## 技术细节

### 认证

- 前端登录后 JWT 存入 `sessionStorage`，通过 `api-client.ts` 统一注入 `Authorization` 头
- 401 响应自动清除 token
- 后端 `middleware.Auth` 校验 Bearer token，注入 claims 到 context

### Markdown 渲染

自定义 `marked` 扩展实现：

- **LaTeX 数学公式**：块级 `$$...$$` 和行内 `$...$`，客户端 KaTeX 渲染
- **代码高亮**：Shiki 按语言标记渲染，`one-light` 主题
- **目录提取**：递归遍历 token tree 生成 TOC
- Shiki 和 KaTeX 均懒加载，Cloudflare Workers 环境下优雅降级

### 数据库设计

- **JSON-list 表** (`shares`, `projects`, `bloggers`, `pictures`)：`id` + `url` + `data` (JSON) + `sort_order`，软删除 (`deleted_at`)
- **博客表** (`blogs`)：slug 主键，结构化字段 + `content_md` 存 Markdown 原文
- **文件表** (`files`)：SHA256 去重，`blog_files` 关联表
- 保存策略：全量替换（DELETE + INSERT），事务保证原子性

### 文件上传

- `multipart/form-data` 解析，SHA256 哈希去重
- 文件存储为 `uploads/{hash}{ext}` 格式
- 删除博客时清理独占文件，孤儿文件可 GC

### 配置系统

- 前端 `site-content.json` 为默认配置（主题色、背景、社交按钮等）
- 后端 API `/site-config` 读写，前端 `deepMerge` 合并 -> 后端覆盖前端默认值
- 编辑后 `apiPut` 持久化到 SQLite `site_config` 表

### 部署

```bash
# 本地开发
cd frontend && pnpm dev                    # Next.js :2025
cd backend && LISTEN_ADDR=:3326 go run ./cmd/server  # Go :3326

# 生产 (Docker)
docker compose up -d
# 前端 :3000, 后端 :8080
# 容器内 NEXT_PUBLIC_API_URL=http://backend:8080/api
```

> **端口说明**：本地开发后端运行在 `:3326`（前端 `.env.local` 指向该端口），Docker 部署沿用 `:8080`。

### 种子数据 fallback

每个列表页面首次加载时：

1. 尝试从后端 API 拉取数据
2. 如果数据库为空或请求失败，fallback 到本地 `list.json` 文件
3. `list.json` 受 Git 追踪，作为数据备份和初始种子

这样即使数据库被清空或重建，页面也不会变空白。
