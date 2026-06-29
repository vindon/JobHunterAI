"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Briefcase,
  Play,
  History,
  User,
  Settings,
  Star,
  Cpu,
} from "lucide-react"
import { cn } from "@/lib/utils"

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/jobs", label: "Jobs Board", icon: Briefcase },
  { href: "/run", label: "Run Agent", icon: Play },
  { href: "/history", label: "History", icon: History },
  { href: "/profile", label: "Profile", icon: User },
  { href: "/settings", label: "Settings", icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside
      className="fixed left-0 top-0 h-screen flex flex-col"
      style={{
        width: 240,
        background: "var(--surface-warm)",
        borderRight: "1px solid var(--border)",
        zIndex: 40,
      }}
    >
      {/* Logo */}
      <div className="px-5 pt-6 pb-5" style={{ borderBottom: "1px solid var(--border)" }}>
        <Link href="/" className="flex items-center gap-2.5 group">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold"
            style={{ background: "var(--primary)" }}
          >
            JH
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="font-display font-700 text-base"
              style={{ color: "var(--text-primary)" }}
            >
              JobHunter
            </span>
            <span
              className="text-xs font-semibold px-1.5 py-0.5 rounded-md"
              style={{
                background: "var(--ai-light)",
                color: "var(--ai-accent)",
                fontSize: 10,
              }}
            >
              AI
            </span>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === "/" ? pathname === "/" : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 relative group",
                isActive
                  ? "text-[var(--primary)] bg-[var(--primary-light)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border)]"
              )}
              style={
                isActive
                  ? {
                      borderLeft: "3px solid var(--primary)",
                      paddingLeft: "calc(0.75rem - 3px)",
                    }
                  : {}
              }
            >
              <Icon
                size={17}
                className={isActive ? "text-[var(--primary)]" : "text-[var(--text-muted)]"}
              />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4" style={{ borderTop: "1px solid var(--border)" }}>
        {/* Model badge */}
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg mb-3"
          style={{ background: "var(--ai-light)" }}
        >
          <Cpu size={14} style={{ color: "var(--ai-accent)" }} />
          <span className="text-xs font-medium" style={{ color: "var(--ai-accent)" }}>
            Mistral 7B
          </span>
          <span
            className="ml-auto text-xs"
            style={{ color: "var(--ai-accent)", opacity: 0.6 }}
          >
            local
          </span>
        </div>

        {/* GitHub link */}
        <a
          href="https://github.com/vindon/JobHunterAI"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors hover:bg-[var(--border)]"
          style={{ color: "var(--text-muted)" }}
        >
          <Star size={13} />
          <span>Free &amp; Open Source</span>
          <span className="ml-auto opacity-60">GitHub</span>
        </a>
      </div>
    </aside>
  )
}
