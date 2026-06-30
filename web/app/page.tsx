"use client"

import { useQuery } from "@tanstack/react-query"
import { motion, AnimatePresence } from "framer-motion"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts"
import { format, parseISO, formatDistanceToNow } from "date-fns"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Skeleton } from "@/components/ui/skeleton"
import { getJobStats, getJobs, getProfile, getRunHistory } from "@/lib/api"
import { COUNTRY_FLAGS } from "@/lib/types"
import type { Job } from "@/lib/types"

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}

const STAT_CONFIG = [
  {
    label: "TOTAL FOUND",
    grad: "linear-gradient(145deg, #EEF2FF 0%, #F5F3FF 100%)",
    border: "1px solid #C7D2FE",
    left: "#6366F1",
    valueColor: "#4F46E5",
  },
  {
    label: "APPLIED",
    grad: "linear-gradient(145deg, #F5F3FF 0%, #FAF8FF 100%)",
    border: "1px solid #DDD6FE",
    left: "#8B5CF6",
    valueColor: "#7C3AED",
  },
  {
    label: "INTERVIEWS",
    grad: "linear-gradient(145deg, #ECFDF5 0%, #F0FDF9 100%)",
    border: "1px solid #A7F3D0",
    left: "#10B981",
    valueColor: "#059669",
  },
  {
    label: "OFFERS",
    grad: "linear-gradient(145deg, #FFFBEB 0%, #FEFCE8 100%)",
    border: "1px solid #FDE68A",
    left: "#F59E0B",
    valueColor: "#D97706",
  },
]

function StatCard({
  label, value, grad, border, left, valueColor, delay = 0,
}: {
  label: string; value: number | undefined
  grad: string; border: string; left: string; valueColor: string; delay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl p-6 relative overflow-hidden"
      style={{
        background: grad,
        border,
        borderLeft: `4px solid ${left}`,
        boxShadow: `0 1px 4px ${left}22, 0 1px 2px rgba(0,0,0,0.03)`,
      }}
    >
      <p
        className="text-[10px] font-black mb-4"
        style={{ color: left, letterSpacing: "0.12em", textTransform: "uppercase" }}
      >
        {label}
      </p>
      {value === undefined ? (
        <div className="h-16 w-20 rounded-xl animate-pulse" style={{ background: `${left}28` }} />
      ) : (
        <p
          className="text-6xl font-black tabular-nums leading-none"
          style={{ color: valueColor, letterSpacing: "-0.04em" }}
        >
          {value}
        </p>
      )}
    </motion.div>
  )
}

function TopMatchCard({ job, index }: { job: Job; index: number }) {
  const flag = COUNTRY_FLAGS[job.country] ?? ""
  const score = job.fit_score
  const scoreGrad =
    score >= 8
      ? "linear-gradient(135deg, #6366F1, #8B5CF6)"
      : score >= 6
      ? "linear-gradient(135deg, #059669, #10B981)"
      : "linear-gradient(135deg, #D97706, #F59E0B)"

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.06 * index, duration: 0.3 }}
      className="flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all hover:bg-[var(--surface-warm)] group cursor-pointer"
      style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
    >
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-black text-white shrink-0"
        style={{ background: scoreGrad, letterSpacing: "-0.02em", boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }}
      >
        {score}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate" style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
          {job.role}
        </p>
        <p className="text-xs truncate mt-0.5" style={{ color: "var(--text-secondary)" }}>
          {job.company} · {flag} {job.country}
        </p>
      </div>
      <Link href={`/jobs?highlight=${job.id}`} className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          className="text-xs px-2.5 py-1 rounded-lg font-medium border"
          style={{ color: "var(--primary)", borderColor: "var(--primary-border)", background: "var(--primary-light)" }}
        >
          Open
        </button>
      </Link>
    </motion.div>
  )
}

export default function DashboardPage() {
  const router = useRouter()

  const { data: stats } = useQuery({ queryKey: ["job-stats"], queryFn: getJobStats })
  const { data: topJobs } = useQuery({ queryKey: ["top-jobs"], queryFn: () => getJobs({ sort: "fit_score_desc", per_page: 5 }) })
  const { data: recentJobs } = useQuery({ queryKey: ["recent-jobs"], queryFn: () => getJobs({ sort: "created_at_desc", per_page: 5 }) })
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: getProfile })
  const { data: runHistory } = useQuery({ queryKey: ["run-history"], queryFn: getRunHistory })

  const greeting = getGreeting()
  const firstName = profile?.name?.split(" ")[0] ?? "there"

  const statValues = [
    stats?.total,
    stats ? (stats.by_status?.["📤 Applied"] ?? 0) : undefined,
    stats ? (stats.by_status?.["🎤 Interview"] ?? 0) : undefined,
    stats ? (stats.by_status?.["✅ Offer"] ?? 0) : undefined,
  ]

  const funnelData = stats
    ? [
        { stage: "Found",     count: stats.total,                             fill: "#6366F1" },
        { stage: "Reviewing", count: stats.by_status?.["⏳ Reviewing"] ?? 0,  fill: "#8B5CF6" },
        { stage: "Applied",   count: stats.by_status?.["📤 Applied"] ?? 0,    fill: "#10B981" },
        { stage: "Interview", count: stats.by_status?.["🎤 Interview"] ?? 0,  fill: "#F59E0B" },
        { stage: "Offer",     count: stats.by_status?.["✅ Offer"] ?? 0,      fill: "#F43F5E" },
      ]
    : []

  const lastRun = runHistory?.[0]

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Greeting */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <p
          className="text-[11px] font-black mb-2"
          style={{ color: "var(--primary)", letterSpacing: "0.12em", textTransform: "uppercase" }}
        >
          {format(new Date(), "EEEE, MMMM d, yyyy")}
        </p>
        <h2
          className="font-black leading-none mb-2"
          style={{ color: "var(--text-primary)", letterSpacing: "-0.04em", fontSize: 40, lineHeight: 1 }}
        >
          {greeting}, {firstName}
        </h2>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Your job hunt overview
        </p>
      </motion.div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {STAT_CONFIG.map((cfg, i) => (
          <StatCard
            key={cfg.label}
            label={cfg.label}
            value={statValues[i]}
            grad={cfg.grad}
            border={cfg.border}
            left={cfg.left}
            valueColor={cfg.valueColor}
            delay={i * 0.05}
          />
        ))}
      </div>

      {/* Two-column */}
      <div className="grid grid-cols-[1fr_340px] gap-5 mb-5">
        {/* Top Matches */}
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

          <div className="space-y-2">
            <AnimatePresence>
              {!topJobs ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-xl" />
                ))
              ) : topJobs.jobs.length === 0 ? (
                <div className="py-14 text-center">
                  <p className="font-semibold text-sm mb-1" style={{ color: "var(--text-secondary)" }}>
                    No jobs yet
                  </p>
                  <p className="text-xs mb-5" style={{ color: "var(--text-muted)" }}>
                    Start a search to discover remote opportunities
                  </p>
                  <button
                    className="btn-primary px-5 py-2 rounded-xl text-sm font-semibold"
                    onClick={() => router.push("/run")}
                  >
                    Search Now
                  </button>
                </div>
              ) : (
                topJobs.jobs.map((job, i) => <TopMatchCard key={job.id} job={job} index={i} />)
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Application Funnel */}
          <div
            className="rounded-2xl p-5"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}
          >
            <h3
              className="font-black text-sm mb-4"
              style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}
            >
              Application Funnel
            </h3>
            {funnelData.length > 0 ? (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={funnelData} layout="vertical" margin={{ left: -10, right: 10 }}>
                  <XAxis type="number" hide />
                  <YAxis
                    type="category" dataKey="stage" width={64}
                    tick={{ fontSize: 11, fill: "var(--text-muted)", fontFamily: "Inter" }}
                    axisLine={false} tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--surface-warm)" }}
                    contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                  />
                  <Bar dataKey="count" radius={[0, 5, 5, 0]}>
                    {funnelData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Skeleton className="h-40 w-full rounded-xl" />
            )}
          </div>

          {/* Recent Activity */}
          <div
            className="rounded-2xl p-5"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}
          >
            <h3
              className="font-black text-sm mb-4"
              style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}
            >
              Recent Activity
            </h3>
            <div className="space-y-3">
              {!recentJobs ? (
                Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-full rounded-lg" />)
              ) : recentJobs.jobs.length === 0 ? (
                <p className="text-xs py-4 text-center" style={{ color: "var(--text-muted)" }}>
                  No activity yet
                </p>
              ) : (
                recentJobs.jobs.map((job) => (
                  <div key={job.id} className="flex items-center gap-2.5">
                    <div
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: "var(--primary)" }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
                        {job.role}
                      </p>
                      <p className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>
                        {job.company}
                      </p>
                    </div>
                    <span className="text-[11px] shrink-0 tabular-nums" style={{ color: "var(--text-muted)" }}>
                      {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* CTA banner */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="rounded-2xl p-6 flex items-center justify-between"
        style={{
          background: "linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)",
          boxShadow: "0 4px 24px rgba(99,102,241,0.35), 0 1px 4px rgba(99,102,241,0.2)",
        }}
      >
        <div>
          <h3
            className="font-black text-base text-white mb-1"
            style={{ letterSpacing: "-0.03em" }}
          >
            Ready for your next search?
          </h3>
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.65)" }}>
            {lastRun
              ? `Last run: ${format(parseISO(lastRun.run_date), "MMM d 'at' h:mm a")} · Found ${lastRun.new_added} new jobs`
              : "No runs yet — start discovering remote opportunities"}
          </p>
        </div>
        <button
          onClick={() => router.push("/run")}
          className="shrink-0 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all"
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
  )
}
