"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import {
  getSettings,
  updateSettings,
  addSearchQuery,
  deleteSearchQuery,
  exportJobsCsv,
  clearAllJobs,
  getPortals,
  updatePortals,
} from "@/lib/api"
import type { Portal } from "@/lib/api"
import type { Settings } from "@/lib/types"
import { toast } from "sonner"
import { format } from "date-fns"
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  useSortable,
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

const AI_MODELS = [
  {
    id: "mistral",
    name: "Mistral 7B",
    badge: "Recommended",
    description: "Fast, local, great for structured extraction. Best balance of speed and quality.",
    badgeColor: "var(--primary)",
  },
  {
    id: "qwen3:4b",
    name: "Qwen3 4B",
    badge: "Compact",
    description: "Smaller model, faster inference. Good if resources are limited.",
    badgeColor: "var(--success)",
  },
  {
    id: "claude-api",
    name: "Claude API",
    badge: "Cloud",
    description: "Anthropic Claude via API. Highest quality but requires API key and has costs.",
    badgeColor: "var(--ai-accent)",
  },
]

const PORTALS = [
  { id: "linkedin", name: "LinkedIn Jobs", icon: "💼" },
  { id: "seek", name: "SEEK", icon: "🔍" },
  { id: "indeed", name: "Indeed", icon: "🏢" },
  { id: "remote_ok", name: "Remote OK", icon: "🌍" },
  { id: "we_work_remotely", name: "We Work Remotely", icon: "💻" },
  { id: "jobsdb", name: "JobsDB", icon: "🗂️" },
]

// --- Sortable query item ---
function SortableQueryItem({
  query,
  index,
  onDelete,
}: {
  query: string
  index: number
  onDelete: (i: number) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: index,
  })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-sm)",
      }}
      className="flex items-center gap-3 px-4 py-3 rounded-xl"
    >
      <span
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing select-none text-sm leading-none"
        style={{ color: "var(--text-muted)" }}
      >
        ⠿
      </span>
      <span className="flex-1 text-sm" style={{ color: "var(--text-primary)" }}>
        {query}
      </span>
      <button
        onClick={() => onDelete(index)}
        className="p-1.5 rounded-lg transition-colors hover:bg-red-50"
        style={{ color: "var(--text-muted)" }}
      >
        ×
      </button>
    </div>
  )
}

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const [newQuery, setNewQuery] = useState("")
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [confirmText, setConfirmText] = useState("")

  const { data: settings, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  })

  const { data: portals } = useQuery({
    queryKey: ["portals"],
    queryFn: getPortals,
  })

  const updateMutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] })
      toast.success("Settings saved")
    },
    onError: (err: Error) => toast.error(err.message),
  })

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

  const clearMutation = useMutation({
    mutationFn: clearAllJobs,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] })
      queryClient.invalidateQueries({ queryKey: ["job-stats"] })
      setClearDialogOpen(false)
      setConfirmText("")
      toast.success("All jobs cleared")
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const portalMutation = useMutation({
    mutationFn: (payload: Record<string, boolean>) => updatePortals(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["portals"] }),
    onError: (err: Error) => toast.error(err.message),
  })

  function handlePortalToggle(portalName: string, enabled: boolean) {
    portalMutation.mutate({ [portalName]: enabled })
  }

  function handleModelChange(modelId: string) {
    updateMutation.mutate({ ollama_model: modelId })
  }

  async function handleExport() {
    try {
      const blob = await exportJobsCsv()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `jobhunter-export-${format(new Date(), "yyyy-MM-dd")}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success("Export started")
    } catch {
      toast.error("Export failed")
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !settings) return
    const oldIndex = active.id as number
    const newIndex = over.id as number
    const reordered = arrayMove(settings.search_queries, oldIndex, newIndex)
    updateMutation.mutate({ search_queries: reordered })
  }

  if (isLoading) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    )
  }

  const queries = settings?.search_queries ?? []

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Tabs defaultValue="queries">
        <TabsList
          className="mb-6 p-1 h-auto"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          {["Search Queries", "AI Model", "Portals", "Danger Zone"].map((tab) => (
            <TabsTrigger
              key={tab}
              value={tab.toLowerCase().replace(" ", "-")}
              className="text-sm px-4 py-2 rounded-lg data-[state=active]:shadow-sm"
              style={{
                color: "var(--text-secondary)",
              }}
            >
              {tab}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Search Queries */}
        <TabsContent value="search-queries">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div
              className="rounded-xl p-5"
              style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}
            >
              <h3 className="font-display text-base mb-1" style={{ color: "var(--text-primary)", fontWeight: 700 }}>
                Search Queries
              </h3>
              <p className="text-xs mb-5" style={{ color: "var(--text-muted)" }}>
                The agent runs all enabled queries on each job search cycle. Drag to reorder.
              </p>

              <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext
                  items={queries.map((_, i) => i)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2 mb-4">
                    {queries.map((q, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl"
                        style={{
                          background: "var(--surface-warm)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        <span className="text-sm leading-none select-none" style={{ color: "var(--text-muted)", cursor: "grab" }}>⠿</span>
                        <span className="flex-1 text-sm" style={{ color: "var(--text-primary)" }}>
                          {q.query}
                        </span>
                        <Switch
                          checked={q.enabled}
                          onCheckedChange={(v) => {
                            const updated = queries.map((item, idx) =>
                              idx === i ? { ...item, enabled: v } : item
                            )
                            updateMutation.mutate({ search_queries: updated })
                          }}
                          className="scale-90"
                        />
                        <button
                          onClick={() => deleteQueryMutation.mutate(i)}
                          className="p-1.5 rounded-lg transition-colors hover:bg-red-50"
                          style={{ color: "var(--text-muted)" }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </SortableContext>
              </DndContext>

              {/* Add new */}
              <div className="flex gap-2">
                <Input
                  placeholder="New search query..."
                  value={newQuery}
                  onChange={(e) => setNewQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newQuery.trim()) {
                      addQueryMutation.mutate(newQuery.trim())
                    }
                  }}
                  style={{ borderColor: "var(--border)", background: "var(--surface-warm)" }}
                />
                <Button
                  onClick={() => newQuery.trim() && addQueryMutation.mutate(newQuery.trim())}
                  style={{ background: "var(--primary)", color: "#fff" }}
                >
                  Add
                </Button>
              </div>
            </div>
          </motion.div>
        </TabsContent>

        {/* AI Model */}
        <TabsContent value="ai-model">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div
              className="rounded-xl p-5"
              style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}
            >
              <h3 className="font-display text-base mb-1" style={{ color: "var(--text-primary)", fontWeight: 700 }}>
                AI Model
              </h3>
              <p className="text-xs mb-5" style={{ color: "var(--text-muted)" }}>
                Choose the model used to parse job listings and score fit. Changing this takes effect on the next run.
              </p>

              <div className="space-y-3">
                {AI_MODELS.map((model) => {
                  const selected = settings?.ollama_model === model.id
                  return (
                    <button
                      key={model.id}
                      onClick={() => handleModelChange(model.id)}
                      className="w-full text-left flex items-start gap-4 p-4 rounded-xl transition-all"
                      style={{
                        border: `2px solid ${selected ? model.badgeColor : "var(--border)"}`,
                        background: selected ? model.badgeColor + "0f" : "var(--surface-warm)",
                      }}
                    >
                      <div
                        className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5"
                        style={{
                          borderColor: selected ? model.badgeColor : "var(--border)",
                          background: selected ? model.badgeColor : "transparent",
                        }}
                      >
                        {selected && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                            {model.name}
                          </span>
                          <span
                            className="text-xs px-1.5 py-0.5 rounded-md font-medium"
                            style={{ background: model.badgeColor + "20", color: model.badgeColor }}
                          >
                            {model.badge}
                          </span>
                        </div>
                        <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
                          {model.description}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </motion.div>
        </TabsContent>

        {/* Portals */}
        <TabsContent value="portals">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div
              className="rounded-xl p-5"
              style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}
            >
              <h3 className="font-display text-base mb-1" style={{ color: "var(--text-primary)", fontWeight: 700 }}>
                Job Portals
              </h3>
              <p className="text-xs mb-5" style={{ color: "var(--text-muted)" }}>
                Toggle which job portals the agent searches. Disabled portals are skipped.
              </p>

              <div className="space-y-2">
                {(portals ?? PORTALS.map((p) => ({ name: p.id, enabled: true }))).map((portal) => {
                  const meta = PORTALS.find((p) => portal.name.includes(p.id)) ?? { icon: "🔗", name: portal.name }
                  return (
                    <div
                      key={portal.name}
                      className="flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all"
                      style={{
                        background: portal.enabled ? "var(--primary-light)" : "var(--surface-warm)",
                        border: `1px solid ${portal.enabled ? "var(--primary)" : "var(--border)"}`,
                      }}
                    >
                      <span className="text-lg shrink-0">{meta.icon}</span>
                      <span className="flex-1 text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                        {portal.name}
                      </span>
                      <Switch
                        checked={portal.enabled}
                        onCheckedChange={(v) => handlePortalToggle(portal.name, v)}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          </motion.div>
        </TabsContent>

        {/* Danger Zone */}
        <TabsContent value="danger-zone">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            {/* Export */}
            <div
              className="rounded-xl p-5"
              style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-display text-base mb-1" style={{ color: "var(--text-primary)", fontWeight: 700 }}>
                    Export All Jobs
                  </h3>
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                    Download all jobs as a CSV file with all fields
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={handleExport}
                  className="gap-2 shrink-0"
                  style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                >
                  Export CSV
                </Button>
              </div>
            </div>

            {/* Clear all */}
            <div
              className="rounded-xl p-5"
              style={{ background: "#FFF5F5", border: "1px solid #FECDD3", boxShadow: "var(--shadow-sm)" }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-sm" style={{ color: "#C53030", letterSpacing: "-0.02em" }}>
                      Clear All Jobs
                    </h3>
                  </div>
                  <p className="text-sm" style={{ color: "#E05252" }}>
                    Permanently deletes all job records from the database. This cannot be undone.
                  </p>
                </div>
                <Button
                  onClick={() => setClearDialogOpen(true)}
                  className="gap-2 shrink-0"
                  style={{ background: "#E85A4A", color: "#fff" }}
                >
                  Clear All
                </Button>
              </div>
            </div>
          </motion.div>
        </TabsContent>
      </Tabs>

      {/* Clear confirmation dialog */}
      <Dialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <DialogContent style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <DialogHeader>
            <DialogTitle style={{ color: "var(--text-primary)" }}>
              Clear all jobs?
            </DialogTitle>
            <DialogDescription style={{ color: "var(--text-muted)" }}>
              This will permanently delete all job records. This action cannot be undone.
              <br /><br />
              Type <strong>DELETE</strong> to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Type DELETE to confirm"
            style={{ borderColor: "#FECDD3", background: "#FFF5F5" }}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setClearDialogOpen(false); setConfirmText("") }}
              style={{ borderColor: "var(--border)" }}
            >
              Cancel
            </Button>
            <Button
              disabled={confirmText !== "DELETE" || clearMutation.isPending}
              onClick={() => clearMutation.mutate()}
              style={{ background: "#E85A4A", color: "#fff" }}
            >
              {clearMutation.isPending ? "Clearing..." : "Yes, clear all"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
