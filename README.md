# AI Mock Interview · AI 语音面试练习

面向个人练习的桌面浏览器应用：注册登录后，填写目标岗位、级别、面试类型和技术栈，由 AI 动态组织问题，通过实时语音完成练习，并查看反馈与改进建议。

当前实现使用 **Next.js + Firebase + 阿里云 IMS/ARTC + 百炼反馈模型**。通话音频由浏览器通过 AICallKit 直连阿里云；Next.js 负责身份验证、短期通话凭证、会话记录、回调文本和反馈生成。本应用不保存原始录音，反馈仅用于个人练习，不作为正式招聘、考试或认证依据。

## 目录

- [已实现功能与技术栈](#已实现功能与技术栈)
- [本地安装与启动](#本地安装与启动)
- [阿里云实时互动与反馈环境变量](#阿里云实时互动与反馈环境变量)
- [面试反馈与回调配置](#面试反馈与回调配置)
- [使用流程与页面入口](#使用流程与页面入口)
- [架构与数据存储](#架构与数据存储)
- [开发验证](#开发验证)
- [部署](#部署)
- [常见问题](#常见问题)
- [项目文档与维护约定](#项目文档与维护约定)

## 已实现功能与技术栈

- 邮箱密码注册登录，Firebase Session Cookie 服务端认证。
- 创建个人面试配置，首页展示近期面试及反馈摘要，同一配置可重复练习。
- 实时语音通话、麦克风静音、打断 AI、挂断与实时字幕。
- 会话归属校验、单用户活跃会话锁、创建冷却时间、开始与结束状态保存。
- 阿里云回调鉴权、事件去重、对话文本保存，以及个人练习浏览器最终字幕兜底。
- 每次会话生成一份反馈：五个维度评分、总分、优点、改进建议和综合评价，并标注文本来源。

| 层次 | 当前技术 |
| --- | --- |
| 框架 | Next.js 16.3.1 App Router、React / React DOM 19.2.8 |
| 语言与样式 | TypeScript 5（strict）、Tailwind CSS 4、CSS Modules |
| UI | shadcn 风格组件、Base UI / Radix、Lucide |
| 认证与数据库 | Firebase Web SDK、Firebase Admin、Cloud Firestore |
| 实时语音 | `aliyun-auikit-aicall`，固定为 2.10.5 |
| 反馈模型 | 百炼兼容接口，服务端请求结构化 JSON 输出 |
| 包管理与测试 | npm / `package-lock.json`、Node.js 内置测试运行器、ESLint |

具体依赖声明和安装版本以 [package.json](package.json) 与 [package-lock.json](package-lock.json) 为准。

## 本地安装与启动

### 1. 准备环境并安装依赖

本文命令以 Node.js **22.23.2**、npm **10.9.8** 为基准；测试直接执行 TypeScript，请使用支持该能力的 Node.js 22.18+。不要仅按 Next.js 自身的最低 Node.js 要求来选择测试环境。原生 TypeScript 支持见 [Node.js 文档](https://nodejs.org/download/release/v22.21.0/docs/api/typescript.html)。

```bash
git clone https://github.com/DA-cpu1/ai_mock_interviews.git
cd ai_mock_interviews
npm ci
```

使用桌面浏览器和可用的麦克风。开发机与部署服务器需要能访问 Firebase 和阿里云服务；真实通话还需要浏览器可连接 ARTC。

### 2. 配置 Firebase

1. 创建或选择自己的 Firebase 项目，添加 Web 应用。
2. 在 Authentication 的登录方式中启用 Email/Password，并检查授权域名包含实际使用的开发和部署域名。
3. 创建默认 Cloud Firestore 数据库，准备允许服务端执行所需认证与数据库操作的服务账号。
4. 将 Web 应用配置填写到 [firebase/client.ts](firebase/client.ts) 的 `firebaseConfig`。**当前前端配置直接写在这个文件中，不会从环境变量自动读取。** 如果接入自己的项目，必须同步替换，不能只改服务端项目 ID。
5. 从服务账号凭证中取得 `project_id`、`client_email`、`private_key`，分别配置下列三个 `FIREBASE_*` 变量。客户端和服务端必须指向同一个项目。

官方步骤：[邮箱密码认证](https://firebase.google.com/docs/auth/web/password-auth)、[Firebase Admin 初始化](https://firebase.google.com/docs/admin/setup)。

在仓库根目录手动创建 `.env.local`（仓库没有 `.env.example`）。先填入 Firebase 凭证并关闭语音与反馈，即可进行基础页面和登录调试：

```dotenv
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_CLIENT_EMAIL=your-service-account-email
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nREPLACE_WITH_YOUR_PRIVATE_KEY\n-----END PRIVATE KEY-----\n"
AI_REALTIME_ENABLED=false
AI_FEEDBACK_ENABLED=false
```

以上均为占位内容，必须替换为自己的配置。私钥保留 PEM 头尾与换行；[firebase/admin.ts](firebase/admin.ts) 支持把字面量 `\n` 还原为换行。即使语音与反馈关闭，应用的登录和数据页面仍依赖 Firebase，当前没有离线模拟模式。

`.env*` 已在 `.gitignore` 中排除。服务账号私钥、RTC App Key、回调 Token 和模型 API Key 只能放在服务端环境中，不要提交或加上 `NEXT_PUBLIC_` 前缀。

### 3. 启动应用

```bash
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000)，注册账号并登录。实际端口以终端输出为准。环境变量修改后重启开发服务器；语音开关关闭时，通话页显示禁用状态，不会创建 RTC 会话。

## 阿里云实时互动与反馈环境变量

### 实时语音

在阿里云 IMS 中准备可用的 AI 实时互动智能体及其关联的 ARTC 应用，配置智能体使用的语音识别、对话模型和语音合成能力。将智能体 ID、RTC App ID、App Key 和地域填写到服务端环境中；RTC App Key 不等于阿里云账号的 AccessKey Secret。

将下列配置合并到 `.env.local`，替换前面同名的关闭开关，不要保留重复变量：

```dotenv
AI_REALTIME_ENABLED=true
ALIYUN_AI_REALTIME_REGION=cn-shanghai
ALIYUN_AI_AGENT_ID=your-agent-id
ALIYUN_RTC_APP_ID=your-artc-app-id
ALIYUN_RTC_APP_KEY=your-artc-app-key
ALIYUN_RTC_TOKEN_TTL_SECONDS=600
AI_REALTIME_MAX_SESSION_MINUTES=30
```

| 变量 | 要求与默认值 |
| --- | --- |
| `AI_REALTIME_ENABLED` | 启用时填写 `true`；关闭或未设置时不创建新通话 |
| `ALIYUN_AI_REALTIME_REGION` | 默认 `cn-shanghai`，应与智能体配置一致 |
| `ALIYUN_AI_AGENT_ID` | 开启语音时必填，IMS 智能体 ID |
| `ALIYUN_RTC_APP_ID` | 开启语音时必填，与智能体关联的 ARTC 应用 ID |
| `ALIYUN_RTC_APP_KEY` | 开启语音时必填，仅用于服务端生成短期凭证 |
| `ALIYUN_RTC_TOKEN_TTL_SECONDS` | 默认 600 秒，整数范围 60～3600 |
| `AI_REALTIME_MAX_SESSION_MINUTES` | 默认 30 分钟，整数范围 1～120 |

时长配置用于活跃会话租约，并转换为秒传给 SDK 的 `agentMaxIdleTime`；不要将它当作服务端精确定时强制挂断的保证。当前租约另有 2 分钟宽限期。Token 有效期是入会凭证有效期，与通话持续时间不是同一个概念。

同一用户只允许一个有效活跃会话，两次创建至少间隔 10 秒。首次接入先在 `/interview/aliyun-test?interviewId={interviewId}` 验证，再测试正常面试页；面试记录可通过 `/interview` 创建。

### 反馈模型与回调 Token

反馈模型是通话结束后的独立服务端调用，与 IMS 智能体的通话模型配置分开。启用反馈时增加：

```dotenv
AI_FEEDBACK_ENABLED=true
ALIYUN_BAILIAN_API_KEY=your-bailian-api-key
ALIYUN_BAILIAN_BASE_URL=https://your-bailian-endpoint/compatible-mode/v1
ALIYUN_BAILIAN_MODEL=your-supported-model-id
AI_FEEDBACK_TIMEOUT_MS=15000
ALIYUN_AI_CALLBACK_TOKEN=REPLACE_WITH_A_RANDOM_TOKEN_OF_32_TO_512_CHARACTERS
```

上面的地址和模型 ID 是占位符，请使用自己百炼服务地域对应的兼容接口地址和已开通模型。代码会在 Base URL 后追加 `/chat/completions`，不要在变量中重复填写该路径。模型需支持当前请求中的 `response_format: json_schema` 严格结构化输出。

模型支持范围及地域接口示例见[百炼结构化输出文档](https://docs.modelstudio.console.alibabacloud.com/zh/model-studio/qwen-structured-output)。官方示例中的变量名与本项目可能不同，本项目只读取上面列出的 `ALIYUN_BAILIAN_*` 变量。

| 变量 | 要求与默认值 |
| --- | --- |
| `AI_FEEDBACK_ENABLED` | 启用反馈生成时填写 `true`，默认关闭 |
| `ALIYUN_BAILIAN_API_KEY` | 开启反馈时必填，服务端模型 API Key |
| `ALIYUN_BAILIAN_BASE_URL` | 开启反馈时必填，无默认值；不含用户名、密码、查询参数或片段 |
| `ALIYUN_BAILIAN_MODEL` | 开启反馈时必填，无默认模型 |
| `AI_FEEDBACK_TIMEOUT_MS` | 默认 15000 毫秒，整数范围 1000～60000 |
| `ALIYUN_AI_CALLBACK_TOKEN` | 配置回调时必填，32～512 个字符；未设置则 POST 回调关闭 |

回调通过独立 Token 启用，不由语音开关控制。回滚时可分别将 `AI_REALTIME_ENABLED`、`AI_FEEDBACK_ENABLED` 设为 `false`，停止创建新通话和生成新反馈；这不会自动删除既有记录或保证中止已建立的通话。

## 面试反馈与回调配置

反馈优先使用阿里云服务端回调文本。个人练习在回调回答缺失时，可使用浏览器最终字幕兜底；结果会标注来源和可能的缺漏。

1. 在本地 `.env.local` 或部署环境中设置 `ALIYUN_AI_CALLBACK_TOKEN`（32～512 个字符的随机密钥）。不要提交或输出真实密钥。
2. 在阿里云 IMS 控制台打开对应智能体的「管理 → 回调配置」，开启「智能体状态回调」和「聊天记录实时回调」。
3. 将回调地址设置为公网可访问的 HTTPS 地址，路径为 `/api/ai-realtime/callback`；控制台鉴权 Token 必须与服务端配置一致。阿里云无法直接访问开发电脑的 `localhost`。
4. 反馈模型需要 `AI_FEEDBACK_ENABLED=true`，以及 `ALIYUN_BAILIAN_API_KEY`、`ALIYUN_BAILIAN_BASE_URL`、`ALIYUN_BAILIAN_MODEL`。更改环境配置后重新启动开发服务器或更新部署。

正常结束后，只要服务端保存了候选人的有效回答，短回答也允许生成反馈。没有回答记录时会先等待回调；已有「回答不足」记录可以在反馈页点击「重试生成反馈」。没有收到的文本无法通过降低字数门槛补回。

新面试会在当前标签页暂存最终字幕（最多 200 句、60,000 字符），正常挂断后通过已登录且核验会话归属的 `/api/interviews/[sessionId]/browser-transcript` 上传到独立快照。超出容量会保留最近部分并标注截断。上传失败时保留当前标签页，反馈页重试会再次上传；成功后清除本地副本。关闭标签页前未保存成功的文本可能丢失，旧版本未收集的字幕也无法自动补回。

浏览器字幕可被客户端修改，仅作为个人练习参考。回调已有回答时继续等待服务端文本就绪；异常结束的通话不通过浏览器路径评分。每场反馈生成后固定来源，迟到回调不会自动重算或覆盖已有反馈。

排查时检查回调请求状态：404 表示地址或运行中的路由需要核对，503 表示回调配置未启用或无效，401 表示鉴权失败，400 表示请求格式不匹配，413 表示请求体过大。GET/HEAD 返回 200 只代表探测地址可达，不代表 POST 回调已启用或文本已保存。

通过鉴权和格式校验的回调会先返回 200，随后使用 Next.js `after()` 保存，避免数据库延迟堵住阿里云的后续回调。Vercel 日志中的 `callback accepted` 表示已接收并安排保存，`callback persisted` 才表示保存成功；`callback persistence after response failed` 表示保存失败。可用 `sessionId` 关联这些日志，并查看保存耗时。日志不记录 Token 或原始对话正文。

`after()` 受路由执行时限约束（当前为 60 秒），并不是持久化消息队列。已返回 200 后的保存失败无法通过 HTTP 响应要求阿里云重发；如持续出现失败或只有接收日志，应继续排查 Firestore 连接、权限和平台超时，不能将 200 当作文本已入库。

阿里云配置说明：[智能体回调](https://help.aliyun.com/zh/ims/user-guide/agent-callback)。

## 使用流程与页面入口

1. 打开 `/sign-up` 注册邮箱密码账号，再从 `/sign-in` 登录。
2. 在首页选择面试入口，进入 `/interview`，填写岗位、级别、面试类型和技术栈。提交成功后服务端创建归属于当前账号的 Firestore 记录，并自动进入通话页，无需手工写入面试数据。
3. 点击开始语音面试并授予麦克风权限。服务端校验登录、面试归属和活跃会话后，浏览器使用短期凭证连接 AICallKit。
4. 回答 AI 问题，按需静音或打断 AI；完成后使用页面上的挂断操作正常结束。
5. 进入反馈页等待文本保存和模型生成。上传或生成失败时按页面提示重试；字幕未成功保存前保留当前标签页。
6. 在反馈页查看各维度评分、建议、来源及截断提示；可重新练习或返回首页查看近期记录。

| URL | 用途 |
| --- | --- |
| `/sign-up` | 邮箱密码注册 |
| `/sign-in` | 登录 |
| `/` | 登录后的首页、面试模板和近期记录 |
| `/interview` | 创建面试配置，支持 `?template={templateId}` 预选类型 |
| `/interview/{interviewId}` | 指定面试的语音练习页 |
| `/interview/aliyun-test?interviewId={interviewId}` | 独立 AICallKit 验证页，需要当前账号拥有的面试 ID |
| `/interview/{interviewId}/feedback?sessionId={sessionId}` | 指定一次通话的反馈页，需要匹配的面试、会话与账号 |

`interviewId` 表示可复用的面试配置，`sessionId` 表示一次通话，二者不能互换。使用页面生成的链接即可，无需自己构造会话 ID。

## 架构与数据存储

```mermaid
flowchart LR
    U[浏览器] -->|邮箱密码登录| A[Firebase Authentication]
    U -->|Session Cookie / 创建面试 / 申请凭证| N[Next.js 服务端]
    N -->|认证与持久化| F[Firebase Admin / Firestore]
    U <-->|AICallKit 实时音频与字幕| R[阿里云 IMS / ARTC]
    R -->|带专用 Token 的回调| N
    U -->|正常结束后的最终字幕快照| N
    N -->|选定文本生成反馈| B[百炼模型接口]
```

音频不经过 Next.js 代理，应用也不维护长连接媒体 WebSocket。回调文本是优先来源；浏览器字幕存于独立快照，不冒充服务端回调。

### 服务端接口

| 方法与路径 | 职责 |
| --- | --- |
| `POST /api/ai-realtime/sessions` | JSON `{ "interviewId": "..." }`，校验归属并返回短期连接数据 |
| `POST /api/ai-realtime/sessions/{sessionId}/start` | 通话建立后的状态确认与租约更新 |
| `POST /api/ai-realtime/sessions/{sessionId}/end` | 结束状态保存与活跃锁释放 |
| `POST /api/ai-realtime/callback` | 阿里云专用 Token 鉴权，校验并安排回调保存 |
| `GET /api/ai-realtime/callback`、`HEAD /api/ai-realtime/callback` | 可达性探测，不验证配置或写入数据库 |
| `POST /api/interviews/{sessionId}/browser-transcript` | 上传归属于该用户会话的最终字幕快照 |
| `POST /api/interviews/{sessionId}/finalize` | 准备文本、生成或返回该会话反馈 |

用户接口独立验证登录与会话归属；回调使用专用 Token，不使用用户 Cookie。敏感响应禁止缓存。创建面试与登录相关操作通过 `lib/action/` 中的 Server Actions 完成。

### Firestore 数据

| 集合 / 路径 | 内容 |
| --- | --- |
| `users/{uid}` | 用户资料，与 Firebase Authentication 用户关联 |
| `interviews/{interviewId}` | 用户拥有的面试配置 |
| `interviewSessions/{sessionId}` | 单次通话状态、租约、文本与反馈处理状态 |
| `interviewSessions/{sessionId}/messages` | 去重后的服务端回调文本 |
| `interviewSessions/{sessionId}/browserTranscript/final` | 浏览器最终字幕独立快照 |
| `aiRealtimeUserStates/{uid}` | 用户活跃会话锁与创建冷却记录 |
| `feedbacks/{sessionId}` | 每次会话的反馈、文本来源、截断标记与模型信息 |

集合由应用写入时建立。仓库当前没有 Firebase Emulator、Firestore Rules 或索引部署配置；云端数据库访问权限和需要的索引需在自己的项目中管理。不要将客户端数据库规则开放给所有人来解决服务端凭证错误。

### 代码目录

| 路径 | 职责 |
| --- | --- |
| `app/(auth)/`、`app/(root)/` | 认证页与产品页；路由组名称不出现在 URL 中 |
| `app/(root)/page.tsx` | 实际首页入口 |
| `app/api/` | 会话、回调、字幕和反馈 Route Handlers |
| `components/interview/`、`components/ui/` | 面试业务组件与共享 UI 基础组件 |
| `firebase/` | 浏览器 Firebase 与服务端 Admin 初始化 |
| `lib/action/`、`lib/interviews/` | Server Actions、面试输入校验与读取 |
| `lib/aliyun/`、`lib/ai-realtime/` | 阿里云配置与签名、会话生命周期和文本处理 |
| `lib/feedback/` | 文本选择、模型调用、反馈校验及持久化 |
| `types/`、`constants/`、`public/` | 类型、静态映射 / 模板和公开资源 |
| `tests/ai-realtime/`、`tests/interviews/`、`tests/feedback/` | 各领域自动化测试 |

## 开发验证

以下命令在仓库根目录运行：

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动开发服务器 |
| `npm run test:artc-token` | RTC Token 签名与边界测试 |
| `npm run test:ai-realtime` | 实时会话、回调、字幕相关测试 |
| `npm run lint` | ESLint 检查，独立于构建执行 |
| `npx tsc --noEmit` | TypeScript 类型检查 |
| `npm run build` | 生产构建 |
| `npm run start` | 启动已构建的生产服务，需先完成 build |

`test:ai-realtime` 脚本不包含 `tests/interviews/` 和 `tests/feedback/`。运行当前三个领域的全部测试：

```bash
node --conditions=react-server --test "tests/ai-realtime/*.test.ts" "tests/interviews/*.test.ts" "tests/feedback/*.test.ts"
```

测试使用 Node.js 内置运行器；`--conditions=react-server` 用于加载测试涉及的服务端模块。自动化测试不等于真实通话验证，也不代表已验证云端数据库、生产部署或模型质量。

首次接入或修改语音流程后，在开发服务器中按顺序检查：

1. 关闭语音开关时显示禁用状态；未登录和错误格式的接口请求被拒绝。
2. 登录创建面试，用同一面试 ID 打开测试页；拒绝麦克风权限后页面能够提示并重试。
3. 授予权限，验证开始、接通、字幕、静音、打断和挂断，同时检查浏览器与终端错误。
4. 验证离开页面时资源释放、失败重试，以及重复点击或第二个标签页不能绕过活跃会话限制。
5. 在正常面试页重复关键流程，确认回调保存、反馈生成、来源标注和刷新后读取已有反馈。

实际使用云端服务的这些检查需要自己的有效配置。不要在测试夹具、截图或日志输出中包含真实密钥、Cookie 或通话凭证。

## 部署

本项目依赖 Server Actions、Node.js Route Handlers、Session Cookie 和 Firebase Admin，需部署为支持这些能力的 Next.js 服务，不能仅导出静态文件到 GitHub Pages。

### Vercel

1. 导入仓库，选择 Next.js 框架，安装命令使用 `npm ci`，构建命令使用 `npm run build`。
2. 为实际使用的 Preview / Production 环境分别设置本文列出的 Firebase、语音、反馈和回调变量；本地 `.env.local` 不会随 Git 推送。
3. 确认 `firebase/client.ts` 指向目标 Firebase 项目，配置该环境的授权域名，再部署。
4. 使用部署后的公网 HTTPS 域名配置 IMS 回调地址；确认该路径不会被部署访问保护或登录跳转拦截。
5. 回调与 finalize 路由当前声明 `maxDuration = 60`，核对运行平台的实际执行时限和 `after()` 支持情况。
6. 用正式域名执行登录、创建、真实通话、挂断、回调入库和反馈回归；修改环境变量后重新部署。

### 自托管 Node.js

配置好环境变量后运行：

```bash
npm ci
npm run build
npm run start
```

生产环境应通过 HTTPS 对外服务：生产 Session Cookie 带有 `Secure` 属性，麦克风访问也需要安全上下文；本地开发可使用浏览器认可的 `localhost`。确保部署进程能访问 Firebase 和百炼，公网回调可到达应用，并让进程在响应发送后继续完成 `after()` 工作。

不要把回调返回 200 当成部署验收完成。应进一步确认对应 `sessionId` 的 `callback persisted` 日志和最终反馈；响应后保存的失败与时限说明见上文回调章节。

## 常见问题

| 现象 | 优先检查 |
| --- | --- |
| Firebase 私钥解析失败或服务端初始化失败 | 三个 `FIREBASE_*` 是否齐全，私钥头尾和换行是否完整；修改后重启 |
| 注册 / 登录失败或一直返回登录页 | 是否启用 Email/Password，密码是否满足 Firebase 策略，前后端项目是否一致，`users/{uid}` 是否存在，域名和网络是否可用 |
| 创建面试失败、首页记录为空 | 检查服务端 Firestore 访问权限、网络与脱敏日志；如日志提示缺少索引，在对应 Firebase 项目中配置 |
| 通话页禁用 / `REALTIME_DISABLED` | 检查运行环境中的 `AI_REALTIME_ENABLED`，不要只修改本地文件后期待线上变化 |
| `SERVER_CONFIG_INVALID` | 检查智能体和 RTC 变量，以及 TTL / 会话时长范围 |
| 麦克风无法启用 | 检查站点权限、操作系统权限、设备占用与 HTTPS / localhost 环境 |
| RTC 无法接通 | 检查地域、智能体与 ARTC 应用是否匹配，凭证是否过期，浏览器网络；先用独立测试页定位 |
| `ACTIVE_SESSION_EXISTS` / HTTP 409 | 先结束同账号已有通话；若异常退出留下租约，待租约过期后重试 |
| `RATE_LIMITED` / HTTP 429 | 两次创建至少间隔 10 秒，避免连续点击 |
| 回调没有文本 | 确认聊天记录回调已开启、公网 URL 正确、Token 匹配，检查 POST 状态和 `callback persisted` 日志 |
| `FEEDBACK_DISABLED` 或模型请求失败 | 检查反馈开关、Key、Base URL、模型权限与结构化输出支持；确认没有重复追加 `/chat/completions` |
| 反馈等待中 / 回答不足 | 检查是否有用户回答、回调是否保存、通话是否正常结束；保持原标签页并按页面提示重试字幕上传 / 反馈生成 |
| 反馈缺少部分内容 | 查看来源与截断提示；未被收集或未成功保存的历史文本无法自动补回 |
| 测试不能执行 `.ts` 文件 | 检查 Node.js 版本，使用本文基准环境并保留测试命令中的服务端条件参数 |

## 项目文档与维护约定

- [AGENTS.md](AGENTS.md)：仓库维护规则、代码边界和验证要求。
- [AI-Mock-Interview-中文学习讲义.md](AI-Mock-Interview-中文学习讲义.md)：学习材料，可能包含历史方案；当前实现以代码为准。
- [阿里云AI实时互动接入实施计划.md](阿里云AI实时互动接入实施计划.md)：总体路线图，计划项不代表全部完成。
- [P2-AICallKit正式集成执行计划.md](P2-AICallKit正式集成执行计划.md)：AICallKit 集成阶段计划。
- [P3-P4-权威文本与面试反馈MVP执行计划.md](P3-P4-权威文本与面试反馈MVP执行计划.md)：回调文本与反馈阶段计划；当前个人练习字幕兜底以代码和本文为准。

维护时使用 npm 并保持锁文件一致；AICallKit 固定版本不能静默升级。修改 Next.js 代码前阅读安装版本的 `node_modules/next/dist/docs/`。不要依据旧讲义重新接入 Vapi / Gemini，或将路线图中尚未完成的阶段当作现有能力。
