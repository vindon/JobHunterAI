"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { getJobStats } from "@/lib/api"

const NAV_LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/jobs", label: "Jobs" },
  { href: "/run", label: "Search" },
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
      title="Built by Vinoth Nataraj"
      className="flex items-center gap-2.5 shrink-0 group"
    >
      <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-label="VN">
        <rect width="30" height="30" rx="8" fill="#5B5BD6" />
        <text
          x="15" y="21"
          textAnchor="middle"
          fill="white"
          fontWeight="700"
          fontSize="12"
          fontFamily="Inter, system-ui, sans-serif"
          letterSpacing="-0.5"
        >
          VN
        </text>
      </svg>
      <div className="leading-none">
        <p className="text-sm font-semibold tracking-tight" style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
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
        background: "rgba(255,255,255,0.92)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--border)",
        boxShadow: "var(--shadow-xs)",
      }}
    >
      <VNLogo />

      <div className="w-px h-4 shrink-0" style={{ background: "var(--border-strong)" }} />

      <nav className="flex items-center gap-0.5 flex-1">
        {NAV_LINKS.map(({ href, label }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className="px-3 py-1.5 rounded-lg text-sm transition-all"
              style={{
                color: active ? "var(--primary)" : "var(--text-secondary)",
                background: active ? "var(--primary-light)" : "transparent",
                fontWeight: active ? 600 : 450,
                letterSpacing: "-0.01em",
              }}
            >
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="flex items-center gap-4 shrink-0">
        {stats && (
          <span className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
            {stats.total} jobs tracked
          </span>
        )}
        {pathname !== "/run" && (
          <button
            onClick={() => router.push("/run")}
            className="btn-primary px-4 py-1.5 rounded-lg text-sm font-semibold"
            style={{ letterSpacing: "-0.01em" }}
          >
            Search
          </button>
        )}
      </div>
    </header>
  )
}
