"use client"

import { useState } from "react"
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
import { ChevronDown, ChevronUp, Clock, Search, Plus, Briefcase, SkipForward } from "lucide-react"
import { format, parseISO } from "date-fns"
import { Skeleton } from "@/components/ui/skeleton"
import { getRunHistory } from "@/lib/api"
import type { RunRecord } from "@/lib/types"
import { cn } from "@/lib/utils"

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function RunCard({ run, index }: { run: RunRecord; index: number }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3 }}
      className="rounded-xl overflow-hidden"
      style={{
        border: "1px solid var(--border)",
        background: "var(--surface)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {/* Card header */}
      <button
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-[var(--surface-warm)] transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Date + run id */}
        <div className="shrink-0">
          <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
            {format(parseISO(run.run_date), "MMM d, yyyy")}
          </p>
          <p className="text-xs font-mono mt-0.5" style={{ color: "var(--text-muted)" }}>
            #{run.run_id.slice(0, 8)}
          </p>
        </div>

        {/* Stats row */}
        <div className="flex-1 grid grid-cols-5 gap-3">
          {[
            { icon: Clock, label: "Duration", value: formatDuration(run.duration_secs), color: "var(--text-secondary)" },
            { icon: Search, label: "Queries", value: run.queries_run, color: "var(--ai-accent)" },
            { icon: Briefcase, label: "Raw", value: run.raw_results, color: "var(--text-secondary)" },
            { icon: Plus, label: "Added", value: run.new_added, color: "var(--success)", bold: true },
            { icon: SkipForward, label: "Dupes", value: run.dupes_skipped, color: "var(--text-muted)" },
          ].map(({ icon: Icon, label, value, color, bold }) => (
            <div key={label} className="text-center">
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <Icon size={11} style={{ color: "var(--text-muted)" }} />
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</span>
              </div>
              <span
                className={cn("text-sm", bold ? "font-bold" : "font-medium")}
                style={{ color }}
              >
                {value}
              </span>
            </div>
          ))}
        </div>

        {/* New added badge */}
        {run.new_added > 0 && (
          <span
            className="shrink-0 text-xs px-2.5 py-1 rounded-full font-bold"
            style={{ background: "var(--success-light)", color: "var(--success)" }}
          >
            +{run.new_added} new
          </span>
        )}

        {/* Expand chevron */}
        <div style={{ color: "var(--text-muted)" }}>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {/* Expanded content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: "hidden", borderTop: "1px solid var(--border)" }}
          >
            <div className="px-5 py-4 space-y-4">
              {/* Summary */}
              {run.summary && (
                <div
                  className="p-3.5 rounded-xl"
                  style={{ background: "var(--ai-light)", border: "1px solid #d4c8f0" }}
                >
                  <p className="text-xs font-semibold mb-1.5" style={{ color: "var(--ai-accent)" }}>
                    ✨ AI Summary
                  </p>
                  <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    {run.summary}
                  </p>
                </div>
              )}

              {/* Top jobs */}
              {run.top_jobs && run.top_jobs.length > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-2" style={{ color: "var(--text-muted)" }}>
                    TOP MATCHES
                  </p>
                  <div className="space-y-1.5">
                    {run.top_jobs.map((jobStr, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div
                          className="w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                          style={{ background: "var(--primary)", fontSize: 9 }}
                        >
                          {i + 1}
                        </div>
                        <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                          {jobStr}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default function HistoryPage() {
  const { data: runs, isLoading } = useQuery({
    queryKey: ["run-history"],
    queryFn: getRunHistory,
  })

  const chartData = (runs ?? []).slice(-20).map((r) => ({
    date: format(parseISO(r.run_date), "MM/dd"),
    new: r.new_added,
    parsed: r.parsed_ok,
    raw: r.raw_results,
  }))

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Chart */}
      <div
        className="rounded-xl p-5 mb-6"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div className="mb-4">
          <h3 className="font-display text-base" style={{ color: "var(--text-primary)", fontWeight: 700 }}>
            Jobs Found per Run
          </h3>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            Last {chartData.length} runs — blue = new additions
          </p>
        </div>

        {isLoading ? (
          <Skeleton className="h-48 w-full rounded-xl" />
        ) : chartData.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-center">
            <div>
              <div className="text-4xl mb-2">📈</div>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                No run history yet
              </p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ left: -10, right: 10, top: 5 }}>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "#9B8B78" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#9B8B78" }}
                axisLine={false}
                tickLine={false}
                width={30}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                cursor={{ fill: "var(--surface-warm)" }}
              />
              <Bar dataKey="new" name="New jobs" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={entry.new > 5 ? "#E8734A" : entry.new > 0 ? "#E8A23A" : "#EDE8E0"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Run list */}
      <div>
        <h3 className="font-display text-base mb-4" style={{ color: "var(--text-primary)", fontWeight: 700 }}>
          Run History
        </h3>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : !runs || runs.length === 0 ? (
          <div className="py-20 text-center rounded-xl" style={{ border: "1px dashed var(--border)" }}>
            <div className="text-5xl mb-4">🕐</div>
            <p className="font-display text-lg font-semibold" style={{ color: "var(--text-secondary)" }}>
              No runs yet
            </p>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              Launch the agent from the Run page to build your history
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {runs.map((run, i) => (
              <RunCard key={run.id} run={run} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
