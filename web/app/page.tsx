"use client"

import { useQuery } from "@tanstack/react-query"
import { motion, AnimatePresence } from "framer-motion"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts"
import { Briefcase, Send, Mic, Trophy, ArrowRight, Zap, Play } from "lucide-react"
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

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  delay = 0,
}: {
  label: string
  value: number | undefined
  icon: React.ElementType
  color: string
  delay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className="rounded-xl p-5"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>
            {label}
          </p>
          {value === undefined ? (
            <Skeleton className="h-8 w-16" />
          ) : (
            <p
              className="font-display text-3xl leading-none"
              style={{ color: "var(--text-primary)", fontWeight: 800 }}
            >
              {value}
            </p>
          )}
        </div>
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ background: color + "18" }}
        >
          <Icon size={20} style={{ color }} />
        </div>
      </div>
    </motion.div>
  )
}

function TopMatchCard({ job, index }: { job: Job; index: number }) {
  const flag = COUNTRY_FLAGS[job.country] ?? "🌍"
  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.1 * index, duration: 0.35 }}
      className="flex items-center gap-4 px-4 py-3.5 rounded-xl transition-colors hover:bg-[var(--surface-warm)] group"
      style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
    >
      <FitScoreRing score={job.fit_score} size="sm" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate" style={{ color: "var(--text-primary)" }}>
          {job.role}
        </p>
        <p className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>
          {job.company} · {flag} {job.country}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {job.urgency === "🔥 URGENT" && (
          <span
            className="text-xs px-1.5 py-0.5 rounded-md font-medium"
            style={{ background: "var(--primary-light)", color: "var(--primary)" }}
          >
            🔥 Urgent
          </span>
        )}
        <Link
          href={`/jobs?highlight=${job.id}`}
          className="opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Button size="sm" variant="outline" className="h-7 text-xs px-2.5 gap-1">
            View <ArrowRight size={11} />
          </Button>
        </Link>
      </div>
    </motion.div>
  )
}

export default function DashboardPage() {
  const router = useRouter()

  const { data: stats } = useQuery({
    queryKey: ["job-stats"],
    queryFn: getJobStats,
  })

  const { data: topJobs } = useQuery({
    queryKey: ["top-jobs"],
    queryFn: () => getJobs({ sort: "fit_score_desc", per_page: 5 }),
  })

  const { data: recentJobs } = useQuery({
    queryKey: ["recent-jobs"],
    queryFn: () => getJobs({ sort: "created_at_desc", per_page: 5 }),
  })

  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
  })

  const { data: runHistory } = useQuery({
    queryKey: ["run-history"],
    queryFn: getRunHistory,
  })

  const greeting = getGreeting()
  const firstName = profile?.name?.split(" ")[0] ?? "there"

  const funnelData = stats
    ? [
        { stage: "Found", count: stats.total, fill: "#E8734A" },
        { stage: "Reviewing", count: stats.by_status?.["⏳ Reviewing"] ?? 0, fill: "#E8A23A" },
        { stage: "Applied", count: stats.by_status?.["📤 Applied"] ?? 0, fill: "#7C5CBF" },
        { stage: "Interview", count: stats.by_status?.["🎤 Interview"] ?? 0, fill: "#5B8B6E" },
        { stage: "Offer", count: stats.by_status?.["✅ Offer"] ?? 0, fill: "#2D9348" },
      ]
    : []

  const lastRun = runHistory?.[0]

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Greeting */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <h2
          className="font-display text-2xl mb-1"
          style={{ color: "var(--text-primary)", fontWeight: 800 }}
        >
          {greeting}, {firstName} 👋
        </h2>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {format(new Date(), "EEEE, MMMM d, yyyy")} · Here&apos;s your job hunt overview
        </p>
      </motion.div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Found" value={stats?.total} icon={Briefcase} color="#E8734A" delay={0} />
        <StatCard label="Applied" value={stats?.by_status?.["📤 Applied"]} icon={Send} color="#7C5CBF" delay={0.05} />
        <StatCard label="Interviews" value={stats?.by_status?.["🎤 Interview"]} icon={Mic} color="#5B8B6E" delay={0.1} />
        <StatCard label="Offers" value={stats?.by_status?.["✅ Offer"]} icon={Trophy} color="#E8A23A" delay={0.15} />
      </div>

      {/* Two-column */}
      <div className="grid grid-cols-[1fr_340px] gap-5 mb-5">
        {/* Top Matches */}
        <div
          className="rounded-xl p-5"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display text-base" style={{ color: "var(--text-primary)", fontWeight: 700 }}>
                Top Matches
              </h3>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                Highest-scoring opportunities
              </p>
            </div>
            <Link href="/jobs">
              <Button variant="ghost" size="sm" className="text-xs gap-1" style={{ color: "var(--text-secondary)" }}>
                View all <ArrowRight size={12} />
              </Button>
            </Link>
          </div>

          <div className="space-y-2">
            <AnimatePresence>
              {!topJobs ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-xl" />
                ))
              ) : topJobs.jobs.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="text-4xl mb-3">🔍</div>
                  <p className="font-medium" style={{ color: "var(--text-secondary)" }}>
                    No jobs found yet
                  </p>
                  <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                    Run the agent to discover new opportunities
                  </p>
                  <Button
                    className="mt-4"
                    size="sm"
                    onClick={() => router.push("/run")}
                    style={{ background: "var(--primary)", color: "#fff" }}
                  >
                    <Play size={13} className="mr-1.5" />
                    Run Agent
                  </Button>
                </div>
              ) : (
                topJobs.jobs.map((job, i) => (
                  <TopMatchCard key={job.id} job={job} index={i} />
                ))
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Funnel */}
          <div
            className="rounded-xl p-5"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}
          >
            <h3 className="font-display text-base mb-4" style={{ color: "var(--text-primary)", fontWeight: 700 }}>
              Application Funnel
            </h3>
            {funnelData.length > 0 ? (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={funnelData} layout="vertical" margin={{ left: -10, right: 10 }}>
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="stage"
                    width={60}
                    tick={{ fontSize: 11, fill: "#9B8B78" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--surface-warm)" }}
                    contentStyle={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {funnelData.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Skeleton className="h-40 w-full rounded-lg" />
            )}
          </div>

          {/* Recent Activity */}
          <div
            className="rounded-xl p-5"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}
          >
            <h3 className="font-display text-base mb-3" style={{ color: "var(--text-primary)", fontWeight: 700 }}>
              Recent Activity
            </h3>
            <div className="space-y-2.5">
              {!recentJobs ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-lg" />
                ))
              ) : recentJobs.jobs.length === 0 ? (
                <p className="text-xs py-4 text-center" style={{ color: "var(--text-muted)" }}>
                  No recent activity
                </p>
              ) : (
                recentJobs.jobs.map((job) => (
                  <div key={job.id} className="flex items-center gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--primary)" }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
                        {job.role}
                      </p>
                      <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                        {job.company}
                      </p>
                    </div>
                    <span className="text-xs shrink-0" style={{ color: "var(--text-muted)" }}>
                      {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Run */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="rounded-xl p-5 flex items-center justify-between"
        style={{ background: "var(--primary-light)", border: "1px solid var(--primary)" }}
      >
        <div className="flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "var(--primary)" }}
          >
            <Zap size={22} color="#fff" />
          </div>
          <div>
            <h3 className="font-display text-base" style={{ color: "var(--text-primary)", fontWeight: 700 }}>
              Ready for your next search run?
            </h3>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {lastRun
                ? `Last run: ${format(parseISO(lastRun.run_date), "MMM d 'at' h:mm a")} · Found ${lastRun.new_added} new jobs`
                : "No runs yet — start discovering remote opportunities"}
            </p>
          </div>
        </div>
        <Button
          onClick={() => router.push("/run")}
          className="shrink-0 gap-2 font-semibold px-5"
          style={{ background: "var(--primary)", color: "#fff" }}
        >
          <Play size={15} />
          Run Now
        </Button>
      </motion.div>
    </div>
  )
}
