# Changelog - Disciple Monitor

## v1.1.0 (2026-03-11) - 宗主响应超时检测

### 新增功能

#### 宗主响应超时监控
- 自动检测掌门人消息是否得到宗主回复
- 2分钟无响应发出警告
- 5分钟无响应发出高危警告
- 防止模型卡死、网络问题导致干等

### 技术实现

#### 数据收集方式
- 直接读取最新的会话文件（.jsonl）
- 解析最后几条消息判断是用户还是宗主
- 使用文件系统而非 CLI 命令（更可靠）

#### 状态追踪
```javascript
masterState: {
  lastReplyTime: Date.now(),
  lastUserMessageTime: null,
  pendingUserMessage: false,
  lastWarningLevel: null  // 防止重复警告
}
```

#### 超时阈值
- `masterTimeoutWarning`: 2分钟（120000ms）
- `masterTimeoutCritical`: 5分钟（300000ms）

### 配置项

在 `config.json` 中添加：
```json
{
  "masterTimeoutWarning": 120000,
  "masterTimeoutCritical": 300000
}
```

### 警告示例

#### 2分钟警告
```
⚠️ 宗主响应较慢（2分钟+）

宗主正在处理中，请稍候...
```

#### 5分钟高危
```
🚨 宗主响应超时（5分钟+）

可能原因：
- 模型调用卡死
- 网络连接问题
- 进程异常或崩溃
- 任务过于复杂

建议立即检查 Gateway 状态
```

### 防误报机制

1. **防止重复警告**：使用 `lastWarningLevel` 记录已发送的警告级别
2. **状态持久化**：重启后恢复 `masterState`
3. **智能判断**：区分用户消息和宗主回复
4. **自动清除**：宗主回复后自动清除待回复状态

### 测试验证

✅ 检测到掌门人新消息
✅ 宗主回复后自动清除状态
✅ 监控脚本正常运行（launchd）
✅ 日志记录完整

### 文件修改

- `monitor.mjs`: 新增 `checkMasterResponse()` 方法
- `SKILL.md`: 更新文档，添加宗主响应超时说明
- `CHANGELOG.md`: 本文件

### 部署状态

- ✅ 代码已更新
- ✅ launchd 服务已重启
- ✅ 监控脚本正常运行（PID: 74181）
- ✅ 日志输出正常

### 下一步优化建议

1. 添加心跳机制：宗主可以主动更新"我还活着"状态
2. 区分思考时间：模型调用中不算超时
3. 可配置的超时阈值：不同场景不同阈值
4. 历史统计：记录平均响应时间，动态调整阈值
