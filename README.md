This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## 面试反馈与回调配置

反馈使用阿里云服务端回调保存的对话文本；页面能显示字幕不代表服务端已收到文本。

1. 在本地 `.env.local` 或部署环境中设置 `ALIYUN_AI_CALLBACK_TOKEN`（32～512 个字符的随机密钥）。不要提交或输出真实密钥。
2. 在阿里云 IMS 控制台打开对应智能体的「管理 → 回调配置」，开启「智能体状态回调」和「聊天记录实时回调」。
3. 将回调地址设置为公网可访问的 HTTPS 地址，路径为 `/api/ai-realtime/callback`；控制台鉴权 Token 必须与服务端配置一致。阿里云无法直接访问开发电脑的 `localhost`。
4. 反馈模型需要 `AI_FEEDBACK_ENABLED=true`，以及 `ALIYUN_BAILIAN_API_KEY`、`ALIYUN_BAILIAN_BASE_URL`、`ALIYUN_BAILIAN_MODEL`。更改环境配置后重新启动开发服务器或更新部署。

正常结束后，只要服务端保存了候选人的有效回答，短回答也允许生成反馈。没有回答记录时会先等待回调；已有「回答不足」记录可以在反馈页点击「重试生成反馈」。没有收到的文本无法通过降低字数门槛补回。

排查时检查回调请求状态：404 表示地址或运行中的路由需要核对，503 表示回调配置未启用或无效，401 表示鉴权失败，400 表示请求格式不匹配。GET/HEAD 返回 200 只代表探测地址可达，不代表 POST 回调已启用或文本已保存。

通过鉴权和格式校验的回调会先返回 200，随后使用 Next.js `after()` 保存，避免数据库延迟堵住阿里云的后续回调。Vercel 日志中的 `callback accepted` 表示已接收并安排保存，`callback persisted` 才表示保存成功；`callback persistence after response failed` 表示保存失败。可用 `sessionId` 关联这些日志，并查看保存耗时。日志不记录 Token 或原始对话正文。

`after()` 受路由执行时限约束（当前为 60 秒），并不是持久化消息队列。已返回 200 后的保存失败无法通过 HTTP 响应要求阿里云重发；如持续出现失败或只有接收日志，应继续排查 Firestore 连接、权限和平台超时，不能将 200 当作文本已入库。

阿里云配置说明：[智能体回调](https://help.aliyun.com/zh/ims/user-guide/agent-callback)。

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## 阿里云实时互动

正式面试从 `/interview/{interviewId}` 进入，记录必须已存在于 Firestore 并属于当前用户。AICallKit 测试页为 `/interview/aliyun-test?interviewId={interviewId}`。要启用真实语音通话，请在 `.env.local` 配置服务端变量；`ALIYUN_RTC_APP_KEY` 只放在服务端，不能使用 `NEXT_PUBLIC_` 前缀：

```text
AI_REALTIME_ENABLED=true
ALIYUN_AI_REALTIME_REGION=cn-shanghai
ALIYUN_AI_AGENT_ID=your-agent-id
ALIYUN_RTC_APP_ID=your-artc-app-id
ALIYUN_RTC_APP_KEY=your-artc-app-key
ALIYUN_RTC_TOKEN_TTL_SECONDS=600
AI_REALTIME_MAX_SESSION_MINUTES=30
```

未配置或保持 `AI_REALTIME_ENABLED=false` 时，页面会保留可验证的禁用状态，不会创建 RTC 会话。

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
