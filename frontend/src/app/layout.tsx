import type { Metadata } from "next";
import AppNav from "@/components/AppNav";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "AI Content Detector",
    template: "%s · AI Content Detector",
  },
  description:
    "Check whether a text was written by AI, with sentence-level highlights, batch file checks and writing tools.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full lg:flex">
        <AppNav />
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-10 lg:py-10 print:max-w-none print:p-0">
            {children}
          </main>
          <footer className="mx-auto w-full max-w-5xl px-4 pb-8 text-xs text-muted sm:px-6 lg:px-10 print:hidden">
            AI detection is probabilistic. Treat a result as one signal among several, never as proof about a person.
          </footer>
        </div>
      </body>
    </html>
  );
}
