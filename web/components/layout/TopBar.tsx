"use client"

import { usePathname, useRouter } from "next/navigation"
import { Bell, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useQuery } from "@tanstack/react-query"
import { getJobStats, getProfile } from "@/lib/api"

const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/jobs": "Jobs Board",
  "/run": "Run Agent",
  "/history": "Run History",
  "/profile": "My Profile",
  "/settings": "Settings",
}

function getPageTitle(pathname: string): string {
  return PAGE_TITLES[pathname] ?? "JobHunter AI"
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

export function TopBar() {
  const pathname = usePathname()
  const router = useRouter()
  const title = getPageTitle(pathname)

  const { data: stats } = useQuery({
    queryKey: ["job-stats"],
    queryFn: getJobStats,
    staleTime: 60_000,
  })

  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
    staleTime: 300_000,
  })

  const urgentCount = 0 // Could compute from stats if needed

  return (
    <header
      className="flex items-center justify-between px-6 h-16 shrink-0"
      style={{
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {/* Left: Page title */}
      <div>
        <h1
          className="font-display font-700 text-lg leading-none"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </h1>
        {stats && (
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            {stats.total} jobs tracked
          </p>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-3">
        {/* Notification bell */}
        <button
          className="relative p-2 rounded-lg transition-colors hover:bg-[var(--border)]"
          style={{ color: "var(--text-muted)" }}
          aria-label="Notifications"
        >
          <Bell size={18} />
          {urgentCount > 0 && (
            <span
              className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full"
              style={{ background: "var(--primary)" }}
            />
          )}
        </button>

        {/* Run Now */}
        {pathname !== "/run" && (
          <Button
            size="sm"
            className="gap-1.5 font-semibold"
            style={{
              background: "var(--primary)",
              color: "#fff",
              border: "none",
            }}
            onClick={() => router.push("/run")}
          >
            <Play size={14} />
            Run Now
          </Button>
        )}

        {/* Avatar */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white cursor-pointer select-none"
          style={{ background: "var(--ai-accent)" }}
          title={profile?.name ?? "Profile"}
        >
          {profile?.name ? getInitials(profile.name) : "JH"}
        </div>
      </div>
    </header>
  )
}
