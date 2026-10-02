# A05 管理员空间与集合页共享离页保护（本地）

日期：2026-10-02；基线 `71728f8`；分支 `codex/functional-checklist-completion`。

## 本轮交付

- 新建空间、编辑空间、新建集合、编辑集合四类草稿接入共享离页协调器。取消或最终准入被其他守卫拒绝保留输入；实际导航提交后才重置。beforeunload 注册警告，不宣称阻止强制退出。
- 原有本地取消/修改影响确认与共享离页确认互斥；确认未决时阻止导航，离页决策期间不接受保存或叠加本地取消。提交读取同步字段快照并保留既有去重。
- `AdminSpacesRoute` 持有同步未决写入导航锁，创建与修改发生后，即使403等拒绝导致编辑器卸载，仍保留离页与刷新警告；显式只读核对成功后按既有协议释放，不自动重发请求。
- 分离“读取失败导致写操作暂不可用”和“实际未知写入导致不能离页”。初始/分页只读失败不能把无草稿用户困在页面；有草稿时仍允许按共享确认决定离页。未决写入不受这一放宽影响。
- 保留原有冻结版本 `expectedUpdatedAt`、集合创建请求键、精确影响确认与权威读回协议。新生命周期检查避免卸载后的完成处理更新失效编辑器。

## 验证

- 修正新测试中导航辅助函数的调用参数后，正式首轮行为RED：**19失败/76通过**。同步最新输入/双提交的两项新增用例本身已通过，不算产品缺陷。
- 基础实现后定向 **95/95**；追加只读失败边界 **3失败/58通过**，分离导航锁后最终两文件 **98/98**。共新增 **24项**。
- 扩大回归 **82文件1877/1877** 全部通过；checklist审计测试 **9/9**。
- 项目类型、空间组件严格DOM、UI构建及VM静态隔离、双语测试 **13/13** 和 **434 keys / 55 placeholders / 6 files** 静态/硬编码检查通过。
- 全App附加严格DOM检查仍 **31条既有诊断**，去行列号后的诊断身份无新增，不是全App类型全绿。

### 复验入口

```sh
rtk proxy npx vitest run test/unit/frontend-admin-space-confirmation.test.tsx test/unit/frontend-admin-space-recovery.test.tsx test/unit/spaces-service.test.ts
rtk proxy npx tsc --ignoreConfig --noEmit --strict --jsx react-jsx --moduleResolution bundler --module esnext --target es2022 --lib es2022,dom,dom.iterable --skipLibCheck frontend/pages/admin/spaces-page.tsx
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy npm run test:i18n
rtk proxy npm run verify:i18n
rtk proxy node --test scripts/functional-checklist-audit.test.mjs
rtk proxy node scripts/functional-checklist-audit.mjs
```

本机日志 `/tmp/a05-spaces-leave-*.log`；扩大回归精确命令 `/tmp/a05-spaces-leave-regression-command.txt`。临时日志不作为跨机器持久制品。

## 边界与下一步

仅本地实现及mock fetch/DOM验证。未push、发布、远程迁移、手动读取/上传秘密文件或调用真实AI；未新增加密、备份或付费服务。

空间/集合未知写入锁仍只覆盖挂载期；未增加跨原生刷新/强制退出持久日志，也未改变服务端幂等协议。只读恢复不等于某次未知写入已成功。原生键盘/触摸、完整浏览器版本、强制离页和真实双身份验收仍开放。

范围内 **29 / 已关闭5 / 剩余24**，A05、R2-008与导航Task 4不关闭。下一允许管理员成员状态操作确认与未决写入的共享离页核查，本地没有外部阻塞。
