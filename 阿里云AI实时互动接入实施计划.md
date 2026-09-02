# 阿里云 AI 实时互动接入实施计划

评估日期：2026-09-01  
适用仓库：`F:/interview-prep`  
当前技术栈：Next.js 16.3.1、React 19.2.8、TypeScript、Firebase Authentication / Firestore

> 本文是一份可以直接拆任务开工的实施计划。默认业务是“个人 AI 模拟面试练习”，首期为桌面浏览器纯语音面试；若实际用途是正式招聘、考试或强防作弊场景，必须执行第 4 节的高可信架构切换。

## 1. 最终建议

采用阿里云智能媒体服务 IMS 的 **AI 实时互动 + Web AICallKit 无 UI 方案**，保留本项目现有面试界面。

- 浏览器安装 `aliyun-auikit-aicall`，由它负责 WebRTC、麦克风、AI 音频播放、智能体状态、实时字幕、智能打断和设备控制。
- Next.js 只处理短 HTTP 请求：Firebase 身份认证、会话创建、服务端生成 ARTC Token、接收阿里云回调、会话落库和面试反馈生成。
- 阿里云 IMS 实时工作流负责 STT、LLM、TTS 和对话轮次，不再自行搭建 ASR/TTS WebSocket 网关。
- 首期用纯语音 `VoiceAgent`，不接数字人、视觉理解、录音和防作弊。
- `AI SDK` 默认暂缓引入；它不负责 AICallKit、WebRTC、实时字幕或语音打断。只有面试后反馈需要多模型切换、工具调用或统一结构化输出时，再把它加入服务端反馈模块。

这一方案比“Fun-ASR + Qwen + CosyVoice 自行拼接”更适合当前目标，因为阿里云已经托管了回声处理、语义断句、实时字幕、全双工与打断；本项目无需维护常驻语音网关。

## 2. 已核实的项目基线

| 位置 | 当前情况 | 实施影响 |
| --- | --- | --- |
| `package.json` | 没有 RTC、语音或 AI SDK 依赖 | 可直接引入 AICallKit，不存在旧链路迁移 |
| `components/Agent.tsx` | 已有 `messages`、`isSpeaking`、`onCall`、`onDisconnect` | 视觉组件可复用，但通话状态必须改为由真实 SDK 事件驱动 |
| `app/(root)/interview/page.tsx` | 固定用户名 `Sr`，没有真实面试和用户数据 | 改为服务端读取当前用户和 `interviewId`，再传给客户端会话容器 |
| `types/index.d.ts` | 已有 `Interview`、`Feedback`、`feedbackSchema` | 可扩展实时会话与字幕类型，反馈结构继续复用 |
| Firebase | 已有服务端 Session Cookie 验证与 Firestore | Token 接口、回调入库、会话归属校验可沿用 |
| Next.js 16.3.1 | Route Handler 适合短请求，不应承担常驻 WebSocket | 本方案不新增 Next.js 音频长连接，能兼容常见 serverless 部署 |

当前 `Agent.tsx` 有两个生产问题需要在接入时一起修复：

1. 未传 `onCall` 也会进入 `ACTIVE`，会展示“假接通”。
2. 连接期间按钮仍可重复点击，可能创建多通收费会话。

## 3. 首期范围与默认值

以下默认值可以让团队不等待额外产品讨论，直接启动 P0：

| 项目 | 首期默认值 |
| --- | --- |
| 使用场景 | 个人面试练习，不用于正式录用决策 |
| 交互形式 | 桌面 Chrome / Edge 的纯语音面试 |
| 语言 | 普通话为主，支持中英技术词，`zh_en` |
| 对话模式 | 自然对话 + 语义断句；“我说完了/回答完毕”作为兜底结束词 |
| STT | 阿里云系统预置，先用中英混合推荐模型做基线 |
| LLM | IMS 工作流中的系统预置千问；通过每通 `llmSystemPrompt` 注入岗位、级别和问题 |
| TTS | 系统预置 TTS / Qwen3-TTS，使用系统音色 |
| 数据保存 | 保存权威文本转录和反馈，不保存音频 |
| 会话限制 | 单用户仅 1 通活跃会话；单通最多 30 分钟；默认每日最多 5 通 |
| 地域 | 中国内地用户优先选择与部署、Firestore 网络路径匹配的同一内地域；P0 可先用现有账号可用地域 |
| 非首期 | 数字人、摄像头、VCR 防作弊、声纹、声音克隆、移动端专项适配、电话呼入呼出 |

## 4. `$grill-me` 审查后的关键决策门

### 4.1 练习产品还是正式招聘

本文默认是练习产品，因此采用阿里云官方推荐的 **客户端 `callWithConfig` 启动**：接通更快、服务端更轻。

如果未来用于正式招聘、考试或付费认证，必须改为服务端调用 `StartAIAgentInstance`：

- 客户端启动时，用户可以在浏览器中查看和篡改 `agentConfig`、提示词和题目。
- 服务端启动可以锁定题目、提示词、智能体配置和实例 ID。
- 正式场景的评分必须只使用阿里云服务端回调或 `CallLogUrl`，不能信任浏览器提交的 transcript。

这个切换不需要重写 UI 和字幕层，只替换“创建会话”服务端流程与 AICallKit 的启动入参。

### 4.2 纯语音还是视频防作弊

首期选择 `VoiceAgent`。如果目标是防作弊，不能只打开摄像头；需要另立二期，采用 `VisionAgent` / `VideoAgent`，明确用户授权、画面检测规则、误报申诉、录像留存和隐私合规。视频价格也明显高于纯音频。

### 4.3 自然对话还是对讲机

正式体验默认自然对话 + 语义断句。P0 必须同时验证对讲机模式，因为它是最可靠的降级路径：

- 语义断句能让体验更自然，但候选人思考停顿时仍可能提前抢话。
- 对讲机模式由 `startPushToTalk` / `finishPushToTalk` 明确划分回答，稳定但交互感稍弱。
- 若 P0 的中文技术面试语料误断率超过验收线，MVP 默认切换对讲机，不阻塞上线。

### 4.4 是否保存录音

首期不保存录音，只启用聊天记录实时回调和最终文本归档。保存音频会引入 OSS、额外计费、告知与同意、保留期限和删除机制，应单独立项。

### 4.5 初学者友好与最小改动原则

本次接入必须遵循“能复用就不重写、一次只改一个目的”的原则：

- 保留现有 Next.js、Firebase、页面样式和 `Agent` 组件主体，只把真实通话状态从组件内部移交给一个小型会话容器。
- 不为了本功能更换数据库、认证、CSS 方案或目录体系。
- 不提前引入 AI SDK、状态管理库、队列或独立语音服务器；只有当前阶段的验收确实需要时再增加。
- 每个阶段单独实施和验证，优先形成小提交；P0 未通过时不继续堆叠后续代码。
- 如果某一步必须大范围重构，先说明“为什么小改无法完成、会改哪些文件、如何回滚”，得到确认后再动手。
- 每次交付都用通俗语言说明改了什么、为什么要改、用户如何亲自验证。

这些长期协作规则同时写入仓库根目录的 `AGENTS.md`；本节负责限定这次阿里云接入的具体改动边界。

## 5. 目标架构

```text
Browser / InterviewSession (Client Component)
  ├─ POST /api/ai-realtime/sessions
  │    └─ Firebase Session 校验、限额、生成 channelId 与 ARTC Token
  ├─ AICallKit.callWithConfig
  │    └─ 阿里云 ARTC + IMS AI 实时工作流
  ├─ SDK 事件 → 页面状态、字幕、打断、错误提示
  └─ End / beforeunload → handup/hangup + destroy

阿里云 IMS
  ├─ STT → 千问 LLM → TTS
  ├─ 智能断句 / 智能打断 / 实时字幕
  └─ HTTPS 回调 → POST /api/ai-realtime/callback
                         └─ Firestore 权威会话与 transcript

反馈页
  └─ POST /api/interviews/{sessionId}/finalize
       ├─ 校验用户与会话归属
       ├─ 读取回调 transcript；必要时补拉 CallLogUrl
       ├─ 生成并校验 Feedback
       └─ Firestore 幂等写入
```

关键边界：

- 浏览器只拿短期 RTC Token、Agent ID、Region 和本通非敏感配置。
- `ALIYUN_RTC_APP_KEY`、AccessKey Secret、回调 Token 永不下发浏览器，不能使用 `NEXT_PUBLIC_` 前缀。
- Next.js 不代理音频流，不持有 WebSocket；音频直接走阿里云 ARTC。
- 页面字幕可使用客户端 SDK 事件即时显示，入库和评分使用阿里云回调作为权威来源。

### 5.1 字幕、对话文本与反馈的数据链路

这里必须区分三种看起来相似、用途却不同的数据：

| 数据 | 来源 | 是否持久化 | 用途 |
| --- | --- | --- | --- |
| 实时字幕 | 浏览器 SDK 的 `userSubtitleNotify`、`agentSubtitleNotify` | 不把每次临时变化写数据库 | 让用户在通话页面立即看到自己和 AI 正在说什么 |
| 最终对话文本 | 阿里云服务端 `chat_record` 回调；必要时用 `CallLogUrl` 补齐 | 是，写入 Firestore | 保存完整面试记录，作为反馈评级的权威输入 |
| 反馈评级 | 面试结束后读取最终对话文本，再调用反馈模型 | 是，写入现有 Feedback 结构 | 生成总分、分类分数、优势、改进项和总结 |

完整流程是：

```text
用户/AI 说话
  ├─ 浏览器字幕事件 → 立即显示，不用于最终评分
  └─ 阿里云聊天记录回调 → Firestore 对话文本
                                  └─ 面试结束 → feedbackSchema → 反馈评级
```

因此，“不保存语音”只表示不保存原始 WAV、RTC 录音或 OSS 音频文件，**仍然保存双方的对话文字**。否则无法稳定生成后续反馈。

字幕实现规则：

- 用户和 AI 字幕必须区分角色，并显示为独立消息。
- 同一句流式字幕使用 `sentenceId` 更新原消息，不能每次变化都新增一行。
- 页面可以显示临时字幕；只有稳定文本或服务端回调文本才进入最终 transcript。
- 断线重连后客户端字幕允许暂时缺失，但服务端回调和 `CallLogUrl` 必须能够补齐最终记录。
- 评分只读取 Firestore 中的权威 transcript，不直接信任浏览器上传的字幕数组。

## 6. 阿里云控制台配置

### 6.1 开通与资源

1. 开通智能媒体服务 IMS 的 AI 实时互动。
2. 选择目标 Region，后续工作流、智能体、ARTC、可选 OSS 均保持一致。
3. 创建或让控制台自动创建 ARTC 应用，记录 App ID 与 App Key。
4. 创建语音通话实时工作流。
5. 创建 `VoiceAgent` 并绑定该工作流和 ARTC 应用。
6. 记录 Agent ID、Region、RTC App ID、RTC App Key。
7. 为生产创建最小权限 RAM 身份；如果首期仅由 AICallKit 客户端启动且 Next.js 本地生成 RTC Token，可以暂不引入 ICE OpenAPI AccessKey。

### 6.2 工作流基线

工作流按 `STT → LLM → TTS` 配置：

- STT：系统预置，中英混合；加入 React、Next.js、TypeScript、JavaScript、HTTP、CSS、Node.js、Firebase 等热词。
- LLM：系统预置千问，控制台保留稳定的基础面试官人设；每通会话通过 `agentConfig.llmConfig.llmSystemPrompt` 注入岗位、级别、题目和结束规则。
- LLM 历史轮数：初始 10 轮；题目较多时再根据延迟和上下文完整性调整。
- TTS：首期用系统音色，语速从 `1.0` 开始。
- 智能断句：开启；`turnDetectionConfig.mode = Semantic`。
- 语义等待：首轮先用 3–5 秒验证，最终根据真实语料调整。
- 结束词：`我说完了`、`回答完毕`、`完毕`。
- 智能打断：开启，但保留界面上的手动“打断 AI”按钮。
- 优雅下线：开启，结束通话时允许 AI 播完当前句；用户主动立即结束时走强制挂断。

提示词必须约束：

- 每次只问一道题。
- 先等待候选人回答，再追问或进入下一题。
- 追问最多 1 次，避免无限对话。
- 不在面试中泄露标准答案和评分。
- 所有题目完成后明确播报结束语，并输出机器标志 `[INTERVIEW_COMPLETE]`。
- TTS 过滤方括号标志，不朗读机器标志；客户端识别标志后进入结束流程。

### 6.3 回调

开启以下 HTTPS 回调：

- 智能体状态回调：`agent_start`、`session_start`、`agent_stop`、`error`。
- 工作流状态回调：用于测量 ASR、LLM、TTS 各段延迟。
- 聊天记录实时回调：作为权威 transcript。

配置一个高熵 Bearer Token。回调接口必须验证 `Authorization`，并使用 `instanceId + event + sentence_id/dialogueId` 幂等去重。

## 7. 代码改造清单

建议按以下文件组织。路径是目标结构，实施时允许根据现有命名风格微调。

```text
app/
  (root)/interview/[interviewId]/page.tsx
  (root)/interview/[interviewId]/feedback/page.tsx
  api/ai-realtime/sessions/route.ts
  api/ai-realtime/callback/route.ts
  api/interviews/[sessionId]/finalize/route.ts

components/
  Agent.tsx
  interview/InterviewSession.tsx
  interview/Transcript.tsx
  interview/CallControls.tsx

lib/
  ai-realtime/aicall-client.ts
  ai-realtime/events.ts
  ai-realtime/session-machine.ts
  aliyun/config.server.ts
  aliyun/rtc-token.server.ts
  data/interview-sessions.server.ts
  feedback/generate.server.ts
  feedback/provider.server.ts       # 只有决定采用 AI SDK 时才新增

types/
  ai-realtime.ts

tests/
  ai-realtime/rtc-token.test.ts
  ai-realtime/session-machine.test.ts
  ai-realtime/callback.test.ts
  e2e/interview-call.spec.ts
```

### 7.1 `Agent.tsx`

将它收敛为展示组件，不再自己猜测通话是否接通：

- `status`、`messages`、`isSpeaking`、`error` 全部由 `InterviewSession` 传入。
- Call、End、Mute、Interrupt 只触发回调。
- 连接中禁用 Call，防止重复创建会话。
- 字幕使用稳定 `sentenceId`，不再把文本本身当 React key。

### 7.2 `InterviewSession.tsx`

作为唯一客户端编排层：

1. 首次点击 Call 时请求麦克风权限。
2. 调用 `POST /api/ai-realtime/sessions`。
3. 动态导入 `aliyun-auikit-aicall`，确保 SSR 不执行浏览器 RTC 代码。
4. 创建一个 `ARTCAICallEngine` 实例并放入 `useRef`。
5. 注册所有事件，再调用 `callWithConfig`。
6. 将 `agentStateChange` 映射为 `listening / thinking / speaking`。
7. 将 `userSubtitleNotify`、`agentSubtitleNotify` 合并为稳定消息列表。
8. 发现 `[INTERVIEW_COMPLETE]` 时等待 AI 结束当前播报，再挂断并进入反馈页。
9. `callEnd`、错误、组件卸载和页面退出都执行幂等清理。

状态机建议使用：

```text
idle
→ requesting_permission
→ issuing_token
→ connecting
→ listening | thinking | speaking
→ ending
→ ended

任意状态 → error → idle（允许重试）
```

不要只用多个互不约束的布尔值，否则网络重连、重复挂断和回调乱序时容易产生非法组合。

### 7.3 `POST /api/ai-realtime/sessions`

请求：

```json
{
  "interviewId": "..."
}
```

服务端处理顺序：

1. 用 Firebase Session Cookie 验证登录。
2. 读取 `Interview`，校验用户有权启动这次面试。
3. 检查单用户活跃会话、每日次数、单通上限和全局并发。
4. 生成不可预测的 `sessionId` 与合法 `channelId`。
5. 将 Firebase UID 哈希/规范化为最长 64 字节、只包含字母数字与 `_` 的 RTC `userId`。
6. 使用 Node `crypto` 和服务端 App ID/App Key 生成短期 ARTC Token。
7. 在 Firestore 创建 `interviewSessions/{sessionId}`。
8. 返回最小启动配置。

响应：

```json
{
  "sessionId": "...",
  "userId": "usr_...",
  "agentId": "...",
  "region": "cn-shanghai",
  "userJoinToken": "...",
  "expiresAt": "...",
  "agentConfig": {
    "agentMaxIdleTime": 600,
    "enableIntelligentSegment": true,
    "agentGracefulShutdown": true
  }
}
```

`agentConfig.llmConfig.llmSystemPrompt` 由服务端根据 Firestore 的岗位、级别和题目生成。练习场景允许把它作为本通配置返回浏览器；正式招聘场景不得这样做，应在服务端启动智能体。

### 7.4 Token 生成

官方提供 Node.js `crypto` 示例，可直接在 Next.js Node Runtime 的 `server-only` 模块实现，不需要为了 Token 单独部署 Java AppServer。

要求：

- 显式使用 Node Runtime，不部署到 Edge Runtime。
- App Key 只存在服务端环境变量。
- Token TTL 建议 5–10 分钟，仅用于入会；通话时长由业务会话另行控制。
- Channel ID 与 Session 绑定并持久化。
- 单元测试固定时间与输入，验证 token JSON、Base64 和 SHA-256 结果。

### 7.5 回调接口

`POST /api/ai-realtime/callback` 必须：

- 验证 Bearer Token，使用恒定时间比较。
- 限制 Content-Type、请求体大小和字段长度。
- 用 Zod 校验已知字段；未知字段可保留到 `raw`，避免厂商增量字段导致整个回调失败。
- 通过 `userData.sessionId` 与预生成的 `channelId` 关联业务 Session。
- 幂等 upsert，允许重复、延迟和乱序回调。
- 只做校验与写库，尽快返回 2xx；不要在回调请求内同步调用反馈 LLM。
- `agent_stop` 将 Session 标记为 `completed`，但允许迟到的最后一条 `chat_record` 继续写入。

客户端字幕只用于即时 UI。最终评分读取回调保存的数据；如果回调不完整，调用 `DescribeAIAgentInstance` 获取 `CallLogUrl` 补齐。

## 8. Firestore 数据设计

### 8.1 `interviewSessions`

```ts
interface InterviewSessionRecord {
  id: string;
  interviewId: string;
  userId: string;
  rtcUserId: string;
  channelId: string;
  agentId: string;
  agentInstanceId?: string;
  region: string;
  status:
    | "created"
    | "connecting"
    | "active"
    | "ending"
    | "completed"
    | "failed";
  conversationMode: "semantic" | "push_to_talk";
  modelConfigVersion: string;
  tokenExpiresAt: string;
  startedAt?: string;
  endedAt?: string;
  lastEventAt?: string;
  errorCode?: string;
  feedbackId?: string;
}
```

### 8.2 消息子集合

`interviewSessions/{sessionId}/messages/{eventKey}`：

```ts
interface TranscriptMessage {
  eventKey: string;
  role: "user" | "assistant";
  text: string;
  sentenceId?: number;
  dialogueId?: string;
  roundId?: string;
  source: "aliyun_callback" | "aliyun_call_log";
  occurredAt: string;
  receivedAt: string;
}
```

不要把不断变化的 partial 字幕逐字写 Firestore。客户端可展示 partial；服务端只持久化回调中的稳定句子，降低写放大和重复费用。

## 9. 面试提示词与结束协议

服务端根据 `Interview` 构造提示词，至少包含：

- 面试官角色、岗位、级别、技术栈。
- 按顺序排列的问题清单。
- 每题最多一次追问。
- 不提前给答案、不公布评分。
- 用户沉默时先提醒一次，再结束。
- 所有问题完成后输出结束语和 `[INTERVIEW_COMPLETE]`。
- 只把机器标志用于控制，不把它作为普通语言解释。

提示词版本写入 `modelConfigVersion`。任何提示词改动都要保留版本，便于对比延迟、完成率和反馈质量。

首批评测语料至少 50 句，覆盖：

- React / Next.js / TypeScript 等中英混说。
- 2–5 秒思考停顿。
- 长回答、口头禅、重复和自我修正。
- AI 播报时插话。
- “我说完了”“回答完毕”等结束词。

## 10. `AI SDK` 是否使用

这里的 `AI SDK` 按 Vercel AI SDK 理解。

| 场景 | 是否使用 | 原因 |
| --- | --- | --- |
| RTC、麦克风、AI 音频 | 否 | AI SDK 不管理 WebRTC 或 AICallKit |
| 实时字幕、智能断句、打断 | 否 | 这些是 IMS/AICallKit 事件与能力 |
| 实时面试 LLM | 首期否 | LLM 已由 IMS 实时工作流管理，再套一层会增加状态源和故障点 |
| 面试后结构化反馈 | 待定 | AI SDK 可通过 OpenAI-compatible provider 统一 Qwen/其他模型，并配合 Zod；但当前只有单一 Qwen 时直接调用也足够 |
| 多供应商切换、fallback、工具调用 | 是，出现需求后再加 | 这是 AI SDK 真正有价值的部分 |

决策规则：满足以下任一条件才引入 AI SDK。

1. 反馈模型需要在 Qwen 与第二家模型之间切换或 fallback。
2. 反馈生成要使用工具调用或统一流式 UI。
3. 项目出现两个以上服务端 AI 功能，需要一个稳定 Provider 层。

如果决定引入，只安装 `ai` 和 `@ai-sdk/openai-compatible`，放在 `lib/feedback/provider.server.ts`，使用百炼 OpenAI-compatible endpoint；不要启用 Vercel AI Gateway，除非已明确接受模型请求经过另一服务商。

即使采用 AI SDK，也继续在服务端用现有 `feedbackSchema` 做最终校验和重试，不能直接信任模型 JSON。

## 11. 分阶段执行计划

以下工期为单名熟悉 Next.js/TypeScript 的工程师估算，不包含账号审批和产品等待时间。

### P0：供应商与浏览器 Spike（0.5–1 天）

任务：

- 开通服务并创建最小 VoiceAgent。
- 只在本地使用控制台体验 `shareToken` 跑通官方示例；严禁用于生产。
- 在独立测试页安装并动态导入 `aliyun-auikit-aicall`。
- 分别验证 Next.js 16 默认 Turbopack 的 `dev/build`；阿里云当前只明确声明 Webpack 5 或 Vite，若 Turbopack 不兼容，再用 `next dev --webpack`、`next build --webpack` 做受控回退。
- 验证 Chrome / Edge：接通、字幕、状态、手动打断、自然打断、结束与资源释放。
- 记录实际 npm 版本、包体积、TypeScript 类型和事件签名。
- 解决官方文档里的方法命名冲突：部分页面写 `handup()`，示例又写 `hangup()`；以已安装包的类型声明和编译结果为唯一依据。

完成标准：

- 连续完成 10 通 3 分钟测试，无僵尸通话。
- 刷新/关闭页面后资源能释放；若未主动挂断，记录厂商约 90 秒才退出的计费风险。
- 用户和 AI 双方字幕均能获取。
- 明确 SDK 是否可在 Next.js 16 + React 19 客户端组件中正常构建。
- 默认 Turbopack 能正常构建；若只能用 Webpack，已记录原因、构建命令和对项目开发体验的影响后再修改 `package.json`，不能先入为主切换整个项目。

不通过则停止后续开发，回到“自建语音网关”备选路线。

### P1：生产 Token 与会话骨架（1–1.5 天）

任务：

- 新增环境变量与 `server-only` 配置模块。
- 实现 ARTC Token 生成及单元测试。
- 实现 `POST /api/ai-realtime/sessions`。
- 新建 Firestore Session 数据结构、活跃会话约束和每日配额。
- 给接口加 Firebase auth、ownership 校验、Zod 和限流。

完成标准：

- 浏览器 bundle 中找不到 App Key / AccessKey / 回调 Token。
- 未登录、越权、超额、重复启动均被拒绝。
- Token 过期和错误可返回可识别错误码。

### P2：AICallKit 与现有 UI 集成（2 天）

任务：

- 拆分 `Agent` 展示层与 `InterviewSession` 编排层。
- 接入状态机、字幕、呼叫、挂断、静音、手动打断。
- 实现用户/AI 双角色字幕、同句流式更新、稳定句去重和字幕滚动区域。
- 处理麦克风权限拒绝、设备缺失、网络错误、Token 过期、同名登录。
- 添加 `beforeunload` 和组件卸载清理。
- 实现 `[INTERVIEW_COMPLETE]` 结束协议。

完成标准：

- UI 状态只由 SDK 事件驱动，不出现假接通。
- Connecting 状态无法重复点击。
- End 多次点击仍只执行一次清理。
- AI 播报动画与 `Speaking` 状态一致。
- 字幕按稳定 ID 更新，不重复、不闪烁。
- 用户字幕和 AI 字幕角色明确；临时字幕更新不会生成大量重复消息。

### P3：权威回调、文本归档与故障恢复（1.5–2 天）

任务：

- 实现并部署 HTTPS 回调接口。
- 配置 Bearer Token、状态/工作流/聊天记录回调。
- 实现事件幂等、乱序处理和 transcript 持久化。
- 确认不保存音频时仍能把用户与 AI 的最终对话文本完整写入 Firestore。
- 将 `agent_stop` 与业务 Session 结束关联。
- 增加 `DescribeAIAgentInstance / CallLogUrl` 补偿流程。

完成标准：

- 同一回调重放 3 次只产生一条消息。
- 客户端断网或直接关页后，服务端最终仍能拿到结束状态与 transcript。
- 反馈模块可按正确时间顺序读出双方对话，且不包含重复的流式字幕片段。
- 回调晚到不会把 `completed` 会话错误恢复为 `active`。

### P4：面试反馈（1–1.5 天）

任务：

- 实现幂等 `finalize` 接口。
- 使用权威 transcript 构造反馈 prompt。
- 复用 `feedbackSchema` 校验总分、分类、优势与改进项。
- 生成失败可重试，成功后写 `feedbackId`。
- 这一步结束时再按第 10 节决定是否引入 AI SDK。

完成标准：

- 同一 Session 重复 finalize 不重复计费或写多份反馈。
- transcript 不完整时明确显示“处理中”，不拿客户端字幕直接评分。
- 反馈生成失败不会丢失面试记录。

### P5：QA、监控与上线（2 天）

任务：

- 执行第 13 节测试矩阵。
- 增加结构化日志、错误码、延迟分段和费用估算字段。
- 配置应用级配额、账单告警和 Feature Flag。
- 完成隐私提示、麦克风授权说明、数据删除入口。
- 生产灰度 5% → 25% → 100%。

完成标准：

- 达到第 12 节验收指标。
- 可在不发版的情况下关闭新会话创建。
- 已演练 SDK 故障、回调故障和账单异常的回滚路径。

预计总工程量：**8–10 个工程日**。账号未开通、Region 资源不可用、SDK 与 React 19 构建不兼容、正式招聘安全升级均不包含在该估算内。

## 12. 验收指标

这些是项目验收目标，不是厂商承诺：

| 指标 | MVP 门槛 |
| --- | --- |
| 呼叫成功率 | 测试环境连续 100 通 ≥ 98% |
| 首次接通 | 点击 Call 到 `callBegin` 的 P95 ≤ 5 秒 |
| 字幕延迟 | 用户说完到稳定字幕 P95 ≤ 1.5 秒 |
| AI 首音 | 稳定用户句结束到 AI 首音 P95 ≤ 3 秒 |
| 技术词识别 | 50 句中英技术语料关键术语准确率 ≥ 90% |
| 误断 | 含 2–5 秒思考停顿语料的提前抢话率 ≤ 10% |
| 打断 | 手动打断到停止 AI 播放 P95 ≤ 500 ms |
| 幂等 | 重复 Call、End、callback、finalize 不产生重复会话/消息/反馈 |
| 清理 | 正常 End 后 3 秒内进入 ended，并释放引擎 |
| 安全 | 客户端产物与网络响应中不存在 App Key、AccessKey Secret、回调 Token |
| 归档 | 完成会话的权威 transcript 可用率 ≥ 99% |
| 反馈 | transcript 就绪后反馈 P95 ≤ 20 秒 |

## 13. 测试矩阵

### 功能

- 正常完成 1、5、10 题面试。
- 中文、英文、中英混合技术术语。
- 长回答、沉默、重复、自我修正、结束词。
- 自然断句、手动打断、AI 智能打断、对讲机降级。
- AI 自动结束、用户主动 End、浏览器刷新、关闭标签页。

### 设备与网络

- Chrome、Edge 当前稳定版；Windows 为必测，macOS 至少烟测。
- 首次授权、拒绝授权、撤销授权、无麦克风、多麦克风切换。
- 扬声器外放与耳机。
- 断网、弱网恢复、Token 过期、两个标签页同时启动。

### 服务端

- 未登录、Session 过期、越权 interviewId、非法 body。
- 单用户并发、每日上限、全局并发。
- 回调伪造、重复、乱序、迟到、字段新增、超大 body。
- Firestore 短暂失败、CallLogUrl 尚未生成、反馈模型超时。

### 构建

- `npm run lint`
- `npm run build`
- 检查客户端 source map / bundle 不含服务端密钥。
- 根据 P0 实际 SDK 类型为调用方法写编译测试，防止厂商升级破坏 `handup/hangup` 或事件名。
- 默认 Turbopack 和 Webpack 回退构建至少各执行一次；最终只保留已验证的生产构建器。

## 14. 安全、隐私与费用控制

### 14.1 安全

- 所有业务 API 每次重新验证 Firebase Session，不依赖页面已登录这一事实。
- 校验面试资源归属，避免 IDOR。
- Token Route 使用 Node Runtime 和 `server-only`。
- 回调 Bearer Token 定期轮换；需要平滑轮换时临时接受新旧两个 Token。
- Prompt、题目和用户资料只返回完成通话所需的最小集合。
- 正式招聘模式不信任客户端参数和客户端 transcript。

### 14.2 隐私

- Call 前明确说明将采集麦克风和保存文本转录。
- 默认不录音、不录视频。
- Session 与 transcript 设置保留期限；建议练习数据默认 90 天，可由用户主动删除。
- 如果未来开启音频归档，先完成 OSS 生命周期、访问控制、下载审计和用户同意。

### 14.3 费用

按 2026-09-01 查阅到的中国内地公开标准价：

- 纯音频 AI 智能体服务：0.098 元/分钟。
- ARTC 为双向计费；官方示例折算为 0.012 元/通话分钟。
- 纯语音合计基线约 0.11 元/通话分钟，不含非预置 LLM、录音存储和应用服务器。
- 20 分钟面试约 2.20 元；1000 场 20 分钟面试约 2200 元。

新用户标准模式会打包收取 STT、TTS、智能体运行时长。首期使用预置能力，避免第三方 STT/TTS 造成重复计费；如果切换非预置服务，要先向阿里云提交工单评估单项计费模式。

IMS 按量计费不应被视为自动预算熔断，因此应用侧必须实现：

- 单用户单通和每日限额。
- 单通 30 分钟强制结束。
- 全局并发阈值。
- 日费用估算与告警。
- 紧急 Feature Flag，关闭新会话但不强杀正在进行的通话。

## 15. 上线与回滚

建议环境变量：

```text
ALIYUN_AI_REALTIME_REGION=
ALIYUN_AI_AGENT_ID=
ALIYUN_RTC_APP_ID=
ALIYUN_RTC_APP_KEY=
ALIYUN_AI_CALLBACK_TOKEN=
AI_REALTIME_ENABLED=false
AI_REALTIME_MAX_SESSION_MINUTES=30
AI_REALTIME_DAILY_LIMIT=5
```

不要把任何密钥放进 `.env.example` 的真实值，也不要使用 `NEXT_PUBLIC_`。

回滚策略：

1. 将 `AI_REALTIME_ENABLED=false`，阻止创建新 Session。
2. 已在通话中的用户允许正常结束，避免强制挂断和资料丢失。
3. 保留 `Agent` 的 mock adapter，服务异常时页面显示“语音面试暂不可用”，不伪装接通。
4. SDK 升级必须固定版本、单独 PR、通过 P0 编译与通话回归后再发布。
5. 提示词和工作流保留版本，出现质量回退时直接恢复上一版本。

## 16. 开工前输入清单

P0 开始前必须拿到：

- 已开通 IMS AI 实时互动的阿里云账号。
- 可用 Region。
- VoiceAgent ID。
- ARTC App ID 与 App Key。
- 一个仅用于本地 P0 的短期体验 Token。

P3 上线前必须拿到：

- 可公网访问的 HTTPS 回调域名。
- 回调 Bearer Token。
- 目标域名、部署区域与生产环境变量管理方案。

上线前需要产品负责人确认，但不阻塞 P0：

1. 这是个人练习还是正式招聘。
2. 是否需要保存音频/视频。
3. 单通、每日、每月预算与并发上限。
4. 首发浏览器和地区。
5. transcript 与反馈保留期限。

## 17. 官方依据

- [阿里云 AI 实时互动概览](https://help.aliyun.com/zh/ims/user-guide/real-time-conversational-ai-overview)
- [音视频通话快速入门](https://help.aliyun.com/zh/ims/user-guide/create-agents-for-audio-and-video-calls)
- [AICallKit Web 集成概览](https://help.aliyun.com/zh/ims/user-guide/integration-overview-2)
- [AICallKit Web API](https://help.aliyun.com/zh/ims/user-guide/web-usage-guide-2)
- [AICallKit Web 数据结构](https://help.aliyun.com/zh/ims/user-guide/data-structure-3)
- [ARTC Token 鉴权与 Node.js 示例](https://help.aliyun.com/zh/ims/developer-reference/token-based-authentication)
- [阿里云 AI 面试实践](https://help.aliyun.com/zh/ims/user-guide/ai-interview)
- [智能体回调](https://help.aliyun.com/zh/ims/user-guide/agent-callback)
- [数据归档](https://help.aliyun.com/zh/ims/user-guide/how-to-achieve-data-archiving/)
- [AI 实时互动计费](https://help.aliyun.com/zh/ims/real-time-conversational-ai-standard-billing)
- [Vercel AI SDK OpenAI-compatible provider](https://ai-sdk.dev/providers/openai-compatible-providers)

## 18. 第一批可直接创建的开发任务

1. `SPIKE: AICallKit 在 Next.js 16 / React 19 中的客户端构建与 10 通稳定性验证`
2. `CLOUD: 创建 VoiceAgent 工作流、热词、语义断句与回调配置`
3. `BACKEND: 实现 Firebase 鉴权的 ARTC Token 与 Session 创建接口`
4. `FRONTEND: 将 Agent 改为受控展示组件并新增 InterviewSession 状态机`
5. `FRONTEND: 接入 SDK 状态、字幕、打断、静音与资源清理`
6. `BACKEND: 实现阿里云回调鉴权、幂等 transcript 和 Session 状态落库`
7. `BACKEND: 实现 CallLogUrl 补偿与幂等反馈生成`
8. `QA: 建立中英技术词语料、断句、弱网、权限与重复事件测试矩阵`
9. `OPS: 配置 Feature Flag、会话限额、费用告警和结构化监控`
