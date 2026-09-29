# LC-008 本机直连软件源验收

日期：2026-09-30 04:11–04:13 Asia/Shanghai（收据使用UTC，2026-09-29T20:11–20:13Z）。
状态：**LC-008关闭；LC-009及后续仍开放。** 不是VM、真实浏览器安装或生产验收。

## 方法与边界

- 原有 `tools/browser-vm/direct-download.mjs` 五个固定公开目标，各完成两轮系统默认地址选择、两轮强制IPv4；额外从下载的main索引读取git/curl版本和大小，各完成两轮IPv4下载。
- macOS系统curl 8.7.1 / SecureTransport / LibreSSL 3.3.6；系统DNS正常查询A与AAAA。curl `--disable`忽略用户curl配置，`--noproxy '*'`仅本进程直接连接，`--proto '=https'`，连接10秒/总计30秒上限；未使用`-k`、自定义CA、重试、代理、自动跳转或凭据，没有修改主机配置。
- 使用curl实际TLS校验结果、HTTP状态、完整下载字节、远端IP、DNS/TCP/TLS/总耗时以及实际正文SHA-256；**不由DNS成功推断下载成功**。所有请求均exit0/HTTP200/TLS verify0/proxy_used0/redirects0，正文长度等于传输字节。
- Alpine选择了IPv6 `2a04:4e42:68::644`及IPv4 `146.75.114.132`；GitHub API `20.205.243.168`，Git入口 `20.205.243.166`。GitHub AAAA返回ENODATA，A访问成功，未误记为联网失败。它们是本次观测，不是未来固定地址策略。
- 根文件系统通过仓库固定大小/SHA-256校验；API正文`full_name`确认为`octocat/Hello-World`；Git响应包含upload-pack服务广告。索引和APK仅记录完整下载/摘要，APK大小匹配索引；**包签名验证、依赖安装与Git完整克隆保留LC-009/010，不由宿主下载替代**。

## 结果

| 资源 | 成功次数 | 每次正文bytes | 总耗时范围（秒） |
|---|---:|---:|---:|
| Alpine v3.24 main/x86 APKINDEX | 4 | 525960 | 0.472–2.048 |
| Alpine v3.24 community/x86 APKINDEX | 4 | 2310520 | 0.559–2.515 |
| 固定alpine-minirootfs-3.24.1-x86 | 4 | 3538048 | 0.456–2.397 |
| GitHub octocat/Hello-World API | 4 | 5107 | 0.314–0.609 |
| 同仓库git-upload-pack info/refs | 4 | 242386 | 0.982–2.148 |
| 索引指定git-2.54.0-r0.apk | 2 | 3568880 | 2.555–2.556 |
| 索引指定curl-8.22.0-r0.apk | 2 | 184281 | 1.316–1.649 |

合计24/24，33,994,406正文bytes；每种静态资源跨轮SHA-256一致。稳定仅指本次有界重复观测，不承诺持续可用性。
完整逐请求收据见同目录 `2026-09-30-host-direct-downloads.json`；不含cookie、票据、私人数据或本机配置。

## 重现命令形态

固定URL和限额来自既有DOWNLOAD_TARGETS；额外APK路径来自同次main APKINDEX的P/V/S字段，不能任意扩展目标。

```sh
curl --disable --noproxy '*' --proto '=https' \
  --connect-timeout 10 --max-time 30 --max-filesize TARGET_LIMIT \
  --silent --show-error --user-agent memory-garden-lc008-public-acceptance \
  --output TEMP_BODY --write-out '%{json}' TARGET_URL
# IPv4复验在--disable后加--ipv4；不加--location/--insecure/--retry。
```

实际临时驱动：`/private/tmp/lc008-baseline.mjs`与`/private/tmp/lc008-baseline-ipv4.mjs`。
正文及原始结果分别保留在 `/private/tmp/lc008-baseline/` 与 `/private/tmp/lc008-baseline-ipv4/`，未加入仓库。
Python独立审核全部24条状态/TLS/无代理/无跳转/完整字节/身份结果，静态资源摘要集合必须为单值后才生成提交收据。

## 下一步

LC-009：在**自带浏览器中的真实Alpine VM**上，通过正式成员授权连接链执行`apk update`及`apk add --no-cache git curl`，保留证书/签名校验，核对退出码和安装版本。
现有成功的是宿主直连及上一轮Node中的受控VM测试；不能把任一结果改名为浏览器公网VM安装成功。
