"use client"

import { useState, useEffect, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion, AnimatePresence } from "framer-motion"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { getSettings, getActiveRun, startRun, addSearchQuery } from "@/lib/api"
import { useSSE } from "@/lib/sse"
import type { Job } from "@/lib/types"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

// ── Portal helpers (shared with dashboard) ────────────────
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

// ── Live result card ──────────────────────────────────────
function LiveResultCard({ job }: { job: Job }) {
  const score = job.fit_score
  const scoreColor = score >= 8 ? "var(--primary)" : score >= 6 ? "var(--success)" : "var(--warning)"
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 px-4 py-3 rounded-xl"
      style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black text-white shrink-0"
        style={{ background: scoreColor }}
      >
        {score}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
          {job.role}
        </p>
        <p className="text-xs truncate mt-0.5" style={{ color: "var(--text-muted)" }}>
          {job.company} · {job.country}
        </p>
      </div>
    </motion.div>
  )
}

// ── Checkmark SVG ─────────────────────────────────────────
const Checkmark = () => (
  <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
    <path d="M1 3l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

// ── Main page ─────────────────────────────────────────────
export default function SearchPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [dryRun, setDryRun] = useState(false)
  const [disabledKeys, setDisabledKeys] = useState<Set<string>>(new Set())
  const [newSite, setNewSite] = useState("")
  const [runId, setRunId] = useState<string | null>(null)

  const { data: settings, isLoading } = useQuery({ queryKey: ["settings"], queryFn: getSettings })
  const { data: activeRun } = useQuery({ queryKey: ["active-run"], queryFn: getActiveRun, refetchInterval: 3000 })

  const { events, isConnected, clearEvents } = useSSE(runId)

  const liveJobs = events.filter((e) => e.type === "job").map((e) => e.payload as Job)
  const isComplete = events.some((e) => e.type === "complete")

  useEffect(() => {
    if (isComplete) {
      queryClient.invalidateQueries({ queryKey: ["jobs"] })
      queryClient.invalidateQueries({ queryKey: ["job-stats"] })
      queryClient.invalidateQueries({ queryKey: ["run-history"] })
      toast.success("Search complete — new jobs added to board.")
    }
  }, [isComplete, queryClient])

  const portalGroups = useMemo(() => {
    const qs = settings?.search_queries ?? []
    const groups = new Map<string, string[]>()
    qs.forEach(({ query }) => {
      const key = portalKey(query)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(query)
    })
    return Array.from(groups.entries()).map(([key, queries]) => ({
      key,
      label: portalLabel(key),
      queries,
    }))
  }, [settings?.search_queries])

  const enabledPortals = portalGroups.filter(({ key }) => !disabledKeys.has(key))
  const enabledCount = enabledPortals.reduce((n, p) => n + p.queries.length, 0)

  const addSiteMutation = useMutation({
    mutationFn: (domain: string) =>
      addSearchQuery(
        `site:${domain} "AI strategy" OR "AI automation" OR "CX automation" director senior remote`
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] })
      setNewSite("")
      toast.success("Site added")
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const startMutation = useMutation({
    mutationFn: () => {
      const enabledQueries = enabledPortals.flatMap(({ queries }) => queries)
      return startRun({ dry_run: dryRun, queries_override: enabledQueries })
    },
    onSuccess: (run) => {
      setRunId(run.run_id)
      clearEvents()
      toast.success("Search started")
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const isRunning = isConnected || activeRun?.active === true

  function togglePortal(key: string) {
    setDisabledKeys((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function toggleAll() {
    if (disabledKeys.size === 0) {
      setDisabledKeys(new Set(portalGroups.map((p) => p.key)))
    } else {
      setDisabledKeys(new Set())
    }
  }

  return (
    <div className="min-h-[calc(100vh-var(--nav-h))] flex flex-col items-center justify-start pt-16 pb-16 px-6">

      {/* Running strip */}
      <AnimatePresence>
        {isRunning && !isComplete && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="w-full max-w-lg mb-4 flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{ background: "var(--primary-light)", border: "1px solid var(--primary-border)" }}
          >
            <span className="spinner" />
            <span className="text-sm font-medium" style={{ color: "var(--primary)" }}>
              Searching across {enabledPortals.length} {enabledPortals.length === 1 ? "portal" : "portals"}
              {liveJobs.length > 0 && ` · ${liveJobs.length} match${liveJobs.length !== 1 ? "es" : ""} found`}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Complete strip */}
      <AnimatePresence>
        {isComplete && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-lg mb-4 flex items-center justify-between px-4 py-3 rounded-xl"
            style={{ background: "var(--success-light)", border: "1px solid #86EFAC" }}
          >
            <span className="text-sm font-medium" style={{ color: "var(--success)" }}>
              Done — {liveJobs.length} new {liveJobs.length === 1 ? "match" : "matches"} found
            </span>
            <button className="text-xs font-semibold" style={{ color: "var(--success)" }} onClick={() => router.push("/jobs")}>
              View all →
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main card */}
      <div
        className="w-full max-w-lg rounded-2xl p-8"
        style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-md)" }}
      >
        <div className="mb-6">
          <h1
            className="font-black mb-2"
            style={{ color: "var(--text-primary)", letterSpacing: "-0.04em", lineHeight: 1, fontSize: 36 }}
          >
            Find Remote Jobs
          </h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Choose which job sites to search
          </p>
        </div>

        {/* Portal checkboxes */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-black tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>
              Job Sites
            </p>
            <button onClick={toggleAll} className="text-xs font-semibold" style={{ color: "var(--primary)" }}>
              {disabledKeys.size === 0 ? "Deselect all" : "Select all"}
            </button>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-xl" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {portalGroups.map(({ key, label, queries }) => {
                const on = !disabledKeys.has(key)
                return (
                  <button
                    key={key}
                    onClick={() => togglePortal(key)}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-all text-left"
                    style={{
                      background: on ? "var(--primary-light)" : "var(--surface-warm)",
                      border: `1px solid ${on ? "var(--primary-border)" : "var(--border)"}`,
                      color: on ? "var(--primary)" : "var(--text-muted)",
                    }}
                  >
                    <div
                      className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                      style={{
                        background: on ? "var(--primary)" : "transparent",
                        border: `1.5px solid ${on ? "var(--primary)" : "var(--border-strong)"}`,
                      }}
                    >
                      {on && <Checkmark />}
                    </div>
                    <span className="flex-1 truncate">{label}</span>
                    {queries.length > 1 && (
                      <span style={{ opacity: 0.4, fontSize: 10 }}>×{queries.length}</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Add site */}
        <div className="flex gap-2 mb-5">
          <input
            className="flex-1 px-3 py-2.5 rounded-xl text-xs outline-none"
            style={{
              background: "var(--surface-warm)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
            }}
            placeholder="Add a site (e.g. remotive.com)"
            value={newSite}
            onChange={(e) => setNewSite(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newSite.trim()) addSiteMutation.mutate(newSite.trim())
            }}
          />
          <button
            onClick={() => newSite.trim() && addSiteMutation.mutate(newSite.trim())}
            disabled={addSiteMutation.isPending}
            className="px-3 py-2 rounded-xl text-xs font-bold text-white"
            style={{ background: "var(--primary)", opacity: addSiteMutation.isPending ? 0.6 : 1 }}
          >
            + Add
          </button>
        </div>

        {/* Dry run toggle */}
        <div
          className="flex items-center justify-between px-4 py-3.5 rounded-xl mb-5"
          style={{ background: "var(--surface-warm)", border: "1px solid var(--border)" }}
        >
          <div>
            <Label className="text-sm font-medium cursor-pointer" style={{ color: "var(--text-primary)" }}>
              Preview mode
            </Label>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              Search only — don&apos;t save results
            </p>
          </div>
          <Switch checked={dryRun} onCheckedChange={setDryRun} />
        </div>

        {/* Search button */}
        <button
          onClick={() => startMutation.mutate()}
          disabled={isRunning || startMutation.isPending || enabledCount === 0}
          className="btn-primary w-full py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2.5"
          style={{ letterSpacing: "-0.02em", fontSize: "15px" }}
        >
          {isRunning ? (
            <>
              <span className="spinner" style={{ borderColor: "rgba(255,255,255,0.3)", borderTopColor: "#fff" }} />
              Searching…
            </>
          ) : (
            `Search${enabledPortals.length > 0 ? ` ${enabledPortals.length} site${enabledPortals.length !== 1 ? "s" : ""}` : ""}`
          )}
        </button>

        {!isRunning && !isComplete && enabledCount > 0 && (
          <p className="text-center text-xs mt-3" style={{ color: "var(--text-muted)" }}>
            Est. ~{Math.ceil(enabledCount * 0.55)} min across {enabledCount} {enabledCount === 1 ? "query" : "queries"}
          </p>
        )}
      </div>

      {/* Live results */}
      <AnimatePresence>
        {liveJobs.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-lg mt-6">
            <p className="text-[11px] font-semibold tracking-widest uppercase mb-3" style={{ color: "var(--text-muted)", letterSpacing: "0.08em" }}>
              New Matches
            </p>
            <div className="space-y-2">
              {liveJobs.slice().reverse().map((job) => (
                <LiveResultCard key={job.id} job={job} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
