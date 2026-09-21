# 自托管范字字体

提供两套 Regular（400）字重的矢量字形：

| 网站选项 | 来源字体 | 版本 | 收录字形 |
| --- | --- | --- | --- |
| 宋体 | Noto Serif SC | Fontsource 5.3.0 | 13,661 |
| 黑体 | Noto Sans SC | Fontsource 5.3.0 | 13,630 |

来源：[Noto Serif SC](https://fontsource.org/fonts/noto-serif-sc)、[Noto Sans SC](https://fontsource.org/fonts/noto-sans-sc)。两者遵循 SIL Open Font License 1.1；完整许可分别保留于 `serif-OFL.txt`、`sans-OFL.txt`。默认的笔顺楷体继续使用原有 Hanzi Writer / Arphic 数据，许可见网站根目录 `ARPHICPL.TXT`。

这里的文件是从 Fontsource 固定版本 Regular WOFF2 中提取的字形轮廓，不是系统字体，也不会在用户设备安装字体。每个 Unicode 128 字符区间保存为一个 JSON 文件，按需从本站加载，加载失败不会悄悄改用其他字体。字库未覆盖的汉字会回退到原有笔顺字形，再回退到系统字体，并在生成结果中提示。

`manifest.json` 保存每个源 WOFF2 文件的 SHA-256、可用区块和字形数量。字形以 SVG path 写进生成的字帖，因此范字预览、浏览器打印和 PDF 栅格化共用同一份轮廓，不依赖打印设备上的字体。标题、姓名日期栏等辅助文字保留原来的样式；当前选项只控制范字。

逐字练习的六个范字使用选定字体，笔顺分解仍使用原有笔顺楷体。界面和纸张页脚均注明，以免将其他字体的笔画造型误认成其专属笔顺。

## 重建

需要 Python 3、`fonttools==4.60.2` 和 `brotli==1.2.0`（建议在虚拟环境中安装）。

1. 从固定包 `@fontsource/noto-serif-sc@5.3.0` 和 `@fontsource/noto-sans-sc@5.3.0` 的 `400.css` 获取 Regular WOFF2 文件清单。
2. 将清单里的文件以及包根目录 `LICENSE` 保存至源目录的 `serif/`、`sans/` 子目录。来源 URL 形式为 `https://cdn.jsdelivr.net/npm/@fontsource/noto-serif-sc@5.3.0/files/<文件名>`；黑体同理。
3. 在项目根目录运行 `python scripts/build-typefaces.py <源目录>`。
4. 运行 `pnpm test`、`pnpm build`。应用运行时无需 Python 或字体解析依赖。

不含字体加粗、斜体或书法体模拟；不修改原始字体设计，也不使用 AI 生成字形。

## 细笔文楷（硬笔小字版式）

新增 LXGW WenKai v1.311 原生 Light 300，取自固定包 `@fontsource/lxgw-wenkai@5.3.0`，遵循 SIL OFL 1.1，完整许可见 `wenkai-OFL.txt`。来源为 https://github.com/lxgw/LxgwWenKai ，并非照片中商业字帖的同款字体；不宣称复制其专有字形。未通过图像侵蚀等方式人为削细笔画。

从 https://registry.npmjs.org/@fontsource/lxgw-wenkai/-/lxgw-wenkai-5.3.0.tgz 解包后，运行 `python3 scripts/build-wenkai.py <package目录>`。文件名中的 latin 是该包的命名，实际包含中文；manifest 保存原文件 SHA-256 和 30,127 个可用字形的清单。按 128 码点分块加载。
