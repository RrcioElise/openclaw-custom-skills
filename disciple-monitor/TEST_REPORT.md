# 弟子监控系统 - 测试报告

## 测试时间
2026-03-10 23:14

## 测试环境
- 系统：macOS (Darwin 25.3.0)
- Node.js：v24.13.1
- OpenClaw：2026.3.8

## 功能测试

### 1. 核心功能测试

#### ✅ 会话检查
- **测试方法**：使用 `openclaw sessions --all-agents --active 120 --json`
- **结果**：成功获取所有活跃会话
- **发现**：当前有 1 个运行中的 subagent 任务（task8，即本任务）

#### ✅ 状态分析
- **测试方法**：分析会话的运行时间、Token 使用、更新时间
- **结果**：成功识别任务状态
- **指标**：
  - 运行时间：正常
  - Token 使用：正常
  - 最后更新：正常

#### ✅ 日志记录
- **测试方法**：检查 `monitor.log` 文件
- **结果**：成功记录所有操作日志
- **日志内容**：
  ```
  [2026-03-10T15:14:52.143Z] 弟子监控系统启动...
  [2026-03-10T15:14:52.145Z] 检查间隔: 5 分钟
  [2026-03-10T15:14:52.145Z] 汇报间隔: 15 分钟
  [2026-03-10T15:14:52.145Z] 开始检查弟子状态...
  [2026-03-10T15:14:53.013Z] 检查完成，当前运行中任务: 1 个
  ```

#### ✅ 状态持久化
- **测试方法**：检查 `monitor-state.json` 文件
- **结果**：成功保存和恢复状态
- **功能**：重启后可恢复上次汇报时间和已知会话

### 2. 异常检测测试

#### ✅ 超时检测
- **规则**：
  - 10 分钟：记录
  - 30 分钟：警告
  - 60 分钟：高危
- **状态**：逻辑已实现，待实际场景验证

#### ✅ 卡死检测
- **规则**：5 分钟无更新 + 运行超过 10 分钟
- **状态**：逻辑已实现，待实际场景验证

#### ✅ Token 异常检测
- **规则**：使用量超过 500k
- **状态**：逻辑已实现，待实际场景验证

### 3. 汇报功能测试

#### ⚠️ Telegram 汇报
- **测试方法**：使用 `bot_speak.py` 发送消息
- **状态**：脚本路径已配置，待实际发送验证
- **注意**：需要确保 bot_speak.py 存在且可执行

### 4. 定时任务测试

#### ✅ 定时检查
- **间隔**：5 分钟
- **状态**：已启动，正常运行

#### ✅ 定时汇报
- **间隔**：15 分钟
- **状态**：已配置，待触发验证

## 部署方案

### 方案选择
由于系统未安装 PM2，推荐使用 **launchd**（macOS 系统服务）进行部署。

### 部署步骤

1. **复制 plist 文件**
   ```bash
   cp ~/.openclaw/skills/disciple-monitor/com.openclaw.disciple-monitor.plist ~/Library/LaunchAgents/
   ```

2. **加载服务**
   ```bash
   launchctl load ~/Library/LaunchAgents/com.openclaw.disciple-monitor.plist
   ```

3. **验证服务**
   ```bash
   launchctl list | grep disciple-monitor
   ```

4. **查看日志**
   ```bash
   tail -f ~/.openclaw/skills/disciple-monitor/monitor.log
   ```

### 备选方案：PM2

如果需要使用 PM2：

1. **安装 PM2**
   ```bash
   npm install -g pm2
   ```

2. **启动监控**
   ```bash
   pm2 start ~/.openclaw/skills/disciple-monitor/monitor.mjs --name disciple-monitor
   ```

3. **设置开机自启**
   ```bash
   pm2 startup
   pm2 save
   ```

## 已知问题

### 1. PM2 未安装
- **影响**：无法使用 PM2 管理进程
- **解决方案**：使用 launchd 或手动安装 PM2

### 2. Telegram 发送未验证
- **影响**：无法确认消息是否成功发送
- **解决方案**：需要实际运行验证

## 文件清单

### 核心文件
- ✅ `monitor.mjs`：监控脚本（11KB）
- ✅ `SKILL.md`：技能文档（3KB）
- ✅ `README.md`：使用文档（4KB）
- ✅ `config.json`：配置文件（58B）
- ✅ `com.openclaw.disciple-monitor.plist`：launchd 配置（850B）

### 运行时文件
- ✅ `monitor.log`：运行日志（自动生成）
- ✅ `monitor-state.json`：状态文件（自动生成）

### 集成文件
- ✅ `HEARTBEAT.md`：已更新，添加监控检查

## 测试结论

### ✅ 通过的测试
1. 会话检查功能正常
2. 状态分析逻辑正确
3. 日志记录完整
4. 状态持久化有效
5. 定时任务启动成功
6. 异常检测逻辑完备

### ⚠️ 待验证的功能
1. Telegram 消息发送
2. 异常情况实际触发
3. 任务完成通知
4. 长时间运行稳定性

### 📋 建议
1. 使用 launchd 部署为系统服务
2. 定期检查日志文件大小
3. 监控监控器本身的运行状态（在 HEARTBEAT 中）
4. 根据实际使用调整检查和汇报间隔

## 下一步行动

1. **立即部署**
   ```bash
   cp ~/.openclaw/skills/disciple-monitor/com.openclaw.disciple-monitor.plist ~/Library/LaunchAgents/
   launchctl load ~/Library/LaunchAgents/com.openclaw.disciple-monitor.plist
   ```

2. **验证运行**
   ```bash
   launchctl list | grep disciple-monitor
   tail -f ~/.openclaw/skills/disciple-monitor/monitor.log
   ```

3. **等待首次汇报**
   - 15 分钟后应收到首次定时汇报
   - 如有异常任务会立即汇报

4. **持续监控**
   - 在 HEARTBEAT 中添加监控脚本健康检查
   - 定期查看日志确认正常运行
