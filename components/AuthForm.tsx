"use client"

import {zodResolver} from "@hookform/resolvers/zod"
import {useForm} from "react-hook-form"
import {z} from "zod"
import Image from "next/image"

import {Button} from "@/components/ui/button"
import {Form} from "@/components/ui/form";
import FormField from "@/components/FormField";
import {Input} from "@/components/ui/input"
import Link from "next/link";
import {toast} from "sonner";
import {useRouter} from "next/navigation";
import {signIn, signUp} from "@/lib/action/auth.action";
import {auth} from "@/firebase/client";
import {createUserWithEmailAndPassword, signInWithEmailAndPassword} from "firebase/auth";

const authFormSchema = (type: FormType) => {
    return z.object({
        name: type === "sign-up"
            ? z.string().min(3)
            : z.string().optional(),

        email: z.string().email(),

        password: z.string().min(3),
    });
};


const AuthForm = ({type}: { type: FormType }) => {
    const router = useRouter();
    const formSchema = authFormSchema(type);

// 1. 定义表单
    const form = useForm<z.infer<typeof formSchema>>({
        // 使用 Zod 的 formSchema 作为表单校验规则
        resolver: zodResolver(formSchema),

        // 设置表单的默认值
        defaultValues: {
            // username 输入框初始为空字符串
            name: "",
            password: "",
            email: "",

        },
    })

// 2. 定义表单提交处理函数
    //提交之后的状态
    async function onSubmit(values: z.infer<typeof formSchema>) {
        try {
            if (type === "sign-up") {
                //先在 Firebase Authentication 创建账号，然后保存用户资料
                const {name, email, password} = values;

                //通过 Zod 校验取出姓名、邮箱和密码
                const userCredentials = await createUserWithEmailAndPassword(
                    auth,
                    email,
                    password
                );

                //校验
                const result = await signUp({
                    uid: userCredentials.user.uid,
                    name: name!,
                    email,
                    password,
                });

                if (!result?.success) {
                    toast.error(result?.message);
                    return;
                }

                toast.success("Sign up successfully!");
                router.push("/sign-in");
            } else {
                const {email, password} = values;

                // 使用邮箱和密码完成 Firebase 客户端身份验证
                const userCredential = await signInWithEmailAndPassword(auth, email, password);

                // 获取 Firebase 为当前用户签发的 ID Token
                const idToken = await userCredential.user.getIdToken();

                // 未获取到 Token 时终止登录流程
                if (!idToken) {
                    toast.error("登录失败");
                    return;
                }

                // 将 ID Token 交给服务端验证，并创建 Session Cookie
                const result = await signIn({idToken});

                if (!result.success) {
                    toast.error(result.message);
                    return;
                }

                toast.success("登录成功");
                router.push("/");
            }
        } catch (error) {
            console.log(error);
            toast.error(`发生错误：${error}`);
        }
    }

    const isSignIn = type === "sign-in";

    return (
        <div className="card-border lg:min-w-[556px]">
            <div className="flex flex-col gap-6 card py-14 px-10">
                <div className="flex flex-row gap-2 justify-center">
                    <Image
                        src="/logo.svg"
                        alt="logo"
                        height={32}
                        width={38}
                    />
                    <h2 className="text-primary-100">PrepWise</h2>
                </div>

                <h3>AI面试助手</h3>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="w-full space-y-6 form">
                        {!isSignIn && (
                            <FormField
                                control={form.control}
                                name="name"
                                label="姓名"
                                placeholder="请输入用户名"
                            />
                        )}
                        <FormField
                            control={form.control}
                            name="email"
                            label="邮箱"
                            placeholder="请输入邮箱"
                            type="email"
                        />

                        <FormField
                            control={form.control}
                            name="password"
                            label="密码"
                            placeholder="请输入密码"
                            type="password"
                        />

                        <Button type="submit" className="btn">
                            {isSignIn ? "登录" : "创建账号"}
                        </Button>
                        <p className="text-center">
                            {isSignIn ? "还没有账号？" : "已有账号？"}

                            <Link
                                href={!isSignIn ? "/sign-in" : "/sign-up"}
                                className="font-bold text-user-primary ml-1"
                            >
                                {!isSignIn ? "去登录" : "去注册"}
                            </Link>
                        </p>
                    </form>


                </Form></div>
        </div>
    )
}
export default AuthForm
