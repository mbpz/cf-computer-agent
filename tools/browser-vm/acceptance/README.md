# 独立浏览器 VM 公网验收（仅开发）

这是 LC-009/010 的验收工具，不是生产工作台、连接器安装包或 VM 联网功能完成声明。

## 边界

- 静态 HTTPS 页面只包含程序；镜像从本机回环服务读取，浏览器重新核对六项固定 SHA-256。
- 本机服务只接受指定的完整 HTTPS Origin、精确 Host 和一次运行随机能力值。能力值不进入 URL、日志或持久化。
- 授权由临时本地 Worker/D1 实际签发、消费和续租，使用正式连接器/guest adapter；远程 HTTPS 消费传输仍由本地 dispatch 替代。
- guest 的包和 Git HTTPS 数据通过正式 TCP 数据面；不开代理旁路，不关闭 TLS/包签名校验。
- 不读取生产 secrets，不修改宿主网络/CA/浏览器安全配置，不自启动，不发布生产工作台。

## 操作

从仓库根目录执行（使用 RTK）：

```sh
rtk proxy node scripts/browser-vm-connector-acceptance.mjs build /private/tmp/memory-garden-browser-acceptance
```

发布上述目录到**单独授权的 HTTPS 静态验收预览**之前必须确认授权。不要上传镜像目录、仓库或本机能力值。仅使用部署后确切 Origin，不使用通配来源。未提供自动部署命令。

本机准备好 `alpine-iso.mjs` 中固定版本的所有资产，明确指定目录后启动：

```sh
rtk proxy env BROWSER_VM_PROBE_ASSETS=/absolute/boot-assets BROWSER_VM_PROBE_ISO_ASSETS=/absolute/iso-assets node scripts/browser-vm-connector-acceptance.mjs serve https://approved-preview.example
```

1. 在自带浏览器打开终端给出的本机控制页，将地址和临时能力值输入已批准的 HTTPS 验收页。不将能力值粘贴到聊天。
2. 明确启动后，浏览器 Worker 加载固定镜像，取得正式授权并启动真实 Alpine。
3. 固定执行网络初始化、`apk update`、`apk add --no-cache git curl`，安装命令最长10分钟，其余单条命令90秒；超时仍失败且不自动重试。记录每条退出码以及 git/curl 版本。全部通过才关闭 LC-009。
4. 同一 VM 点击 Git 验收，完成 clone、fetch、两个 commit 校验及 API 仓库身份校验。全部通过才关闭 LC-010。
5. 点击停止/关闭页面会销毁 VM。Ctrl+C 停止本机服务并清理临时 Worker/连接器；服务最长20分钟自动清理。失败不自动重连；重新开始需要重启本机服务取得新能力值。

验收记录应包括实际 HTTPS URL、浏览器完整版本与默认安全配置、命令退出码/版本、日期和错误；不要保存能力值、配对码、票据或成员会话。握手、本地命令单测、Node VM 验证均不能替代上述浏览器证据。

## 当前证据

2026-09-30：本地快速VM回归350/350、静态构建通过；新增夹具/HTTP边界/命令测试6项。尚未发布或完成真实浏览器公网验收。主清单5/29、剩余24，连接器8/15保持不变。

2026-09-30 后续实际浏览器验收：网络初始化与 `apk update` 退出码0，安装在首个依赖下载期间触发原90秒上限，未取得安装退出码或版本。失败收据见 `design/browser-vm/2026-09-30-browser-apk-timeout.json`。现仅为固定安装命令设置10分钟上限，须重新手动配对后实际验证；LC-009/010仍开放。
