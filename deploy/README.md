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

将 `server/ai.py`、`server/online.py`、`server/community.py` 一并安装到 `/opt/zitie-ai/`，创建无登录权限的 `zitie-ai` 系统用户，安装 `zitie-ai.service` 到 `/etc/systemd/system/`。

在 `/etc/zitie/ai.env` 设置以下环境变量（目录权限 700，文件 root 所有、权限 600；不可放入网站根目录或 Git）：

```text
DEEPSEEK_API_KEY=替换为自己的密钥
DEEPSEEK_MODEL=deepseek-chat
AI_DAILY_LIMIT=100
```

执行 `systemctl daemon-reload` 和 `systemctl enable --now zitie-ai`。服务仅监听 `127.0.0.1:8789`，通过本目录 Nginx 配置代理 `/api/poetry/`，必须覆盖 `X-Real-IP`，不要向公网开放 8789 端口。先 `nginx -t` 再 reload。

`GET /api/poetry/status` 返回配置状态；`POST /api/poetry/hints` 接收 `{"query":"李白梦里游仙山的诗"}`，返回 `suggestions` 和 `online`。每次 AI 查询均调用 DeepSeek，随后通过固定的 `https://zh.wikisource.org/w/api.php` 搜索最多 3 组线索、读取最多 6 个来源版本（不用额外 API Key）。`online.status` 为 `completed` / `partial` / `unavailable`；即使无在线结果仍保留本地资料库结果。`sources` 提供实际抓取文本、版本号、固定版本 URL、SHA-256 和诗句匹配状态，不接受模型生成 URL 或正文。密钥留在服务端。默认单 IP 每小时 10 次、全站每天 100 次（UTC 日界），失败调用也计数；直接检索不受影响。计数存于 `/var/lib/zitie/quota.sqlite`，保留约两天，不保存查询正文。额度是应用限流，并非服务商账单硬上限。

### 联网查找与核对边界

- 更新时必须同时发布前端与三个后端 Python 文件，并重启服务；Nginx `proxy_read_timeout` 为 60 秒，前端超时为 65 秒。
- 服务器须能访问 `api.deepseek.com` 和 `zh.wikisource.org`。DeepSeek 请求仍使用现有 Key/模型配置；维基文库为公开只读 API，不新增付费搜索服务或凭据。
- DeepSeek Chat Completions 负责作品识别，联网由应用代码执行，不能仅在提示词里要求联网。官方 [Responses 兼容说明](https://api-docs.deepseek.com/guides/responses_api/) 也列明其内置 `web_search` 类型被忽略，因此不能通过添加此参数假装已搜索。
- 来源读取仅访问固定域名，禁止重定向，单请求最多 1 MB、6 秒，文本最多 16000 字（超出不截断，跳过来源）。读取指定 revision 的 HTML 后提取纯文本段落，剔除常见导航、表格、脚注、样式和脚本；不执行页面内容。复杂版式可能无法提取，预览仍可能含序言或注释。
- `source_fetched` 仅表示真实抓取，不代表学术校勘；`quoteCheck` 仅在提示诗句至少 4 字时对实际正文做 NFKC/标点/空白归一化子串核对。前端在本地资料库及其 OpenCC 转换器可用时，另对实际来源正文与提示诗句进行繁简归一比较；仅新增 `matched_after_conversion` 信息标签，保留来源原字形和后端原始核对结果，不标记为已校勘。异体字不强行等同；`not_found` 可能是字形差异，也可能作品不符，不可视为确认或断言错误。无提示诗句返回 `not_provided`。
- 在线候选与本地校勘记录分离。用户核对篇名、作者和所选正文并明确勾选后可填入；不会自动加入已校勘资料库，且不放开本地待校勘篇目。作者预填来自 AI 线索，尚未核准。
- 来源可能缺失、超时或不可达；返回可用候选及明确失败状态，不回退成编造文本。状态接口 `available` 只表示密钥已配置，不是实时上游健康检查。
- API 合约参考：[MediaWiki 搜索](https://www.mediawiki.org/wiki/API:Search)、[版本读取](https://www.mediawiki.org/wiki/API:Revisions)、[指定版本解析](https://www.mediawiki.org/wiki/API:Parsing_wikitext)。

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
