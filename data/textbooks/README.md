# 教材古诗文数据

核对日期：2026-09-20。36 册，444 个教材选篇位置，216 篇不同作品。

## 收录范围

- 人教版统编教材六三学制：一至九年级，上、下册。
- 上海现行统编教材五四学制：一至九年级，上、下册；不收录历史沪教版。
- 本次收录目录中的课内古诗文及“古诗词诵读”。**暂不含语文园地的日积月累**、现代诗文、古典白话小说节选、注释、译文、题目及插图。
- 包含公版近代文言作品《少年中国说》节选与秋瑾词。

## 目录与版本

`catalog.json` 只保存目录事实与出处，`texts.json` 保存选用的公版原文、作者、正文来源和整理说明。`public/library/textbooks.json` 是二者的构建产物。

目录依据国家中小学智慧教育平台公开教材目录和预览页逐册整理：

- [官方目录版本入口](https://s-file-1.ykt.cbern.com.cn/zxx/ndrs/resources/tch_material/version/data_version.json)
- 每册保存平台 `officialId`、详情链接、公开目录预览 `catalogPages`。
- 仅使用公开目录及公开预览；未获取需要登录的教材 PDF。
- 平台现有册次中，修订本与尚未标记修订的下册并存。`versionNote` 如实保留“根据 2022 年版课程标准修订”标记，不能视为全国学校在 2026 学年统一使用的版本。
- 九年级修订上册和平台公开旧下册存在篇目重复，按各册来源保留，不自行推算新版下册目录。
- 五四学制五下含毕业古诗词诵读；六下含《关尹子教射》，不能复制六三学制的年级归属。

## 正文来源

只取公版古代原文及已进入公版的近代原文，不复制以下来源的现代译文、鉴赏、注释、代码或页面设计。正文版本与教材的标点、异体字、节选开头可能不同，界面明确提示核对并允许编辑，**不承诺逐字等同所有印次教材**。

1. [chinese-poetry](https://github.com/chinese-poetry/chinese-poetry/tree/b8594f81a89752241442f2ce267d6f66f96704ee)，沿用站内 MIT 数据来源，见 `public/library/LICENSE.txt`。
2. [gxwtf/poem 初中原文资料](https://github.com/gxwtf/poem/blob/618c9daafa90024487e853451e236d4ca66ab79c/scripts/poem-content/junior.json)，仅提取古代原文 `content` 与篇名、作者事实。
3. [aopao/chinese-gushiwen](https://github.com/aopao/chinese-gushiwen/tree/c2345d0abf2404b8b3601e4afc2e8fd12f90d6c8/guwen)，仅提取古代原文 `content` 与作者事实，去除夹注。来源索引（如有）从 1 起计。
4. [teachany-courseware 中的小学古文原文](https://github.com/weponusa/teachany-courseware/tree/782280c92c14dfaa2e39ae5a70bf3dbac0507e1a/_reading_site/texts)，只选相应古代或公版近代原文，排除采集页面导航、教材注释、练习题等。
5. [《关尹子教射》原文](https://github.com/bexiang/bexiang.github.io/blob/b4c5495b72f10b139638ffa2211cbb7016c11bfc/wenyanwen/wenyanwen_G6-2.html)，只取《列子·说符》的公版原文。
6. [《三国志·武文世王公传》](https://github.com/NiuTrans/Classical-Modern/blob/4e746ea9fa99c3c0d7051c45397330bef7b0962d/古文原文/三国志/魏书/武文世王公传/text.txt)，节取曹冲称象故事，恢复引号。范围在篇目说明中列出。

未给这些项目新增许可证，也不把其现代整理内容视为 MIT；引用范围限于不受现代作者专有权保护的原作文字和目录事实。教材图片不随仓库或网站发布。

## 编辑规范与构建

```sh
pnpm build:textbooks
pnpm test
pnpm build
```

1. 先核对官方目录的学制、年级、册次及修订状态，再修改 `catalog.json`。
2. `texts.json` 必须同时提供正文与可追溯来源。禁止用 AI 按标题补写；禁止模糊匹配后直接取第一个同名结果。
3. 明确组诗选择、教材节选首尾及异文：例如《惠崇春江晚景》《六月二十七日望湖楼醉书》仅选第一首；《陈涉世家》止于“杀之以应陈涉”。整理说明放在 `textNote`，不混入可临摹正文。
4. 共享篇目可共用原文；如果未来发现某册节选范围不同，应新增明确的文本版本映射，不能直接修改成所有册通用。
5. 构建遇到缺少正文、来源、无效对象文本会报错；测试检查 36 册完整性、学制差异、正文节选边界与检索行为。

本功能为纯静态本地检索，不调用 DeepSeek，不发送教材选择或练习正文。
