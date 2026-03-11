# 弟子监控系统 - 使用文档

## 快速开始

### 1. 使用 PM2 启动（推荐）

```bash
# 安装 PM2（如果未安装）
npm install -g pm2

# 启动监控
pm2 start ~/.openclaw/skills/disciple-monitor/monitor.mjs --name disciple-monitor

# 查看状态
pm2 status

# 查看日志
pm2 logs disciple-monitor

# 设置开机自启
pm2 startup
pm2 save
```

### 2. 使用 launchd 启动（macOS 系统服务）

```bash
# 复制 plist 文件到 LaunchAgents
cp ~/.openclaw/skills/disciple-monitor/com.openclaw.disciple-monitor.plist ~/Library/LaunchAgents/

# 加载服务
launchctl load ~/Library/LaunchAgents/com.openclaw.disciple-monitor.plist

# 查看服务状态
launchctl list | grep disciple-monitor

# 停止服务
launchctl unload ~/Library/LaunchAgents/com.openclaw.disciple-monitor.plist
```

### 3. 直接运行（测试用）

```bash
node ~/.openclaw/skills/disciple-monitor/monitor.mjs
```

## 配置说明

编辑 `~/.openclaw/skills/disciple-monitor/config.json`：

```json
{
  "checkInterval": 300000,    // 检查间隔（毫秒），默认 5 分钟
  "reportInterval": 900000    // 汇报间隔（毫秒），默认 15 分钟
}
```

修改后需要重启监控：

```bash
# PM2
pm2 restart disciple-monitor

# launchd
launchctl unload ~/Library/LaunchAgents/com.openclaw.disciple-monitor.plist
launchctl load ~/Library/LaunchAgents/com.openclaw.disciple-monitor.plist
```

## 常用命令

### PM2 管理

```bash
# 启动
pm2 start ~/.openclaw/skills/disciple-monitor/monitor.mjs --name disciple-monitor

# 停止
pm2 stop disciple-monitor

# 重启
pm2 restart disciple-monitor

# 删除
pm2 delete disciple-monitor

# 查看日志
pm2 logs disciple-monitor

# 查看实时日志
pm2 logs disciple-monitor --lines 100

# 清空日志
pm2 flush disciple-monitor
```

### 查看日志

```bash
# 查看监控日志
tail -f ~/.openclaw/skills/disciple-monitor/monitor.log

# 查看最近 50 行
tail -n 50 ~/.openclaw/skills/disciple-monitor/monitor.log

# 查看标准输出（launchd）
tail -f ~/.openclaw/skills/disciple-monitor/stdout.log

# 查看错误输出（launchd）
tail -f ~/.openclaw/skills/disciple-monitor/stderr.log
```

### 查看状态

```bash
# 查看状态文件
cat ~/.openclaw/skills/disciple-monitor/monitor-state.json

# 格式化输出
cat ~/.openclaw/skills/disciple-monitor/monitor-state.json | jq .
```

## 故障排查

### 问题：监控未运行

**检查步骤：**

1. 检查进程是否存在
```bash
pm2 status disciple-monitor
# 或
ps aux | grep monitor.mjs
```

2. 查看日志
```bash
tail -f ~/.openclaw/skills/disciple-monitor/monitor.log
```

3. 手动启动测试
```bash
node ~/.openclaw/skills/disciple-monitor/monitor.mjs
```

### 问题：无法发送 Telegram 消息

**可能原因：**
- OpenClaw 配置问题
- Telegram bot token 无效
- 网络连接问题

**解决方法：**
1. 检查 OpenClaw 配置
2. 测试 Telegram 连接
3. 查看错误日志

### 问题：检查频率不对

**解决方法：**
修改 `config.json` 中的 `checkInterval` 和 `reportInterval`，然后重启监控。

### 问题：日志文件过大

**解决方法：**
```bash
# 清空日志
> ~/.openclaw/skills/disciple-monitor/monitor.log

# 或使用 logrotate 自动管理
```

## 监控指标说明

### 运行时间阈值
- **10 分钟**：开始记录
- **30 分钟**：警告级别
- **60 分钟**：高危级别

### 卡死判断
- 5 分钟无更新 + 运行超过 10 分钟 = 可能卡死

### Token 警告
- 使用量超过 500k 触发警告

## 汇报示例

### 正常汇报
```
📊 弟子状态汇报

进行中：2 个
- 上等马：zns 界面重新设计 | 运行 15 分钟 | Token 30k
- 铁公鸡：动态杠杆策略 | 运行 20 分钟 | Token 60k

已完成：18 个
异常：0 个

下次汇报：15 分钟后
```

### 异常汇报
```
⚠️ 弟子异常警告

上等马：
- 任务：zns 界面重新设计
- 状态：运行超时（35 分钟）
- Token：150k
- 最后更新：5 分钟前
- 建议：检查任务进度或考虑终止
```

### 完成汇报
```
✅ 弟子任务完成

上等马：
- 任务：zns 界面重新设计
- 耗时：25 分钟
- Token：80k
- 状态：成功完成
```

## 最佳实践

1. **使用 PM2 管理**：更稳定，支持自动重启
2. **定期查看日志**：及时发现问题
3. **合理设置间隔**：根据实际需求调整检查和汇报频率
4. **监控监控器**：在 HEARTBEAT.md 中添加监控脚本的健康检查
5. **日志轮转**：防止日志文件过大

## 集成到 HEARTBEAT

在 `HEARTBEAT.md` 中添加：

```markdown
## 弟子监控系统

每次心跳检查监控脚本状态：

1. 检查 PM2 进程是否运行
2. 如果未运行，立即启动
3. 如果运行异常，重启
4. 汇报监控状态

命令：
- 检查：`pm2 status disciple-monitor`
- 启动：`pm2 start ~/.openclaw/skills/disciple-monitor/monitor.mjs --name disciple-monitor`
- 重启：`pm2 restart disciple-monitor`
```

## 卸载

```bash
# 停止并删除 PM2 进程
pm2 stop disciple-monitor
pm2 delete disciple-monitor

# 或卸载 launchd 服务
launchctl unload ~/Library/LaunchAgents/com.openclaw.disciple-monitor.plist
rm ~/Library/LaunchAgents/com.openclaw.disciple-monitor.plist

# 删除文件
rm -rf ~/.openclaw/skills/disciple-monitor
```

## 技术支持

如有问题，请查看：
1. 监控日志：`~/.openclaw/skills/disciple-monitor/monitor.log`
2. PM2 日志：`pm2 logs disciple-monitor`
3. 状态文件：`~/.openclaw/skills/disciple-monitor/monitor-state.json`
