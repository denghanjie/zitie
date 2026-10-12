# 部署

线上地址：https://zitie.denghanjie.vip

前端构建产物为 `dist/`；直接检索、排版和 PDF 在浏览器完成。Python 3 服务提供本地扩展古诗文检索，并可选接入 DeepSeek、百度。静态部署保留原浏览器资料库；扩展本地语料与外部搜索需要后端。

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

## 本地检索与可选外部服务

Python 3 标准库即可运行，无需 pip 包（SQLite 须启用 FTS5，常见系统 Python 已包含）。随服务器安装 56,831 条古诗文整理本记录，压缩快照与生成索引约 34 MB，不进入浏览器包。首启在接受请求前离线创建索引，本次云端测试约 9 秒；后续服务启动可复用经过核验的缓存。具体覆盖与排除记录见 `server/data/chinese-poetry/`。将整个 `server/` 目录（含语料与清单）安装到 `/opt/zitie-ai/`；不要只复制 `ai.py`。创建无登录权限的 `zitie-ai` 用户，安装 `deploy/zitie-ai.service`。同时发布本次构建的 `dist/`，旧前端与新后端不应混用。

在 `/etc/zitie/ai.env` 保存可选配置（目录 700、文件 root 所有且 600；不可放进 Git 或网站目录）：

```text
# 只运行本地检索时，此文件可以为空；服务仍需要该文件存在。
# DEEPSEEK_API_KEY=由管理员在服务器安全设置
DEEPSEEK_MODEL=deepseek-chat
# BAIDU_API_KEY=由管理员在服务器安全设置
WIKISOURCE_ENABLED=0
AI_DAILY_LIMIT=100
```

不要在聊天、日志、前端代码或部署提示词中粘贴真实密钥。百度 API 可能计费，管理员应在已授权账户中另行确认服务开通、余额和限额。本更新不购买服务、不创建密钥，也不证明任何外部 API 已从生产服务器连通。

`systemctl daemon-reload` 后重启 `zitie-ai`；服务只监听 `127.0.0.1:8789`。保留本目录 Nginx `/api/` 代理（覆盖 `X-Real-IP`、禁用 API 日志），不要公网开放 8789。配置有修改时先 `nginx -t` 再 reload。系统服务的 600 权限环境文件由 systemd 读取，不需将其授权给静态 Web 服务。

### 接口及行为

- `GET /api/poetry/status`：只报告配置，不是上游实时健康探测。
- `POST /api/poetry/search`，JSON `{"query":"满城尽带黄金甲"}`：本地固定版本扩展语料查询；无密钥、无第三方网络调用、无外部调用配额。前端普通检索同时保留既有资料库。
- `POST /api/poetry/discover`：百度发现来源，不要求 DeepSeek。返回 `online.discoveries`，只包含 `discovery_only` 链接/摘要；不自动抓取结果 URL，不是全文核实。
- `POST /api/poetry/hints`：DeepSeek 只辨认线索，随后查询已配置来源。识别失败时使用原查询，明确报告失败；不会编造原文。显式 AI 查询仍调用模型，本地结果先显示，不等待外部结果。
- `online.providers` 分别报告百度、维基文库及适用时 DeepSeek 的状态。缺少百度密钥明确显示未配置。本地扩展与百度发现各有单独状态。
- 维基文库默认关闭。只有服务器实际 HTTPS 测试正常后，管理员才可设置 `WIKISOURCE_ENABLED=1`；不使用代理、镜像或关闭 TLS 验证绕过连接问题。固定域名、指定 revision、禁止重定向。其失败不影响本地检索。
- 同一 IP 外部查询每小时 10 次、全站每天 `AI_DAILY_LIMIT` 次，失败也计数；这是应用限流，不是账单硬上限。最多 32 个请求处理线程；DeepSeek 同时最多 2 个真实调用，调用等待上限 18 秒；可选维基文库最多 1 组真实检索，等待上限 8 秒。百度同样有独立容量、8 秒截止及 30 秒失败冷却。达到截止后占位会保持到真实后台调用退出，防止不断重试堆积。提供商失败不盲目重试。浏览器取消会阻止旧结果覆盖新查询，但已到达第三方的请求可能继续运行并计费。

官方百度协议：[AI 搜索组件](https://ai.baidu.com/ai-doc/AppBuilder/pmaxd1hvy)。固定 POST `https://qianfan.baidubce.com/v2/ai_search/web_search`，`search_source=baidu_search_v2`，只处理 `references` 的来源标题、链接和摘要。返回 URL 仅作为安全检查后的用户链接，不发起任意 URL 请求。

### 正文、版本与核对

本地扩展语料与来源证据保留原字形；前端用 OpenCC 默认显示简体篇名、作者和正文，预览、填入与生成使用同一份可编辑文本。可展开对照转换前原文；繁简转换不是校勘，不合并异文版本。转换未就绪或失败时不能填入扩展候选，并明确提示重试；已经保存或手动编辑的草稿不会被自动转换。其固定仓库 revision、来源路径/记录、取得日期及 SHA-256 可追溯；不同版本不合并。现有资料库中的已校勘、待校勘及禁用记录仍走既有质量规则，不因扩展语料放开。扩展候选不是已校勘资料库：需用户打开来源，核对篇名、作者、正文并明确确认才可填入。

`source_fetched` 仅说明来源内容已取得，不是学术审核。百度 `discovery_only` 不能升级成它。AI 不输出全文或可抓取 URL。新保存草稿保留版本化来源证据及哈希；旧/不完整证据不被当作已核准，恢复时要求重新检索核对。系统不使用无来源或过期网络缓存来伪装核实结果。

### 发布检查和回滚

1. 在本机干净检出要发布的固定 Git commit，执行 `pnpm install --frozen-lockfile`、`pnpm test`、`pnpm build`。`node scripts/build-corpus.mjs --check` 语料离线检查必须通过（已纳入测试命令）；更新上游语料需另行显式执行生成脚本，日常部署不抓取外网语料。
2. 备份当前静态 release、完整 `/opt/zitie-ai/` 与服务配置。新的 `server/` 完整复制到候选目录，验证语料可读后再切换；不要覆盖 `/var/lib/zitie` 的反馈、统计和额度库，也不要覆盖已有安全环境文件。
3. 更新静态 release 与完整后端并重启服务。检查 status、本地失效案例、一般篇名、繁简查询、待校勘保护及草稿恢复。无密钥本地查询必须成功。
4. 若自行配置百度，单独检查真实请求与返回的提供商状态，确认只是来源发现；不得仅凭 status 中配置存在就宣布连通。维基文库保持关闭，除非实际网络验证通过。
5. 失败时同时回退前端与后端目录，重启服务，再验证本地检索、反馈接口和静态页面。

本地调试：`ZITIE_STATE_DIR=/tmp/zitie-state python3 server/ai.py`，另一个终端 `pnpm dev`；无任何 API Key 也能搜索扩展本地语料。

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
