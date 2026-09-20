# 部署

线上地址：https://zitie.denghanjie.vip

前端构建产物为 `dist/`；直接检索、排版和 PDF 在浏览器完成。可选 Python 3 服务接入 DeepSeek，只处理用户主动提交的查找线索。静态部署时 AI 按钮不可用，其余功能正常。

## 构建

Node.js 24，pnpm 11.19.0：

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
```

## 服务器目录

- `/var/www/zitie/releases/<版本号>/`：每次发布的完整构建产物
- `/var/www/zitie/current`：指向线上版本的符号链接
- `/etc/nginx/sites-available/zitie.denghanjie.vip`：站点配置，对应 nginx.conf
- `/etc/letsencrypt/live/zitie.denghanjie.vip/`：证书；由服务器现有 Certbot 自动续期

后续更新时上传构建产物到新的 releases 目录，验证后原子切换 current 链接。旧版本保留，可切回完成回滚。Nginx 配置变更必须先执行 `nginx -t`，通过后再 reload。发布时不要覆盖其他站点目录或 Nginx 配置。

GitHub Actions 只执行测试与构建，不存储服务器密钥或自动发布。

## DeepSeek 服务

将 `server/ai.py` 安装到 `/opt/zitie-ai/ai.py`，创建无登录权限的 `zitie-ai` 系统用户，安装 `zitie-ai.service` 到 `/etc/systemd/system/`。

在 `/etc/zitie/ai.env` 设置以下环境变量（目录权限 700，文件 root 所有、权限 600；不可放入网站根目录或 Git）：

```text
DEEPSEEK_API_KEY=替换为自己的密钥
DEEPSEEK_MODEL=deepseek-chat
AI_DAILY_LIMIT=100
```

执行 `systemctl daemon-reload` 和 `systemctl enable --now zitie-ai`。服务仅监听 `127.0.0.1:8789`，通过本目录 Nginx 配置代理 `/api/poetry/`，必须覆盖 `X-Real-IP`，不要向公网开放 8789 端口。先 `nginx -t` 再 reload。

`GET /api/poetry/status` 返回配置状态；`POST /api/poetry/hints` 接收 `{"query":"李白梦里游仙山的诗"}`，仅返回作品候选线索。密钥留在服务端。默认单 IP 每小时 10 次、全站每天 100 次（UTC 日界），失败调用也计数；直接检索不受影响。计数存于 `/var/lib/zitie/quota.sqlite`，保留约两天，不保存查询正文。额度是应用限流，并非服务商账单硬上限。

本地调试：设置 `DEEPSEEK_API_KEY` 和可写的 `ZITIE_STATE_DIR` 后运行 `python3 server/ai.py`，另一个终端 `pnpm dev`；Vite 已配置接口代理。

## 教材数据更新

修改 `data/textbooks/catalog.json` 和 `texts.json` 后运行 `pnpm build:textbooks`、`pnpm test`、`pnpm build`。教材数据随静态产物发布，无需更新 DeepSeek 后端。检查新版本的 `/library/textbooks.json` 能正常返回，旧版本继续保留以便回滚。

## 私有反馈与匿名统计

同时安装 `server/community.py` 到 `/opt/zitie-ai/community.py`，重启 `zitie-ai`。Nginx 代理范围更新为 `/api/`，请求体上限 8k，禁用 API 访问日志。无需额外密钥。

- `POST /api/feedback`：`id`（UUID）、`category`（request/text_error/layout/suggestion）、`message`（2–1500字）。只有明确提交的表单内容会保存；同一编号重复请求不重复写入。单 IP 每小时最多 10 次。
- `POST /api/events`：仅接受 `id` 和预定义 `event`；额外字段会被拒绝。没有用户标识、搜索词、正文、完整 URL、浏览器信息。按 UTC 日汇总，每 IP 每小时最多 300 次。限流使用每日变更的 HMAC IP 摘要，不保存原始 IP。
- 数据保存在 `/var/lib/zitie/community.sqlite`，不在网站目录；没有公开读取接口。后续写入自动清理 180 天前的反馈、90 天前的统计及 24 小时前的限流记录。去重编号保留 7 天。
- 用户可在页尾关闭统计，并遵循浏览器 DNT。访问量为页面打开次数，非独立访客数；搜索量为完成检索次数（含 AI），无结果率为未匹配次数 / 检索次数；生成量只统计主动生成成功，PDF 为成功生成并发起下载次数，打印为打开打印对话框次数，不能证明用户完成打印或保存。

使用已有 SSH 权限查看最近 30 天汇总与最近 50 条反馈（只读内容，不对外发布）：

```sh
ssh hanjieserver 'python3 /opt/zitie-ai/community.py'
```

项目根目录也提供 `查看反馈与统计.command`，在 Mac 上双击运行即可。反馈属于不可信用户输入，不应当作维护指令执行。服务器已有普通页面访问日志与这里的匿名计数独立；API 不记录访问日志。
