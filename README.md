# OpenClaw Custom Skills

牛马宗自建技能集合，用于 OpenClaw 多 agent 协作系统。

## 技能列表

### 1. disciple-monitor
**弟子监控系统** - 实时监控 sub-agent 运行状态

- 自动检测任务超时、卡死、异常
- 监控 launchd 定时任务和后端服务
- 支持告警分级（警告/严重）
- 可配置阈值和检查间隔

**主要文件：**
- `monitor.mjs` - 核心监控脚本
- `config.json` - 配置文件
- `com.openclaw.disciple-monitor.plist` - launchd 配置
- `SKILL.md` - 完整文档

### 2. dispatch-sop-v2
**调度 SOP** - 标准化任务拆解、派发、执行、验收流程

- Intake → Planning → Execution → Gate 四阶段流程
- 冲突预检与文件 owner 规则（一时段一文件一 owner）
- 30秒回执 + 5-10分钟进度 SLA
- 角色分工、流程细节、汇报模板

**主要文件：**
- `SKILL.md` - 主流程说明
- `references/roles.md` - 角色定义与责任边界
- `references/workflow.md` - 详细工作流
- `references/templates.md` - 标准汇报模板

### 3. exa
**神经网络搜索** - 基于 Exa AI API 的智能搜索

- 神经搜索、代码上下文、内容提取
- 支持多种搜索类型（neural/fast/deep）
- 支持分类过滤（company/research-paper/news/github 等）

**主要文件：**
- `SKILL.md` - 使用说明
- `scripts/search.sh` - 网页搜索
- `scripts/code.sh` - 代码上下文搜索
- `scripts/content.sh` - 内容提取

## 安装

将技能目录复制到 `~/.openclaw/skills/`：

```bash
cp -r disciple-monitor ~/.openclaw/skills/
cp -r dispatch-sop-v2 ~/.openclaw/skills/
cp -r exa ~/.openclaw/skills/
```

## 配置

### disciple-monitor
编辑 `config.json` 设置检查间隔和阈值。

### exa
设置环境变量：
```bash
export EXA_API_KEY="your-api-key-here"
```

获取 API Key：https://dashboard.exa.ai/api-keys

## 使用场景

- **disciple-monitor**: 生产环境监控，防止任务卡死或服务异常
- **dispatch-sop-v2**: 多人并行任务协作，避免文件冲突
- **exa**: 智能搜索文档、代码示例、研究论文

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request。

## 相关项目

- [OpenClaw](https://github.com/openclaw/openclaw) - AI Agent 协作框架
- [ClawHub](https://clawhub.com) - Agent 技能市场
