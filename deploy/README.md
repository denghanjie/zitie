# 部署

线上地址：https://zitie.denghanjie.vip

纯静态站点，构建产物为 `dist/`。无需数据库、后端、环境密钥。服务器通过 Nginx 提供文件；字帖文本仅保存在用户浏览器。

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
