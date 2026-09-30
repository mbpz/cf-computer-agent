# LC-011 正式账户网络运行时接线

前置：d039de8已验证网络所有者，但reserve/issue/renew仍由测试夹具手工提供；正式页面也尚不存在。下一必要接线是使用成员会话API、环境代次和浏览器生命周期的账户网络运行时，不把验收harness的能力值接口带入产品。

沿用批准设计，顺序执行，无子代理。GitHub继续用户跳过；无push/生产发布/迁移/秘密读取。

1. [x] TDD实现账户/环境绑定的网络运行时，真实调用固定同源GET current→POST reserve→POST ticket及续租API。服务端生成runtimeId/generation；客户端不传memberId。手动提供本机端口、connectorId及一次性配对码，不自动配对、不持久化。
2. [x] 取消覆盖授权准备和已连接阶段；账户epoch在请求/续租/attach边界变化、pagehide、offline、恢复边界关闭旧资源（立即退出登录由后续页面所有者调用dispose）；超时/冲突/不确定响应不自动重试，不执行或重放客体命令。响应绑定严格校验，错误不泄露票据。
3. [x] 实际Worker/D1路由、签名、消费及WS联调；让现有三组真实Alpine验收使用该正式账户运行时，移除测试手工reserve/issue/renew编排。
4. [x] VM全回归、浏览器打包、类型/checklist校验、证据与本地提交。

不以账户网络运行时模块取代LC-015正式shadcn页面、账户VM资源所有者及真实浏览器矩阵。LC-011/012父项本轮不预先关闭；完成后继续接页面/VM所有权，主清单29/5/24保持据实。

验证：账户单测24/24，五项行为变异均检出并还原；真实Worker/D1集成3/3；完整快速VM422/422；真实Alpine3/3（115.4秒）；checklist9/9与实际计数29/5/24；tsc及浏览器ESM打包40526字节通过（新增mjs不在TS覆盖范围）。收据design/browser-vm/2026-09-30-account-network.json。本地提交包含此计划与证据；未push或发布。
