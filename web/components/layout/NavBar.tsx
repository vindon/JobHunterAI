"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Play } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { getJobStats } from "@/lib/api"

const NAV_LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/jobs", label: "Jobs" },
  { href: "/run", label: "Run Agent" },
  { href: "/history", label: "History" },
  { href: "/profile", label: "Profile" },
  { href: "/settings", label: "Settings" },
]

function VNLogo() {
  return (
    <a
      href="https://linkedin.com/in/vinothnataraj"
      target="_blank"
      rel="noopener noreferrer"
      title="Built by Vinoth Nataraj — LinkedIn"
      className="flex items-center gap-2 shrink-0 group"
    >
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-label="VN">
        <rect width="32" height="32" rx="7" fill="#0056D2" />
        <text
          x="16" y="22"
          textAnchor="middle"
          fill="white"
          fontWeight="700"
          fontSize="13"
          fontFamily="Inter, system-ui, sans-serif"
          letterSpacing="-0.5"
        >
          VN
        </text>
      </svg>
      <div className="leading-none">
        <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          JobHunter<span style={{ color: "var(--primary)" }}>AI</span>
        </p>
        <p className="text-[10px] mt-0.5 group-hover:underline" style={{ color: "var(--text-muted)" }}>
          by Vinoth Nataraj
        </p>
      </div>
    </a>
  )
}

export function NavBar() {
  const pathname = usePathname()
  const router = useRouter()

  const { data: stats } = useQuery({
    queryKey: ["job-stats"],
    queryFn: getJobStats,
    staleTime: 60_000,
  })

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 flex items-center gap-6 px-6"
      style={{
        height: "var(--nav-h)",
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {/* Brand */}
      <VNLogo />

      {/* Divider */}
      <div className="w-px h-5 shrink-0" style={{ background: "var(--border-strong)" }} />

      {/* Nav links */}
      <nav className="flex items-center gap-1 flex-1">
        {NAV_LINKS.map(({ href, label }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
              style={{
                color: active ? "var(--primary)" : "var(--text-secondary)",
                background: active ? "var(--primary-light)" : "transparent",
                fontWeight: active ? 600 : 500,
              }}
            >
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Right side */}
      <div className="flex items-center gap-3 shrink-0">
        {stats && (
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {stats.total} jobs tracked
          </span>
        )}
        {pathname !== "/run" && (
          <button
            onClick={() => router.push("/run")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold text-white transition-colors"
            style={{ background: "var(--primary)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--primary-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--primary)")}
          >
            <Play size={13} />
            Run Now
          </button>
        )}
      </div>
    </header>
  )
}
