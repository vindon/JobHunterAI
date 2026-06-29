"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion, AnimatePresence } from "framer-motion"
import {
  Play,
  Plus,
  X,
  Eye,
  EyeOff,
  ChevronDown,
  CheckCircle,
  AlertCircle,
  Loader2,
  ArrowDown,
  Terminal,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { getSettings, getActiveRun, startRun, addSearchQuery, deleteSearchQuery } from "@/lib/api"
import { useSSE } from "@/lib/sse"
import type { PipelineNode, Job } from "@/lib/types"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

const PIPELINE_NODES: Omit<PipelineNode, "status" | "count" | "detail">[] = [
  { id: "supervisor", label: "Supervisor", icon: "🧠" },
  { id: "search", label: "Search", icon: "🔍" },
  { id: "parse", label: "Parse", icon: "📄" },
  { id: "rank", label: "Rank", icon: "⭐" },
  { id: "write", label: "Write", icon: "✍️" },
  { id: "report", label: "Report", icon: "📊" },
]

type NodeStatus = "idle" | "running" | "complete" | "error"

interface NodeState {
  status: NodeStatus
  count?: number
  detail?: string
}

// Detect node status from log line
function detectNodeFromLog(line: string): { nodeId: string; status: NodeStatus; count?: number } | null {
  const lower = line.toLowerCase()
  for (const node of PIPELINE_NODES) {
    const id = node.id
    if (lower.includes(`[${id}]`) || lower.includes(`node: ${id}`) || lower.includes(`entering ${id}`)) {
      if (lower.includes("error") || lower.includes("failed")) return { nodeId: id, status: "error" }
      if (lower.includes("complete") || lower.includes("done") || lower.includes("finished")) {
        const countMatch = line.match(/(\d+)\s*(results|jobs|found|parsed|written)/i)
        return { nodeId: id, status: "complete", count: countMatch ? Number(countMatch[1]) : undefined }
      }
      return { nodeId: id, status: "running" }
    }
  }
  return null
}

function getLogLineClass(line: string): string {
  if (line.includes("✅") || line.toLowerCase().includes("success") || line.toLowerCase().includes("complete")) {
    return "log-line-success"
  }
  if (line.includes("❌") || line.toLowerCase().includes("error") || line.toLowerCase().includes("fail")) {
    return "log-line-error"
  }
  if (line.includes("⚠") || line.toLowerCase().includes("warn") || line.toLowerCase().includes("skip")) {
    return "log-line-warn"
  }
  return "log-line-info"
}

// --- Pipeline Visualiser Node ---
function PipelineNodeCard({ node, nodeState }: { node: typeof PIPELINE_NODES[0]; nodeState: NodeState }) {
  const { status, count } = nodeState
  return (
    <div
      className={cn(
        "flex flex-col items-center p-4 rounded-xl border-2 transition-all duration-300 min-w-[100px]",
        status === "idle" && "border-[var(--border)] bg-[var(--surface-warm)]",
        status === "running" && "border-[var(--ai-accent)] bg-[var(--ai-light)] node-running",
        status === "complete" && "border-[var(--success)] bg-[var(--success-light)]",
        status === "error" && "border-red-300 bg-red-50"
      )}
    >
      <div className="text-2xl mb-2">{node.icon}</div>
      <span
        className="text-xs font-semibold text-center"
        style={{
          color:
            status === "running"
              ? "var(--ai-accent)"
              : status === "complete"
              ? "var(--success)"
              : status === "error"
              ? "#E85A4A"
              : "var(--text-muted)",
        }}
      >
        {node.label}
      </span>

      <div className="mt-2 h-5 flex items-center justify-center">
        {status === "running" && (
          <Loader2 size={14} className="animate-spin" style={{ color: "var(--ai-accent)" }} />
        )}
        {status === "complete" && (
          <CheckCircle size={14} style={{ color: "var(--success)" }} />
        )}
        {status === "error" && (
          <AlertCircle size={14} style={{ color: "#E85A4A" }} />
        )}
      </div>

      {count !== undefined && status === "complete" && (
        <span
          className="mt-1 text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ background: "var(--success-light)", color: "var(--success)" }}
        >
          {count}
        </span>
      )}
    </div>
  )
}

// --- Live Result Card ---
function LiveResultCard({ job }: { job: Job }) {
  const scoreColor = job.fit_score >= 8 ? "var(--primary)" : job.fit_score >= 6 ? "var(--success)" : "var(--warning)"
  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
      style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0"
        style={{ background: scoreColor }}
      >
        {job.fit_score}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold truncate" style={{ color: "var(--text-primary)" }}>
          {job.role}
        </p>
        <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
          {job.company} · {job.country}
        </p>
      </div>
    </motion.div>
  )
}

export default function RunAgentPage() {
  const queryClient = useQueryClient()
  const [dryRun, setDryRun] = useState(false)
  const [newQuery, setNewQuery] = useState("")
  const [disabledQueryIndices, setDisabledQueryIndices] = useState<Set<number>>(new Set())
  const [runId, setRunId] = useState<string | null>(null)
  const [nodeStates, setNodeStates] = useState<Record<string, NodeState>>(
    PIPELINE_NODES.reduce((acc, n) => ({ ...acc, [n.id]: { status: "idle" } }), {})
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
  const hasError = events.some((e) => e.type === "error")

  // Update node states from logs
  useEffect(() => {
    logs.forEach((line) => {
      const detected = detectNodeFromLog(line)
      if (detected) {
        setNodeStates((prev) => {
          const updated = { ...prev }
          // Mark previous nodes complete if current one starts
          if (detected.status === "running") {
            const nodeIds = PIPELINE_NODES.map((n) => n.id)
            const idx = nodeIds.indexOf(detected.nodeId)
            nodeIds.slice(0, idx).forEach((id) => {
              if (updated[id].status === "running") {
                updated[id] = { ...updated[id], status: "complete" }
              }
            })
          }
          updated[detected.nodeId] = {
            status: detected.status,
            count: detected.count ?? updated[detected.nodeId].count,
          }
          return updated
        })
      }
    })
  }, [logs])

  // Mark all complete when run finishes
  useEffect(() => {
    if (isComplete) {
      setNodeStates((prev) =>
        PIPELINE_NODES.reduce(
          (acc, n) => ({
            ...acc,
            [n.id]: { ...prev[n.id], status: prev[n.id].status === "error" ? "error" : "complete" },
          }),
          {} as Record<string, NodeState>
        )
      )
      queryClient.invalidateQueries({ queryKey: ["jobs"] })
      queryClient.invalidateQueries({ queryKey: ["job-stats"] })
      queryClient.invalidateQueries({ queryKey: ["run-history"] })
      toast.success("Agent run complete!")
    }
  }, [isComplete, queryClient])

  // Auto-scroll log
  useEffect(() => {
    if (isAtBottom && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [logs, isAtBottom])

  const handleLogScroll = useCallback(() => {
    if (!logRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = logRef.current
    setIsAtBottom(scrollHeight - scrollTop - clientHeight < 40)
  }, [])

  const addQueryMutation = useMutation({
    mutationFn: addSearchQuery,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] })
      setNewQuery("")
      toast.success("Query added")
    },
  })

  const deleteQueryMutation = useMutation({
    mutationFn: deleteSearchQuery,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings"] }),
  })

  const startMutation = useMutation({
    mutationFn: () => {
      const enabledQueries = settings?.search_queries
        .filter((_, i) => !disabledQueryIndices.has(i))
        .map((q) => q.query)
      return startRun({ dry_run: dryRun, queries: enabledQueries })
    },
    onSuccess: (run) => {
      setRunId(run.run_id)
      clearEvents()
      setNodeStates(PIPELINE_NODES.reduce((acc, n) => ({ ...acc, [n.id]: { status: "idle" } }), {}))
      toast.success("Agent launched!")
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  const isRunning = isConnected || activeRun?.status === "running"
  const queries = settings?.search_queries ?? []

  function toggleQuery(idx: number) {
    setDisabledQueryIndices((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  return (
    <div className="flex h-full">
      {/* Left panel: Config */}
      <div
        className="w-80 shrink-0 flex flex-col h-full overflow-y-auto"
        style={{ borderRight: "1px solid var(--border)", background: "var(--surface)" }}
      >
        <div className="p-5">
          <h3 className="font-display text-base mb-1" style={{ color: "var(--text-primary)", fontWeight: 700 }}>
            Launch Configuration
          </h3>
          <p className="text-xs mb-5" style={{ color: "var(--text-muted)" }}>
            Configure and launch the job search agent
          </p>

          {/* Dry run toggle */}
          <div
            className="flex items-center justify-between p-3.5 rounded-xl mb-5"
            style={{ background: "var(--surface-warm)", border: "1px solid var(--border)" }}
          >
            <div>
              <Label className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                Dry Run
              </Label>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                Find jobs but don&apos;t save to DB
              </p>
            </div>
            <Switch
              checked={dryRun}
              onCheckedChange={setDryRun}
              style={{ accentColor: "var(--primary)" }}
            />
          </div>

          {/* Search queries */}
          <div className="mb-5">
            <p className="text-xs font-semibold mb-2.5" style={{ color: "var(--text-muted)" }}>
              SEARCH QUERIES ({queries.filter((_, i) => !disabledQueryIndices.has(i)).length}/{queries.length} enabled)
            </p>

            {settingsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full rounded-lg" />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {queries.map((q, i) => {
                  const enabled = !disabledQueryIndices.has(i)
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all"
                      style={{
                        background: enabled ? "var(--primary-light)" : "var(--surface-warm)",
                        border: `1px solid ${enabled ? "#f0c5b0" : "var(--border)"}`,
                        opacity: enabled ? 1 : 0.6,
                      }}
                    >
                      <span className="flex-1 text-xs truncate" style={{ color: "var(--text-primary)" }}>
                        {q.query}
                      </span>
                      <button onClick={() => toggleQuery(i)} style={{ color: "var(--text-muted)" }}>
                        {enabled ? <Eye size={13} /> : <EyeOff size={13} />}
                      </button>
                      <button
                        onClick={() => deleteQueryMutation.mutate(i)}
                        style={{ color: "var(--text-muted)" }}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Add query */}
            <div className="flex gap-2 mt-3">
              <Input
                placeholder="Add search query..."
                value={newQuery}
                onChange={(e) => setNewQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newQuery.trim()) {
                    addQueryMutation.mutate(newQuery.trim())
                  }
                }}
                className="flex-1 h-8 text-xs"
                style={{ borderColor: "var(--border)", background: "var(--surface-warm)" }}
              />
              <Button
                size="sm"
                className="h-8 px-3"
                onClick={() => newQuery.trim() && addQueryMutation.mutate(newQuery.trim())}
                style={{ background: "var(--primary)", color: "#fff" }}
              >
                <Plus size={13} />
              </Button>
            </div>
          </div>

          {/* Estimated time */}
          <div
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl mb-5"
            style={{ background: "var(--ai-light)", border: "1px solid #d4c8f0" }}
          >
            <span className="text-sm">⏱️</span>
            <span className="text-xs font-medium" style={{ color: "var(--ai-accent)" }}>
              Estimated runtime: ~6 min
            </span>
          </div>

          {/* Launch button */}
          <Button
            onClick={() => startMutation.mutate()}
            disabled={isRunning || startMutation.isPending}
            className="w-full gap-2 font-semibold py-6 text-base"
            style={{
              background: isRunning ? "var(--border)" : "var(--primary)",
              color: isRunning ? "var(--text-muted)" : "#fff",
              cursor: isRunning ? "not-allowed" : "pointer",
            }}
          >
            {isRunning ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Agent Running...
              </>
            ) : (
              <>
                <Play size={18} />
                Launch Search
              </>
            )}
          </Button>

          {isRunning && (
            <p className="text-xs text-center mt-2" style={{ color: "var(--text-muted)" }}>
              {isConnected ? "Streaming live results..." : "Connecting..."}
            </p>
          )}
        </div>
      </div>

      {/* Centre: Pipeline + Logs */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Pipeline */}
        <div
          className="p-5 shrink-0"
          style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)" }}
        >
          <h3 className="font-display text-sm mb-4" style={{ color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.05em" }}>
            PIPELINE
          </h3>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {PIPELINE_NODES.map((node, idx) => (
              <div key={node.id} className="flex items-center gap-2 shrink-0">
                <PipelineNodeCard node={node} nodeState={nodeStates[node.id]} />
                {idx < PIPELINE_NODES.length - 1 && (
                  <div
                    className="w-6 h-0.5 shrink-0 rounded-full transition-all duration-500"
                    style={{
                      background:
                        nodeStates[node.id].status === "complete"
                          ? "var(--success)"
                          : "var(--border)",
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Live Log */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div
            className="flex items-center justify-between px-4 py-2 shrink-0"
            style={{ borderBottom: "1px solid #2d2b28", background: "#1C1A18" }}
          >
            <div className="flex items-center gap-2">
              <Terminal size={13} style={{ color: "#9B8B78" }} />
              <span className="text-xs font-mono" style={{ color: "#9B8B78" }}>
                live log
              </span>
              {isConnected && (
                <span
                  className="text-xs px-1.5 py-0.5 rounded-md font-mono"
                  style={{ background: "#2D4A3A", color: "#5B8B6E" }}
                >
                  ● streaming
                </span>
              )}
              {isComplete && (
                <span
                  className="text-xs px-1.5 py-0.5 rounded-md font-mono"
                  style={{ background: "#3A2D2D", color: "#5B8B6E" }}
                >
                  ✅ complete
                </span>
              )}
            </div>
            {!isAtBottom && (
              <button
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-md"
                style={{ background: "#2d2b28", color: "#9B8B78" }}
                onClick={() => {
                  if (logRef.current) {
                    logRef.current.scrollTop = logRef.current.scrollHeight
                    setIsAtBottom(true)
                  }
                }}
              >
                <ArrowDown size={11} />
                Jump to bottom
              </button>
            )}
          </div>

          <div
            ref={logRef}
            className="flex-1 overflow-y-auto p-4 log-terminal"
            onScroll={handleLogScroll}
          >
            {logs.length === 0 ? (
              <p className="log-line-info text-xs">
                {isRunning ? "Waiting for output..." : "Launch the agent to see live logs here."}
              </p>
            ) : (
              logs.map((line, i) => (
                <div key={i} className={cn("text-xs mb-0.5", getLogLineClass(line))}>
                  {line}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Right panel: Live Results */}
      <div
        className="w-72 shrink-0 flex flex-col h-full overflow-hidden"
        style={{ borderLeft: "1px solid var(--border)", background: "var(--surface)" }}
      >
        <div className="px-4 py-3.5 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-center gap-2">
            <h3 className="font-display text-sm" style={{ color: "var(--text-primary)", fontWeight: 700 }}>
              Matches Found
            </h3>
            {liveJobs.length > 0 && (
              <span
                className="text-xs px-2 py-0.5 rounded-full font-bold"
                style={{ background: "var(--primary-light)", color: "var(--primary)" }}
              >
                {liveJobs.length}
              </span>
            )}
          </div>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            Results appear in real-time
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          <AnimatePresence>
            {liveJobs.length === 0 ? (
              <div className="py-12 text-center">
                <div className="text-3xl mb-2">🎯</div>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {isRunning ? "Searching for matches..." : "Start a run to see results"}
                </p>
              </div>
            ) : (
              liveJobs
                .slice()
                .reverse()
                .map((job) => <LiveResultCard key={job.id} job={job} />)
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
