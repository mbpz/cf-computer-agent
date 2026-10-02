# A05 知识投稿草稿与未决写入保护（本地）

日期：2026-10-02；基线 `ed897a3`；分支 `codex/functional-checklist-completion`。

## 实现与边界

- MemberSubmitForm 接入共享 useCreateDraft。恢复的离线草稿也需要离页确认；默认保留，取消或后置守卫拒绝不清理。beforeunload 提醒与普通应用导航使用同一草稿/写入事实。
- 同步 request/intent 引用以及已识别的损坏意图阻止普通离页；pending、未知结果和无效成功响应不提供普通丢弃出口。继续使用原有成员分区意图、幂等键和显式原快照重试，不自动发送。
- 保留原有“旧投稿未决期间可以编辑下一份草稿”的行为。字段以增量合并到同步 ref，不让旧渲染覆盖其他字段；提交取最新 ref。离页确认期间拒绝编辑和提交。
- 现有回执结构校验通过后，只有成功清除恢复记录才解除该意图锁。清理失败保留原身份供显式重试；已确认的当前稿可以清空，较新的草稿不被旧回执抹掉。清空后的模式纳入正确基线，不产生空表单误报 dirty。
- 共享守卫在获准导航真正提交时重置草稿；路由同步持久化该重置，避免 App 卸载表单后 React effect 不再运行、丢弃内容却再次恢复。只修改当前成员离线草稿。
- 卸载/成员替换撤销旧回调准入并中止旧请求；旧重试不能重新发送旧成员的写入。未改服务端、存储格式、授权或接口。
- 本轮不等于完整原生刷新/关闭、完整浏览器版本、安全配置或真实身份切换验收。测试中的强制 root.render 明确是生命周期模拟，不算普通导航获准。未声称跨标签协调或存储不可读时不存在未知记录。

## RED 与验证

七个纵向 RED→GREEN 回合，各新增一个失败行为：恢复草稿不提醒；确认期间仍能提交；成功后空 code 表单误报 dirty；连续字段旧快照覆盖；换成员后旧重试仍发请求；恢复记录清理失败误放行；真实 App 路由卸载导致已丢弃草稿残留。

最终新增 **14项**测试，投稿 owner 路由 **32/32**；扩大回归 **58文件1408/1408通过**，无未捕获异常或 act 警告。扩大范围是此前50文件加投稿/存储/静态页面8文件，不是全仓测试。

- 项目 `typecheck`、`build:ui` 与 VM 隔离通过。
- 附加独立严格 DOM 类型检查**未通过**：SubmitPage 依赖的既有 `asset-availability-panel.tsx:33` 联合类型收窄错误仍存在；全 App 34条诊断，与前一轮诊断身份一致，当前修改区域没有新增诊断。不能声称所有前端严格类型通过，也未为此扩大修改范围。
- 双语测试13/13；静态434keys/55placeholders/6files通过。
- 清单契约9/9、清单审计29/5/24、`git diff --check`通过。
- 网络边界由测试替身提供，没有执行真实 AI、生产请求或付费资源调用。

## 复现

```sh
rtk proxy npx vitest run test/unit/frontend-submit-owner-route.test.tsx
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy npm run test:i18n
rtk proxy npm run verify:i18n
rtk proxy node --test scripts/functional-checklist-audit.test.mjs
rtk proxy npm run audit:functional-checklist
```

扩大回归：在 `navigation-focus-write-protection-evidence.md` 的完整50文件命令后添加以下8文件：

```text
test/unit/frontend-submit-owner-route.test.tsx
test/unit/frontend-submit-pages.test.tsx
test/unit/frontend-submission-data.test.ts
test/unit/submission-intent.test.ts
test/unit/offline-submission-draft.test.ts
test/unit/frontend-a11y.test.tsx
test/unit/frontend-user-read-pages.test.tsx
test/unit/frontend-locale-pages.test.tsx
```

附加严格检查（预期仍报告上述既有问题，而非作为通过证据）：

```sh
rtk proxy npx tsc --ignoreConfig --noEmit --strict --skipLibCheck --jsx react-jsx --module ESNext --moduleResolution bundler --target ES2022 --lib ES2023,DOM,DOM.Iterable --esModuleInterop --allowSyntheticDefaultImports frontend/pages/submit-page.tsx frontend/lib/use-create-draft.tsx
```

## 清单与下一步

原始30项 / D08排除 / 29范围内 / 5完成 / 24未关闭。此处仅关闭知识投稿离页保护本地子项；A05/R2-008和计划Task 4整体仍开放，不把局部测试提升为全站或生产验收。

下一允许按A05继续搜索页已保存视图的草稿、创建/删除同步准入、未知写入及离页保护核查；当前 SearchRoute 仍只以异步 pending 状态准入，SearchPage 提交即清名称，未接共享保护。其余逐页和原生/真实身份门禁仍需证据。本地下一步无外部阻塞。未push、发布或远端迁移，未读取生产密钥文件。
