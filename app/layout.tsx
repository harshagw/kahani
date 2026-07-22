import type { Metadata } from "next";
import { Geist, Bricolage_Grotesque } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

/** Canonical origin for absolute Open Graph / Twitter card URLs. */
const metadataBase = new URL(
  process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000")
);

export const metadata: Metadata = {
  metadataBase,
  title: "Kahani - an AI story you play",
  description:
    "A fast, image-first choice game set in India. Every scene is generated in real time.",
  openGraph: {
    title: "Kahani - an AI story you play",
    description:
      "A fast, image-first choice game set in India. Every scene is generated in real time.",
    type: "website",
    siteName: "Kahani",
  },
  twitter: {
    card: "summary_large_image",
    title: "Kahani - an AI story you play",
    description:
      "A fast, image-first choice game set in India. Every scene is generated in real time.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "h-full antialiased font-sans",
        geist.variable,
        bricolage.variable
      )}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
