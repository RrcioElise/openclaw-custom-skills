#!/usr/bin/env node
/**
 * 弟子监控系统 - Disciple Monitor (修复版)
 * 自动监控所有 subagent 任务状态，识别异常并汇报
 * 
 * 修复内容：
 * 1. OpenClaw CLI 命令错误（subagents -> sessions）
 * 2. Telegram 发送参数错误（移除 --channel）
 * 3. 添加错误重试机制
 * 4. 改进日志输出
 * 5. 添加健康检查功能
 * 6. 添加降级方案
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 日志级别
const LOG_LEVELS = {
  ERROR: '[ERROR]',
  WARN: '[WARN]',
  INFO: '[INFO]',
  DEBUG: '[DEBUG]'
};

/**
 * 重试工具函数
 */
async function retryAsync(fn, maxRetries = 3, delayMs = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      console.log(`[RETRY] 第 ${i + 1} 次重试失败，${delayMs}ms 后重试...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

class DiscipleMonitor {
  constructor(config = {}) {
    this.checkInterval = config.checkInterval || 60 * 1000; // 1 分钟
    this.reportInterval = config.reportInterval || 15 * 60 * 1000; // 15 分钟（仅用于记录，实际不再定时汇报）
    this.lastReport = Date.now();
    this.knownSessions = new Map();
    this.logFile = path.join(__dirname, 'monitor.log');
    this.stateFile = path.join(__dirname, 'monitor-state.json');
    this.telegramFailedLog = path.join(__dirname, 'telegram-failed.log');
    
    // 弟子名册
    this.disciples = {
      task1: '拉磨驴', task2: '上等马', task3: '看门狗', task4: '领头羊',
      task5: '出头鸟', task6: '铁公鸡', task7: '笑面虎', task8: '妙法天尊',
      task9: '天地一子', task10: '探宝鼠', task11: '知更鸟', task12: '涨停板',
      task13: '哲学猫', task14: '旅行者', task15: '派蒙', task16: '大根骑士'
    };

    // 告警阈值配置（新）
    this.taskWarningThreshold = config.taskWarningThreshold || 10 * 60 * 1000; // 10分钟
    this.taskCriticalThreshold = config.taskCriticalThreshold || 20 * 60 * 1000; // 20分钟
    this.taskStuckThreshold = config.taskStuckThreshold || 3 * 60 * 1000; // 3分钟无更新
    
    // 宗主响应超时配置
    this.masterTimeoutWarning = config.masterTimeoutWarning || 2 * 60 * 1000; // 2分钟
    this.masterTimeoutCritical = config.masterTimeoutCritical || 5 * 60 * 1000; // 5分钟
    
    // 后端服务监控配置（新）
    this.backendServices = config.backendServices || [
      { name: 'ai.openclaw.projecthub', label: 'ProjectHub' },
      { name: 'ai.openclaw.intelhub', label: 'IntelHub' },
      { name: 'ai.openclaw.financehub', label: 'FinanceHub' },
      { name: 'ai.openclaw.staroffice', label: 'StarOffice' }
    ];
    
    // 宗主状态追踪
    this.masterState = {
      lastReplyTime: Date.now(),
      lastUserMessageTime: null,
      pendingUserMessage: false,
      lastWarningLevel: null // 防止重复警告
    };

    this.loadState();
  }

  loadState() {
    try {
      if (fs.existsSync(this.stateFile)) {
        const state = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
        this.lastReport = state.lastReport || Date.now();
        this.knownSessions = new Map(state.knownSessions || []);
        if (state.masterState) {
          this.masterState = { ...this.masterState, ...state.masterState };
        }
      }
    } catch (err) {
      this.log(LOG_LEVELS.ERROR, `加载状态失败: ${err.message}`);
    }
  }

  saveState() {
    try {
      const state = {
        lastReport: this.lastReport,
        knownSessions: Array.from(this.knownSessions.entries()),
        masterState: this.masterState
      };
      fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
    } catch (err) {
      this.log(LOG_LEVELS.ERROR, `保存状态失败: ${err.message}`);
    }
  }

  log(level, message) {
    const timestamp = new Date().toISOString();
    const logMessage = `${timestamp} ${level} ${message}`;
    console.log(logMessage);
    
    try {
      fs.appendFileSync(this.logFile, logMessage + '\n');
    } catch (err) {
      console.error('写入日志失败:', err);
    }
  }

  /**
   * 检查 launchd 服务状态（包括定时任务和后端服务）
   */
  async checkLaunchdJobs() {
    this.log(LOG_LEVELS.DEBUG, '检查 launchd 服务状态...');
    
    const jobs = [
      { name: 'ai.openclaw.binance-morning-news', label: '晨报', type: 'cron' },
      { name: 'ai.openclaw.binance-hourly-check', label: '整点检查', type: 'cron' },
      { name: 'ai.openclaw.disciple-monitor', label: '弟子监控', type: 'cron' },
      ...this.backendServices.map(s => ({ ...s, type: 'service' }))
    ];
    
    const jobStatuses = [];
    
    for (const job of jobs) {
      try {
        // 检查任务是否加载
        const { stdout: listOutput } = await execAsync(`launchctl list | grep ${job.name}`);
        const loaded = listOutput.trim().length > 0;
        
        if (!loaded) {
          jobStatuses.push({
            name: job.name,
            label: job.label,
            type: job.type,
            status: 'not_loaded',
            lastRun: null,
            error: null
          });
          continue;
        }
        
        // 解析状态
        const parts = listOutput.trim().split(/\s+/);
        const pid = parts[0] === '-' ? null : parseInt(parts[0]);
        const exitCode = parts[1] === '-' ? null : parseInt(parts[1]);
        
        // 判断状态
        let status;
        if (job.type === 'service') {
          // 后端服务应该一直运行
          if (pid) {
            status = 'running';
          } else if (exitCode !== null && exitCode !== 0) {
            status = 'failed';
          } else {
            status = 'stopped';
          }
        } else {
          // 定时任务
          status = pid ? 'running' : (exitCode === 0 ? 'success' : 'failed');
        }
        
        // 获取最后执行时间（从日志文件）
        let lastRun = null;
        const logFile = path.join(os.homedir(), '.openclaw/logs', `${job.label}.log`);
        if (fs.existsSync(logFile)) {
          try {
            const { stdout: lastLine } = await execAsync(`tail -1 "${logFile}"`);
            const match = lastLine.match(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/);
            if (match) {
              lastRun = new Date(match[0]).toISOString();
            }
          } catch (err) {
            // 忽略日志读取错误
          }
        }
        
        jobStatuses.push({
          name: job.name,
          label: job.label,
          type: job.type,
          status,
          lastRun,
          exitCode,
          pid
        });
        
      } catch (error) {
        jobStatuses.push({
          name: job.name,
          label: job.label,
          type: job.type,
          status: 'error',
          lastRun: null,
          error: error.message
        });
      }
    }
    
    return jobStatuses;
  }

  /**
   * 检查日志文件大小
   */
  async checkLogSizes() {
    this.log(LOG_LEVELS.INFO, '检查日志文件大小...');
    
    const logsDir = path.join(os.homedir(), '.openclaw/logs');
    const warnings = [];
    
    try {
      const files = fs.readdirSync(logsDir);
      
      for (const file of files) {
        if (!file.endsWith('.log')) continue;
        
        const filePath = path.join(logsDir, file);
        const stats = fs.statSync(filePath);
        const sizeMB = stats.size / (1024 * 1024);
        
        if (sizeMB > 50) {
          warnings.push({
            file,
            sizeMB: sizeMB.toFixed(1),
            level: 'critical'
          });
        } else if (sizeMB > 20) {
          warnings.push({
            file,
            sizeMB: sizeMB.toFixed(1),
            level: 'warning'
          });
        }
      }
      
    } catch (error) {
      this.log(LOG_LEVELS.ERROR, `检查日志大小失败: ${error.message}`);
    }
    
    return warnings;
  }

  /**
   * 健康检查
   */
  async healthCheck() {
    this.log(LOG_LEVELS.INFO, '开始健康检查...');
    
    const checks = {
      openclaw_cli: false,
      bot_speak: false,
      disk_space: false
    };
    
    // 检查 OpenClaw CLI
    try {
      await execAsync('openclaw --version');
      checks.openclaw_cli = true;
      this.log(LOG_LEVELS.INFO, 'OpenClaw CLI 可用');
    } catch (error) {
      this.log(LOG_LEVELS.ERROR, 'OpenClaw CLI 不可用');
    }
    
    // 检查 bot_speak.py
    try {
      const botPath = path.join(os.homedir(), '.openclaw/workspaces/main/scripts/bot_speak.py');
      if (fs.existsSync(botPath)) {
        checks.bot_speak = true;
        this.log(LOG_LEVELS.INFO, 'bot_speak.py 可用');
      } else {
        this.log(LOG_LEVELS.WARN, 'bot_speak.py 不存在');
      }
    } catch (error) {
      this.log(LOG_LEVELS.ERROR, `bot_speak.py 检查失败: ${error.message}`);
    }
    
    // 检查磁盘空间
    try {
      const { stdout } = await execAsync('df -h ~/.openclaw | tail -1');
      const parts = stdout.trim().split(/\s+/);
      const available = parts[3];
      checks.disk_space = true;
      this.log(LOG_LEVELS.INFO, `磁盘可用空间: ${available}`);
    } catch (error) {
      this.log(LOG_LEVELS.ERROR, '磁盘空间检查失败');
    }
    
    return checks;
  }

  /**
   * 从文件系统扫描会话（降级方案）
   */
  async scanSessionsFromFS(agentsDir) {
    this.log(LOG_LEVELS.INFO, '使用降级方案：从文件系统扫描会话');
    
    try {
      const sessions = [];
      
      // 扫描所有 agent 目录
      const agentDirs = fs.readdirSync(agentsDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);
      
      for (const agentName of agentDirs) {
        const agentPath = path.join(agentsDir, agentName);
        const sessionsPath = path.join(agentPath, 'sessions');
        
        if (!fs.existsSync(sessionsPath)) continue;
        
        const sessionDirs = fs.readdirSync(sessionsPath, { withFileTypes: true })
          .filter(dirent => dirent.isDirectory())
          .map(dirent => dirent.name);
        
        for (const sessionId of sessionDirs) {
          const sessionPath = path.join(sessionsPath, sessionId);
          const metaPath = path.join(sessionPath, 'meta.json');
          
          if (fs.existsSync(metaPath)) {
            try {
              const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
              const key = `agent:${agentName}:subagent:${sessionId}`;
              
              // 只收集 subagent 类型的会话
              if (key.includes('subagent')) {
                sessions.push({
                  key,
                  updatedAt: meta.updatedAt || Date.now(),
                  ageMs: Date.now() - (meta.createdAt || Date.now()),
                  totalTokens: meta.totalTokens || 0,
                  abortedLastRun: meta.abortedLastRun || false
                });
              }
            } catch (err) {
              this.log(LOG_LEVELS.WARN, `读取会话元数据失败: ${sessionPath}`);
            }
          }
        }
      }
      
      this.log(LOG_LEVELS.INFO, `从文件系统扫描到 ${sessions.length} 个会话`);
      return sessions;
    } catch (error) {
      this.log(LOG_LEVELS.ERROR, `文件系统扫描失败: ${error.message}`);
      return [];
    }
  }

  /**
   * 检查宗主响应超时
   */
  async checkMasterResponse() {
    try {
      this.log(LOG_LEVELS.DEBUG, '检查宗主响应状态...');
      
      // 1. 找到最新的宗主会话文件
      const sessionsDir = path.join(os.homedir(), '.openclaw/agents/main/sessions');
      const files = fs.readdirSync(sessionsDir)
        .filter(f => f.endsWith('.jsonl') && !f.includes('.reset') && !f.includes('.bak') && !f.includes('.corrupted'))
        .map(f => ({
          name: f,
          path: path.join(sessionsDir, f),
          mtime: fs.statSync(path.join(sessionsDir, f)).mtime.getTime()
        }))
        .sort((a, b) => b.mtime - a.mtime);
      
      if (files.length === 0) {
        this.log(LOG_LEVELS.DEBUG, '未找到宗主会话文件');
        return;
      }
      
      // 2. 读取最新会话的最后几条消息
      const latestFile = files[0].path;
      const { stdout } = await execAsync(`tail -5 "${latestFile}"`);
      const lines = stdout.trim().split('\n').filter(l => l.trim());
      
      if (lines.length === 0) {
        this.log(LOG_LEVELS.DEBUG, '会话文件为空');
        return;
      }
      
      // 3. 解析最后一条消息
      const lastLine = lines[lines.length - 1];
      let lastMessage;
      try {
        lastMessage = JSON.parse(lastLine);
      } catch (err) {
        this.log(LOG_LEVELS.WARN, '解析会话消息失败');
        return;
      }
      
      const now = Date.now();
      const messageRole = lastMessage.message?.role;
      const messageTimestamp = new Date(lastMessage.timestamp).getTime();
      
      // 4. 判断是否为用户消息
      // 用户消息的特征：role=user 且包含 sender_id 或 conversation_label
      const messageContent = JSON.stringify(lastMessage.message?.content || '');
      const isUserMessage = messageRole === 'user' && 
                           (messageContent.includes('sender_id') || 
                            messageContent.includes('conversation_label'));
      
      if (isUserMessage) {
        // 用户发了消息，宗主还没回复
        if (!this.masterState.pendingUserMessage) {
          // 首次检测到待回复消息
          this.masterState.pendingUserMessage = true;
          this.masterState.lastUserMessageTime = messageTimestamp;
          this.masterState.lastWarningLevel = null;
          this.log(LOG_LEVELS.INFO, '检测到掌门人新消息，等待宗主回复');
        }
        
        // 计算响应延迟
        const delay = now - this.masterState.lastUserMessageTime;
        
        // 超时检测
        if (delay > this.masterTimeoutCritical) {
          // 5分钟无响应 - 高危
          if (this.masterState.lastWarningLevel !== 'critical') {
            this.log(LOG_LEVELS.ERROR, `宗主响应超时（${Math.floor(delay / 60000)}分钟）`);
            await this.sendTelegramAlert(
              '🚨 宗主响应超时（5分钟+）\n\n' +
              '可能原因：\n' +
              '- 模型调用卡死\n' +
              '- 网络连接问题\n' +
              '- 进程异常或崩溃\n' +
              '- 任务过于复杂\n\n' +
              '建议立即检查 Gateway 状态'
            );
            this.masterState.lastWarningLevel = 'critical';
          }
        } else if (delay > this.masterTimeoutWarning) {
          // 2分钟无响应 - 警告
          if (this.masterState.lastWarningLevel !== 'warning') {
            this.log(LOG_LEVELS.WARN, `宗主响应较慢（${Math.floor(delay / 60000)}分钟）`);
            await this.sendTelegramAlert(
              '⚠️ 宗主响应较慢（2分钟+）\n\n' +
              '宗主正在处理中，请稍候...'
            );
            this.masterState.lastWarningLevel = 'warning';
          }
        }
      } else if (messageRole === 'assistant') {
        // 最后一条是宗主回复，清除待回复状态
        if (this.masterState.pendingUserMessage) {
          this.masterState.pendingUserMessage = false;
          this.masterState.lastReplyTime = now;
          this.masterState.lastWarningLevel = null;
          this.log(LOG_LEVELS.INFO, '宗主已回复');
        }
      }
      
    } catch (error) {
      this.log(LOG_LEVELS.ERROR, `检查宗主响应失败: ${error.message}`);
    }
  }

  /**
   * 发送 Telegram 警告（独立方法，避免与汇报混淆）
   */
  async sendTelegramAlert(message) {
    try {
      const scriptPath = path.join(os.homedir(), '.openclaw/workspaces/main/scripts/bot_speak.py');
      
      if (!fs.existsSync(scriptPath)) {
        this.log(LOG_LEVELS.WARN, 'bot_speak.py 不存在，跳过警告发送');
        return;
      }
      
      const escapedMessage = message.replace(/"/g, '\\"').replace(/\$/g, '\\$');
      const command = `HTTPS_PROXY=socks5h://127.0.0.1:7897 python3 "${scriptPath}" main "${escapedMessage}"`;
      
      await execAsync(command, { timeout: 30000 });
      this.log(LOG_LEVELS.INFO, 'Telegram 警告已发送');
    } catch (error) {
      this.log(LOG_LEVELS.ERROR, `Telegram 警告发送失败: ${error.message}`);
    }
  }

  /**
   * 检查会话（修复版）
   */
  async checkSessions() {
    try {
      // 使用正确的命令：openclaw sessions --all-agents --active 120 --json
      const { stdout } = await execAsync('openclaw sessions --all-agents --active 120 --json', {
        timeout: 30000
      });

      const data = JSON.parse(stdout);
      
      // 过滤出 subagent 类型的会话
      const subagentSessions = (data.sessions || []).filter(s => 
        s.key && s.key.includes(':subagent:')
      );

      this.log(LOG_LEVELS.INFO, `检查到 ${subagentSessions.length} 个 subagent 会话`);
      return subagentSessions;
    } catch (error) {
      this.log(LOG_LEVELS.ERROR, `检查会话失败: ${error.message}`);
      
      // 降级方案：直接读取会话文件
      try {
        const agentsDir = path.join(os.homedir(), '.openclaw/agents');
        return await this.scanSessionsFromFS(agentsDir);
      } catch (fallbackError) {
        this.log(LOG_LEVELS.ERROR, `降级方案也失败: ${fallbackError.message}`);
        return [];
      }
    }
  }

  /**
   * 带重试的会话检查
   */
  async checkSessionsWithRetry() {
    return await retryAsync(
      () => this.checkSessions(),
      3,    // 最多重试 3 次
      2000  // 每次间隔 2 秒
    );
  }

  isRunning(session) {
    // 判断任务是否还在运行
    if (session.abortedLastRun === true) {
      return false;
    }
    
    const now = Date.now();
    const updatedAt = session.updatedAt;
    const timeSinceUpdate = now - updatedAt;
    
    // 10 分钟内有更新认为还在运行
    return timeSinceUpdate < 10 * 60 * 1000;
  }

  analyzeSession(session) {
    const now = Date.now();
    const updatedAt = session.updatedAt;
    const ageMs = session.ageMs || (now - updatedAt);
    const runtime = ageMs;
    const timeSinceUpdate = now - updatedAt;

    let status = 'normal';
    let level = 'info';
    let suggestions = [];

    // 卡死判断（优先级最高）
    if (timeSinceUpdate > this.taskStuckThreshold) {
      status = 'stuck';
      level = 'critical';
      suggestions.push(`${Math.floor(timeSinceUpdate / 60000)} 分钟无更新，可能已卡死`);
    }
    // 超时判断（新阈值）
    else if (runtime > this.taskCriticalThreshold) {
      status = 'critical';
      level = 'critical';
      suggestions.push(`运行超过 ${Math.floor(this.taskCriticalThreshold / 60000)} 分钟，建议检查或终止`);
    } else if (runtime > this.taskWarningThreshold) {
      status = 'warning';
      level = 'warning';
      suggestions.push(`运行超过 ${Math.floor(this.taskWarningThreshold / 60000)} 分钟，请关注进度`);
    }

    // Token 异常判断
    const totalTokens = session.totalTokens || 0;
    if (totalTokens > 500000) {
      if (level === 'info') {
        status = 'token_warning';
        level = 'warning';
      }
      suggestions.push('Token 使用量过高，注意成本控制');
    }

    return { 
      status, 
      level, 
      runtime, 
      timeSinceUpdate,
      suggestions,
      totalTokens
    };
  }

  getDiscipleName(sessionKey) {
    // 从 sessionKey 中提取弟子代号
    // 格式: agent:task8:subagent:xxx
    const match = sessionKey.match(/agent:(task\d+):/);
    if (match) {
      const taskId = match[1];
      return this.disciples[taskId] || taskId;
    }
    return '未知弟子';
  }

  getTaskLabel(session) {
    // 从会话 key 中提取任务标签
    const parts = session.key.split(':');
    if (parts.length >= 4) {
      return parts[3].substring(0, 8);
    }
    return '未命名任务';
  }

  formatDuration(ms) {
    const minutes = Math.floor(ms / 60000);
    if (minutes < 60) return `${minutes} 分钟`;
    const hours = Math.floor(minutes / 60);
    const remainMinutes = minutes % 60;
    return `${hours} 小时 ${remainMinutes} 分钟`;
  }

  formatTokens(tokens) {
    if (tokens > 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
    if (tokens > 1000) return `${(tokens / 1000).toFixed(0)}k`;
    return tokens.toString();
  }

  formatModel(model, provider) {
    if (!model) return '未知';
    
    // 简化模型名称显示
    const modelName = model.replace('tokenmax/', '').replace('anthropic/', '');
    
    if (provider && provider !== 'unknown') {
      return `${modelName} (${provider})`;
    }
    
    return modelName;
  }

  // 删除正常状态汇报方法（不再需要）

  formatAnomalyReport(anomalies) {
    let report = '⚠️ 弟子异常警告\n\n';
    
    anomalies.forEach(({ session, analysis }) => {
      const disciple = this.getDiscipleName(session.key);
      const task = this.getTaskLabel(session);
      const runtime = this.formatDuration(analysis.runtime);
      const tokens = this.formatTokens(analysis.totalTokens);
      const timeSinceUpdate = this.formatDuration(analysis.timeSinceUpdate);
      const model = this.formatModel(session.model, session.modelProvider);
      
            
      report += `${disciple}（${task}）：\n`;
      report += `- 状态：${this.getStatusText(analysis.status)}（${runtime}）\n`;
      report += `- Token：${tokens}\n`;
      report += `- 模型：${model}\n`;
            report += `- 最后更新：${timeSinceUpdate} 前\n`;
      
      if (analysis.suggestions.length > 0) {
        report += `- 建议：${analysis.suggestions[0]}\n`;
      }
      
      report += '\n';
    });
    
    return report;
  }

  formatCompletionReport(session) {
    const disciple = this.getDiscipleName(session.key);
    const task = this.getTaskLabel(session);
    const duration = this.formatDuration(session.ageMs || 0);
    const tokens = this.formatTokens(session.totalTokens || 0);
    const model = this.formatModel(session.model, session.modelProvider);
    
        
    let report = '✅ 弟子任务完成\n\n';
    report += `${disciple}（${task}）：\n`;
    report += `- 耗时：${duration}\n`;
    report += `- Token：${tokens}\n`;
    report += `- 模型：${model}\n`;
        report += `- 状态：${session.abortedLastRun ? '异常终止' : '成功完成'}\n`;
    
    return report;
  }

  getStatusText(status) {
    const statusMap = {
      'normal': '正常',
      'timeout': '运行超时',
      'warning': '运行时间较长',
      'stuck': '可能卡死',
      'token_warning': 'Token 使用过高'
    };
    return statusMap[status] || status;
  }

  /**
   * 发送 Telegram 消息（修复版）
   */
  async sendTelegramReport(message) {
    try {
      const scriptPath = path.join(os.homedir(), '.openclaw/workspaces/main/scripts/bot_speak.py');
      
      if (!fs.existsSync(scriptPath)) {
        this.log(LOG_LEVELS.WARN, 'bot_speak.py 不存在，跳过 Telegram 发送');
        return;
      }
      
      // 修复：使用 main bot 而不是 task8，正确转义消息内容
      const escapedMessage = message.replace(/"/g, '\\"').replace(/\$/g, '\\$');
      const command = `HTTPS_PROXY=socks5h://127.0.0.1:7897 python3 "${scriptPath}" main "${escapedMessage}"`;
      
      await execAsync(command, { timeout: 30000 });
      this.log(LOG_LEVELS.INFO, 'Telegram 汇报已发送');
    } catch (error) {
      this.log(LOG_LEVELS.ERROR, `Telegram 发送失败: ${error.message}`);
      
      // 降级方案：写入日志文件
      try {
        const logEntry = `[${new Date().toISOString()}] ${message}\n`;
        fs.appendFileSync(this.telegramFailedLog, logEntry);
        this.log(LOG_LEVELS.INFO, '消息已保存到 telegram-failed.log');
      } catch (logError) {
        this.log(LOG_LEVELS.ERROR, `保存失败消息也失败: ${logError.message}`);
      }
    }
  }

  async sendReport(sessions, anomalies, launchdJobs = [], logWarnings = []) {
    // 只在有异常时发送汇报
    if (anomalies.length === 0 && launchdJobs.filter(j => j.status === 'failed' || j.status === 'error' || j.status === 'stopped').length === 0 && logWarnings.length === 0) {
      this.log(LOG_LEVELS.DEBUG, '无异常，静默');
      return;
    }

    let report = this.formatAnomalyReport(anomalies);

    this.log(LOG_LEVELS.INFO, `生成异常汇报:\n${report}`);
    
    // 发送到 Telegram（带重试）
    await retryAsync(
      () => this.sendTelegramReport(report),
      2,    // 最多重试 2 次
      3000  // 每次间隔 3 秒
    );
  }

  async checkForCompletions(currentSessions) {
    // 检查是否有任务完成
    const currentKeys = new Set(currentSessions.map(s => s.key));
    
    // 只汇报之前在运行中、现在消失的任务（真正新完成的）
    for (const [key, session] of this.knownSessions.entries()) {
      if (!currentKeys.has(key) && this.isRunning(session)) {
        // 任务之前在运行，现在消失了，说明刚完成
        const report = this.formatCompletionReport(session);
        this.log(LOG_LEVELS.INFO, `任务完成: ${key}`);
        await this.sendTelegramReport(report);
        this.knownSessions.delete(key);
      } else if (!currentKeys.has(key)) {
        // 任务之前就已完成，现在仍然不在活跃列表，静默删除
        this.log(LOG_LEVELS.DEBUG, `移除已完成任务: ${key}`);
        this.knownSessions.delete(key);
      }
    }
    
    // 更新已知会话（只追踪运行中的任务）
    currentSessions.forEach(s => {
      if (this.isRunning(s)) {
        this.knownSessions.set(s.key, s);
      }
    });
    
    this.saveState();
  }

  async runCheck() {
    this.log(LOG_LEVELS.DEBUG, '开始检查弟子状态...');
    
    try {
      const sessions = await this.checkSessionsWithRetry();
      
      // 检查宗主响应超时
      await this.checkMasterResponse();
      
      // 检查 launchd 服务状态（包括后端服务）
      const launchdJobs = await this.checkLaunchdJobs();
      
      // 检查日志文件大小
      const logWarnings = await this.checkLogSizes();
      
      // 检查任务完成
      await this.checkForCompletions(sessions);
      
      // 分析异常（只报告 warning 和 critical）
      const anomalies = sessions
        .filter(s => this.isRunning(s))
        .map(s => ({ session: s, analysis: this.analyzeSession(s) }))
        .filter(({ analysis }) => analysis.level === 'warning' || analysis.level === 'critical');

      // 检查后端服务异常
      const failedServices = launchdJobs.filter(j => 
        j.type === 'service' && (j.status === 'failed' || j.status === 'error' || j.status === 'stopped')
      );
      
      if (failedServices.length > 0) {
        this.log(LOG_LEVELS.ERROR, `发现 ${failedServices.length} 个后端服务异常`);
        let serviceReport = '🚨 后端服务异常\n\n';
        failedServices.forEach(svc => {
          serviceReport += `❌ ${svc.label} (${svc.name})\n`;
          serviceReport += `   状态: ${svc.status}\n`;
          if (svc.exitCode !== null) {
            serviceReport += `   退出码: ${svc.exitCode}\n`;
          }
          if (svc.error) {
            serviceReport += `   错误: ${svc.error}\n`;
          }
        });
        await this.sendTelegramReport(serviceReport);
      }

      // 检查定时任务失败
      const failedCrons = launchdJobs.filter(j => 
        j.type === 'cron' && (j.status === 'failed' || j.status === 'error')
      );
      
      if (failedCrons.length > 0) {
        this.log(LOG_LEVELS.WARN, `发现 ${failedCrons.length} 个定时任务失败`);
        let cronReport = '⚠️ 定时任务异常\n\n';
        failedCrons.forEach(job => {
          cronReport += `❌ ${job.label} (${job.name})\n`;
          if (job.exitCode !== null) {
            cronReport += `   退出码: ${job.exitCode}\n`;
          }
          if (job.error) {
            cronReport += `   错误: ${job.error}\n`;
          }
        });
        await this.sendTelegramReport(cronReport);
      }
      
      // 检查日志文件过大
      const criticalLogs = logWarnings.filter(w => w.level === 'critical');
      if (criticalLogs.length > 0) {
        this.log(LOG_LEVELS.WARN, `发现 ${criticalLogs.length} 个超大日志文件`);
        let logReport = '⚠️ 日志文件过大\n\n';
        criticalLogs.forEach(w => {
          logReport += `🔴 ${w.file}: ${w.sizeMB} MB\n`;
        });
        await this.sendTelegramReport(logReport);
      }

      // 有任务异常立即汇报
      if (anomalies.length > 0) {
        this.log(LOG_LEVELS.WARN, `发现 ${anomalies.length} 个任务异常`);
        await this.sendReport(sessions, anomalies, launchdJobs, logWarnings);
      }

      // 移除定时汇报逻辑（只报异常）
      const runningCount = sessions.filter(s => this.isRunning(s)).length;
      this.log(LOG_LEVELS.DEBUG, `检查完成，运行中: ${runningCount}, 异常: ${anomalies.length}`);
      
    } catch (err) {
      this.log(LOG_LEVELS.ERROR, `检查过程出错: ${err.message}`);
    }
  }

  async start() {
    this.log(LOG_LEVELS.INFO, '弟子监控系统启动（重构版 v2）...');
    this.log(LOG_LEVELS.INFO, `检查间隔: ${this.formatDuration(this.checkInterval)}`);
    this.log(LOG_LEVELS.INFO, `告警阈值: warning=${this.formatDuration(this.taskWarningThreshold)}, critical=${this.formatDuration(this.taskCriticalThreshold)}, stuck=${this.formatDuration(this.taskStuckThreshold)}`);
    this.log(LOG_LEVELS.INFO, `监控模式: 只报异常，静默正常状态`);
    
    // 健康检查
    const healthStatus = await this.healthCheck();
    this.log(LOG_LEVELS.INFO, `健康检查完成: ${JSON.stringify(healthStatus)}`);
    
    // 立即执行一次检查
    await this.runCheck();
    
    // 定时检查
    setInterval(async () => {
      await this.runCheck();
    }, this.checkInterval);
  }
}

// 加载配置
let config = {};
const configFile = path.join(__dirname, 'config.json');
if (fs.existsSync(configFile)) {
  try {
    config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  } catch (err) {
    console.error('加载配置失败:', err);
  }
}

// 启动监控
const monitor = new DiscipleMonitor(config);
monitor.start();

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n监控系统正在关闭...');
  monitor.saveState();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n监控系统正在关闭...');
  monitor.saveState();
  process.exit(0);
});
