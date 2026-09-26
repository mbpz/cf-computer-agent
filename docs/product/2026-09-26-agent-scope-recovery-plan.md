# B08 来源范围和会话恢复 — 本地执行切片

范围：沿用现有 chat_conversations/chat_messages；不新增数据库、部署、远程迁移或客户端正文存储。

- [x] RED：无效来源不得回退 all；恢复必须 owner-bound、引用重新鉴权；前端恢复失败不得发送新回合。
- [x] GET 单会话恢复接口，最多最近 8 条消息，no-store，不调用 AI。
- [x] all/space/collection/items 显式来源控件；应用来源明确开启新会话，不隐式修改旧会话。
- [x] 会话恢复链接与恢复状态；异步卸载/成员切换隔离；保持 Stop 既有语义。
- [x] GREEN、回归、typecheck/build/i18n/maturity/domain/delivery gates。
- [x] 更新父 checklist 的局部证据，验证后进入本地提交。

暂不宣称：历史列表/分页、回合幂等、原生浏览器身份验收或生产上线；B08 父项保持未关闭。
