"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { format } from "date-fns"
import Link from "next/link"
import { Skeleton } from "@/components/ui/skeleton"
import { getJobStats, getJobs, getProfile, getSettings, startRun, addSearchQuery, getActiveRun } from "@/lib/api"
import { COUNTRY_FLAGS } from "@/lib/types"
import type { Job } from "@/lib/types"
import { toast } from "sonner"

// ── Helpers ───────────────────────────────────────────────
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

const SITE_LABELS: Record<string, string> = {
  "seek.com.au": "SEEK AU",
  "nz.seek.com": "SEEK NZ",
  "reed.co.uk": "Reed UK",
  "uk.indeed.com": "Indeed UK",
  "indeed.com": "Indeed US",
  "jobs.gartner.com": "Gartner",
  "linkedin.com/jobs": "LinkedIn",
  "linkedin.com": "LinkedIn",
  "remoterocketship.com": "Remote Rocketship",
  "remote.co": "Remote.co",
  "naukri.com": "Naukri",
  "agentic-engineering-jobs.com": "Agentic Jobs",
}

function portalKey(query: string): string {
  const m = query.match(/site:([\w.\-/]+)/)
  return m ? m[1].replace(/\/$/, "").toLowerCase() : "__global__"
}

function portalLabel(key: string): string {
  if (key === "__global__") return "Global"
  return SITE_LABELS[key] ?? key
}

// ── Embedded search (full-width, panning pill row) ────────
function EmbeddedSearch() {
  const queryClient = useQueryClient()
  const [disabledKeys, setDisabledKeys] = useState<Set<string>>(new Set())
  const [newSite, setNewSite] = useState("")
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle")
  const [panAmount, setPanAmount] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)

  const { data: settings, isLoading } = useQuery({ queryKey: ["settings"], queryFn: getSettings })
  const { data: activeRun } = useQuery({ queryKey: ["active-run"], queryFn: getActiveRun, refetchInterval: 3000 })

  const portalGroups = useMemo(() => {
    const qs = settings?.search_queries ?? []
    const groups = new Map<string, string[]>()
    qs.forEach(({ query }) => {
      const key = portalKey(query)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(query)
    })
    return Array.from(groups.entries()).map(([key, queries]) => ({ key, label: portalLabel(key), queries }))
  }, [settings?.search_queries])

  // Measure overflow to know how far to pan
  useEffect(() => {
    if (!containerRef.current || !trackRef.current) return
    const overflow = trackRef.current.scrollWidth - containerRef.current.clientWidth
    setPanAmount(Math.max(0, overflow))
  }, [portalGroups.length])

  // Detect run completion
  useEffect(() => {
    if (phase === "running" && activeRun?.active === false) {
      setPhase("done")
      queryClient.invalidateQueries({ queryKey: ["job-stats"] })
      queryClient.invalidateQueries({ queryKey: ["top-jobs"] })
    }
  }, [activeRun?.active, phase, queryClient])

  const isRunning = phase === "running" || activeRun?.active === true

  const addSiteMutation = useMutation({
    mutationFn: (domain: string) =>
      addSearchQuery(`site:${domain} "AI strategy" OR "AI automation" OR "CX automation" director senior remote`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["settings"] }); setNewSite(""); toast.success("Site added") },
    onError: (e: Error) => toast.error(e.message),
  })

  const startMutation = useMutation({
    mutationFn: () => {
      const enabledQueries = portalGroups.filter(({ key }) => !disabledKeys.has(key)).flatMap(({ queries }) => queries)
      return startRun({ dry_run: false, queries_override: enabledQueries })
    },
    onSuccess: () => { setPhase("running"); toast.success("Search started — results will appear in Jobs board") },
    onError: (e: Error) => toast.error(e.message),
  })

  const Checkmark = () => (
    <svg width="7" height="5" viewBox="0 0 7 5" fill="none">
      <path d="M1 2.5l1.5 1.5 3.5-3.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )

  const enabledCount = portalGroups.filter(({ key }) => !disabledKeys.has(key)).length

  return (
    <div
      className="rounded-2xl px-6 py-5"
      style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-md)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-black" style={{ fontSize: 17, letterSpacing: "-0.03em", color: "var(--text-primary)" }}>
            Find Remote Jobs
          </h2>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
            {enabledCount} of {portalGroups.length} sites selected
          </p>
        </div>

        {/* Add site + Search inline */}
        <div className="flex items-center gap-2">
          <input
            className="px-3 py-2 rounded-xl text-xs outline-none"
            style={{
              width: 180,
              background: "var(--surface-warm)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
            }}
            placeholder="Add site (e.g. remotive.com)"
            value={newSite}
            onChange={(e) => setNewSite(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && newSite.trim()) addSiteMutation.mutate(newSite.trim()) }}
          />
          <button
            onClick={() => newSite.trim() && addSiteMutation.mutate(newSite.trim())}
            disabled={addSiteMutation.isPending}
            className="px-3 py-2 rounded-xl text-xs font-bold text-white"
            style={{ background: "var(--primary)", opacity: addSiteMutation.isPending ? 0.6 : 1, whiteSpace: "nowrap" }}
          >
            + Add
          </button>
          <button
            onClick={() => {
              if (phase === "done") { setPhase("idle"); return }
              startMutation.mutate()
            }}
            disabled={isRunning}
            className="btn-primary px-5 py-2 rounded-xl text-sm font-bold flex items-center gap-2"
            style={{ whiteSpace: "nowrap" }}
          >
            {isRunning ? (
              <><span className="spinner" style={{ borderColor: "rgba(255,255,255,0.3)", borderTopColor: "#fff", width: 14, height: 14 }} />Searching…</>
            ) : phase === "done" ? "Done ✓" : "Search"}
          </button>
        </div>
      </div>

      {/* Panning portal pill row */}
      {isLoading ? (
        <div className="flex gap-2">
          {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-9 rounded-full" style={{ width: 100 }} />)}
        </div>
      ) : (
        <div ref={containerRef} className="overflow-hidden relative">
          {/* Fade masks */}
          <div
            className="absolute inset-y-0 left-0 z-10 pointer-events-none"
            style={{ width: 40, background: "linear-gradient(to right, var(--surface), transparent)" }}
          />
          <div
            className="absolute inset-y-0 right-0 z-10 pointer-events-none"
            style={{ width: 40, background: "linear-gradient(to left, var(--surface), transparent)" }}
          />

          <motion.div
            ref={trackRef}
            className="flex gap-2"
            style={{ width: "max-content" }}
            animate={panAmount > 0 ? { x: [0, -panAmount, 0] } : { x: 0 }}
            transition={
              panAmount > 0
                ? { duration: 16, ease: "easeInOut", repeat: Infinity, repeatDelay: 1.5, times: [0, 0.5, 1] }
                : undefined
            }
            whileHover={{ animationPlayState: "paused" }}
          >
            {portalGroups.map(({ key, label, queries }) => {
              const on = !disabledKeys.has(key)
              return (
                <button
                  key={key}
                  onClick={() =>
                    setDisabledKeys((prev) => {
                      const next = new Set(prev)
                      on ? next.add(key) : next.delete(key)
                      return next
                    })
                  }
                  className="flex items-center gap-2 pl-2.5 pr-3.5 py-2 rounded-full text-xs font-semibold transition-all shrink-0"
                  style={{
                    background: on ? "var(--primary)" : "var(--surface-warm)",
                    border: `1.5px solid ${on ? "var(--primary)" : "var(--border)"}`,
                    color: on ? "#fff" : "var(--text-muted)",
                    boxShadow: on ? "0 2px 8px rgba(99,102,241,0.35)" : "none",
                  }}
                >
                  <div
                    className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                    style={{
                      background: on ? "rgba(255,255,255,0.25)" : "transparent",
                      border: `1.5px solid ${on ? "rgba(255,255,255,0.5)" : "var(--border-strong)"}`,
                    }}
                  >
                    {on && <Checkmark />}
                  </div>
                  {label}
                  {queries.length > 1 && (
                    <span style={{ opacity: on ? 0.6 : 0.4, fontSize: 10 }}>×{queries.length}</span>
                  )}
                </button>
              )
            })}
          </motion.div>
        </div>
      )}
    </div>
  )
}

// ── Horizontal job card ───────────────────────────────────
function JobCard({ job }: { job: Job }) {
  const flag = COUNTRY_FLAGS[job.country] ?? ""
  return (
    <div
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
      <p className="text-sm font-semibold leading-snug flex-1 mb-3" style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
        {job.role}
      </p>
      <p className="text-xs mb-0.5 truncate" style={{ color: "var(--text-muted)" }}>{job.company}</p>
      <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>{flag} {job.country}</p>
      <Link href={`/jobs?highlight=${job.id}`}>
        <button
          className="w-full text-xs py-2 rounded-xl font-semibold"
          style={{ border: "1px solid var(--primary-border)", color: "var(--primary)", background: "var(--primary-light)" }}
        >
          Open
        </button>
      </Link>
    </div>
  )
}

// ── Pipeline stat tile ────────────────────────────────────
function PipelineStat({ label, value, accent, delay = 0 }: {
  label: string; value: number | undefined; accent: string; delay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 1, y: 0 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl px-4 py-3"
      style={{ border: "1px solid var(--border)", background: "var(--surface)", borderLeft: `3px solid ${accent}` }}
    >
      <p className="text-[10px] font-black mb-1.5" style={{ color: accent, letterSpacing: "0.1em", textTransform: "uppercase" }}>
        {label}
      </p>
      {value === undefined ? (
        <div className="h-8 w-10 rounded animate-pulse" style={{ background: `${accent}25` }} />
      ) : (
        <p className="text-3xl font-black tabular-nums" style={{ color: accent, letterSpacing: "-0.04em", lineHeight: 1 }}>
          {value}
        </p>
      )}
    </motion.div>
  )
}

// ── Page ─────────────────────────────────────────────────
export default function DashboardPage() {
  const { data: stats } = useQuery({ queryKey: ["job-stats"], queryFn: getJobStats })
  const { data: topJobs } = useQuery({
    queryKey: ["top-jobs"],
    queryFn: () => getJobs({ sort: "fit_score_desc", per_page: 8 }),
  })
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: getProfile })

  const greeting = getGreeting()
  const firstName = profile?.name?.split(" ")[0] ?? "there"

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-5">

      {/* ── Greeting ── */}
      <motion.div
        initial={{ opacity: 1, y: 0 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-end justify-between pt-2"
      >
        <div>
          <p className="text-base mb-0.5" style={{ color: "var(--text-muted)" }}>{greeting}</p>
          <h1
            className="font-black leading-none"
            style={{ color: "var(--text-primary)", fontSize: "clamp(44px, 5.5vw, 68px)", letterSpacing: "-0.05em", lineHeight: 0.92 }}
          >
            {firstName}
          </h1>
        </div>
        <p className="text-[11px] font-semibold pb-1" style={{ color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          {format(new Date(), "EEEE, MMMM d, yyyy")}
        </p>
      </motion.div>

      {/* ── Find Remote Jobs — full-width, panning portals ── */}
      <EmbeddedSearch />

      {/* ── Stats row ── */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr" }}>
        <motion.div
          initial={{ opacity: 1, scale: 1 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="hero-stat-card rounded-2xl p-8 relative overflow-hidden"
          style={{ minHeight: 160 }}
        >
          <p className="text-[10px] font-black mb-3" style={{ color: "#4338CA", letterSpacing: "0.14em", textTransform: "uppercase" }}>
            Total Found
          </p>
          {stats === undefined ? (
            <div className="h-16 w-32 rounded-xl animate-pulse" style={{ background: "#4338CA22" }} />
          ) : (
            <p className="font-black tabular-nums leading-none" style={{ color: "#312E81", fontSize: "clamp(72px, 8vw, 96px)", letterSpacing: "-0.05em", lineHeight: 0.85 }}>
              {stats.total}
            </p>
          )}
          <p className="text-sm mt-3" style={{ color: "#4338CA", opacity: 0.6 }}>Remote AI &amp; automation roles</p>
        </motion.div>

        <PipelineStat label="Applied"    value={stats ? (stats.by_status?.["📤 Applied"]   ?? 0) : undefined} accent="#8B5CF6" delay={0.05} />
        <PipelineStat label="Interviews" value={stats ? (stats.by_status?.["🎤 Interview"]  ?? 0) : undefined} accent="#059669" delay={0.10} />
        <PipelineStat label="Offers"     value={stats ? (stats.by_status?.["✅ Offer"]      ?? 0) : undefined} accent="#D97706" delay={0.15} />
      </div>

      {/* ── Top Matches ── */}
      <div
        className="rounded-2xl p-6"
        style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-black text-base" style={{ color: "var(--text-primary)", letterSpacing: "-0.03em" }}>
              Top Matches
            </h3>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>Highest-scoring opportunities</p>
          </div>
          <Link href="/jobs">
            <button className="text-xs font-semibold" style={{ color: "var(--primary)" }}>View all →</button>
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
            <p className="text-xs mb-5" style={{ color: "var(--text-muted)" }}>Use the search above to discover remote opportunities</p>
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto" style={{ paddingBottom: 4, scrollbarWidth: "none" }}>
            {topJobs.jobs.map((job) => <JobCard key={job.id} job={job} />)}
          </div>
        )}
      </div>
    </div>
  )
}
