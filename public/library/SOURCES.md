# 诗词全文来源

数据源：[chinese-poetry](https://github.com/chinese-poetry/chinese-poetry)，MIT 许可。

固定版本：`b8594f81a89752241442f2ce267d6f66f96704ee`。原始选集共 1555 条记录。同名、不同首句或不同整理本保留为独立候选，不合并文本。

- 宋词补充（李清照、苏轼）：[原始文件](https://github.com/chinese-poetry/chinese-poetry/blob/b8594f81a89752241442f2ce267d6f66f96704ee/%E5%AE%8B%E8%AF%8D)
- 唐诗三百首：[原始文件](https://github.com/chinese-poetry/chinese-poetry/blob/b8594f81a89752241442f2ce267d6f66f96704ee/%E5%85%A8%E5%94%90%E8%AF%97/%E5%94%90%E8%AF%97%E4%B8%89%E7%99%BE%E9%A6%96.json)
- 宋词三百首：[原始文件](https://github.com/chinese-poetry/chinese-poetry/blob/b8594f81a89752241442f2ce267d6f66f96704ee/%E5%AE%8B%E8%AF%8D/%E5%AE%8B%E8%AF%8D%E4%B8%89%E7%99%BE%E9%A6%96.json)
- 古文观止：[原始文件](https://github.com/chinese-poetry/chinese-poetry/blob/b8594f81a89752241442f2ce267d6f66f96704ee/%E8%92%99%E5%AD%A6/guwenguanzhi.json)
- 千家诗：[原始文件](https://github.com/chinese-poetry/chinese-poetry/blob/b8594f81a89752241442f2ce267d6f66f96704ee/%E8%92%99%E5%AD%A6/qianjiashi.json)
- 楚辞：[原始文件](https://github.com/chinese-poetry/chinese-poetry/blob/b8594f81a89752241442f2ce267d6f66f96704ee/%E6%A5%9A%E8%BE%9E/chuci.json)

繁体文本使用 OpenCC 转为简体，未用模型生成或补全文本；标点、异文与段落以此来源为准。已核对的现代用字差异按 src/text-corrections.js 校订，正文保留原始来源并另列校订依据；校订不会全局替换通假字，也不代表全库逐字审核完成。部分长文超过字帖的 3000 字限制，需要选择段落填入。

## 历代名篇补充

另收录杨慎《临江仙·滚滚长江东逝水》，见 `data/library/supplemental-works.json`。仅使用古代词正文，不收录现代赏析、注释和译文。

- 正文来源：[aopao/chinese-gushiwen 固定版本](https://github.com/aopao/chinese-gushiwen/blob/c2345d0abf2404b8b3601e4afc2e8fd12f90d6c8/guwen/guwen0-1000.json)，第 187 条。去除篇前出处说明，按上下阕分段。
- 对照来源：[ddabb/poetryesm 固定版本](https://github.com/ddabb/poetryesm/blob/34d14ed12372b9d55406f2b66303c66cd1a3dfe0/source/明代/杨慎.json)。两份公开整理本的词正文逐字一致，可能有共同底本，不视为独立权威认证。

## 《劝学》补充（2026-10-04）

- 颜真卿《劝学》全文：上述 aopao 固定版本第 247 条；对照 [ddabb 固定版本](https://github.com/ddabb/poetryesm/blob/34d14ed12372b9d55406f2b66303c66cd1a3dfe0/source/唐代/颜真卿.json)，正文逐字一致。
- 荀子《劝学（节选）》：上述 aopao 固定版本第 309 条的第 1、2、4、7 段，去除拼音与通假字夹注。对照 [gxwtf 固定版本第 12 条](https://github.com/gxwtf/poem/blob/618c9daafa90024487e853451e236d4ca66ab79c/scripts/poem-content/senior.json)。保留原文“輮”，对照本作“𫐓”；其余汉字逐字一致。明确标为节选，不宣称是全篇，也不新增为已核实的教材版本。
- 对照全文及字形差异保存在校勘记录中。以上公开整理本可能共享底本。
