"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion, AnimatePresence } from "framer-motion"
import {
  Play,
  Plus,
  X,
  ChevronDown,
  CheckCircle,
  AlertCircle,
  Loader2,
  ArrowDown,
  Terminal,
  Check,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { getSettings, getActiveRun, startRun, addSearchQuery, deleteSearchQuery } from "@/lib/api"
import { useSSE } from "@/lib/sse"
import type { PipelineNode, Job } from "@/lib/types"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

const PIPELINE_NODES: Omit<PipelineNode, "status" | "count" | "detail">[] = [
  { id: "supervisor", label: "Plan", icon: "1" },
  { id: "search",     label: "Search", icon: "2" },
  { id: "parse",      label: "Parse", icon: "3" },
  { id: "rank",       label: "Rank", icon: "4" },
  { id: "write",      label: "Write", icon: "5" },
  { id: "report",     label: "Report", icon: "6" },
]

type NodeStatus = "idle" | "running" | "complete" | "error"
interface NodeState { status: NodeStatus; count?: number }

function detectNodeFromLog(line: string): { nodeId: string; status: NodeStatus; count?: number } | null {
  const lower = line.toLowerCase()
  for (const node of PIPELINE_NODES) {
    const id = node.id
    if (lower.includes(`[${id}]`) || lower.includes(`node: ${id}`) || lower.includes(`entering ${id}`)) {
      if (lower.includes("error") || lower.includes("failed")) return { nodeId: id, status: "error" }
      if (lower.includes("complete") || lower.includes("done") || lower.includes("finished")) {
        const m = line.match(/(\d+)\s*(results|jobs|found|parsed|written)/i)
        return { nodeId: id, status: "complete", count: m ? Number(m[1]) : undefined }
      }
      return { nodeId: id, status: "running" }
    }
  }
  return null
}

function getLogClass(line: string): string {
  if (line.includes("✅") || /success|complete/i.test(line)) return "log-line-success"
  if (line.includes("❌") || /error|fail/i.test(line)) return "log-line-error"
  if (line.includes("⚠") || /warn|skip/i.test(line)) return "log-line-warn"
  return "log-line-info"
}

// ── Pipeline step card ─────────────────────────────────────────────
function StepCard({ node, state }: { node: typeof PIPELINE_NODES[0]; state: NodeState }) {
  const { status, count } = state
  const colors = {
    idle:     { bg: "var(--surface)", border: "var(--border)", text: "var(--text-muted)" },
    running:  { bg: "var(--primary-light)", border: "var(--primary)", text: "var(--primary)" },
    complete: { bg: "var(--success-light)", border: "var(--success)", text: "var(--success)" },
    error:    { bg: "#FEF2F2", border: "#FCA5A5", text: "#DC2626" },
  }[status]

  return (
    <div
      className="flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all duration-300"
      style={{ background: colors.bg, borderColor: colors.border, minWidth: 76 }}
    >
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
        style={{
          background: status === "idle" ? "var(--border)" : colors.border,
          color: status === "idle" ? "var(--text-muted)" : "#fff",
        }}
      >
        {status === "running" ? (
          <Loader2 size={12} className="animate-spin" />
        ) : status === "complete" ? (
          <Check size={12} />
        ) : status === "error" ? (
          <X size={12} />
        ) : (
          node.icon
        )}
      </div>
      <span className="text-xs font-medium text-center leading-tight" style={{ color: colors.text }}>
        {node.label}
      </span>
      {count !== undefined && status === "complete" && (
        <span className="text-[10px] font-bold" style={{ color: colors.text }}>{count}</span>
      )}
    </div>
  )
}

// ── Query multi-select dropdown ────────────────────────────────────
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
      {/* Trigger */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors"
        style={{
          background: "var(--surface)",
          border: `1px solid ${open ? "var(--primary)" : "var(--border-strong)"}`,
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
          className="transition-transform"
          style={{
            color: "var(--text-muted)",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 right-0 mt-1 rounded-lg overflow-hidden z-50"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border-strong)",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            {/* Select all / clear */}
            <div
              className="flex items-center justify-between px-3 py-2 border-b"
              style={{ borderColor: "var(--border)", background: "var(--surface-warm)" }}
            >
              <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
                SEARCH QUERIES
              </span>
              <button
                onClick={onToggleAll}
                className="text-xs font-semibold"
                style={{ color: "var(--primary)" }}
              >
                {allEnabled ? "Deselect all" : "Select all"}
              </button>
            </div>

            {/* Query list */}
            <div className="max-h-56 overflow-y-auto">
              {queries.map((q, i) => {
                const enabled = !disabledIndices.has(i)
                return (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-[var(--surface-warm)] group cursor-pointer"
                    onClick={() => onToggle(i)}
                  >
                    <div
                      className="w-4 h-4 rounded flex items-center justify-center shrink-0 transition-colors"
                      style={{
                        background: enabled ? "var(--primary)" : "transparent",
                        border: `1.5px solid ${enabled ? "var(--primary)" : "var(--border-strong)"}`,
                      }}
                    >
                      {enabled && <Check size={10} color="#fff" />}
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
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded transition-opacity"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <X size={11} />
                    </button>
                  </div>
                )
              })}
              {queries.length === 0 && (
                <p className="px-3 py-4 text-xs text-center" style={{ color: "var(--text-muted)" }}>
                  No queries yet
                </p>
              )}
            </div>

            {/* Add query */}
            <div
              className="flex gap-2 p-2 border-t"
              style={{ borderColor: "var(--border)" }}
            >
              <input
                className="flex-1 px-2.5 py-1.5 rounded-md text-xs outline-none"
                style={{
                  background: "var(--surface-warm)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                }}
                placeholder="Add a search query..."
                value={newQ}
                onChange={(e) => setNewQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newQ.trim()) {
                    onAdd(newQ.trim())
                    setNewQ("")
                  }
                }}
              />
              <button
                className="px-2.5 py-1.5 rounded-md text-xs font-semibold text-white"
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

// ── Live result card ───────────────────────────────────────────────
function LiveResultCard({ job }: { job: Job }) {
  const score = job.fit_score
  const scoreColor = score >= 8 ? "var(--primary)" : score >= 6 ? "var(--success)" : "var(--warning)"
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
      style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
    >
      <div
        className="w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold text-white shrink-0"
        style={{ background: scoreColor }}
      >
        {score}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold truncate" style={{ color: "var(--text-primary)" }}>
          {job.role}
        </p>
        <p className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>
          {job.company} · {job.country}
        </p>
      </div>
    </motion.div>
  )
}

// ── Main page ──────────────────────────────────────────────────────
export default function RunAgentPage() {
  const queryClient = useQueryClient()
  const [dryRun, setDryRun] = useState(false)
  const [disabledIndices, setDisabledIndices] = useState<Set<number>>(new Set())
  const [runId, setRunId] = useState<string | null>(null)
  const [nodeStates, setNodeStates] = useState<Record<string, NodeState>>(
    PIPELINE_NODES.reduce((acc, n) => ({ ...acc, [n.id]: { status: "idle" as NodeStatus } }), {})
  )
  const [isAtBottom, setIsAtBottom] = useState(true)
  const logRef = useRef<HTMLDivElement>(null)

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

  const logs = events.filter((e) => e.type === "log").map((e) => e.payload as string)
  const liveJobs = events.filter((e) => e.type === "job").map((e) => e.payload as Job)
  const isComplete = events.some((e) => e.type === "complete")

  useEffect(() => {
    logs.forEach((line) => {
      const detected = detectNodeFromLog(line)
      if (!detected) return
      setNodeStates((prev) => {
        const updated = { ...prev }
        if (detected.status === "running") {
          const ids = PIPELINE_NODES.map((n) => n.id)
          ids.slice(0, ids.indexOf(detected.nodeId)).forEach((id) => {
            if (updated[id].status === "running") updated[id] = { ...updated[id], status: "complete" }
          })
        }
        updated[detected.nodeId] = { status: detected.status, count: detected.count ?? updated[detected.nodeId].count }
        return updated
      })
    })
  }, [logs])

  useEffect(() => {
    if (isComplete) {
      setNodeStates((prev) =>
        PIPELINE_NODES.reduce(
          (acc, n) => ({ ...acc, [n.id]: { ...prev[n.id], status: prev[n.id].status === "error" ? "error" : "complete" } }),
          {} as Record<string, NodeState>
        )
      )
      queryClient.invalidateQueries({ queryKey: ["jobs"] })
      queryClient.invalidateQueries({ queryKey: ["job-stats"] })
      queryClient.invalidateQueries({ queryKey: ["run-history"] })
      toast.success("Run complete — new jobs added to board.")
    }
  }, [isComplete, queryClient])

  useEffect(() => {
    if (isAtBottom && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [logs, isAtBottom])

  const handleScroll = useCallback(() => {
    if (!logRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = logRef.current
    setIsAtBottom(scrollHeight - scrollTop - clientHeight < 40)
  }, [])

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
      setNodeStates(PIPELINE_NODES.reduce((acc, n) => ({ ...acc, [n.id]: { status: "idle" as NodeStatus } }), {}))
      toast.success("Agent launched")
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const isRunning = isConnected || activeRun?.active === true
  const queries = settings?.search_queries ?? []

  function toggleQuery(i: number) {
    setDisabledIndices((prev) => { const next = new Set(prev); next.has(i) ? next.delete(i) : next.add(i); return next })
  }
  function toggleAll() {
    setDisabledIndices((prev) => prev.size === 0 ? new Set(queries.map((_, i) => i)) : new Set())
  }

  return (
    <div className="flex" style={{ height: "calc(100vh - var(--nav-h))" }}>

      {/* ── Left config panel ─────────────────────────────── */}
      <div
        className="w-72 shrink-0 flex flex-col overflow-y-auto"
        style={{ borderRight: "1px solid var(--border)", background: "var(--surface)" }}
      >
        <div className="p-5 space-y-5">
          <div>
            <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Run Configuration
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              Customise then launch the agent
            </p>
          </div>

          {/* Dry run */}
          <div
            className="flex items-center justify-between px-3 py-3 rounded-lg"
            style={{ background: "var(--surface-warm)", border: "1px solid var(--border)" }}
          >
            <div>
              <Label className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                Dry run
              </Label>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                Search only — don&apos;t save results
              </p>
            </div>
            <Switch checked={dryRun} onCheckedChange={setDryRun} />
          </div>

          {/* Query picker */}
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: "var(--text-muted)" }}>
              ACTIVE QUERIES
            </p>
            {settingsLoading ? (
              <div className="h-10 rounded-lg animate-pulse" style={{ background: "var(--border)" }} />
            ) : (
              <QueryPicker
                queries={queries}
                disabledIndices={disabledIndices}
                onToggle={toggleQuery}
                onToggleAll={toggleAll}
                onAdd={(q) => addQueryMutation.mutate(q)}
                onDelete={(i) => deleteQueryMutation.mutate(i)}
              />
            )}
          </div>

          {/* Estimate */}
          <div
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs"
            style={{ background: "var(--primary-light)", color: "var(--primary)", border: "1px solid var(--primary-border)" }}
          >
            <span className="font-medium">Est. ~6 min</span>
            <span style={{ color: "var(--text-muted)" }}>across {queries.length - disabledIndices.size} queries</span>
          </div>

          {/* Launch */}
          <button
            onClick={() => startMutation.mutate()}
            disabled={isRunning || startMutation.isPending}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold text-white transition-all"
            style={{
              background: isRunning ? "var(--border-strong)" : "var(--primary)",
              color: isRunning ? "var(--text-muted)" : "#fff",
              cursor: isRunning ? "not-allowed" : "pointer",
            }}
          >
            {isRunning ? (
              <><Loader2 size={16} className="animate-spin" />Running...</>
            ) : (
              <><Play size={16} />Launch Search</>
            )}
          </button>
          {isRunning && (
            <p className="text-xs text-center -mt-3" style={{ color: "var(--text-muted)" }}>
              {isConnected ? "Streaming live results..." : "Connecting..."}
            </p>
          )}
        </div>
      </div>

      {/* ── Centre: pipeline + log ─────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Pipeline steps */}
        <div
          className="px-5 py-4 shrink-0"
          style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)" }}
        >
          <p className="text-[11px] font-semibold mb-3 tracking-wider" style={{ color: "var(--text-muted)" }}>
            PIPELINE
          </p>
          <div className="flex items-center gap-1.5">
            {PIPELINE_NODES.map((node, idx) => (
              <div key={node.id} className="flex items-center gap-1.5 shrink-0">
                <StepCard node={node} state={nodeStates[node.id]} />
                {idx < PIPELINE_NODES.length - 1 && (
                  <div
                    className="w-5 h-px rounded-full transition-all duration-500"
                    style={{ background: nodeStates[node.id].status === "complete" ? "var(--success)" : "var(--border-strong)" }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Log terminal */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div
            className="flex items-center justify-between px-4 py-2 shrink-0"
            style={{ borderBottom: "1px solid #1E293B", background: "#0F172A" }}
          >
            <div className="flex items-center gap-2">
              <Terminal size={12} style={{ color: "#475569" }} />
              <span className="text-[11px] font-mono" style={{ color: "#64748B" }}>live log</span>
              {isConnected && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ background: "#052e16", color: "#4ade80" }}>
                  ● streaming
                </span>
              )}
              {isComplete && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ background: "#052e16", color: "#4ade80" }}>
                  ✓ complete
                </span>
              )}
            </div>
            {!isAtBottom && (
              <button
                className="flex items-center gap-1 text-[11px] px-2 py-1 rounded"
                style={{ background: "#1E293B", color: "#64748B" }}
                onClick={() => { if (logRef.current) { logRef.current.scrollTop = logRef.current.scrollHeight; setIsAtBottom(true) } }}
              >
                <ArrowDown size={10} />Jump to bottom
              </button>
            )}
          </div>
          <div ref={logRef} className="flex-1 overflow-y-auto p-4 log-terminal" onScroll={handleScroll}>
            {logs.length === 0 ? (
              <p className="log-line-info text-xs">
                {isRunning ? "Waiting for output..." : "Launch the agent to see live output here."}
              </p>
            ) : (
              logs.map((line, i) => (
                <div key={i} className={cn("text-xs mb-0.5", getLogClass(line))}>{line}</div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Right: live matches ────────────────────────────── */}
      <div
        className="w-64 shrink-0 flex flex-col overflow-hidden"
        style={{ borderLeft: "1px solid var(--border)", background: "var(--surface)" }}
      >
        <div className="px-4 py-3 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Matches</span>
            {liveJobs.length > 0 && (
              <span
                className="text-xs px-2 py-0.5 rounded-full font-bold"
                style={{ background: "var(--primary-light)", color: "var(--primary)" }}
              >
                {liveJobs.length}
              </span>
            )}
          </div>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
            Real-time results
          </p>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          <AnimatePresence>
            {liveJobs.length === 0 ? (
              <div className="py-16 text-center">
                <CheckCircle size={28} className="mx-auto mb-2 opacity-20" style={{ color: "var(--text-muted)" }} />
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {isRunning ? "Searching..." : "Results appear here"}
                </p>
              </div>
            ) : (
              liveJobs.slice().reverse().map((job) => <LiveResultCard key={job.id} job={job} />)
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
