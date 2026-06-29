import type { Metadata } from "next"
import "./globals.css"
import { Providers } from "@/lib/providers"
import { Sidebar } from "@/components/layout/Sidebar"
import { TopBar } from "@/components/layout/TopBar"
import { Toaster } from "@/components/ui/sonner"

export const metadata: Metadata = {
  title: "JobHunter AI — Find Remote Work",
  description:
    "Autonomous AI agent that finds and tracks remote job opportunities worldwide.",
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
          <div className="flex h-full">
            {/* Sidebar */}
            <Sidebar />

            {/* Main content */}
            <div className="flex flex-col min-h-full" style={{ marginLeft: 240, flex: 1 }}>
              <TopBar />
              <main className="flex-1 overflow-auto" style={{ background: "var(--background)" }}>
                {children}
              </main>
            </div>
          </div>
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: "var(--surface)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
                boxShadow: "var(--shadow-md)",
              },
            }}
          />
        </Providers>
      </body>
    </html>
  )
}
