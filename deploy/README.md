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
