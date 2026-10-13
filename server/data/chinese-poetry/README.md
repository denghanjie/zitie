# 服务端本地诗文索引

此目录是「先查本地原文，再选择联网」使用的扩展来源库，不是网站已经校勘的选篇库。不进入 Vite 静态构建，也不在浏览器下载。检索和返回的候选统一标记 `source_fetched`，必须由用户打开来源、核对版本后使用；检索命中不代表已校勘或作者已确认。

## 覆盖范围与许可

- 上游：[chinese-poetry/chinese-poetry](https://github.com/chinese-poetry/chinese-poetry)，固定提交 `b8594f81a89752241442f2ce267d6f66f96704ee`，MIT 许可。完整许可及署名保留在 [LICENSE.txt](LICENSE.txt)。
- `全唐诗/poet.tang.0.json` 至 `poet.tang.57000.json`，58 个完整源文件，共 57,607 条上游记录。
- 另取 [`御定全唐詩/json/733.json` 第 21 条](https://github.com/chinese-poetry/chinese-poetry/blob/b8594f81a89752241442f2ce267d6f66f96704ee/%E5%BE%A1%E5%AE%9A%E5%85%A8%E5%94%90%E8%A9%A9/json/733.json)：黃巢《不第後賦菊》。该版本是“沖天香陣透長安，滿城盡帶黃金甲”。全唐诗另一记录作“衝天”；两个版本独立展示，不合并、不默默改字。
- 导入日期：2026-10-12。`acquiredAt: 2026-10-12T00:00:00Z` 表示确定性的 UTC 导入日期，不声称午夜发生了实际下载。
- 可检索 56,831 条，排除与现有选篇库重叠的 544 条，跳过缺少身份信息、正文过短或过长等不适合记录 233 条。明确的每条排除原因和关联状态在 `excluded.json`；精确计数以 `manifest.json` 为准。

这里只把上游 `title`、`author` 和 `paragraphs` 导入检索与显示，正文严格为原始段落用换行连接，保留繁体字、标点和用字；不收录模型生成全文、译文或赏析。简繁转换只产生搜索键，不改变显示正文。返回 `contentHash` 是该原始正文 UTF-8 字节的 SHA-256。

原始快照保留完整上游字节，以便重新验证 Git blob 和 SHA-256。字段审计：全唐诗 4,132 条有主题 `tags`，21 条有简短书目 `notes`，没有译文；御定第 733 卷的 `biography` 与 `notes` 均为空，另有卷次和编号。这些额外字段仅存在于离线来源存档，不进入索引、API 候选或界面。资料来自公开整理本，底本和录入可能有问题，MIT 许可不代表文本权威性。

## 来源链与文件

- `upstream-manifest.json`：每个原始文件的固定路径、上游 Git blob SHA-1、原始字节 SHA-256、长度与导入日期。
- `sources/*.json.gz.b64`：原始文件完整字节的 gzip / base64 编码；便于仓库工具传输，不改变来源。
- `shards/*.index.json.gz.b64`：确定性生成的原始正文、搜索键和来源位置。每片的未压缩 SHA-256、长度和记录数在 `manifest.json`。
- `protected.index.json.gz.b64`：现有选篇、教材及编辑前正文的简体、繁体和原字形匹配信息，用于阻止其它来源重新启用受限条目。
- 每个 API 候选携带 `provider`、`verification`、固定提交 `revisionId`、`sourcePath`、从 1 开始的 `sourceIndex`、可区分整理本的 `edition`、日期、原文件链接和正文哈希。

## 现有选篇的边界

生成时保守排除所有已收录作品的重叠，和原选篇是可用、待核或暂停使用无关。匹配采用 OpenCC 简体键：标题＋作者，任何连续 12 字共享片段，至少 4 字的完整短篇，或较长选篇中至少 4 字的短候选。现有教材按 `textbook:标题` 关联校勘账本；现有诗词按 `poetry:id` 关联。编辑前旧正文也纳入保护。因此这份原始扩展库不能恢复旧版本、跳过待校勘或暂停使用状态。

`corpus.conflicts_with_library(source)` 对联网来源应用相同的保守边界，并拒绝少于 4 个标准化字符的候选。可能多排除共享片段的相关篇目；这种保守排除不等同于对两个作品作同一性裁定。更换现有选篇、编辑记录或校勘状态后必须重建索引，离线检查会提示旧产物。

## 构建、核验与部署

需要仓库锁定的 `opencc-js 1.4.2` 和 Node.js。默认及 `--check` 都离线运行：

```sh
node scripts/build-corpus.mjs
node scripts/build-corpus.mjs --check
python3 -m unittest discover -s tests -p test_corpus.py
```

只有显式 `node scripts/build-corpus.mjs --fetch` 才重新下载同一固定版本。先验证每个源文件长度、Git blob 与 SHA-256，再重建；不会追踪上游最新提交。`--fetch` 与 `--check` 不能同时使用。整个目录约 34 MB，部署时连同 `server/corpus.py` 复制到后端，不能只复制 Python 文件。

运行时使用 Python 标准库 SQLite FTS5 构建汉字二元组索引，并核对每片和每条的哈希。索引缓存放在 `$ZITIE_STATE_DIR/corpus-index`，未设置时使用 `/tmp/zitie-corpus-<uid>`。目录必须由服务用户持有且权限 0700，缓存文件权限 0600，不接受符号链接。后端可保持只读源目录。缓存约 160 MB，首次建立约 10–12 秒；服务可在开始接受请求前用 `corpus.search('不第后赋菊', 1)` 预热。机器、文件系统和负载会影响时间。

索引指纹变化自动使用新缓存。返回前对选中条目比对来自已核实源片的完整记录摘要，不能仅凭缓存自报的正文哈希冒充来源；摘要缓存最多保留 8 片。输入长度、返回条数、FTS 候选数与源片大小均有上限。检索不联网、不调用模型、不写查询日志。常见精确标题或诗句命中约 0.01 秒，广泛词语通常约 0.1–0.3 秒。待核边界与性能均有回归测试。
