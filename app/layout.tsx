import type {Metadata} from "next";
import {Mona_Sans, Geist} from "next/font/google";
import "./globals.css";
import {cn} from "@/lib/utils";
import {Toaster} from "sonner";

const geist = Geist({subsets: ['latin'], variable: '--font-sans'});

const MonaSans = Mona_Sans({
    variable: "--font-mona-sans",
    subsets: ["latin"],
});


export const metadata: Metadata = {
    title: "Prepwise",
    description: "AI面试平台",
};

export default function RootLayout({children}: LayoutProps<"/">) {
    // @ts-ignore
    // @ts-ignore
    return (
        <html
            lang="en"
            className={cn("dark", "font-sans", geist.variable)}
        >
        <body className={`${MonaSans.className} antialiased pattern`}>
        {children}
        <Toaster/>
        </body>
        </html>
    );
}
