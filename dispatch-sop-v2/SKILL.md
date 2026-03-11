---
name: dispatch-sop-v2
description: 牛马宗通用调度SOP v2技能。用于高频任务、多人并行、需要避免冲突、需要标准化汇报节奏的协作场景；提供 Intake→Planning→Execution→Gate 主流程、冲突预检与文件owner规则、30秒回执与5-10分钟进度SLA，并指导按需读取 references/roles.md、references/workflow.md、references/templates.md。
---

# dispatch-sop-v2

执行牛马宗通用调度SOP v2，统一任务拆解、分派、执行、验收与汇报。

## 执行原则

- 先对齐目标，再派工。
- 先做冲突预检，再落地改动。
- 单文件单owner，避免并行覆盖。
- 按SLA持续回报，保持可观测。
- Gate未通过前，不宣布完成。

## 主流程（Intake → Planning → Execution → Gate）

### 1) Intake（接单与定级）

- 明确目标、范围、截止时间、验收标准。
- 标注任务类型：紧急 / 常规 / 探索。
- 判断是否触发并行调度（多人、跨模块、时限紧）。
- 在30秒内发送回执（见下方SLA）。

### 2) Planning（拆单与派工）

- 将任务拆成可独立交付的子任务（建议每项15-60分钟）。
- 为每个子任务指定：owner、输入、输出、预计耗时、依赖。
- 标记关键路径与阻塞点。
- 需要角色分工细则时，读取 `references/roles.md`。
- 需要流程细节与决策分支时，读取 `references/workflow.md`。

### 3) Execution（并行执行与同步）

- 每位owner仅改动自己认领范围。
- 执行前完成冲突预检（见下一节）。
- 按5-10分钟节奏同步进展：完成项、进行中、阻塞项、下一步。
- 需要标准化播报时，读取 `references/templates.md` 并套用模板。

### 4) Gate（关口验收）

- 汇总子任务结果并核对验收标准。
- 明确结论：PASS / NO-GO。
- 若NO-GO，给出阻塞项、风险和回退/补救方案。
- 发布上线结论时，必须使用 `references/templates.md` 的上线模板。

## 冲突预检与文件owner规则

在任何文件写入前执行以下检查：

1. 列出本次将改动的文件清单。
2. 为每个文件标记唯一owner（`file -> owner`）。
3. 若发现同一文件存在多个owner：
   - 立即停止并行改动该文件。
   - 升级为“串行接力”或改为由单一owner合并。
4. 对共享高风险文件（如全局配置、核心入口）默认指定主owner，其余人员仅提交建议，不直接改写。
5. 交接时先声明“释放owner”，下一位再“接管owner”，避免隐性冲突。

简化规则：**一时段一文件一owner**。

## 回报SLA

- **30秒回执**：接到任务后30秒内确认“已接单 + 当前状态 + 下一动作”。
- **5-10分钟节奏**：执行阶段每5-10分钟输出一次进展快报；遇阻塞立即加报，不等待周期。
- **关口即时播报**：到达Gate后立即给出PASS/NO-GO与依据。

## References 读取时机

- 读取 `references/roles.md`：当需要明确角色职责、责任边界、升级路径时。
- 读取 `references/workflow.md`：当需要执行完整SOP清单、分支判定、异常处理时。
- 读取 `references/templates.md`：当需要快速输出标准汇报（拆单、分诊、上线结论）时。

只在需要时读取对应文件，避免无关上下文膨胀。
