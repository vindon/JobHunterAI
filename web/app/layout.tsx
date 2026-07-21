import type { Metadata } from "next"
import "./globals.css"
import { Providers } from "@/lib/providers"
import { NavBar } from "@/components/layout/NavBar"
import { Toaster } from "@/components/ui/sonner"

export const metadata: Metadata = {
  title: "JobHunterAI — Remote AI Jobs",
  description:
    "Autonomous AI agent that finds and tracks remote jobs worldwide. Built by Vinoth Nataraj.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full antialiased" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
        <Providers>
          <NavBar />
          <main
            className="min-h-full"
            style={{ paddingTop: "var(--nav-h)", background: "var(--background)" }}
          >
            {children}
          </main>
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: "var(--surface)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
                boxShadow: "var(--shadow-md)",
                fontSize: "13px",
              },
            }}
          />
        </Providers>
      </body>
    </html>
  )
}
