"use client"

import { useQuery } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { format, parseISO, formatDistanceToNow } from "date-fns"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Skeleton } from "@/components/ui/skeleton"
import { getJobStats, getJobs, getProfile, getRunHistory } from "@/lib/api"
import { COUNTRY_FLAGS } from "@/lib/types"
import type { Job } from "@/lib/types"

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return "Good morning,"
  if (h < 17) return "Good afternoon,"
  return "Good evening,"
}

function scoreGrad(score: number) {
  if (score >= 8) return "linear-gradient(135deg, #6366F1, #8B5CF6)"
  if (score >= 6) return "linear-gradient(135deg, #059669, #10B981)"
  return "linear-gradient(135deg, #D97706, #F59E0B)"
}

// ── Horizontal job card ────────────────────────────────
function JobCard({ job, index }: { job: Job; index: number }) {
  const flag = COUNTRY_FLAGS[job.country] ?? ""
  return (
    <motion.div
      initial={{ opacity: 1, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.04 * index, duration: 0.28 }}
      className="shrink-0 flex flex-col rounded-2xl p-4"
      style={{
        width: 208,
        minHeight: 196,
        border: "1px solid var(--border)",
        background: "var(--surface)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black text-white mb-3 shrink-0"
        style={{ background: scoreGrad(job.fit_score), boxShadow: "0 2px 8px rgba(0,0,0,0.16)" }}
      >
        {job.fit_score}
      </div>
      <p
        className="text-sm font-semibold leading-snug flex-1 mb-3"
        style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}
      >
        {job.role}
      </p>
      <p className="text-xs mb-0.5 truncate" style={{ color: "var(--text-muted)" }}>
        {job.company}
      </p>
      <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
        {flag} {job.country}
      </p>
      <Link href={`/jobs?highlight=${job.id}`}>
        <button
          className="w-full text-xs py-2 rounded-xl font-semibold transition-colors"
          style={{
            border: "1px solid var(--primary-border)",
            color: "var(--primary)",
            background: "var(--primary-light)",
          }}
        >
          Open
        </button>
      </Link>
    </motion.div>
  )
}

// ── Pipeline stat tile ─────────────────────────────────
function PipelineStat({
  label, value, accent, delay = 0,
}: {
  label: string; value: number | undefined; accent: string; delay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      className="flex-1 rounded-xl px-4 py-3"
      style={{
        border: "1px solid var(--border)",
        background: "var(--surface)",
        borderLeft: `3px solid ${accent}`,
      }}
    >
      <p
        className="text-[10px] font-black mb-1.5"
        style={{ color: accent, letterSpacing: "0.1em", textTransform: "uppercase" }}
      >
        {label}
      </p>
      {value === undefined ? (
        <div className="h-8 w-10 rounded animate-pulse" style={{ background: `${accent}25` }} />
      ) : (
        <p
          className="text-3xl font-black tabular-nums"
          style={{ color: accent, letterSpacing: "-0.04em", lineHeight: 1 }}
        >
          {value}
        </p>
      )}
    </motion.div>
  )
}

// ── Page ──────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter()

  const { data: stats } = useQuery({ queryKey: ["job-stats"], queryFn: getJobStats })
  const { data: topJobs } = useQuery({
    queryKey: ["top-jobs"],
    queryFn: () => getJobs({ sort: "fit_score_desc", per_page: 8 }),
  })
  const { data: recentJobs } = useQuery({
    queryKey: ["recent-jobs"],
    queryFn: () => getJobs({ sort: "created_at_desc", per_page: 6 }),
  })
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: getProfile })
  const { data: runHistory } = useQuery({ queryKey: ["run-history"], queryFn: getRunHistory })

  const greeting = getGreeting()
  const firstName = profile?.name?.split(" ")[0] ?? "there"
  const lastRun = runHistory?.[0]

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-5">

      {/* ── Greeting ── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-end justify-between"
      >
        <div>
          <p className="text-base mb-0.5" style={{ color: "var(--text-muted)" }}>
            {greeting}
          </p>
          <h1
            className="font-black leading-none"
            style={{
              color: "var(--text-primary)",
              fontSize: "clamp(44px, 5.5vw, 68px)",
              letterSpacing: "-0.05em",
              lineHeight: 0.92,
            }}
          >
            {firstName}
          </h1>
        </div>
        <p
          className="text-[11px] font-semibold pb-1"
          style={{ color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}
        >
          {format(new Date(), "EEEE, MMMM d, yyyy")}
        </p>
      </motion.div>

      {/* ── Hero stat + pipeline ── */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "2fr 1fr" }}>

        {/* Hero stat card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="hero-stat-card rounded-2xl p-8 relative overflow-hidden"
          style={{ minHeight: 180 }}
        >
          <p
            className="text-[10px] font-black mb-4"
            style={{ color: "#4338CA", letterSpacing: "0.14em", textTransform: "uppercase" }}
          >
            Total Found
          </p>
          {stats === undefined ? (
            <div className="h-20 w-36 rounded-xl animate-pulse" style={{ background: "#4338CA22" }} />
          ) : (
            <p
              className="font-black tabular-nums leading-none"
              style={{
                color: "#312E81",
                fontSize: "clamp(80px, 9vw, 108px)",
                letterSpacing: "-0.05em",
                lineHeight: 0.85,
              }}
            >
              {stats.total}
            </p>
          )}
          <p className="text-sm mt-4" style={{ color: "#4338CA", opacity: 0.6 }}>
            Remote AI &amp; automation roles
          </p>
        </motion.div>

        {/* Pipeline stack */}
        <div className="flex flex-col gap-3">
          <PipelineStat
            label="Applied"
            value={stats ? (stats.by_status?.["📤 Applied"] ?? 0) : undefined}
            accent="#8B5CF6"
            delay={0.05}
          />
          <PipelineStat
            label="Interviews"
            value={stats ? (stats.by_status?.["🎤 Interview"] ?? 0) : undefined}
            accent="#059669"
            delay={0.10}
          />
          <PipelineStat
            label="Offers"
            value={stats ? (stats.by_status?.["✅ Offer"] ?? 0) : undefined}
            accent="#D97706"
            delay={0.15}
          />
        </div>
      </div>

      {/* ── Top Matches — horizontal scroll ── */}
      <div
        className="rounded-2xl p-6"
        style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-black text-base" style={{ color: "var(--text-primary)", letterSpacing: "-0.03em" }}>
              Top Matches
            </h3>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              Highest-scoring opportunities
            </p>
          </div>
          <Link href="/jobs">
            <button className="text-xs font-semibold" style={{ color: "var(--primary)" }}>
              View all →
            </button>
          </Link>
        </div>

        {!topJobs ? (
          <div className="flex gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="shrink-0 rounded-2xl" style={{ width: 208, height: 196 }} />
            ))}
          </div>
        ) : topJobs.jobs.length === 0 ? (
          <div className="py-14 text-center">
            <p className="font-semibold text-sm mb-1" style={{ color: "var(--text-secondary)" }}>No jobs yet</p>
            <p className="text-xs mb-5" style={{ color: "var(--text-muted)" }}>
              Start a search to discover remote opportunities
            </p>
            <button className="btn-primary px-5 py-2 rounded-xl text-sm font-semibold" onClick={() => router.push("/run")}>
              Search Now
            </button>
          </div>
        ) : (
          <div
            className="flex gap-3 overflow-x-auto"
            style={{ paddingBottom: 4, scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {topJobs.jobs.map((job, i) => (
              <JobCard key={job.id} job={job} index={i} />
            ))}
          </div>
        )}
      </div>

      {/* ── Recent Activity + CTA side-by-side ── */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 280px" }}>

        {/* Recent Activity */}
        <div
          className="rounded-2xl p-5"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}
        >
          <h3 className="font-black text-sm mb-4" style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
            Recent Activity
          </h3>
          <div className="space-y-3">
            {!recentJobs ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full rounded-lg" />)
            ) : recentJobs.jobs.length === 0 ? (
              <p className="text-xs py-4 text-center" style={{ color: "var(--text-muted)" }}>No activity yet</p>
            ) : (
              recentJobs.jobs.map((job) => (
                <div key={job.id} className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--primary)" }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>{job.role}</p>
                    <p className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>{job.company}</p>
                  </div>
                  <span className="text-[11px] shrink-0 tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-2xl p-6 flex flex-col justify-between"
          style={{
            background: "linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)",
            boxShadow: "0 4px 24px rgba(99,102,241,0.35)",
          }}
        >
          <div>
            <p
              className="text-[10px] font-black mb-2 text-white"
              style={{ letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.55 }}
            >
              Next Search
            </p>
            <p className="font-black text-white mb-2" style={{ fontSize: 20, letterSpacing: "-0.03em", lineHeight: 1.1 }}>
              Ready for your next search?
            </p>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>
              {lastRun
                ? `Last run ${format(parseISO(lastRun.run_date), "MMM d 'at' h:mm a")} · ${lastRun.new_added} new`
                : "No runs yet — start discovering roles"}
            </p>
          </div>
          <button
            onClick={() => router.push("/run")}
            className="mt-5 w-full py-2.5 rounded-xl text-sm font-bold text-white"
            style={{
              background: "rgba(255,255,255,0.15)",
              border: "1px solid rgba(255,255,255,0.25)",
              backdropFilter: "blur(8px)",
              letterSpacing: "-0.01em",
            }}
          >
            Search Now →
          </button>
        </motion.div>
      </div>
    </div>
  )
}
