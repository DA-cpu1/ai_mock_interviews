'use server'

import {db, auth} from "@/firebase/admin";
import {cookies} from "next/headers";

const ONE_WEEK = 60 * 60 * 24 * 7;


//将已注册用户的信息保存到 Firestore
export async function signUp(params: SignUpParams) {
    const {uid, name, email} = params;

    try {
        const userRecord = await db.collection('users').doc(uid).get();

        if (userRecord.exists) {
            return {
                success: false,
                message: '用户已存在，请直接登录!'
            }
        }

        await db.collection('users').doc(uid).set({
            name, email,
        })

        return {
            success: true,
            message: "注册成功！",
        };

    } catch (e: any) {
        console.error('创建用户出错', e);

        if (e.code === 'auth/email-already-exists') {
            return {
                success: false,
                message: '此邮箱已被使用'
            };
        }
    }
}

//确认 Firebase Authentication 中存在该用户
export async function signIn({idToken}: SignInParams) {
    try {
        await setSessionCookie(idToken);

        return {
            success: true,
            message: "登录成功",
        };
    } catch (e) {
        console.error("登录失败：", e);

        return {
            success: false,
            message: "登录凭证无效",
        };
    }
}

//把 Firebase ID Token 转换成服务端 Session Cookie
export async function setSessionCookie(idToken: string) {
    const cookieStore = await cookies();

    const sessionCookie = await auth.createSessionCookie(idToken, {
        expiresIn: ONE_WEEK * 1000,
    });

    cookieStore.set('session', sessionCookie, {
        maxAge: ONE_WEEK,
        httpOnly: true,//浏览器 JavaScript 不能通过 document.cookie 读取它，降低 XSS 窃取会话的风险
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        sameSite: 'lax',
    })
}

// 获取当前已登录用户的 Firestore 资料；未登录或会话无效时返回 null
export async function getCurrentUser(): Promise<User | null> {
    // 获取当前请求携带的所有 Cookie
    const cookieStore = await cookies();

    // 从 Cookie 中读取名为 session 的 Firebase 会话凭证
    const sessionCookie = cookieStore.get('session')?.value;

    // 没有会话凭证，说明用户当前未登录
    if (!sessionCookie) return null;

    try {
        // 验证 Session Cookie，并检查该会话是否已经被撤销
        const decodedClaims = await auth.verifySessionCookie(sessionCookie, true);

        // 使用会话中解析出的用户 uid，从 Firestore 的 users 集合查询用户资料
        const userRecord = await db
            .collection('users')
            .doc(decodedClaims.uid)
            .get();

        // Firebase Authentication 中虽然存在该用户，但 Firestore 中没有对应资料
        if (!userRecord.exists) return null;

        // 合并 Firestore 中的用户数据与文档 id，并转换为 User 类型返回
        return {
            ...userRecord.data(),
            id: userRecord.id,
        } as User;

    } catch (e) {
        // Cookie 无效、过期、被撤销或数据库查询失败时，记录错误并视为未登录
        console.log(e);

        return null;
    }
}

// 判断当前请求对应的用户是否已经通过有效会话完成身份认证
export async function isAuthenticated(): Promise<boolean> {
    // 复用当前用户查询逻辑：认证成功时返回用户资料，否则返回 null
    const user = await getCurrentUser();

    // 使用双重逻辑非将用户对象转换为布尔值：存在用户为 true，否则为 false
    return !!user;
}

