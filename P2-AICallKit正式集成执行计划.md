# P2：AICallKit 与现有面试 UI 正式集成执行计划

> 本文是可直接交给后续 Agent 执行的工作清单。代码、`package.json`、锁文件和已安装 SDK 类型声明是事实来源；《阿里云AI实时互动接入实施计划.md》只作为路线图。本文不代表任务已完成。

## 1. 最终目标

在保留 P1 安全与会话约束的前提下，将 `aliyun-auikit-aicall@2.10.5` 正式接入现有面试 UI，完成互斥通话状态、双角色字幕、挂断、双方静音、手动/自然打断、智能断句、错误恢复、幂等清理和 `[INTERVIEW_COMPLETE]` 浏览器端结束协议。

P2 不实现阿里云服务端回调、权威 transcript、CallLogUrl 补偿、评分反馈、录音录像、正式招聘/防作弊、SDK 升级、每日配额或全局并发限制。

## 2. 开工前强制规则

每个 Agent 开始任何任务前必须：

1. 完整阅读仓库根目录 `AGENTS.md`，保留其中 Next.js 自动管理区块。
2. 执行 `git status --short --branch`、`git diff --stat` 和 `git diff --cached --stat`；保护用户已有改动，不覆盖、不删除、不顺手格式化。
3. 修改 Next.js 代码前，完整阅读当前 `node_modules/next/dist/docs/` 中与该任务有关的指南，至少按需覆盖 Server/Client Components、`use client`、lazy loading、Route Handlers 和动态路由参数。
4. 修改 React 组件时读取并遵守 `vercel-react-best-practices`；涉及页面展示时读取 `frontend-design`，但只延续现有信号台视觉，不重做产品风格。
5. 核对 `package.json`、`package-lock.json` 和 `node_modules/aliyun-auikit-aicall/types/index.d.ts`。不得凭文档或记忆猜测事件、参数和 `handup()` 名称。
6. 单次只执行本文一个任务；每个代码补丁最多新增或修改 100 行。若一个任务需要多个补丁，每个补丁仍不得超过 100 行，且每步都应保持代码可编译、可审查。
7. 不增加依赖、不升级 SDK、不创建分支或 commit、不部署、不修改外部服务。
8. 行为变化先在 `/interview/aliyun-test` 验证，再推广到 `/interview/[interviewId]`。共享的纯函数或无行为变化的展示拆分可以同时使用。
9. 无法真实执行的阿里云通话、麦克风、Firebase 和浏览器行为必须标记为“未验证”，不得用编译通过代替真实验证。
10. 每个任务完成后立即暂停，按第 8 节模板交接；只有用户回复“继续”后才能开始下一任务。
11. 每个功能都必须为核心函数、关键状态和不直观的处理分支补充简洁中文注释，用通俗语言说明“这段代码做什么、为什么这样做”，尽量少用专业术语，必须使用时同时解释；不要为显而易见的赋值或简单语句堆砌无意义注释。交接给后续 Agent 或分派子任务时必须明确传递本条要求，任务完成前检查注释是否与实际代码一致。

## 3. 已确认的执行决策

- SDK 行为变化先通过 `variant="test"` 或等价的窄范围方式在测试入口启用；真实验证后再推广，避免测试页和正式页因共享组件而同时变化。
- 正式面试页最终隐藏 Session、Region、原始 SDK 事件等诊断信息；测试页继续保留完整诊断。正式页只展示用户能理解的状态和错误。
- SDK、网络或初始化错误结束时，服务端会话记为 `failed`；只保存稳定、无敏感信息的错误码，不保存原始 SDK 文案。
- 自然打断不能依赖控制台默认值，必须根据 2.10.5 类型显式启用并监听实际状态；先在测试页验证。
- 现有 UI 风格、响应式布局、P1 路由和 Firebase 架构保持不变。

## 4. 当前基线

静态实现完成度约 45%。当前代码已经具备：八态联合类型、浏览器动态加载 SDK、监听器先注册后 `callWithConfig()`、`callBegin` 后才进入 active、双方字幕合并、50 条上限、滚动字幕、双方静音、手动打断、基础清理和 P1 会话接口。

主要缺口：954 行 Client Component 未拆分；测试页与正式页共用同一行为；刷新/卸载绕过统一清理；完成标记固定延迟 1.2 秒；稳定字幕可能倒退；媒体/网络/自动播放错误恢复不足；控制操作存在并发点击；自然打断未显式启用；禁用开关不能在页面预先显示；错误会话会被服务端写成 completed；没有 P2 自动化或真实 SDK 验证记录。

初始基线检查结果：

- `npm run test:ai-realtime`：11/11 通过，仅覆盖 P1 策略与 Token。
- `npx tsc --noEmit`：通过。
- P1/P2 相关文件定向 ESLint：通过。
- `npm run build`：Next.js 16.3.1 默认 Turbopack 构建通过。
- `npm ls aliyun-auikit-aicall --depth=0`：2.10.5。
- `.next/static` 未匹配服务端敏感变量名称。
- 真实通话、麦克风、Firebase 写入、Chrome/Edge 行为：未验证。

### 关键文件导航

| 位置 | 当前职责 | 执行注意 |
|---|---|---|
| `components/interview/AliyunInterviewClient.tsx` | 现有 UI、状态、SDK、字幕和清理 | 当前 954 行，是 P2 主要拆分对象 |
| `components/interview/AliyunInterviewClient.module.css` | 信号台视觉、动画、响应式 | 保持风格，只补状态、焦点和减弱动画 |
| `types/ai-realtime.ts` | 浏览器与服务端共享契约 | 保持 strict，避免重复布尔状态和 `any` |
| `app/(root)/interview/aliyun-test/page.tsx` | SDK 测试入口 | 所有 SDK 行为先在这里验证 |
| `app/(root)/interview/[interviewId]/page.tsx` | 正式入口与服务端归属检查 | 只推广测试页已验证的行为 |
| `app/api/ai-realtime/sessions/route.ts` | 创建短期 Token 和会话锁 | 继续独立认证、校验归属和开关 |
| `app/api/ai-realtime/sessions/[sessionId]/start/route.ts` | `callBegin` 后记录开始 | 不能由点击 Call 提前调用 |
| `app/api/ai-realtime/sessions/[sessionId]/end/route.ts` | 结束和释放锁 | P2-7 扩展稳定 outcome，不接收 transcript |
| `lib/ai-realtime/session-lifecycle*.ts` | 服务端会话状态策略 | 保持事务和幂等，补 failed 语义测试 |
| `tests/ai-realtime/` | 当前 P1 单元测试 | P2 继续使用内置 `node:test` |
| `node_modules/aliyun-auikit-aicall/types/index.d.ts` | 2.10.5 API 真相 | 修改事件或方法前重新核对 |

当前关键代码事实：`callBegin` 回调在服务端 start 成功后设置 active；监听器注册早于 `callWithConfig()`；字幕以 `role:sentenceId` 合并；`beforeunload` 和卸载另写了一套清理；完成标记使用固定 1200ms 延迟；服务端 end 默认把非 failed 会话写为 completed。后续 Agent 必须重新查看当前行号和 diff，不能依赖本文中的历史描述。

## 5. 必须保留的 P1 能力

- 正式面试绑定已保存且属于当前用户的 Firestore Interview；正式入口是 `/interview/[interviewId]`。
- `/interview` 是选择引导页，`/interview/aliyun-test` 是 SDK 验证入口。
- 创建会话重复验证登录和 Interview 所有权；同一用户仅一个活跃会话；保留 10 秒创建间隔。
- 测试阶段不增加每日次数和全局并发限制。
- App Key、Firebase Admin 凭证等只留在服务端；浏览器只接收本通所需的短期 RTC Token。
- 只有 SDK 接通后通知服务端开始；所有结束路径尽量通知服务端结束并释放锁。
- 保留 `AI_REALTIME_ENABLED`；Next.js 不代理 RTC 音频、不保持长期媒体连接。

## 6. 分步任务

### P2-1：字幕协议收口（第一个任务）

目标：把字幕合并和控制标记解析提取为无副作用纯函数，并接回现有组件。

实现要求：

- 使用 `role + sentenceId` 生成稳定 ID。
- 同一句流式字幕更新原记录；稳定句不能被后来的非稳定片段降级。
- 从所有可见文本中移除全部 `[INTERVIEW_COMPLETE]`，同时返回独立的完成信号。
- 标记必须只在 AI 的稳定字幕中生效，用户字幕中的相同文本不得结束面试。
- 最多保留 50 条，更新旧消息时也保持边界。
- 使用内置 `node:test` 增加确定性测试，不添加测试依赖。

验证：定向字幕测试、`npx tsc --noEmit`、相关文件 ESLint、开发服务器页面烟测。真实流式字幕仍需标记未验证。

### P2-2：字幕展示层拆分

目标：将字幕面板从 `AliyunInterviewClient` 提取成职责单一的受控展示组件，不改变样式。

实现要求：只接收消息、提示文案和滚动容器所需数据；保留双方角色、LIVE/STABLE、`aria-live`、滚动和自动到底部；不导入 SDK、Firebase、环境变量或服务端模块；避免让高频字幕导致整个控制台重复渲染。

验证：TypeScript、定向 ESLint、开发服务器检查空状态、长字幕、滚动、角色样式和窄屏布局。

### P2-3：互斥通话状态机

目标：用明确的 reducer 或等价单一状态机制约束 `idle → requesting_permission → issuing_token → connecting → active → ending → ended/error`。

实现要求：

- 为合法和非法转换补纯函数测试。
- 点击 Call 后立即锁定启动；connecting 不能重复 Call。
- `active` 只能由当前 SDK 实例的 `callBegin` 触发，不能因 `callWithConfig()` resolve 提前接通。
- 为每次尝试生成通话代次；旧实例、旧回调和旧定时器不能更新新尝试。
- error/ended 重试必须从全新 SDK、Token、监听器和空字幕开始。
- connecting 阶段应提供安全取消入口，避免无限等待只能刷新页面。

验证：状态机单测、TypeScript、定向 ESLint；浏览器检查双击 Call、连接中取消、错误后重试。真实 `callBegin` 未执行时不得宣称通过。

### P2-4：控制栏与操作并发

目标：提取受控控制栏，并让每个 SDK 操作都有清晰的可用、执行中和失败状态。

实现要求：

- 保留开始、挂断、用户麦克风静音、AI 音频静音和手动打断。
- 非 active 状态禁用静音和打断；ending 时禁用所有通话控制。
- mute、AI mute、interrupt 各自防止 Promise 完成前重复点击。
- SDK 返回失败或抛错时回滚乐观 UI，并展示安全中文提示。
- 所有按钮保留原生键盘操作、可访问名称、明确 disabled 和可见焦点。
- 加入 `prefers-reduced-motion`，不影响现有视觉方向。

验证：TypeScript、定向 ESLint、开发服务器键盘操作、重复点击、disabled、失败回滚和移动宽度检查。

### P2-5：安全错误分类与恢复

目标：建立稳定错误分类，禁止把原始服务端、SDK 或 DOMException 文案直接展示给用户。

至少覆盖：浏览器不支持麦克风、权限拒绝、无设备、Token 获取失败/即将过期/已过期、RTC 失败、智能体启动失败、Agent ID/Region 错误、同名登录、自动播放阻止、网络中断、服务端 start/end 保存失败。

实现要求：

- 纯函数把 DOMException 名称、SDK `AICallErrorCode`、连接状态和服务端稳定错误码映射为中文提示。
- 日志只记录错误类别、SDK 数字码和必要上下文，不记录 Token、凭证或原始响应。
- 自动播放失败必须提供可执行恢复动作，而不是只显示警告。
- `Disconnected`、`Reconnecting`、`Failed` 必须有确定处理策略；短暂重连不能立刻误判永久失败。
- 清理错误不得覆盖最初通话错误；结束状态保存失败另行提示。

验证：错误映射单测、TypeScript、定向 ESLint、浏览器权限拒绝和模拟失败。真实网络/自动播放行为未执行时标记未验证。

### P2-6：统一、幂等的资源清理

目标：让所有结束路径调用同一个可重复执行的清理流程。

入口必须覆盖：End、`callEnd`、SDK error、Token expired、初始化/动态导入失败、连接取消、组件卸载、刷新/关闭标签、完成标记。

清理顺序与要求：

1. 原子取得唯一 cleanup Promise，后续调用复用它。
2. 标记 ending 并阻止新操作；中止尚未完成的 fetch/启动流程。
3. 主动结束时调用类型声明确认的 `handup()`；SDK 已结束路径调用 `destroy()`；失败时安全兜底。
4. 移除当前实例全部监听器，停止并清空临时麦克风轨道，取消完成定时器。
5. 清空 engine/session 引用，重置静音、agent 状态和动画。
6. 以 `keepalive` 等当前架构允许的短请求通知服务端结束；不得引入媒体代理或长期连接。
7. 组件卸载后不得更新 React state；卸载期间未完成的权限或 Token 请求不得继续创建孤儿会话。

验证：对可抽取的 cleanup coordinator 做并发单测；浏览器检查多次 End、初始化失败、路由切换和刷新。关闭标签后的 Firebase/阿里云状态必须通过真实环境确认，否则标记未验证。

### P2-7：服务端结束结果准确化

目标：用最小接口扩展区分正常完成、用户取消和技术失败，同时保持认证、归属校验与幂等释放锁。

实现要求：请求体只接受白名单 outcome 和稳定错误码；服务端独立认证并验证 session 所有权；错误会话写为 `failed`，正常结束写为 `completed`；重复 end 不改变首次有效结束时间或把 failed 覆盖成 completed；不接收 transcript、原始 SDK 文案或 Token。

验证：生命周期纯策略测试覆盖重复 end、failed 保留、他人会话和非法请求；运行 TypeScript、API 定向 ESLint和 `npm run test:ai-realtime`。真实 Firestore 事务未执行时标记未验证。

### P2-8：SDK 网络、自然打断与智能断句

目标：只在测试入口显式配置并验证 2.10.5 提供的实时能力。

实现要求：

- 使用 `agentConfig.enableIntelligentSegment = true`，不得猜测其他字段。
- 依据真实类型设置 `agentConfig.interruptConfig.enableVoiceInterrupt = true` 或使用已验证的等价 API。
- 监听 `voiceInterruptChanged` 和带 reason 的 `speakingInterrupted`，区分自然语音打断与手动 API 打断。
- 完整读取 `connectionStatusChange(status, reason)`，映射连接、重连、断开和失败。
- 不升级 SDK，不修改阿里云控制台或其他外部服务。

验证：编译和定向 ESLint后，在 `/interview/aliyun-test` 实测手动打断、自然打断、语义断句和弱网恢复。未获得真实结果前不得推广到正式页。

### P2-9：`[INTERVIEW_COMPLETE]` 结束协议

目标：AI 最后一条稳定字幕触发一次浏览器端结束，并等待最后一句真实播报完成。

实现要求：只有 assistant + stable 可触发；控制标记永不显示；完成信号用 ref/状态保证只处理一次；记录标记出现后是否观察到 speaking，并等待后续非 speaking/结束事件；设置有上限的兜底计时，避免 SDK 缺失状态时永久占用；所有定时器归统一清理；只结束浏览器通话，不写 transcript、不评分、不进入 P3。

验证：纯协议测试覆盖重复标记、标记前后状态顺序、无 speaking、超时和用户提前 End；测试页真实验证最后一句不会被截断。

### P2-10：Feature Flag 与正式展示收敛

目标：禁用时页面预先显示正确状态，不先请求麦克风或创建会话；正式页不暴露测试诊断。

实现要求：Server Component 只向客户端传递安全布尔值，不传任何凭证；disabled 时 Call 明确禁用并解释原因；API 继续独立检查开关；诊断面板只在 test variant 渲染；正式页保留当前视觉、状态、字幕和用户级错误；静态外壳尽量留在 Server Component，交互边界保持最窄。

验证：开关 false/true 两种页面状态、无会话请求、TypeScript、定向 ESLint、开发服务器控制台与响应式页面检查。

### P2-11：测试页验收、推广与最终回归

目标：汇总前述改动，先证明测试页，再将已验证行为推广到正式面试页。

执行顺序：

1. 在 `/interview/aliyun-test?interviewId=...` 运行 Chrome/Edge 真实矩阵。
2. 记录 SDK 事件参数、浏览器版本、每个场景结果和未验证项；不得记录 Token 或凭证。
3. 只有测试页通过后，删除临时行为隔离，将相同编排用于正式入口。
4. 正式页使用属于当前登录用户的已保存 Interview 做烟测。
5. 执行全套静态检查、测试、生产构建和客户端敏感信息扫描。

最终命令至少包括：

```powershell
npm.cmd run test:ai-realtime
npx.cmd tsc --noEmit
npm.cmd run lint
npm.cmd run build
npm.cmd ls aliyun-auikit-aicall --depth=0
```

敏感信息检查只能搜索变量名、已知假测试值或构建文件命中路径，不得把 `.env.local` 的真实值打印到终端。

## 7. 每个任务的浏览器检查清单

涉及 UI、SDK、状态或清理的任务必须启动 `npm run dev`，检查：

- 浏览器控制台和开发服务器终端无新增错误。
- 页面视觉与现有产品一致，桌面和窄屏均可用。
- Call 在请求权限、Token 和 connecting 阶段不能重复点击。
- active 前不得显示 RTC 已连接；AI speaking 前不得播放讲话动画。
- mute、AI mute、interrupt、End 的正常、重复点击和失败状态正确。
- 权限拒绝、无设备、Token/初始化/网络失败后提示明确且可安全重试。
- End、SDK callEnd、error、刷新、关闭和组件卸载进入同一清理结果。
- 新尝试没有旧字幕、旧监听器、旧 Token、旧定时器或旧 SDK 实例。
- disabled feature 不申请麦克风、不创建服务端会话。

无法自动检查的真实设备或云端结果列为“未验证”，交给用户按相同清单手动确认。

## 8. 单任务完成后的强制交接格式

完成一个任务后立即停止，并向用户提供：

```text
任务：P2-x · 名称

修改了什么：
- 按文件说明行为变化。

为什么需要：
- 对应哪个已审计缺口或验收项。

执行的验证：
- 精确命令或浏览器路径。

验证结果：
- 逐项写通过/失败，不用“应该可以”。

尚未验证：
- 真实阿里云、麦克风、Firebase、浏览器或边界条件。

建议暂存：
- 只列本任务文件；提醒先运行 git diff --check 和查看 diff。

推荐提交名：
- 一句通俗中文，例如“修正实时字幕的稳定更新和完成标记”。

下一任务：
- 只说明建议，不开始执行；等待用户回复“继续”。
```

不得代替用户执行 `git add`、commit、创建分支或部署。

## 9. 最终验收矩阵

每项必须记录“通过 / 失败 / 未验证”和证据：

- UI 的 active 只由当前 SDK 实例的 `callBegin` 驱动，不出现假接通。
- requesting、issuing、connecting 期间重复 Call 不产生第二个请求、会话或实例。
- End 多次点击、`callEnd` 与 error 竞态仍只运行一次清理。
- AI 动画与 speaking 完全一致；异常状态和结束后回到 idle。
- 用户和 AI 字幕角色明确；同一句流式更新不重复；稳定结果不倒退。
- 字幕自动滚动且数量有界；浏览器字幕不写入权威评分数据。
- 麦克风拒绝、无设备和不支持状态有安全中文提示并能重试。
- Token、RTC、Agent、Region、同名登录、自动播放和网络错误处理明确。
- 初始化失败和所有结束路径释放 SDK、音轨、监听器、定时器和服务端锁。
- `[INTERVIEW_COMPLETE]` 不显示、只触发一次，最后一句播完再结束。
- disabled feature 页面正确且不能申请麦克风或创建会话。
- 正式页只保留用户级信息，测试页保留诊断能力。
- `npm run test:ai-realtime`、TypeScript、全量 ESLint 和生产构建通过。
- 客户端构建不存在 App Key、Firebase 私钥、Client Email 或其他服务端凭证。
- SDK 仍为精确版本 2.10.5，未新增依赖。

## 10. 重点风险与停止条件

- 仓库没有 P0 的 10 通真实稳定性记录。若 2.10.5 在 Next.js 16/React 19 中出现构建或真实通话阻断，停止正式页推广并向用户报告，不自行升级 SDK。
- 若 `handup()`、自然打断、自动播放恢复或完成播报时序与类型注释不一致，以测试页真实事件记录为准；先报告差异，再决定实现。
- 若服务端结束通知持续失败，不得声称活跃锁已释放；报告租约兜底时间和真实 Firestore 未验证状态。
- 若一个职责清晰的步骤无法在 100 行单补丁内完成，先寻找合理子步骤；仍无法拆分时，在写代码前说明必要性、风险和回滚方式并请求批准。
- 若发现用户未提交改动与目标文件重叠，停止编辑并说明冲突，不覆盖或回退。
- 若需求会进入 P3、改变 Firebase 数据权威来源、升级依赖或修改外部服务，立即停止并请求新授权。

## 11. 后续 Agent 的起始指令

默认从 **P2-1：字幕协议收口** 开始。先复核本文件是否仍与当前代码一致，再检查 git 状态和相关 diff。若 P2-1 已被其他提交完成，则用代码和测试证据逐条验收，选择最早一个尚未完成的任务；不能只根据提交名或本文文字跳过任务。

每轮只处理一个任务。完成并交接后立即暂停，等待用户回复“继续”。
