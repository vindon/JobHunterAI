"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronDown, X, Check, Plus } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { getSettings, getActiveRun, startRun, addSearchQuery, deleteSearchQuery } from "@/lib/api"
import { useSSE } from "@/lib/sse"
import type { Job } from "@/lib/types"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

// ── Query multi-select dropdown ─────────────────────────
interface SearchQuery { query: string; enabled: boolean }

function QueryPicker({
  queries,
  disabledIndices,
  onToggle,
  onToggleAll,
  onAdd,
  onDelete,
}: {
  queries: SearchQuery[]
  disabledIndices: Set<number>
  onToggle: (i: number) => void
  onToggleAll: () => void
  onAdd: (q: string) => void
  onDelete: (i: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [newQ, setNewQ] = useState("")
  const ref = useRef<HTMLDivElement>(null)
  const enabledCount = queries.length - disabledIndices.size
  const allEnabled = disabledIndices.size === 0

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handle)
    return () => document.removeEventListener("mousedown", handle)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm transition-all"
        style={{
          background: "var(--surface-warm)",
          border: `1.5px solid ${open ? "var(--primary)" : "var(--border)"}`,
          color: "var(--text-primary)",
        }}
      >
        <span className="font-medium">
          {enabledCount === queries.length
            ? `All ${queries.length} queries`
            : `${enabledCount} of ${queries.length} queries`}
        </span>
        <ChevronDown
          size={14}
          style={{ color: "var(--text-muted)", transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.12 }}
            className="absolute left-0 right-0 mt-1.5 rounded-xl overflow-hidden z-50"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-lg)" }}
          >
            <div
              className="flex items-center justify-between px-4 py-2.5 border-b"
              style={{ borderColor: "var(--border)", background: "var(--surface-warm)" }}
            >
              <span className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>
                Queries
              </span>
              <button onClick={onToggleAll} className="text-xs font-semibold" style={{ color: "var(--primary)" }}>
                {allEnabled ? "Deselect all" : "Select all"}
              </button>
            </div>

            <div className="max-h-56 overflow-y-auto">
              {queries.map((q, i) => {
                const enabled = !disabledIndices.has(i)
                return (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--surface-warm)] group cursor-pointer"
                    onClick={() => onToggle(i)}
                  >
                    <div
                      className="w-4 h-4 rounded-md flex items-center justify-center shrink-0 transition-colors"
                      style={{
                        background: enabled ? "var(--primary)" : "transparent",
                        border: `1.5px solid ${enabled ? "var(--primary)" : "var(--border-strong)"}`,
                      }}
                    >
                      {enabled && <Check size={9} color="#fff" strokeWidth={3} />}
                    </div>
                    <span
                      className="flex-1 text-xs truncate"
                      style={{ color: enabled ? "var(--text-primary)" : "var(--text-muted)" }}
                      title={q.query}
                    >
                      {q.query}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(i) }}
                      className="opacity-0 group-hover:opacity-100 w-4 h-4 rounded flex items-center justify-center transition-opacity"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <X size={10} />
                    </button>
                  </div>
                )
              })}
              {queries.length === 0 && (
                <p className="px-4 py-5 text-xs text-center" style={{ color: "var(--text-muted)" }}>No queries yet</p>
              )}
            </div>

            <div className="flex gap-2 p-3 border-t" style={{ borderColor: "var(--border)" }}>
              <input
                className="flex-1 px-3 py-2 rounded-lg text-xs outline-none"
                style={{ background: "var(--surface-warm)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                placeholder="Add a query..."
                value={newQ}
                onChange={(e) => setNewQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && newQ.trim()) { onAdd(newQ.trim()); setNewQ("") } }}
              />
              <button
                className="px-3 py-2 rounded-lg text-xs font-semibold text-white"
                style={{ background: "var(--primary)" }}
                onClick={() => { if (newQ.trim()) { onAdd(newQ.trim()); setNewQ("") } }}
              >
                <Plus size={12} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Live result card ────────────────────────────────────
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
        style={{ background: scoreColor, letterSpacing: "-0.02em" }}
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

// ── Main page ───────────────────────────────────────────
export default function SearchPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [dryRun, setDryRun] = useState(false)
  const [disabledIndices, setDisabledIndices] = useState<Set<number>>(new Set())
  const [runId, setRunId] = useState<string | null>(null)

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  })

  const { data: activeRun } = useQuery({
    queryKey: ["active-run"],
    queryFn: getActiveRun,
    refetchInterval: 3000,
  })

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

  const addQueryMutation = useMutation({
    mutationFn: addSearchQuery,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["settings"] }); toast.success("Query added") },
  })

  const deleteQueryMutation = useMutation({
    mutationFn: deleteSearchQuery,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings"] }),
  })

  const startMutation = useMutation({
    mutationFn: () => {
      const enabledQueries = (settings?.search_queries ?? [])
        .filter((_, i) => !disabledIndices.has(i))
        .map((q) => q.query)
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
  const queries = settings?.search_queries ?? []
  const enabledCount = queries.length - disabledIndices.size

  function toggleQuery(i: number) {
    setDisabledIndices((prev) => { const next = new Set(prev); next.has(i) ? next.delete(i) : next.add(i); return next })
  }
  function toggleAll() {
    setDisabledIndices((prev) => prev.size === 0 ? new Set(queries.map((_, i) => i)) : new Set())
  }

  return (
    <div className="min-h-[calc(100vh-var(--nav-h))] flex flex-col items-center justify-start pt-16 pb-16 px-6">

      {/* Running status strip */}
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
              Searching across {enabledCount} {enabledCount === 1 ? "query" : "queries"}
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
            <button
              className="text-xs font-semibold"
              style={{ color: "var(--success)" }}
              onClick={() => router.push("/jobs")}
            >
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
        <div className="mb-7">
          <h1
            className="font-black mb-2"
            style={{ color: "var(--text-primary)", letterSpacing: "-0.04em", lineHeight: 1, fontSize: 36 }}
          >
            Find Remote Jobs
          </h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Search across tailored AI & automation queries globally
          </p>
        </div>

        <div className="space-y-4">
          {/* Query picker */}
          {settingsLoading ? (
            <div className="h-12 rounded-xl animate-pulse" style={{ background: "var(--border)" }} />
          ) : (
            <div>
              <p className="text-xs font-semibold mb-2 tracking-wider uppercase" style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}>
                Queries
              </p>
              <QueryPicker
                queries={queries}
                disabledIndices={disabledIndices}
                onToggle={toggleQuery}
                onToggleAll={toggleAll}
                onAdd={(q) => addQueryMutation.mutate(q)}
                onDelete={(i) => deleteQueryMutation.mutate(i)}
              />
            </div>
          )}

          {/* Dry run toggle */}
          <div
            className="flex items-center justify-between px-4 py-3.5 rounded-xl"
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
        </div>

        {/* Search button */}
        <button
          onClick={() => startMutation.mutate()}
          disabled={isRunning || startMutation.isPending}
          className="btn-primary w-full mt-6 py-3.5 rounded-xl text-sm font-bold tracking-tight flex items-center justify-center gap-2.5"
          style={{ letterSpacing: "-0.02em", fontSize: "15px" }}
        >
          {isRunning ? (
            <>
              <span className="spinner" style={{ borderColor: "rgba(255,255,255,0.3)", borderTopColor: "#fff" }} />
              Searching...
            </>
          ) : (
            "Search"
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
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full max-w-lg mt-6"
          >
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
