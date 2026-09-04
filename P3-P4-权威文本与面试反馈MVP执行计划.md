# P3-P4：权威文本与面试反馈 MVP 执行计划

> 本文是可直接交给后续 Agent 执行的模块化工作清单。代码、`package.json`、锁文件和配置是事实来源；`阿里云AI实时互动接入实施计划.md` 只作为路线图。本文不表示相关功能已经实现。

## 1. 目标与交付边界

本阶段交付一条最小但可信的反馈闭环：

```text
阿里云 chat_record / agent_stop 回调
  -> Firestore 权威 transcript
  -> 用户触发幂等 finalize
  -> 百炼结构化反馈
  -> Firestore Feedback
  -> 反馈页与首页入口
```

MVP 包含：

- 回调鉴权、请求限长、字段校验和安全日志。
- 稳定对话幂等归档、乱序排序和迟到消息处理。
- transcript 就绪判断、反馈生成租约和失败重试。
- 单模型结构化反馈、Zod 二次校验和确定性写库。
- 反馈页的处理中、生成中、失败、内容不足和成功状态。
- 面试结束后的反馈入口，以及首页最近一次反馈摘要。

MVP 不包含：

- 保存原始音频、视频、浏览器字幕或模型原始响应。
- 正式招聘、考试、防作弊、人格判断或录用建议。
- 第二模型 fallback、流式反馈、AI SDK 或新增 npm 依赖。
- 历史趋势、反馈对比、分享、导出和管理员后台。
- `CallLogUrl` 自动补偿；它是 MVP 后的第一项可靠性增强。

## 2. 当前代码基线

已确认：

- `interviewSessions` 已支持创建、开始、结束和用户级活跃锁。
- 浏览器已展示 AICallKit 实时字幕，但这些字幕只用于 UI。
- `constants/index.ts` 有初版 `feedbackSchema`，约束仍过宽。
- `types/index.d.ts` 有旧 `Feedback`，但没有 Session 维度关联。
- `InterviewCard` 将反馈固定为 `null`。
- callback、transcript DAL、finalize、反馈模型调用和反馈页均不存在。
- 当前 `npm.cmd run test:ai-realtime` 为 23/23 通过，`npx.cmd tsc --noEmit` 通过。

因此不能直接开始反馈 UI。必须先完成权威 transcript 最小链路；浏览器字幕不得作为评分输入。

## 3. 强制工作方式

每个模块开始前必须：

1. 阅读根目录 `AGENTS.md`，检查 `git status --short --branch`、相关 diff 和 staged diff。
2. 修改 Next.js 文件前，完整阅读已安装版本 `node_modules/next/dist/docs/` 下的相关指南。
3. 核对当前代码和测试，不依据本文描述假设上一个模块已经完成。
4. 一次只实施一个编号模块；每个补丁新增或修改不超过 100 行。
5. 不增加依赖、不升级 AICallKit、不创建分支或 commit、不部署、不修改云端配置。
6. 外部配置、部署和真实通话必须等待用户明确授权。
7. 每个服务端入口独立执行认证或回调鉴权，不依赖页面已经检查登录。
8. 每步完成后报告修改、原因、精确验证命令、结果和未验证项，然后暂停。
9. 每个模块必须按下文“新手可读性与注释规范”补齐中文注释；缺少要求中的关键注释视为模块未完成。

### 3.1 新手可读性与注释规范

注释的目标是让第一次接触本项目的人理解业务流程、信任边界和不直观的实现原因。所有新增或修改代码必须遵守：

- 核心导出函数前写简短中文说明，解释输入来自哪里、函数负责什么、返回结果给谁使用。
- 领域类型和状态字段写中文注释，说明每个状态在业务上代表什么，避免只翻译英文名称。
- Firestore 事务前说明为什么这些读写必须原子完成，以及并发时要防止什么结果。
- 鉴权、资源归属、请求限长、恒定时间比较等安全逻辑前说明威胁和保护目标。
- 幂等键、生成租约、迟到回调、安静窗口、确定性文档 ID 等不直观逻辑必须说明“为什么不能简化”。
- 调用外部服务前说明超时、重试和失败后保留哪些本地数据。
- Client/Server 边界处说明为何该代码必须在浏览器或服务端运行，禁止把密钥带入 Client Component。
- 错误分支说明用户将看到什么、服务端保留什么、是否允许重试。
- 测试中的固定时间、哈希输入、竞态场景和边界数据要说明它们保护的真实故障。
- 注释必须跟随代码更新；行为变化后仍描述旧逻辑，按缺陷处理。

注释不应这样写：

```ts
// 设置状态为 ready
status = "ready";

// 返回结果
return result;
```

这类注释只是重复代码，没有帮助。应解释原因和约束：

```ts
// agent_stop 可能早于最后一条 chat_record 到达，因此只有安静窗口结束后
// 才允许进入 ready，避免使用缺失最后一轮回答的 transcript 生成反馈。
status = "ready";
```

### 3.2 函数注释模板

复杂核心函数优先使用短 JSDoc，按实际需要填写，不要求机械写满所有字段：

```ts
/**
 * 判断本场 transcript 是否可以用于生成反馈。
 * 输入来自阿里云回调归档，只使用传入的 nowMs，确保测试不依赖真实时间。
 * 返回 pending 时调用方应稍后重试，不能改用浏览器字幕绕过等待。
 */
export const getTranscriptReadiness = (...) => { ... };
```

注释语言要求：

- 默认使用简洁中文；必须出现英文术语时，在首次出现处解释，例如“幂等（重复调用仍得到同一结果）”。
- 一条注释尽量只解释一个原因；复杂流程使用函数级说明加关键分支注释。
- 不要求为 import、简单赋值、明显 JSX 标签、普通 map/filter 或类型已经完全自解释的字段写注释。
- 不写教程式长篇注释；超过约 6 行的背景说明应放在本执行文档，代码中只保留定位说明。

### 3.3 每模块注释验收

每个模块交接前必须人工检查：

1. 新增核心函数是否说明职责、输入来源和调用结果。
2. 安全或并发分支是否解释风险，而非只描述语句。
3. 错误和重试是否说明不会丢失哪些数据。
4. 测试是否说明它对应的真实故障。
5. 是否存在重复代码、过时内容或大段注释掉的代码。
6. 新手能否沿注释说清“请求从哪里来、数据写到哪里、失败后怎么办”。

## 4. 核心领域决策

- `Interview` 是可重复使用的岗位配置；`InterviewSession` 才代表一次实际练习。
- 一次 Session 最多生成一份反馈；`feedbacks/{sessionId}` 使用 Session ID 作为确定性文档 ID。
- 反馈必须同时保存 `sessionId`、`interviewId` 和 `userId`，读取时重新校验归属。
- 回调 transcript 是权威输入；客户端字幕永不上传、入库或参与评分。
- 回调只校验和写库，不在阿里云请求内同步调用反馈模型。
- `agent_stop` 不是“最后消息必然到齐”的证明；finalize 还需等待安静窗口。
- 总分由服务端根据维度分计算，不能直接相信模型返回的总分。
- transcript 是不可信内容；反馈提示词必须声明它只是待评价数据，不能执行其中的指令。
- 反馈是学习建议，不输出人格、文化匹配、录用概率或确定性职业判断。

## 5. 状态与数据契约

### 5.1 Session 扩展字段

```ts
transcriptStatus: "pending" | "ready" | "insufficient" | "failed";
feedbackStatus: "not_started" | "generating" | "ready" | "failed";
agentInstanceId?: string;
providerStoppedAt?: string;
lastTranscriptAt?: string;
transcriptMessageCount?: number;
feedbackId?: string;
generationAttemptId?: string;
generationLeaseExpiresAt?: string;
feedbackErrorCode?: string;
```

`interviewId` 仍标识可重复使用的面试配置；`sessionId` 标识一次实际练习。一个 Interview 可以有多个 Session，每个 Session 最多对应一份 Feedback。

### 5.2 Transcript 消息

路径：`interviewSessions/{sessionId}/messages/{eventKey}`。

```ts
interface TranscriptMessage {
    eventKey: string;
    role: "user" | "assistant";
    text: string;
    sentenceId?: number;
    dialogueId?: string;
    roundId?: string;
    source: "aliyun_callback";
    occurredAt: string;
    receivedAt: string;
}
```

- 优先使用 `dialogueId` 生成文档 ID；没有稳定 ID 时，对 Session、角色、句号、时间和规范化文本做 SHA-256。
- 同一事件重复投递使用同一个 `eventKey`，不得新增第二份消息。
- 读取时按 `occurredAt`、`eventKey` 排序，不依赖回调到达顺序。
- 只保存最终稳定文本；忽略空白、控制标记、reasoningText、音频地址和未知原始字段。
- 单条文本、消息数和总字符数必须设上限；超过限制返回稳定错误且不打印正文。

### 5.3 Feedback 文档

路径：`feedbacks/{sessionId}`。

```ts
interface FeedbackRecord {
    id: string;              // 与 sessionId 相同
    sessionId: string;       // 具体哪一次练习
    interviewId: string;     // 使用了哪个面试配置
    userId: string;
    totalScore: number;
    categoryScores: Array<{
        id: "communication" | "technical" | "problemSolving" | "relevance" | "clarity";
        score: number;
        comment: string;
    }>;
    strengths: string[];
    areasForImprovement: string[];
    finalAssessment: string;
    model: string;
    promptVersion: string;
    transcriptHash: string;
    createdAt: string;
}
```

- 各维度分必须是 `0..100` 的整数；服务端用固定规则计算 `totalScore`。
- 首版使用五个等权维度，`totalScore = round(sum(scores) / 5)`。
- `Cultural Fit` 改为 `relevance`，避免从短对话推断文化或人格。
- 页面通过静态映射显示中文名称，持久化层只保存稳定英文 ID。
- 优点和改进项各 `1..5` 条；所有文字字段设置合理长度上限。

## 6. HTTP 接口契约

### 6.1 `POST /api/ai-realtime/callback`

此接口供阿里云调用，不使用 Firebase Session Cookie。

- 要求 `Content-Type: application/json`，请求体上限 256 KB。
- 将 `Authorization` 与服务端 `ALIYUN_AI_CALLBACK_TOKEN` 做恒定时间比较。
- 校验顶层 `aiAgentId`、`instanceId`、`event`、`timestamp`、`userData` 和已知 data 字段。
- 从 `userData` 解析 `sessionId`，再校验 Session、agentId 和已绑定 instanceId。
- `chat_record` 幂等写消息；`agent_start/session_start` 绑定实例；`agent_stop` 只更新结束信息。
- 已 completed 的 Session 仍可接收迟到的 `chat_record`，但不能退回 active。
- 成功或已处理事件返回 2xx；鉴权失败返回 401；格式错误返回 400/413。
- 响应和错误日志不得包含 Token、正文、Firebase 凭证或原始请求体。

### 6.2 `POST /api/interviews/[sessionId]/finalize`

此接口供登录用户调用，请求体只接受严格空对象 `{}`。

- 独立验证 Firebase Session Cookie、sessionId 格式和 Session 所有权。
- 不接收 `interviewId`、transcript、分数、模型名或 feedbackId 等客户端参数。
- `200 {status: "ready", feedbackId}`：反馈已经存在或本次生成成功。
- `202 {status: "transcript_pending" | "generating", retryAfterMs}`：页面稍后重试。
- `422 {status: "insufficient_transcript"}`：面试结束但没有足够有效问答。
- `503 {status: "feedback_disabled" | "provider_failed"}`：保留 transcript，可稍后重试。
- 所有响应设置 `Cache-Control: no-store`。

## 7. 模块依赖与执行顺序

```text
M0 会话结束语义
  -> M1 领域契约
     -> M2 回调鉴权与解析
        -> M3 Transcript 幂等持久化
           -> M4 Transcript 就绪判断
              -> M5 反馈 Provider
                 -> M6 Finalize 编排
                    -> M7 反馈页闭环
                       -> M8 首页摘要
                          -> M9 MVP 验收
```

M2 完成后需要部署测试环境并由用户授权配置阿里云回调，才能执行 M3 的真实云端验收。M5 可以使用固定 transcript fixture 与 M3-M4 并行验证逻辑，但合并顺序仍按上图执行。

## 8. 分模块执行清单

### M0：收口会话结束语义与反馈入口

目标：让后续流程能区分正常完成、用户提前结束和技术失败，并在结束后保留本次 Session ID。

预计文件：

- `types/ai-realtime.ts`
- `lib/ai-realtime/session-lifecycle-policy.ts`
- `lib/ai-realtime/session-lifecycle.server.ts`
- `lib/ai-realtime/session-lifecycle-handler.server.ts`
- `app/api/ai-realtime/sessions/[sessionId]/end/route.ts`
- `components/interview/AliyunInterviewClient.tsx`
- `tests/ai-realtime/session-lifecycle-policy.test.ts`

实施步骤：

1. 定义白名单结束 outcome 与稳定错误码，先写纯策略测试。
2. 扩展 end body 校验，确保 failed 不会被重复 end 覆盖成 completed。
3. 客户端只发送稳定 outcome/errorCode，不发送 SDK 原始错误或字幕。
4. 清理 SDK 后保留 completed sessionId，并提供进入反馈页所需状态。

验收：正常结束为 completed；技术失败为 failed；重复 end 保留首次 endedAt；越权和非法 body 被拒绝。

验证命令：

```powershell
node --conditions=react-server --test tests/ai-realtime/session-lifecycle-policy.test.ts
npx.cmd tsc --noEmit
npx.cmd eslint types/ai-realtime.ts lib/ai-realtime app/api/ai-realtime
```

### M1：固化 Transcript 与 Feedback 契约

目标：在写数据库前确定状态、字段、长度和评分约束。

预计文件：

- `types/ai-realtime.ts`
- `types/feedback.ts`
- `lib/feedback/schema.ts`
- `tests/feedback/schema.test.ts`

实施步骤：

1. 增加 Session 扩展字段和 `TranscriptMessage`。
2. 将旧全局 Feedback 声明迁移为显式导出的严格类型。
3. 建立严格 Zod schema，限制分数、条数、文本长度和未知字段。
4. 建立维度中文标签与等权总分纯函数。

验收：非法分数、重复维度、缺失维度、超长内容和多余字段全部被拒绝；总分完全由服务端计算。

验证命令：

```powershell
node --conditions=react-server --test tests/feedback/schema.test.ts
npx.cmd tsc --noEmit
npx.cmd eslint types/feedback.ts lib/feedback/schema.ts
```

### M2：阿里云回调鉴权与协议解析

目标：建立只负责鉴权、限流前置校验和协议规范化的 Route Handler。

预计文件：

- `lib/aliyun/callback-config.server.ts`
- `lib/aliyun/callback-protocol.ts`
- `app/api/ai-realtime/callback/route.ts`
- `tests/ai-realtime/callback-protocol.test.ts`

实施步骤：

1. 增加 `ALIYUN_AI_CALLBACK_TOKEN` 读取与安全禁用逻辑。
2. 使用哈希后 `timingSafeEqual` 比较 Authorization，避免长度差异分支。
3. 先检查 Content-Type 和 Content-Length，再读取有界 body。
4. Zod 解析已知字段并忽略未使用扩展；解析 `userData.sessionId`。
5. 将厂商 producer/role 规范化为 `user | assistant`，不保留 reasoningText。
6. Route Handler 只调用规范化与持久化服务，统一返回 no-store 响应。

验收：伪造 Token、缺失 Token、超大 body、畸形 JSON、非法 sessionId 和未知事件都有确定结果，日志不出现请求正文。

验证命令：

```powershell
node --conditions=react-server --test tests/ai-realtime/callback-protocol.test.ts
npx.cmd tsc --noEmit
npx.cmd eslint lib/aliyun app/api/ai-realtime/callback
```

### M3：Transcript 幂等持久化

目标：让重复、乱序和迟到回调形成一份稳定、可排序的权威 transcript。

预计文件：

- `lib/ai-realtime/transcript-event-key.ts`
- `lib/ai-realtime/transcript-store.server.ts`
- `lib/ai-realtime/callback-handler.server.ts`
- `tests/ai-realtime/transcript-event-key.test.ts`
- `tests/ai-realtime/callback-policy.test.ts`

实施步骤：

1. 用纯函数规范化文本并生成确定性 eventKey。
2. 在 Firestore 事务中验证 Session、agentId 和 instanceId 绑定关系。
3. `chat_record` 使用确定性文档 ID upsert，更新消息计数和最后消息时间。
4. 状态事件采用单向转换；agent_stop 写 `providerStoppedAt`，迟到消息只更新 transcript 元数据。
5. Firestore 错误只记录错误类别、event 和 sessionId，不记录对话正文。

验收：同一 payload 重放 3 次只有一条消息；用户与 AI 相同 sentenceId 不冲突；迟到消息不把 completed 改回 active。

验证命令：

```powershell
node --conditions=react-server --test tests/ai-realtime/transcript-event-key.test.ts
node --conditions=react-server --test tests/ai-realtime/callback-policy.test.ts
npx.cmd tsc --noEmit
```

真实验证：经用户授权后部署测试环境，配置状态回调和聊天记录实时回调，完成一场一题面试并检查 Firestore。回调 Header 的实际格式以测试环境观测为准，不在代码中猜测。

### M4：Transcript 读取与就绪判断

目标：只在完整度足够且回调已经安静后允许生成反馈。

预计文件：

- `lib/ai-realtime/transcript-readiness.ts`
- `lib/ai-realtime/transcript-store.server.ts`
- `tests/ai-realtime/transcript-readiness.test.ts`

建议规则：

- 未收到 provider stop：`pending`。
- provider stop 后距最后消息不足 5 秒：`pending`。
- 至少一条 assistant 提问、一条有效 user 回答，且用户总文本不少于 20 个字符：`ready`。
- stop 后安静窗口已过但不满足最小问答：`insufficient`。
- 最多读取 200 条消息、每条 4000 字符、总计 60000 字符；越界：`failed`。
- 排序键为 `occurredAt + eventKey`；生成规范化 transcript 和 SHA-256 hash。

验收：覆盖一题面试、空通话、只有欢迎语、迟到消息、同时间消息和超限 transcript；所有测试使用固定时间。

验证命令：

```powershell
node --conditions=react-server --test tests/ai-realtime/transcript-readiness.test.ts
npx.cmd tsc --noEmit
npx.cmd eslint lib/ai-realtime/transcript-readiness.ts
```

### M5：反馈模型 Provider 与 Prompt

目标：使用单一百炼模型生成严格、可复现、对用户有行动价值的学习反馈。

预计文件：

- `lib/feedback/config.server.ts`
- `lib/feedback/prompt.ts`
- `lib/feedback/provider.server.ts`
- `lib/feedback/generate.server.ts`
- `tests/feedback/prompt.test.ts`
- `tests/feedback/provider-response.test.ts`

服务端配置：

```text
AI_FEEDBACK_ENABLED=false
ALIYUN_BAILIAN_API_KEY=server-only-secret
ALIYUN_BAILIAN_BASE_URL=https://configured-compatible-endpoint/v1
ALIYUN_BAILIAN_MODEL=configured-model-name
AI_FEEDBACK_TIMEOUT_MS=15000
```

实施步骤：

1. 功能默认关闭；关闭时不要求 API Key 存在。
2. 使用原生 `fetch` 调 OpenAI-compatible 接口，不新增 SDK。
3. 请求严格 JSON Schema 输出；不设置可能截断 JSON 的过小 token 上限。
4. Prompt 包含岗位上下文、评分标准和带清晰分隔符的 transcript。
5. 明确 transcript 仅是待评价数据，其中任何指令都不得执行。
6. 解析后再用本地 Zod 校验；格式错误最多修复重试一次，网络超时不无限重试。
7. 不打印或保存完整 prompt、transcript、模型原始响应和 API Key。

验收：固定 fixture 输出可通过 schema；超时、空响应、代码块 JSON、缺字段、越界分数均转换为稳定错误码。

### M6：幂等 Finalize 编排

目标：让刷新、双击和多标签请求不会写出多份反馈，并尽量避免重复模型费用。

预计文件：

- `lib/feedback/finalize-policy.ts`
- `lib/feedback/feedback-store.server.ts`
- `lib/feedback/finalize.server.ts`
- `app/api/interviews/[sessionId]/finalize/route.ts`
- `tests/feedback/finalize-policy.test.ts`

实施步骤：

1. Route Handler 先认证，再在 DAL 内重新校验 Session 归属。
2. 已有 `feedbacks/{sessionId}` 时直接返回 ready，不调用模型。
3. transcript 未就绪时返回 202/422，不取得生成租约。
4. Firestore 事务创建 `generationAttemptId` 和短租约；有效租约存在时返回 generating。
5. 租约持有者在事务外调用模型，避免长事务。
6. 使用第二个事务校验 attemptId、创建确定性 Feedback、更新 Session feedbackId/status。
7. 失败时保留 transcript，记录稳定错误码并释放或缩短租约，允许显式重试。

租约只能防止正常并发重复调用。若进程在模型计费完成、写库之前崩溃，严格的零重复计费需要耐久任务队列或供应商幂等键，不纳入本次 MVP，也不得在交接中宣称“绝对 exactly-once”。

验收：连续请求、并发请求、有效租约、过期租约、已有反馈、模型失败和写库失败均有确定结果；任何失败不删除 transcript。

验证命令：

```powershell
node --conditions=react-server --test tests/feedback/*.test.ts
npx.cmd tsc --noEmit
npx.cmd eslint lib/feedback app/api/interviews
```

### M7：反馈页与通话结束闭环

目标：用户结束有效面试后能看到明确进度，并最终查看本次 Session 的反馈。

建议路由：`/interview/[interviewId]/feedback?sessionId={sessionId}`。两个 ID 都属于不可信输入；页面用 sessionId 读取 Session 后，必须同时核验 userId 和 interviewId。

预计文件：

- `app/(root)/interview/[interviewId]/feedback/page.tsx`
- `components/interview/FeedbackGenerationStatus.tsx`
- `components/interview/InterviewFeedback.tsx`
- `components/interview/AliyunInterviewClient.tsx`
- 反馈页局部样式文件或现有全局样式的最小扩展

页面状态：

- `transcript_pending`：显示“正在整理面试记录”，按服务端 retryAfterMs 有界轮询。
- `generating`：显示“正在生成反馈”，继续有界轮询。
- `insufficient_transcript`：说明有效回答不足，提供重新练习入口。
- `provider_failed`：保留记录，提供显式重试按钮。
- `ready`：展示总分、五个维度、优势、改进项和总结。

实施要求：

- 页面主体为 Server Component；只有触发 finalize、轮询和重试的小组件使用 `"use client"`。
- 首次渲染先读已有 Feedback；存在时绝不再次调用 finalize。
- 轮询使用退避和总时限，组件卸载时取消；不能产生无限请求。
- 通话正常结束后保留 sessionId，显示进入反馈页的明确命令；技术失败不自动生成评分。
- 保留键盘操作、加载提示、可访问标题、窄屏布局和现有视觉语言。

验收：刷新 ready 页面没有模型请求；越权、不匹配 interviewId、非法 sessionId 返回 404；每个状态都有可恢复下一步。

浏览器验证：

```text
/interview/{ownedInterviewId}/feedback?sessionId={ownedSessionId}
```

分别检查桌面与窄屏、处理中、失败重试、成功、刷新、返回首页和未登录状态。

### M8：首页最近反馈摘要

目标：让可重复使用的面试配置显示最近一次练习结果，同时仍能开始新练习。

预计文件：

- `lib/interviews/interview-store.server.ts`
- `components/InterviewCard.tsx`
- `app/(root)/page.tsx`

实施步骤：

1. DAL 按当前用户批量查询最近 Session/Feedback 摘要，避免每张卡独立读取。
2. 卡片分别显示未练习、处理中、生成失败和最新得分。
3. “查看反馈”携带最新 sessionId；“再次练习”继续使用原 interviewId。
4. 只返回 UI 需要的摘要字段，不把 transcript 或内部错误返回组件。

验收：同一 Interview 三次练习时展示最新一次；不同用户数据不混合；无反馈时原有进入面试行为不变。

### M9：MVP 集成验收

目标：在测试环境证明从真实通话到反馈页面的完整闭环，并记录未验证项。

自动检查：

```powershell
npm.cmd run test:ai-realtime
node --conditions=react-server --test tests/feedback/*.test.ts
npx.cmd tsc --noEmit
npm.cmd run lint
npm.cmd run build
npm.cmd ls aliyun-auikit-aicall --depth=0
```

真实测试矩阵：

| 场景 | 预期结果 |
|---|---|
| 正常完成一题面试 | user/assistant transcript 完整，生成一份反馈 |
| 正常完成五题面试 | 消息顺序正确，反馈覆盖多题表现 |
| 用户提前挂断且有有效回答 | 等待回调稳定后允许生成反馈 |
| 用户未回答就挂断 | 显示内容不足，不生成分数 |
| 浏览器刷新或直接关闭 | 服务端回调仍能归档最终文本 |
| 同一回调重放三次 | 消息集合无重复 |
| chat_record 晚于 agent_stop | Session 不倒退，迟到消息可入库 |
| 反馈页连续刷新/双击 | 只有一个 Feedback 文档，通常只有一次模型调用 |
| 模型超时或格式错误 | transcript 保留，页面可重试 |
| 未登录或读取他人 sessionId | 401/404，不泄露资源是否存在 |
| Feature Flag 关闭 | 回调/记录保留，新的模型生成被拒绝 |

安全检查：

- `.next/static` 和浏览器网络响应不包含 callback Token、百炼 API Key、Firebase Admin 凭证或 RTC App Key。
- 回调日志不包含 Authorization、userData 原文、对话正文或完整请求体。
- finalize 日志不包含 transcript、完整 prompt 或模型原始响应。
- 回调请求体、消息文本、消息数量、transcript 总长和模型超时均有上限。
- 页面和 API 都不能只凭 interviewId 或 sessionId 单字段授权。
- 反馈页面明确这是练习建议，不是招聘决定或事实判断。

性能目标：

- 回调在不含 Firestore 重试时尽快返回，禁止等待模型。
- transcript ready 后反馈生成 P95 目标不超过 20 秒。
- feedback ready 页面刷新不触发模型调用。
- 首页获取反馈摘要采用批量查询，避免按卡片数量线性增加请求。

### 各模块必须包含的关键注释

| 模块 | 必须通过中文注释讲清楚的内容 |
|---|---|
| M0 | 正常结束、提前结束和技术失败的区别；为什么重复 end 不能覆盖首次结果；为什么清理后仍保留 sessionId |
| M1 | Interview、Session、Transcript、Feedback 的一对多/一对一关系；状态值和评分约束 |
| M2 | 回调为何不使用 Firebase Cookie；Authorization 如何比较；为什么先限长再解析；为何不保存原始 payload |
| M3 | eventKey 如何保证重复回调不重复写入；事务保护什么；为什么 completed 仍接受迟到 chat_record 但不回退状态 |
| M4 | agent_stop 后为什么还要等待 5 秒；最小有效问答如何判断；为什么限制消息数和总字符数 |
| M5 | transcript 为何是不可信数据；JSON Schema 与 Zod 各保护哪一层；超时/重试策略；为何不记录原始模型内容 |
| M6 | 为什么模型调用放在事务外；生成租约如何减少重复费用；两个事务各自保证什么；崩溃窗口为什么无法绝对 exactly-once |
| M7 | Server Component 与 Client Component 的职责；自动 finalize、轮询退避、卸载取消；各页面状态如何恢复 |
| M8 | 为什么使用批量查询；如何从 interviewId 找最新 Session；为什么查看反馈和再次练习使用不同 ID |
| M9 | 测试 fixture 为什么不含真实凭证；每个竞态、越权、迟到回调用例对应的线上风险 |

模块验收不得只统计注释数量。评审者应抽查以上语义是否准确，并删除“给变量赋值”“调用函数”一类重复代码的注释。

## 9. 外部配置与人工操作

以下动作不由代码 Agent 擅自执行，必须获得用户授权：

1. 部署包含 callback Route Handler 的测试环境，并确认 HTTPS 公网可达。
2. 在阿里云智能体控制台启用状态回调和聊天记录实时回调。
3. 设置回调地址与随机高强度 Token；Token 只进入部署环境变量。
4. 在百炼控制台创建或选择模型 API Key，并确认 Region 与兼容端点。
5. 设置 `AI_FEEDBACK_ENABLED=true` 前先完成固定 fixture 和单场真实面试验收。

配置时必须确认：

- 阿里云实际发送的 Authorization 格式与代码验证规则一致。
- AICallKit 的 `userData` 原样出现在回调中，并能解析出本项目 sessionId。
- chat_record 的 role/producer、sentence_id/dialogueId 和 timestamp 真实格式。
- agent_stop 与最后一条 chat_record 的真实先后关系。
- 模型实际支持选定的 JSON Schema 模式；不支持时停止并报告，不静默退化为自由文本。

任何截图、测试记录和日志都必须隐藏 Token、Key、Cookie、私人对话正文和用户标识。

## 10. Feature Flag 与回滚

- `AI_REALTIME_ENABLED=false`：保持现有行为，禁止创建新实时通话。
- `AI_FEEDBACK_ENABLED=false`：停止新的模型调用，但继续接收回调和保存 transcript。
- callback 不应与反馈开关绑定，否则关闭模型时会丢失面试记录。
- 回滚反馈 UI 时不得删除现有 Feedback 或 transcript。
- Provider 故障时先关闭 `AI_FEEDBACK_ENABLED`，页面显示暂不可用并保留重试入口。
- callback 连续鉴权失败时先核对 Header 格式和环境配置，不降低鉴权强度。

## 11. MVP 完成标准

只有全部满足后，才可宣布本阶段完成：

- 一场真实面试的双方最终文本由阿里云回调写入 Firestore。
- 浏览器字幕未进入权威 transcript，也未作为 finalize 输入。
- 重复、乱序和迟到回调不会重复消息或回退 Session 状态。
- transcript 不完整时只显示处理中或内容不足，不生成虚假反馈。
- 同一 Session 最终只有一个确定性 Feedback 文档。
- 反馈记录同时包含 sessionId、interviewId、userId、model、promptVersion 和 transcriptHash。
- 反馈结构通过严格 schema，总分由服务端计算。
- 刷新、重试和多标签页不会写出第二份反馈。
- 模型失败不会删除或污染 Session 和 transcript。
- 反馈页与首页通过服务端重新校验当前用户归属。
- 自动检查全部通过，且没有新增依赖或升级 AICallKit。
- Chrome/Edge 至少各完成一次测试环境真实闭环。

## 12. 排期建议

| 模块 | 预计时间 | 主要产物 |
|---|---:|---|
| M0 | 0.5 天 | 准确结束状态与 sessionId 交接 |
| M1 | 0.5 天 | 严格领域类型、schema 和纯函数测试 |
| M2 | 0.5 天 | 安全 callback Route Handler |
| M3 | 0.5–1 天 | 幂等 transcript 持久化 |
| M4 | 0.5 天 | transcript 就绪策略与有界读取 |
| M5 | 0.5–1 天 | 百炼结构化反馈 Provider |
| M6 | 0.5–1 天 | 幂等 finalize 与生成租约 |
| M7 | 1 天 | 反馈页完整状态闭环 |
| M8 | 0.5 天 | 首页最近反馈摘要 |
| M9 | 0.5–1 天 | 自动回归与真实云端验收 |

总计约 5–7 个开发日。M0–M7 构成最小可内测闭环；M8 可以在闭环稳定后接入，M9 不得省略。

## 13. MVP 后第一批增强

按优先级排序：

1. 使用 `DescribeAIAgentInstance / CallLogUrl` 补齐缺失 transcript。
2. 引入耐久任务队列，处理无人停留在反馈页时的自动生成与崩溃恢复。
3. 增加用户主动删除 Session、transcript 和 Feedback 的完整数据删除能力。
4. 增加 90 天保留期限和清理任务。
5. 增加生成耗时、成功率、错误类别和 token 用量统计，不记录正文。
6. 基于多次 Session 提供趋势比较，不覆盖历史反馈。

实现 CallLogUrl 前必须确认服务端 API 鉴权、URL 有效期、下载大小限制和返回 JSON 的真实结构。它不能接受任意客户端 URL，且下载必须限制域名、响应大小和超时，避免 SSRF。

## 14. 停止条件

遇到以下任一情况，当前模块停止实现并向用户报告，不自行扩大范围：

- 真实回调没有携带可关联 Session 的 userData，或其格式与已验证协议冲突。
- 阿里云 Authorization 实际格式不明确，无法在不降低安全性的前提下验签。
- chat_record 只提供浏览器侧片段，无法得到稳定双方最终文本。
- 选定模型不支持严格结构化输出，需要更换模型、依赖或架构。
- 必须新增 npm 包、升级 SDK、引入队列、修改 Firestore 安全规则或迁移既有数据。
- 一个不可再拆的实现步骤必然超过 100 行补丁。
- 用户未提交改动与目标文件重叠，且无法在不覆盖的情况下继续。
- 需要部署、修改阿里云/Firebase/百炼配置或使用真实凭证，但尚未取得授权。
- 自动测试通过但真实回调、Firebase 或模型行为尚未验证；此时只能标记未验证。

## 15. 每个模块的交接格式

每完成一个模块立即暂停，使用以下格式交接：

```text
模块：Mx · 名称

修改了什么：
- 按文件列出行为变化。

为什么需要：
- 对应本计划中的风险、契约或验收项。

执行的验证：
- 精确命令、页面路径或测试环境操作。

验证结果：
- 逐项写通过、失败或未验证，不使用“应该可以”。

安全检查：
- 是否检查日志、响应和客户端产物中的敏感信息。

注释检查：
- 按本模块注释清单列出已解释的关键逻辑。
- 确认没有重复代码、已经过时或大段教程式注释。

尚未验证：
- 真实阿里云、Firebase、百炼、浏览器或竞态条件。

建议暂存：
- 只列本模块文件；提醒先运行 git diff --check 并查看 diff。

推荐提交名：
- 一句简洁中文；不得代替用户 commit。

下一模块：
- 只说明建议和前置条件，等待用户回复后再开始。
```

## 16. 后续执行起点

默认从 **M0：收口会话结束语义与反馈入口** 开始。先用当前代码和测试复核 M0 是否已由其他改动完成；若未完成，只实施 M0，不提前创建 callback、Feedback 页面或模型配置。M0 交接并由用户确认后，再进入 M1。
