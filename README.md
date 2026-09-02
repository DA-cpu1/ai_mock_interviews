This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

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

已验证的 AICallKit 测试页为 `/interview/aliyun-test`。要启用真实语音通话，请在 `.env.local` 配置服务端变量；`ALIYUN_RTC_APP_KEY` 只放在服务端，不能使用 `NEXT_PUBLIC_` 前缀：

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
