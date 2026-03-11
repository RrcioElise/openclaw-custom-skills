# 弟子监控系统 (Disciple Monitor)

自动监控所有 subagent 任务状态，识别异常并汇报。

## 功能

- ✅ 定时检查所有进行中的任务（默认 5 分钟）
- ✅ 自动识别异常情况（超时、卡死、错误）
- ✅ 自动汇报进度和异常（默认 15 分钟）
- ✅ 支持 Telegram 汇报
- ✅ 持久化状态，重启后恢复
- ✅ 任务完成自动通知

## 监控指标

### 运行时间
- 超过 10 分钟 → 记录
- 超过 30 分钟 → 警告
- 超过 60 分钟 → 高危

### 宗主响应超时（新增）
- 超过 2 分钟无响应 → 警告
- 超过 5 分钟无响应 → 高危
- 自动检测掌门人消息是否得到回复
- 防止模型卡死、网络问题导致干等

### 异常检测
- 任务卡死：5 分钟无更新且运行超过 10 分钟
- Token 异常：使用量超过 500k
- 任务报错：stopReason 为 error

## 使用方法

### 启动监控

```bash
# 直接运行
node ~/.openclaw/skills/disciple-monitor/monitor.mjs

# 使用 PM2 管理（推荐）
pm2 start ~/.openclaw/skills/disciple-monitor/monitor.mjs --name disciple-monitor

# 查看状态
pm2 status disciple-monitor

# 查看日志
pm2 logs disciple-monitor

# 停止监控
pm2 stop disciple-monitor

# 重启监控
pm2 restart disciple-monitor
```

### 配置

编辑 `~/.openclaw/skills/disciple-monitor/config.json`：

```json
{
  "checkInterval": 300000,
  "reportInterval": 900000,
  "masterTimeoutWarning": 120000,
  "masterTimeoutCritical": 300000
}
```

- `checkInterval`: 检查间隔（毫秒），默认 5 分钟
- `reportInterval`: 汇报间隔（毫秒），默认 15 分钟
- `masterTimeoutWarning`: 宗主响应警告阈值（毫秒），默认 2 分钟
- `masterTimeoutCritical`: 宗主响应高危阈值（毫秒），默认 5 分钟

## 汇报格式

### 正常汇报（每 15 分钟）

```
📊 弟子状态汇报

进行中：2 个
- 上等马：zns 界面重新设计 | 运行 15 分钟 | Token 30k
- 铁公鸡：动态杠杆策略 | 运行 20 分钟 | Token 60k

已完成：18 个
异常：0 个

下次汇报：15 分钟后
```

### 异常汇报（立即）

```
⚠️ 弟子异常警告

上等马：
- 任务：zns 界面重新设计
- 状态：运行超时（35 分钟）
- Token：150k
- 最后更新：5 分钟前
- 建议：检查任务进度或考虑终止
```

### 完成汇报（任务完成时）

```
✅ 弟子任务完成

上等马：
- 任务：zns 界面重新设计
- 耗时：25 分钟
- Token：80k
- 状态：成功完成
```

### 宗主响应超时警告（新增）

```
⚠️ 宗主响应较慢（2分钟+）

宗主正在处理中，请稍候...
```

```
🚨 宗主响应超时（5分钟+）

可能原因：
- 模型调用卡死
- 网络连接问题
- 进程异常或崩溃
- 任务过于复杂

建议立即检查 Gateway 状态
```

## 文件说明

- `monitor.mjs`: 核心监控脚本
- `config.json`: 配置文件
- `monitor.log`: 运行日志
- `monitor-state.json`: 状态持久化文件

## 自动启动

### 使用 PM2（推荐）

```bash
# 安装 PM2
npm install -g pm2

# 启动监控
pm2 start ~/.openclaw/skills/disciple-monitor/monitor.mjs --name disciple-monitor

# 设置开机自启
pm2 startup
pm2 save
```

### 使用 launchd（macOS）

创建 `~/Library/LaunchAgents/com.openclaw.disciple-monitor.plist`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.openclaw.disciple-monitor</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/Users/user/.openclaw/skills/disciple-monitor/monitor.mjs</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/user/.openclaw/skills/disciple-monitor/stdout.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/user/.openclaw/skills/disciple-monitor/stderr.log</string>
</dict>
</plist>
```

加载服务：

```bash
launchctl load ~/Library/LaunchAgents/com.openclaw.disciple-monitor.plist
```

## 故障排查

### 监控未运行

```bash
# 检查进程
pm2 status disciple-monitor

# 查看日志
tail -f ~/.openclaw/skills/disciple-monitor/monitor.log
```

### 无法发送 Telegram 消息

检查 OpenClaw 配置和 Telegram bot token。

### 检查间隔太长/太短

修改 `config.json` 中的 `checkInterval` 和 `reportInterval`。

## 集成到 HEARTBEAT

在 `HEARTBEAT.md` 中添加：

```markdown
## 弟子监控

检查监控脚本是否运行：
- 如果未运行，立即启动
- 如果运行异常，重启
- 汇报监控状态
```

## 注意事项

1. 监控脚本需要常驻运行，建议使用 PM2 管理
2. 首次启动会立即执行一次检查
3. 状态文件用于重启后恢复，不要手动删除
4. 日志文件会持续增长，建议定期清理

## 版本历史

- v1.1.0 (2026-03-11): 宗主响应超时检测
  - 新增宗主响应超时监控
  - 2分钟警告，5分钟高危
  - 自动检测掌门人消息是否得到回复
  - 防止模型卡死导致干等
- v1.0.0 (2026-03-10): 初始版本
  - 基础监控功能
  - 异常检测
  - Telegram 汇报
  - 状态持久化
