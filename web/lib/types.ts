export type JobStatus =
  | "🆕 New"
  | "⏳ Reviewing"
  | "📤 Applied"
  | "🎤 Interview"
  | "✅ Offer"
  | "❌ Pass"

export type RemoteScope =
  | "🌍 Globally Remote"
  | "🌏 Anywhere in AU"
  | "🇳🇿 NZ Remote"
  | "🌐 Remote UK"
  | "🌐 Remote US"
  | "🌐 Remote"
  | "❓ Check listing"

export type Urgency = "🔥 URGENT" | "⚡ Active"

export interface Job {
  id: number
  role: string
  company: string
  country: string
  job_type: string
  remote_scope: RemoteScope
  source_portal: string
  date_found: string
  urgency: Urgency
  fit_score: number
  status: JobStatus
  salary_hint: string
  fit_notes: string
  direct_link: string
  notes: string
  created_at: string
}

export interface JobStats {
  total: number
  by_status: Record<string, number>
  by_country: Record<string, number>
  by_score_bucket: Record<string, number>
}

export interface RunRecord {
  id: number
  run_id: string
  run_date: string
  duration_secs: number
  queries_run: number
  raw_results: number
  parsed_ok: number
  new_added: number
  dupes_skipped: number
  top_jobs: string[]
  summary: string
  created_at: string
}

export interface Profile {
  name: string
  email: string
  target_roles: string[]
  target_countries: string[]
  key_skills: string[]
  min_seniority: string
  fit_score_threshold: number
  ollama_model: string
}

export interface RunEvent {
  type: "log" | "job" | "complete" | "error"
  payload: string | Job
}

export interface PipelineNode {
  id: string
  label: string
  icon: string
  status: "idle" | "running" | "complete" | "error"
  count?: number
  detail?: string
}

export interface SearchQuery {
  query: string
  enabled: boolean
}

export interface Settings {
  search_queries: SearchQuery[]
  ai_model: string
  portals: Record<string, boolean>
  min_fit_score: number
}

export const JOB_STATUSES: JobStatus[] = [
  "🆕 New",
  "⏳ Reviewing",
  "📤 Applied",
  "🎤 Interview",
  "✅ Offer",
  "❌ Pass",
]

export const STATUS_COLORS: Record<JobStatus, string> = {
  "🆕 New": "bg-blue-50 text-blue-700 border-blue-200",
  "⏳ Reviewing": "bg-amber-50 text-amber-700 border-amber-200",
  "📤 Applied": "bg-violet-50 text-violet-700 border-violet-200",
  "🎤 Interview": "bg-green-50 text-green-700 border-green-200",
  "✅ Offer": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "❌ Pass": "bg-gray-50 text-gray-500 border-gray-200",
}

export const COUNTRY_FLAGS: Record<string, string> = {
  Australia: "🇦🇺",
  "New Zealand": "🇳🇿",
  "United Kingdom": "🇬🇧",
  UK: "🇬🇧",
  "United States": "🇺🇸",
  USA: "🇺🇸",
  Canada: "🇨🇦",
  India: "🇮🇳",
  Germany: "🇩🇪",
  Singapore: "🇸🇬",
  Remote: "🌍",
  Global: "🌍",
}
