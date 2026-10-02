# A05 / R2-008：导航获准后的路由提交

基线 `4478d21`，分支 `codex/functional-checklist-completion`。继续已批准的导航保护计划Task 2，不重新请求方案批准。

## 实际实现与边界

- `workspace-location`按window持有共享准入协调器，新增`registerWorkspaceLeaveGuard`。`writeWorkspaceHistory`返回committed/deferred/blocked，第三参数承载获准后执行的路由副作用。顺序为history成功→路由回调→一次共享事件；历史写入失败不执行副作用。已成功写入后若业务回调抛错仍通知位置，不能把这称为任意异常都可回滚的事务。
- 延迟请求绑定原window与解析后的目标地址；订阅清理也绑定原window，避免旧组件清理新窗口订阅。
- `App`只有在服务器注销及匿名会话确认成功后才调用`endWorkspaceSession`，使旧决定失效、分离旧注册并立即清理私有会话。退出失败保留错误与原页面，不谎称已退出；网络资源撤销保持原语义。
- 将25处查询ref、state、读取失效、过滤定时器和分页pending等导航副作用移动到获准提交内。用户正在输入的筛选草稿不是导航提交，不提前丢弃。
- **TaskEditor尚未注册到此接口。** 本轮证明有保护注册时的共享路径与实际路由原子性；用户任务草稿尚未自动触发全局导航保护。后退/前进仍是原始popstate订阅，留待Task 4，不用显式导航单测替代历史或原生验收。

## writer覆盖清单

原静态审计40处调用现在对应39处`writeWorkspaceHistory`与1处`endWorkspaceSession`：

| 分类 | 数量 | 范围 |
|---|---:|---|
| App内获准回调 | 25 | 分析1；知识1；搜索3；Agent1；投稿1；任务1；Inbox1；目标/项目/项目时间线3；日历1；通知2；消息2；看板2；审核1；重复项1；成员1；审计2；附件1 |
| App内仅写URL | 11 | Shell1；五个页码规范化replace；项目时间线入口/返回2；通知目标1；消息创建后目标1；审核详情1 |
| 其他页面仅写URL | 3 | review-detail-route、today-page、workbench-review-page各1 |
| 确认会话结束 | 1 | App注销成功，单独清理，不以replace自动跳过保护 |

外部页面只写URL，无查询副作用需要迁移；两个`history.back`、跨文档链接与beforeunload不在本轮新增验收范围内。

## 验证结果

- 共享位置首轮13项：12失败/1通过，其中10项为新接口不存在，2项为提交回调缺失/订阅清理行为失败；不把接口缺失误称为全部行为RED。接入后13/13；追加回调异常与通知重入后15/15。
- 真实TasksRoute新增2项行为RED：URL未变，但请求数从1变2。修复后取消不改变查询、不取消原请求；接受仅一次新读取。
- 新增Inbox真实App两项取消/接受测试，验证待决定时不清行、不进入加载、不改变页码；新增App注销成功/失败两项，验证立即清私有数据、旧决定不可重放。
- **20文件437/437通过**（共享位置当时13项）；追加2项异常测试后位置文件**15/15通过**。没有把两个不同测试运行计为单次439项运行。
- 共享核心/位置及新DOM测试独立严格TypeScript检查、项目typecheck、build:ui和静态VM隔离验证通过；清单校验器9/9，canonical计数29范围内/5完成/24未完成。
- 修正两处验证环境问题：新DOM测试改为`.tsx`以符合现有Worker-only typecheck边界；首页注销测试补MutationObserver模拟。旧运行1失败/436通过不计成功；修复后20文件重跑全绿。未扩大Worker全局DOM类型，也未声称所有frontend TSX已严格类型检查。
- 保留现有AI binding与chunk大小告警；无实际AI调用。

日志：`/tmp/a05-atomic-{location-red,location-green,route-red,route-green,security-inbox,regression,regression-green,exceptions,build}.log`。

## 状态

Task 2本地完成，A05/R2-008保持开放，29范围内/5完成/24未完成。下一允许任务是Task 3的Tasks与Inbox任务编辑器接入，无需重复批准；随后必须完成Task 4历史适配与浏览器验收。未push、部署、远程迁移、读取/上传SECRETS_FILE、更新预览或执行原生浏览器验收。
