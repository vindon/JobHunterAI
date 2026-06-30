"use client"

import { useQuery } from "@tanstack/react-query"
import { motion, AnimatePresence } from "framer-motion"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts"
import { format, parseISO, formatDistanceToNow } from "date-fns"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { FitScoreRing } from "@/components/jobs/FitScoreRing"
import { getJobStats, getJobs, getProfile, getRunHistory } from "@/lib/api"
import { COUNTRY_FLAGS } from "@/lib/types"
import type { Job } from "@/lib/types"

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}

const STAT_ACCENTS = ["#5B5BD6", "#7B61FF", "#17A34A", "#C47D16"]

function StatCard({
  label,
  value,
  accent,
  delay = 0,
}: {
  label: string
  value: number | undefined
  accent: string
  delay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className="rounded-2xl p-6"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-sm)",
        borderTop: `3px solid ${accent}`,
      }}
    >
      <p className="text-xs font-semibold tracking-wider uppercase mb-2" style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}>
        {label}
      </p>
      {value === undefined ? (
        <Skeleton className="h-10 w-16" />
      ) : (
        <p className="text-4xl font-black tabular-nums" style={{ color: "var(--text-primary)", letterSpacing: "-0.04em", lineHeight: 1 }}>
          {value}
        </p>
      )}
    </motion.div>
  )
}

function TopMatchCard({ job, index }: { job: Job; index: number }) {
  const flag = COUNTRY_FLAGS[job.country] ?? ""
  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.08 * index, duration: 0.3 }}
      className="flex items-center gap-4 px-4 py-3 rounded-xl transition-colors hover:bg-[var(--surface-warm)] group"
      style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
    >
      <FitScoreRing score={job.fit_score} size="sm" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate" style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
          {job.role}
        </p>
        <p className="text-xs truncate mt-0.5" style={{ color: "var(--text-secondary)" }}>
          {job.company} · {flag} {job.country}
        </p>
      </div>
      <Link
        href={`/jobs?highlight=${job.id}`}
        className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
      >
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

  const funnelData = stats
    ? [
        { stage: "Found",      count: stats.total,                               fill: "#5B5BD6" },
        { stage: "Reviewing",  count: stats.by_status?.["⏳ Reviewing"] ?? 0,    fill: "#7B61FF" },
        { stage: "Applied",    count: stats.by_status?.["📤 Applied"] ?? 0,      fill: "#17A34A" },
        { stage: "Interview",  count: stats.by_status?.["🎤 Interview"] ?? 0,    fill: "#C47D16" },
        { stage: "Offer",      count: stats.by_status?.["✅ Offer"] ?? 0,        fill: "#F59E0B" },
      ]
    : []

  const lastRun = runHistory?.[0]

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Greeting */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-7">
        <h2 className="text-2xl font-black mb-0.5" style={{ color: "var(--text-primary)", letterSpacing: "-0.04em", lineHeight: 1.1 }}>
          {greeting}, {firstName}
        </h2>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {format(new Date(), "EEEE, MMMM d, yyyy")} · Your job hunt overview
        </p>
      </motion.div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Found"  value={stats?.total}                               accent={STAT_ACCENTS[0]} delay={0}    />
        <StatCard label="Applied"      value={stats?.by_status?.["📤 Applied"]}           accent={STAT_ACCENTS[1]} delay={0.05} />
        <StatCard label="Interviews"   value={stats?.by_status?.["🎤 Interview"]}         accent={STAT_ACCENTS[2]} delay={0.10} />
        <StatCard label="Offers"       value={stats?.by_status?.["✅ Offer"]}             accent={STAT_ACCENTS[3]} delay={0.15} />
      </div>

      {/* Two-column */}
      <div className="grid grid-cols-[1fr_340px] gap-5 mb-5">
        {/* Top Matches */}
        <div className="rounded-2xl p-6" style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-bold text-base" style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
                Top Matches
              </h3>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                Highest-scoring opportunities
              </p>
            </div>
            <Link href="/jobs">
              <button className="text-xs font-medium" style={{ color: "var(--primary)" }}>
                View all →
              </button>
            </Link>
          </div>

          <div className="space-y-2">
            <AnimatePresence>
              {!topJobs ? (
                Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)
              ) : topJobs.jobs.length === 0 ? (
                <div className="py-14 text-center">
                  <p className="font-semibold text-sm mb-1" style={{ color: "var(--text-secondary)" }}>No jobs yet</p>
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
          {/* Funnel */}
          <div className="rounded-2xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}>
            <h3 className="font-bold text-sm mb-4" style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
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
          <div className="rounded-2xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}>
            <h3 className="font-bold text-sm mb-4" style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
              Recent Activity
            </h3>
            <div className="space-y-3">
              {!recentJobs ? (
                Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-full rounded-lg" />)
              ) : recentJobs.jobs.length === 0 ? (
                <p className="text-xs py-4 text-center" style={{ color: "var(--text-muted)" }}>No activity yet</p>
              ) : (
                recentJobs.jobs.map((job) => (
                  <div key={job.id} className="flex items-center gap-2.5">
                    <div className="w-1 h-1 rounded-full shrink-0" style={{ background: "var(--primary)" }} />
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
        </div>
      </div>

      {/* Quick run CTA */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="rounded-2xl p-5 flex items-center justify-between"
        style={{
          background: "linear-gradient(135deg, #EDEDFF 0%, #F4F4F8 100%)",
          border: "1px solid var(--primary-border)",
        }}
      >
        <div>
          <h3 className="font-bold text-sm mb-0.5" style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
            Ready for your next search?
          </h3>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {lastRun
              ? `Last run: ${format(parseISO(lastRun.run_date), "MMM d 'at' h:mm a")} · Found ${lastRun.new_added} new jobs`
              : "No runs yet — start discovering remote opportunities"}
          </p>
        </div>
        <button
          onClick={() => router.push("/run")}
          className="btn-primary shrink-0 px-5 py-2.5 rounded-xl text-sm font-semibold"
          style={{ letterSpacing: "-0.01em" }}
        >
          Search Now
        </button>
      </motion.div>
    </div>
  )
}
