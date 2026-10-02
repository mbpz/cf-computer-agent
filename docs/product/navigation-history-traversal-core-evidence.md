# A05 / R2-008 历史遍历核心：两阶段准入与恢复状态机

2026-10-02；基线 `57bb774`；本地实现与测试，不是浏览器运行时接入或生产验收。

## 范围与结果

原清单30项、排除D08后29项：5完成、24未完成。A05/R2-008与共享计划Task 4保持开放。

- `workspace-navigation-gate.ts` 增加 prepare/一次性permit。批准后继续保留导航占用；实际到达才能commit，并重新读取全部草稿版本、写入锁及注册生命周期。
- `workspace-history-traversal.ts` 新增独立于DOM的历史状态机；accepted位置与浏览器原始位置分离。通过精确key/id/url恢复原条目后再询问，允许后仅重放最初目标；禁止猜测delta和用旧URL替代原条目身份。
- finished promise不替代目标到达事件；重复到达只发布一次。恢复失败锁定原视图并报告故障；未知目标仅恢复、不获准。
- 已排队重放在原位置被取消时不能立即释放。等待该重放settle，处理迟到到达、恢复原位置后再释放；不允许旧确认在新的尝试上生效。
- guard卸载、会话dispose、迟到的旧恢复失败、重复确认和同步端口错误均有覆盖。成功commit开始后的组件卸载不再误触发取消回调。

## RED → GREEN

1. 两阶段permit：原24项通过、新10项行为失败，随后103/103（协调器、位置、编辑器三个文件）通过。
2. 历史状态机：接口占位下15/15行为失败，实现后核心49/49通过。
3. 成功commit中的guard清理：新增1失败/34通过，修正为commit已开始时不调用取消回调。
4. 排队重放取消：新增2失败/22通过，修正为保持取消阶段占用直到排队重放已settle且原位置已恢复。原卸载例补充真实异步settle步骤，不能用未完成的promise假装已空闲。
5. 最终完整23文件 **530/530**，含协调器35与历史状态机24；现有位置、任务编辑器双入口、Tasks/Inbox、通知/消息、分页、shell/logout等回归通过。

## 其他验证

- 项目 `npm run typecheck` 通过。
- 新核心与workspace-location独立严格DOM类型检查通过。首次命令缺少TypeScript7的`--ignoreConfig`而退出；修正命令后退出0，不把首次失败冒充通过。
- `npm run build:ui` 与VM构建隔离通过；保留既有大chunk警告。
- `test:i18n` 13/13、`verify:i18n` 通过；清单审计仍29/5/24，清单契约测试9/9。
- Vitest启动打印现有AI binding警告；此次不调用AI、不读取/上传secret文件，不进行远程验收。

本地日志：

- `/tmp/a05-history-permit-red.log`、`/tmp/a05-history-permit-green.log`
- `/tmp/a05-history-traversal-red.log`
- `/tmp/a05-history-commit-cleanup-red.log`
- `/tmp/a05-history-queued-cancel-red.log`
- `/tmp/a05-history-core-full.log`
- `/tmp/a05-history-core-checks.log`、`/tmp/a05-history-core-dom-types.log`
- `/tmp/a05-history-core-checklist-tests.log`

## 接入约束与尚未完成

**当前workspace-location仍订阅原始popstate；该新状态机尚未接到浏览器，不能声称后退/前进已有保护。** 两阶段gate扩展不改变已有显式导航接口。

下一步在已批准Task 4中实现实际端口与位置订阅：精确验证Navigation API entry及traverseTo目标；恢复/重放期间阻止显式writer改变accepted anchor；将所有订阅及读取指向获准位置；确认会话结束先dispose旧历史控制器。端口负责真实事件、失败/超时与缺失能力提示，不能仅靠永不settle的promise冻结应用。

仍需RED/集成验证：无Navigation API与未知/失效条目恢复UI、reload/跨文档、连续浏览器按钮操作、真实Tasks/Inbox dirty及pending写入、原生键盘/触控与身份场景。浏览器端口必须处理“finished先于popstate”和同条目无事件等差异，不能依赖模拟环境代表原生行为。

没有push、发布、迁移、生产修改。下一步允许继续，无需重复设计批准；当前无已知外部阻塞。
