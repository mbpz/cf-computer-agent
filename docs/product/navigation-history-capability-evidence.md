# A05 / R2-008 历史导航能力与适配决策

2026-10-02；本地基线 `7431102`。这是计划Task4的能力核验，不是历史离开保护的完成验收。原生操作使用用户指定的Codex内置浏览器，在无账户/秘密/产品数据的127.0.0.1临时页执行；没有操作生产或VM连接器。

## 官方语义核验

来源：WHATWG HTML Living Standard，https://html.spec.whatwg.org/multipage/nav-history-apis.html ，页面标记更新日期2026-10-01。本机只读下载成功，原始HTML临时文件 `/tmp/a05-navigation-spec.html`，SHA256 `61341cff3e3ede3ceba2af116d84cd32d5e8ad277b319cfcd250c06e3d394636`。web工具未提供正文；Chrome开发者站读取超时，未把这些失败当作核验通过。

核验章节为Navigation API、NavigateEvent/intercept、NavigationHistoryEntry/traverseTo：

- navigate并非总可取消，重复阻止后的遍历、子文档或跨源遍历可处于不可取消分支。
- precommitHandler在currentEntry更新前运行，拒绝Promise可阻止提交，但只允许用于可取消事件。普通handler在条目更新后运行，不能替代提交前准入。
- 条目key与URL不是同一身份；traverseTo通过key定位同源历史条目。不能用相同URL推断相同条目，也不能猜测未知历史的delta。
- 地址栏发起的新文档导航不都经过navigate；刷新/跨文档必须另验，不能以本页成功外推。

## 原生实测（非happy-dom）

可复用探针：`design/navigation/2026-10-02-history-capability-probe.html`。只在本机静态服务器打开；无外部脚本、fetch、存储或账户。

环境报告为 `Chrome/154.0.0.0` 的缩减UA；navigation存在、NavigateEvent.intercept为函数、本地secure context=true。**未取得完整浏览器版本**：内置浏览器不支持原始CDP Browser.getVersion；缩减UA不替代版本/证书/默认安全配置验收。没有修改浏览器安全配置。

| 操作 | 实际结果 | 可证明范围 |
| --- | --- | --- |
| push两次，策略defer-precommit，点击页内Back | traverse: cancelable=true、canIntercept=true；precommit中URL仍/entry-2、index2 | 此分支可等待确认，不提前移动位置 |
| 点击Reject pending | navigateerror；URL仍/entry-2、index2，未出现目标popstate | 拒绝Promise保留原条目 |
| 策略cancel，连续两次页内Back | 两次defaultPrevented=true，仍/entry-2 | 页内按钮这两次可取消；不代表所有来源 |
| 紧接着改defer-precommit，执行浏览器级Back | cancelable=false；intercept抛InvalidStateError；随后currententrychange及popstate到/entry-1 | **真实反例：只用precommit拦截会漏掉浏览器后退** |
| 新文档回到探针根路径，再push两次并记住当前key | 记住/entry-2、index4、key K；原生Back到/entry-1、index3 | 不把index0当作固定初始位置 |
| 点击Restore accepted key，调用traverseTo(K) | 恢复/entry-2、index4、同一key K | 通过实际条目身份恢复，不用replaceState伪造URL |

恢复序列还观察到finished回调早于该次popstate日志。**不能把Promise完成和popstate各发布一次路由变化**；适配器需要条目身份及阶段去重。UUID仅临时条目标识，不是业务身份，报告以K表示。

### 复现步骤

1. 在独立本机测试页打开探针，push两次。选defer-precommit → 页内Back → Reject pending。
2. 选cancel → 页内Back两次；选defer-precommit → 使用浏览器Back（不是再点页内Back）。观察不可取消分支及错误日志。该行为受浏览器干预策略影响，不承诺每次序列一定相同；任何出现一次都足以否定“总是可取消”的假设。
3. 重新打开根路径形成新文档，push两次 → Remember accepted entry → 浏览器Back → Restore accepted key。确认URL、index、key全部恢复。

## 选择的适配约束与下一步

不采用“全部依赖preventDefault/precommit”、也不通过replaceState回写旧URL冒充位置恢复。继续已批准方案，不需要重新询问设计许可：

1. 共享层持有获准位置，所有路由订阅仅由获准提交通知；原始popstate不得直接使页面卸载或触发目标读取。
2. 可取消/可拦截分支可作增强；不可取消分支必须有按已验证条目身份恢复的路径。恢复与目标重放分阶段，固定首次目标，并在最终提交前再次验证原guard注册/草稿版本/写入锁。
3. 新增RED覆盖取消后恢复、确认后的单次目标提交、重复遍历、恢复期间显式导航、Promise/event去重及卸载/会话失效。
4. 未知条目、旧文档/刷新后的key、Navigation API不可用、恢复失败，不可猜delta或默许丢弃。需明确失败关闭和恢复UI，并独立原生验证后才关闭该适配任务。

## 当前完成状态

Task4能力核验子项完成，运行时适配、集成RED→GREEN及完整原生验收仍开放。产品popstate目前仍原始订阅，**尚未提供浏览器后退/前进保护**。父项继续 **29范围内 / 5完成 / 24剩余**；A05与R2-008不勾选。下一步本地测试/实现允许继续，无需用户操作；未push、部署或迁移。
