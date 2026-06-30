"use client"

import { useState, useEffect, useCallback, Suspense } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion, AnimatePresence } from "framer-motion"
import {
  Search,
  LayoutGrid,
  Table,
  Download,
  ExternalLink,
  X,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from "lucide-react"
import { format } from "date-fns"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { FitScoreRing } from "@/components/jobs/FitScoreRing"
import { getJobs, updateJobStatus, exportJobsCsv } from "@/lib/api"
import {
  JOB_STATUSES,
  STATUS_COLORS,
  COUNTRY_FLAGS,
  type Job,
  type JobStatus,
} from "@/lib/types"
import { toast } from "sonner"
import {
  DndContext,
  DragOverlay,
  closestCorners,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { cn } from "@/lib/utils"

const SCORE_FILTERS = [
  { label: "Any", value: 0 },
  { label: "5+", value: 5 },
  { label: "7+", value: 7 },
  { label: "9+", value: 9 },
]

const COUNTRIES = ["Australia", "New Zealand", "United Kingdom", "United States", "Canada", "India", "Germany", "Singapore"]

// --- Job Detail Sheet ---
function JobDetailSheet({
  job,
  open,
  onClose,
}: {
  job: Job | null
  open: boolean
  onClose: () => void
}) {
  const [selectedStatus, setSelectedStatus] = useState<JobStatus>("🆕 New")
  const [notes, setNotes] = useState("")
  const queryClient = useQueryClient()

  useEffect(() => {
    if (job) {
      setSelectedStatus(job.status as JobStatus)
      setNotes(job.notes ?? "")
    }
  }, [job])

  const mutation = useMutation({
    mutationFn: () => updateJobStatus(job!.id, selectedStatus, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] })
      queryClient.invalidateQueries({ queryKey: ["job-stats"] })
      toast.success("Job updated")
      onClose()
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  if (!job) return null
  const flag = COUNTRY_FLAGS[job.country] ?? "🌍"

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="w-[480px] p-0 overflow-y-auto"
        style={{
          background: "var(--surface)",
          borderLeft: "1px solid var(--border)",
        }}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h2
                className="font-display text-xl leading-tight"
                style={{ color: "var(--text-primary)", fontWeight: 700 }}
              >
                {job.role}
              </h2>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                  {job.company}
                </span>
                <span style={{ color: "var(--border-strong)" }}>·</span>
                <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                  {flag} {job.country}
                </span>
                <Badge
                  variant="outline"
                  className="text-xs"
                  style={{ color: "var(--text-muted)", borderColor: "var(--border)" }}
                >
                  {job.source_portal}
                </Badge>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-[var(--border)] transition-colors shrink-0"
              style={{ color: "var(--text-muted)" }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Fit Score */}
          <div className="flex items-center gap-5">
            <FitScoreRing score={job.fit_score} size="lg" />
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>
                AI Fit Score
              </p>
              <p className="font-display text-2xl" style={{ color: "var(--text-primary)", fontWeight: 700 }}>
                {job.fit_score}<span className="text-sm font-normal" style={{ color: "var(--text-muted)" }}>/10</span>
              </p>
            </div>
          </div>

          {/* AI Reasoning */}
          {job.fit_notes && (
            <div
              className="rounded-xl p-4"
              style={{ background: "var(--ai-light)", border: "1px solid rgba(79,70,229,0.2)" }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Sparkles size={14} style={{ color: "var(--ai-accent)" }} />
                <span className="text-xs font-semibold" style={{ color: "var(--ai-accent)" }}>
                  AI Reasoning
                </span>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {job.fit_notes}
              </p>
            </div>
          )}

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Job Type", value: job.job_type },
              { label: "Remote", value: job.remote_scope },
              { label: "Urgency", value: job.urgency },
              { label: "Date Found", value: format(new Date(job.date_found), "MMM d, yyyy") },
              { label: "Salary", value: job.salary_hint || "Not listed" },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>{label}</p>
                <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{value}</p>
              </div>
            ))}
          </div>

          <Separator style={{ background: "var(--border)" }} />

          {/* Status selector */}
          <div>
            <p className="text-xs font-semibold mb-2.5" style={{ color: "var(--text-muted)" }}>
              STATUS
            </p>
            <div className="flex flex-wrap gap-2">
              {JOB_STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => setSelectedStatus(s)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                    selectedStatus === s
                      ? STATUS_COLORS[s] + " border-current"
                      : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)]"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: "var(--text-muted)" }}>
              NOTES
            </p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Add personal notes..."
              className="w-full px-3 py-2.5 rounded-xl text-sm resize-none outline-none transition-all focus:ring-2 focus:ring-[var(--primary)]"
              style={{
                background: "var(--surface-warm)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
              }}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            {job.direct_link && (
              <a href={job.direct_link} target="_blank" rel="noopener noreferrer" className="flex-1">
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                >
                  <ExternalLink size={14} />
                  Open Listing
                </Button>
              </a>
            )}
            <Button
              className="flex-1 font-semibold"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              style={{ background: "var(--primary)", color: "#fff" }}
            >
              {mutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// --- Table View ---
function TableView({
  jobs,
  onSelectJob,
}: {
  jobs: Job[]
  onSelectJob: (job: Job) => void
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            {["Score", "Role", "Company", "Country", "Remote", "Source", "Date", "Status", ""].map((h) => (
              <th
                key={h}
                className="text-left px-4 py-3 text-xs font-semibold whitespace-nowrap"
                style={{ color: "var(--text-muted)" }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => {
            const flag = COUNTRY_FLAGS[job.country] ?? "🌍"
            const statusColor = STATUS_COLORS[job.status as JobStatus]
            return (
              <tr
                key={job.id}
                onClick={() => onSelectJob(job)}
                className="cursor-pointer transition-colors hover:bg-[var(--surface-warm)]"
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-1.5 rounded-full"
                      style={{
                        width: 40,
                        background: "var(--border)",
                        position: "relative" as const,
                      }}
                    >
                      <div
                        className="h-1.5 rounded-full absolute left-0 top-0"
                        style={{
                          width: `${(job.fit_score / 10) * 100}%`,
                          background: job.fit_score >= 8 ? "#E8734A" : job.fit_score >= 6 ? "#5B8B6E" : "#E8A23A",
                        }}
                      />
                    </div>
                    <span className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>
                      {job.fit_score}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    {job.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                  {job.company}
                </td>
                <td className="px-4 py-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                  {flag} {job.country}
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {job.remote_scope}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className="text-xs px-2 py-0.5 rounded-md"
                    style={{ background: "var(--surface-warm)", color: "var(--text-muted)" }}
                  >
                    {job.source_portal}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                  {format(new Date(job.date_found), "MMM d")}
                </td>
                <td className="px-4 py-3">
                  <span className={cn("text-xs px-2 py-1 rounded-md border font-medium", statusColor)}>
                    {job.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {job.direct_link && (
                    <a
                      href={job.direct_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink size={14} style={{ color: "var(--text-muted)" }} />
                    </a>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// --- Kanban card ---
function KanbanCard({ job, onSelect }: { job: Job; onSelect: (job: Job) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: job.id })
  const flag = COUNTRY_FLAGS[job.country] ?? "🌍"
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => onSelect(job)}
      className="rounded-xl p-3 cursor-grab active:cursor-grabbing select-none"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-sm)",
        opacity: isDragging ? 0.5 : 1,
        transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
      }}
    >
      <p className="text-sm font-semibold leading-tight mb-1" style={{ color: "var(--text-primary)" }}>
        {job.role}
      </p>
      <p className="text-xs mb-2" style={{ color: "var(--text-secondary)" }}>
        {job.company}
      </p>
      <div className="flex items-center justify-between">
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {flag} {job.country}
        </span>
        <span
          className="text-xs px-1.5 py-0.5 rounded-md font-bold"
          style={{
            background: job.fit_score >= 8 ? "var(--primary-light)" : "var(--surface-warm)",
            color: job.fit_score >= 8 ? "var(--primary)" : "var(--text-muted)",
          }}
        >
          {job.fit_score}/10
        </span>
      </div>
      {job.urgency === "🔥 URGENT" && (
        <span
          className="text-xs mt-1.5 inline-block px-1.5 py-0.5 rounded-md"
          style={{ background: "var(--primary-light)", color: "var(--primary)" }}
        >
          🔥 Urgent
        </span>
      )}
    </div>
  )
}

// --- Kanban column ---
function KanbanColumn({
  status,
  jobs,
  onSelect,
}: {
  status: JobStatus
  jobs: Job[]
  onSelect: (job: Job) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const color = STATUS_COLORS[status]

  return (
    <div
      ref={setNodeRef}
      className="flex flex-col min-w-[220px] max-w-[220px] rounded-xl"
      style={{
        background: isOver ? "var(--primary-light)" : "var(--surface-warm)",
        border: `1px solid ${isOver ? "var(--primary)" : "var(--border)"}`,
        transition: "all 0.15s",
      }}
    >
      <div className="px-3 py-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between">
          <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-md border", color)}>
            {status}
          </span>
          <span
            className="text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center"
            style={{ background: "var(--border)", color: "var(--text-muted)" }}
          >
            {jobs.length}
          </span>
        </div>
      </div>
      <div className="p-2 space-y-2 overflow-y-auto" style={{ minHeight: 200, maxHeight: 600 }}>
        {jobs.map((job) => (
          <KanbanCard key={job.id} job={job} onSelect={onSelect} />
        ))}
        {jobs.length === 0 && (
          <div className="py-8 text-center text-xs" style={{ color: "var(--text-muted)" }}>
            Drop here
          </div>
        )}
      </div>
    </div>
  )
}

// --- Main page ---
function JobsBoardInner() {
  const searchParams = useSearchParams()
  const [view, setView] = useState<"table" | "kanban">("table")
  const [search, setSearch] = useState("")
  const [minScore, setMinScore] = useState(0)
  const [statusFilter, setStatusFilter] = useState("")
  const [countryFilter, setCountryFilter] = useState("")
  const [sort, setSort] = useState("created_at_desc")
  const [page, setPage] = useState(1)
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [activeId, setActiveId] = useState<number | null>(null)
  const queryClient = useQueryClient()

  const highlightId = searchParams.get("highlight")

  const { data, isLoading } = useQuery({
    queryKey: ["jobs", { search, minScore, statusFilter, countryFilter, sort, page }],
    queryFn: () =>
      getJobs({
        search,
        min_score: minScore || undefined,
        status: statusFilter || undefined,
        country: countryFilter || undefined,
        sort,
        page,
        per_page: 20,
      }),
  })

  // All jobs for kanban (no pagination)
  const { data: allJobsData } = useQuery({
    queryKey: ["jobs-all-kanban", { search, minScore, statusFilter, countryFilter }],
    queryFn: () =>
      getJobs({
        search,
        min_score: minScore || undefined,
        status: statusFilter || undefined,
        country: countryFilter || undefined,
        per_page: 200,
      }),
    enabled: view === "kanban",
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      updateJobStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] })
      queryClient.invalidateQueries({ queryKey: ["job-stats"] })
    },
  })

  const openJob = useCallback((job: Job) => {
    setSelectedJob(job)
    setSheetOpen(true)
  }, [])

  // Open job if highlight param
  useEffect(() => {
    if (highlightId && data?.jobs) {
      const j = data.jobs.find((j) => j.id === Number(highlightId))
      if (j) openJob(j)
    }
  }, [highlightId, data, openJob])

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as number)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const { active, over } = event
    if (!over) return
    const jobId = active.id as number
    const newStatus = over.id as string
    statusMutation.mutate({ id: jobId, status: newStatus })
  }

  const jobs = data?.jobs ?? []
  const totalPages = data?.total_pages ?? 1
  const total = data?.total ?? 0

  const kanbanJobs = allJobsData?.jobs ?? []
  const jobsByStatus = JOB_STATUSES.reduce<Record<string, Job[]>>((acc, s) => {
    acc[s] = kanbanJobs.filter((j) => j.status === s)
    return acc
  }, {})

  const activeJob = allJobsData?.jobs.find((j) => j.id === activeId)

  const handleExport = async () => {
    try {
      const blob = await exportJobsCsv()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `jobhunter-export-${format(new Date(), "yyyy-MM-dd")}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error("Export failed")
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="px-6 py-4 flex items-center justify-between shrink-0"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)" }}
      >
        <div className="flex items-center gap-3">
          <h2 className="font-display text-lg" style={{ color: "var(--text-primary)", fontWeight: 700 }}>
            Jobs Board
          </h2>
          <span
            className="text-xs px-2 py-0.5 rounded-full font-semibold"
            style={{ background: "var(--primary-light)", color: "var(--primary)" }}
          >
            {total} jobs
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div
            className="flex rounded-lg p-0.5"
            style={{ background: "var(--border)" }}
          >
            {(["table", "kanban"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className="p-1.5 rounded-md transition-all"
                style={{
                  background: view === v ? "var(--surface)" : "transparent",
                  color: view === v ? "var(--text-primary)" : "var(--text-muted)",
                  boxShadow: view === v ? "var(--shadow-sm)" : "none",
                }}
              >
                {v === "table" ? <Table size={15} /> : <LayoutGrid size={15} />}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={handleExport}
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
          >
            <Download size={13} />
            Export
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div
        className="px-6 py-3 flex items-center gap-3 flex-wrap shrink-0"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)" }}
      >
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
          <Input
            placeholder="Search jobs..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-9 h-8 w-48 text-sm"
            style={{ borderColor: "var(--border)", background: "var(--surface-warm)" }}
          />
        </div>

        <Select value={countryFilter || "all"} onValueChange={(v) => { setCountryFilter((v ?? "all") === "all" ? "" : (v ?? "")); setPage(1) }}>
          <SelectTrigger className="h-8 w-36 text-xs" style={{ borderColor: "var(--border)" }}>
            <SelectValue placeholder="All countries" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All countries</SelectItem>
            {COUNTRIES.map((c) => (
              <SelectItem key={c} value={c}>{COUNTRY_FLAGS[c] ?? ""} {c}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Score chips */}
        <div className="flex gap-1">
          {SCORE_FILTERS.map(({ label, value }) => (
            <button
              key={label}
              onClick={() => { setMinScore(value); setPage(1) }}
              className="h-8 px-3 rounded-lg text-xs font-medium transition-all"
              style={{
                background: minScore === value ? "var(--primary)" : "var(--surface-warm)",
                color: minScore === value ? "#fff" : "var(--text-secondary)",
                border: `1px solid ${minScore === value ? "var(--primary)" : "var(--border)"}`,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Status chips */}
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => { setStatusFilter(""); setPage(1) }}
            className="h-8 px-3 rounded-lg text-xs font-medium transition-all"
            style={{
              background: !statusFilter ? "var(--text-primary)" : "var(--surface-warm)",
              color: !statusFilter ? "#fff" : "var(--text-secondary)",
              border: `1px solid ${!statusFilter ? "var(--text-primary)" : "var(--border)"}`,
            }}
          >
            All
          </button>
          {JOB_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => { setStatusFilter(statusFilter === s ? "" : s); setPage(1) }}
              className={cn("h-8 px-3 rounded-lg text-xs font-medium transition-all border", STATUS_COLORS[s])}
              style={{ opacity: statusFilter && statusFilter !== s ? 0.4 : 1 }}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="ml-auto">
          <Select value={sort} onValueChange={(v) => setSort(v ?? "created_at_desc")}>
            <SelectTrigger className="h-8 w-40 text-xs" style={{ borderColor: "var(--border)" }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="created_at_desc">Newest first</SelectItem>
              <SelectItem value="created_at_asc">Oldest first</SelectItem>
              <SelectItem value="fit_score_desc">Highest score</SelectItem>
              <SelectItem value="fit_score_asc">Lowest score</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {view === "table" ? (
          <div>
            {isLoading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-xl" />
                ))}
              </div>
            ) : jobs.length === 0 ? (
              <div className="py-20 text-center">
                <div className="text-5xl mb-4">📭</div>
                <p className="font-display text-lg font-semibold" style={{ color: "var(--text-secondary)" }}>
                  No jobs match your filters
                </p>
                <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                  Try adjusting filters or run the agent to find more
                </p>
              </div>
            ) : (
              <TableView jobs={jobs} onSelectJob={openJob} />
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 py-4" style={{ borderTop: "1px solid var(--border)" }}>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft size={14} />
                </Button>
                <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight size={14} />
                </Button>
              </div>
            )}
          </div>
        ) : (
          <DndContext
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="p-4 flex gap-3 overflow-x-auto min-h-full">
              {JOB_STATUSES.map((status) => (
                <KanbanColumn
                  key={status}
                  status={status}
                  jobs={jobsByStatus[status] ?? []}
                  onSelect={openJob}
                />
              ))}
            </div>
            <DragOverlay>
              {activeJob ? (
                <div
                  className="rounded-xl p-3 shadow-lg"
                  style={{ background: "var(--surface)", border: "1px solid var(--primary)", width: 220 }}
                >
                  <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    {activeJob.role}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    {activeJob.company}
                  </p>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {/* Detail Sheet */}
      <JobDetailSheet
        job={selectedJob}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  )
}

export default function JobsBoardPage() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center"><div className="animate-spin w-6 h-6 rounded-full border-2 border-[var(--primary)] border-t-transparent" /></div>}>
      <JobsBoardInner />
    </Suspense>
  )
}
