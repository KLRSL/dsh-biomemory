# dsh-biomemory · 生物仿生记忆系统

给 DeepSeek Harness (DSH) 的跨会话记忆插件：像人脑一样分层记、分级审、透明可改。

- 纯文件 Markdown 数据层（默认 `~/.dsh/memory`，`DSH_MEMORY_ROOT` 环境变量可覆盖）——肉眼可读、手改即生效
- `memory` 工具：add / query / remove / list
- 会话启动自动注入**冻结记忆快照**（最高优先级用户偏好 + 近期知识/行为记忆）
- **分级审批门**：重要记忆（偏好/决策/教训）走人工审批，普通事实自动写入；无审批通道时 fail closed
- 审计日志：每次写入可追溯
- `/memory` 命令：list / query / add / remove / audit
- `memory_recall` 工具：跨会话召回（"你还记得…吗"场景）
- 去重：内容指纹跳过重复记忆

## 安装

```bash
# 在 DSH profile 中作为本地 bundle 使用
dsh plugin add dsh-biomemory
# 或 pnpm 本地 link
pnpm add link:./dsh-biomemory
```

在 profile 的 `dsh.profile.bundles` 中加入 `dsh-biomemory`。

## 记忆结构

```
~/.dsh/memory/
├── preferences.md      # 用户/项目偏好（最高优先级，冻结注入）
├── hot/
│   ├── knowledge.md    # L1 近期知识（事实/决策）
│   └── behavior.md     # L1 近期行为（教训/习惯/工作流）
├── projects/<项目>/    # L2 项目档案
├── longterm/           # L3 长期记忆体
└── audit.log           # 写入审计
```

## 配置

```js
// 插件配置（bundle 或 profile 层）
{
  petEndpoint: null // 可选：本地通知服务 URL（配置后启用桌宠/通知联动，默认关闭）
}
```

## 兼容性

- Node >= 22.19.0
- `@deepseek-ai/dsh-*` 0.1.0-rc.5 运行时（按实际 lib 源码核对实现）

## License

MIT
