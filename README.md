# 一字一练

把喜欢的文字，写成自己的字。

一个用于生成汉字练习字帖的轻量网页应用。粘贴汉字、诗词或文章，选择练习方式，即可预览、打印或下载 A4 PDF。

**[在线使用](https://zitie.denghanjie.vip/) · [部署说明](deploy/README.md) · [反馈问题](https://github.com/denghanjie/zitie/issues)**

[![Test and build](https://github.com/denghanjie/zitie/actions/workflows/check.yml/badge.svg)](https://github.com/denghanjie/zitie/actions/workflows/check.yml)

## 功能

| 功能 | 说明 |
| --- | --- |
| 逐字练习 | 每个汉字一行六格，第一格深色范字、后五格浅色描红；附带编号的逐笔笔顺分解 |
| 整篇临摹 | 连续排版文章，保留标点和段落，不显示笔顺 |
| 诗词排版 | 支持五言、七言、长短句和长篇古诗，按句长调整字格，长句自动折行 |
| 分阕与分页 | 用空行标记上下阕或诗节，分页时尽量保持完整 |
| 字格选择 | 田字格、米字格 |
| 打印与导出 | A4 纵向自动分页、分页预览、直接下载 PDF、浏览器打印 |
| 草稿保存 | 在当前浏览器保存文字和设置，刷新后可继续编辑 |
| 诗词检索 | 按作品名、作者、诗句检索 1,555 条资料；同名作品展示首句，预览来源后填入 |
| AI 辅助查找 | 用模糊描述交给 DeepSeek 辨认作品，正文仍从资料库获取 |

无需注册。普通检索、排版和导出无需 API Key；自建站点的 AI 辅助查找需配置服务器端 DeepSeek 服务。一次最多输入 3000 个字符。逐字模式按原文顺序保留重复汉字。

## 使用方法

1. 打开[在线网站](https://zitie.denghanjie.vip/)，粘贴文字，或选「按名称查找」检索作品。只记得主题时可点「AI 帮我找」。核对作者、首句和全文后，点「用此正文替换练习内容」。
2. 选择「逐字练习」或「整篇临摹」。
3. 设置字格和字帖标题，点击「生成字帖」。
4. 检查分页预览，点击「保存 PDF」下载，或点击「打印」。

打印建议：**A4、纵向、100% 比例，关闭浏览器页眉页脚**。

### 如何排版诗词

在「整篇临摹」中，可选择自动识别、诗词或文章排版。诗词断句提供三种方式：

| 断句方式 | 适合的输入 |
| --- | --- |
| 自动 | 优先保留已经分行的诗句；连续粘贴或按整阕粘贴的长段落按标点分句 |
| 完全保留原有分行 | 已经手动整理好分行的文字；过长的一行仍会折行 |
| 按标点分句 | 希望按逗号、句号、问号等拆开诗句，同时保留空行分阕 |

例如，输入《水调歌头》时，在上下阕之间空一行：

```text
明月几时有？把酒问青天。
不知天上宫阙，今夕是何年。
……
起舞弄清影，何似在人间。

转朱阁，低绮户，照无眠。
……
但愿人长久，千里共婵娟。
```

上例的省略号仅用于说明分阕位置；实际生成时请粘贴完整正文。

短句不会补齐整行空格，长句优先在标点处折行，并避免常见标点落在行首。能放下一页的诗节尽量整节排版；超长诗节按原句顺序分页。自动识别基于文字格式与句长，不会推断未标记的阕界，结果不合适时可以手动切换排版方式或编辑换行。

## 本地运行

推荐使用 **Node.js 24** 和 **pnpm 11.19.0**，版本信息见 [package.json](package.json)。

```sh
git clone https://github.com/denghanjie/zitie.git
cd zitie
npm install -g pnpm@11.19.0
pnpm install --frozen-lockfile
pnpm dev
```

浏览器打开终端显示的本地地址，通常为 `http://127.0.0.1:5173/`。

### 构建与预览

```sh
pnpm test
pnpm build
pnpm preview
```

构建产物在 `dist/`，可以部署到支持 HTTPS 的静态网站服务器。当前配置按域名根路径部署。`dist/` 和 `node_modules/` 不提交到 Git，需要先安装依赖并构建。

macOS 用户构建完成后，也可以双击仓库中的 `启动网站.command`，通过 Python 3 启动本地静态服务器；使用时保留终端窗口。本地构建包含字库，启动后无需外部字库 CDN。

## 项目结构

```text
src/
  main.jsx          输入、设置、预览与导出界面
  poetry.js         诗词识别、断句、折行与分阕分页
  worksheet.js      字形加载、字帖 SVG 与 PDF 生成
  style.css         页面样式、移动端与打印样式
public/
  data/             汉字字形与笔顺数据
  ARPHICPL.TXT      字库许可
  DATA-LICENSE.md   字库来源说明
tests/
  layout.test.mjs   排版与分页测试
deploy/             Nginx 配置、证书续期脚本和部署说明
```

技术栈：**React、Vite、SVG、jsPDF**。基本功能纯静态运行；可选 Python 后端提供 DeepSeek 检索线索，并用 SQLite 保存限额计数。GitHub Actions 在推送和 Pull Request 时执行测试与构建，不会自动发布到服务器。

## 数据与隐私

文字排版和 PDF 生成在浏览器内完成，输入内容与设置存储在当前浏览器的 `localStorage`。直接检索也在浏览器内进行。仅点击「AI 帮我找」时，查找框中的线索会通过本站服务器发送至 DeepSeek，不会自动发送练习正文。服务器只保存约两天的 IP 和请求时间用于限额，不保存查询正文；没有账号系统或第三方统计脚本。

在线使用时，浏览器会向本站请求所需汉字的字形 JSON；请求路径包含单个汉字，可能出现在服务器访问日志中。若需要避免这些在线请求，可以下载项目并在本机运行。

## 已知限制

- 字库未收录的生僻字使用系统字体，并提示缺少笔顺；能否显示取决于设备字体。
- 不同来源对笔顺可能存在差异，当前按随项目提供的字库展示。
- 直接下载的 PDF 使用高分辨率页面图片；如需要矢量输出，可尝试浏览器打印中的「另存为 PDF」。
- 资料库覆盖有限，可能存在异文或录入差异；填入前请核对来源。AI 只提供候选线索，不生成全文；未收录作品仍需自行粘贴。超过 3000 字的作品可在全文预览中摘选。

## 测试

```sh
pnpm test
```

测试需 Python 3（标准库，无额外依赖）。覆盖同名作品检索、繁简转换、来源完整性、AI 输出约束、接口限流，以及《如梦令》《水调歌头》《梦游天姥吟留别》的三种断句方式、内容完整性、长句折行、分阕分页、标点避头、3000 字输入、普通文章和逐字练习。

## 字库与许可

诗词库来自 MIT 许可的 [chinese-poetry](https://github.com/chinese-poetry/chinese-poetry)，包含唐诗三百首、宋词三百首、古文观止、千家诗、楚辞以及李清照、苏轼宋词补充；经 OpenCC 转为简体。固定版本和记录来源见 [SOURCES.md](public/library/SOURCES.md)，保留其 [MIT 许可](public/library/LICENSE.txt)。

汉字数据来自 [Hanzi Writer Data](https://github.com/chanind/hanzi-writer-data) 2.0.1，源于 [Make Me a Hanzi](https://github.com/skishore/makemeahanzi) 与文鼎字形数据，遵循 **Arphic Public License**。许可全文与来源说明保留在 [ARPHICPL.TXT](public/ARPHICPL.TXT) 和 [DATA-LICENSE.md](public/DATA-LICENSE.md)。

应用代码目前未指定开源许可证；字库许可不自动适用于应用代码。第三方依赖遵循各自的许可证。

## 反馈

欢迎通过 [Issues](https://github.com/denghanjie/zitie/issues) 反馈问题。排版问题请附上可公开的示例文字、练习模式、排版与断句选项，以及预期效果，方便复现。
