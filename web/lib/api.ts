import type { Job, JobStats, RunRecord, Profile, Settings } from "@/lib/types"

const BASE = "http://localhost:8000/api"

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    let message = `API error ${res.status}`
    try {
      const body = await res.json()
      message = body.detail || body.message || message
    } catch {
      // ignore parse error
    }
    throw new Error(message)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

// --- Jobs ---

export interface GetJobsParams {
  status?: string
  country?: string
  min_score?: number
  search?: string
  sort?: string
  page?: number
  per_page?: number
}

export interface JobsResponse {
  jobs: Job[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

export async function getJobs(params?: GetJobsParams): Promise<JobsResponse> {
  const qs = new URLSearchParams()
  if (params?.status) qs.set("status", params.status)
  if (params?.country) qs.set("country", params.country)
  if (params?.min_score !== undefined) qs.set("min_score", String(params.min_score))
  if (params?.search) qs.set("search", params.search)
  if (params?.sort) qs.set("sort", params.sort)
  if (params?.page) qs.set("page", String(params.page))
  if (params?.per_page) qs.set("per_page", String(params.per_page))
  const query = qs.toString()
  return apiFetch<JobsResponse>(`/jobs${query ? `?${query}` : ""}`)
}

export async function getJobStats(): Promise<JobStats> {
  return apiFetch<JobStats>("/jobs/stats")
}

export async function getJob(id: number): Promise<Job> {
  return apiFetch<Job>(`/jobs/${id}`)
}

export async function updateJobStatus(
  id: number,
  status: string,
  notes?: string
): Promise<Job> {
  return apiFetch<Job>(`/jobs/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status, notes }),
  })
}

export async function addJob(data: Partial<Job>): Promise<Job> {
  return apiFetch<Job>("/jobs", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export async function deleteJob(id: number): Promise<void> {
  return apiFetch<void>(`/jobs/${id}`, { method: "DELETE" })
}

export async function exportJobsCsv(): Promise<Blob> {
  const res = await fetch(`${BASE}/jobs/export`, {
    headers: { Accept: "text/csv" },
  })
  if (!res.ok) throw new Error("Export failed")
  return res.blob()
}

// --- Runs ---

export interface StartRunOptions {
  dry_run?: boolean
  queries_override?: string[]
}

export interface StartRunResult {
  run_id: string
  started_at: string
}

export interface ActiveRun {
  active: boolean
  run_id: string | null
  rate_limit: {
    runs_this_hour: number
    max_per_hour: number
    cooldown_seconds: number
  }
}

export async function getRunHistory(): Promise<RunRecord[]> {
  return apiFetch<RunRecord[]>("/runs/history")
}

export async function getActiveRun(): Promise<ActiveRun | null> {
  try {
    return await apiFetch<ActiveRun>("/runs/active")
  } catch {
    return null
  }
}

export async function startRun(options?: StartRunOptions): Promise<StartRunResult> {
  return apiFetch<StartRunResult>("/runs/start", {
    method: "POST",
    body: JSON.stringify(options ?? {}),
  })
}

export async function cancelRun(runId: string): Promise<void> {
  return apiFetch<void>(`/runs/${runId}/cancel`, { method: "POST" })
}

// --- Profile ---

export async function getProfile(): Promise<Profile> {
  return apiFetch<Profile>("/profile")
}

export async function updateProfile(data: Partial<Profile>): Promise<Profile> {
  return apiFetch<Profile>("/profile", {
    method: "PUT",
    body: JSON.stringify(data),
  })
}

// --- Settings ---

export async function getSettings(): Promise<Settings> {
  return apiFetch<Settings>("/settings")
}

export async function updateSettings(data: Partial<Settings>): Promise<Settings> {
  return apiFetch<Settings>("/settings", {
    method: "PUT",
    body: JSON.stringify(data),
  })
}

export async function addSearchQuery(query: string): Promise<Settings> {
  return apiFetch<Settings>("/settings/queries", {
    method: "POST",
    body: JSON.stringify({ query }),
  })
}

export async function deleteSearchQuery(index: number): Promise<Settings> {
  return apiFetch<Settings>(`/settings/queries/${index}`, { method: "DELETE" })
}

export async function clearAllJobs(): Promise<{ deleted: number }> {
  return apiFetch<{ deleted: number }>("/jobs/all", { method: "DELETE" })
}

// --- Portals ---

export interface Portal {
  name: string
  enabled: boolean
}

export async function getPortals(): Promise<Portal[]> {
  const res = await apiFetch<{ portals: Portal[] }>("/settings/portals")
  return res.portals
}

export async function updatePortals(portals: Record<string, boolean>): Promise<Portal[]> {
  const res = await apiFetch<{ portals: Portal[] }>("/settings/portals", {
    method: "PUT",
    body: JSON.stringify({ portals }),
  })
  return res.portals
}
