"use client"

import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { X, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { getProfile, updateProfile } from "@/lib/api"
import type { Profile } from "@/lib/types"
import { toast } from "sonner"

const SENIORITY_LEVELS = [
  "Junior",
  "Senior",
  "Senior Manager",
  "Director",
  "VP",
  "Executive",
]

const PRESET_COUNTRIES: { code: string; name: string; flag: string }[] = [
  { code: "AU", name: "Australia", flag: "🇦🇺" },
  { code: "NZ", name: "New Zealand", flag: "🇳🇿" },
  { code: "GB", name: "UK", flag: "🇬🇧" },
  { code: "US", name: "USA", flag: "🇺🇸" },
  { code: "CA", name: "Canada", flag: "🇨🇦" },
  { code: "IN", name: "India", flag: "🇮🇳" },
  { code: "DE", name: "Germany", flag: "🇩🇪" },
  { code: "SG", name: "Singapore", flag: "🇸🇬" },
]

function TagInput({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string
  values: string[]
  onChange: (vals: string[]) => void
  placeholder: string
}) {
  const [input, setInput] = useState("")

  function addTag(val: string) {
    const trimmed = val.trim()
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed])
    }
    setInput("")
  }

  function removeTag(tag: string) {
    onChange(values.filter((v) => v !== tag))
  }

  return (
    <div>
      <Label className="text-xs font-semibold mb-2 block" style={{ color: "var(--text-muted)" }}>
        {label}
      </Label>
      <div
        className="flex flex-wrap gap-2 p-3 rounded-xl min-h-[60px]"
        style={{ border: "1px solid var(--border)", background: "var(--surface-warm)" }}
      >
        {values.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium"
            style={{ background: "var(--primary-light)", color: "var(--primary)", border: "1px solid #f0c5b0" }}
          >
            {tag}
            <button onClick={() => removeTag(tag)} className="opacity-60 hover:opacity-100 transition-opacity">
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === ",") && input.trim()) {
              e.preventDefault()
              addTag(input)
            }
          }}
          placeholder={placeholder}
          className="flex-1 min-w-[140px] text-xs bg-transparent outline-none"
          style={{ color: "var(--text-primary)" }}
        />
      </div>
      <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
        Press Enter or comma to add
      </p>
    </div>
  )
}

const SCORE_DESCRIPTIONS: Record<number, string> = {
  1: "Show everything — even weak matches",
  2: "Very low bar",
  3: "Loose matching",
  4: "Below average fit",
  5: "Decent match (recommended minimum)",
  6: "Good fit",
  7: "Strong match",
  8: "Excellent fit",
  9: "Near-perfect match",
  10: "Perfect match only",
}

export default function ProfilePage() {
  const queryClient = useQueryClient()
  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
  })

  const [form, setForm] = useState<Profile>({
    name: "",
    email: "",
    target_roles: [],
    target_countries: [],
    key_skills: [],
    min_seniority: "Senior",
    fit_score_threshold: 5,
    ollama_model: "mistral",
  })

  useEffect(() => {
    if (profile) setForm(profile)
  }, [profile])

  const mutation = useMutation({
    mutationFn: () => updateProfile(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] })
      toast.success("Profile saved")
    },
    onError: (err: Error) => toast.error(err.message),
  })

  function toggleCountry(name: string) {
    setForm((prev) => ({
      ...prev,
      target_countries: prev.target_countries.includes(name)
        ? prev.target_countries.filter((c) => c !== name)
        : [...prev.target_countries, name],
    }))
  }

  if (isLoading) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        {/* Personal Section */}
        <section
          className="rounded-xl p-5"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}
        >
          <h3 className="font-display text-base mb-4" style={{ color: "var(--text-primary)", fontWeight: 700 }}>
            Personal Details
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-semibold mb-1.5 block" style={{ color: "var(--text-muted)" }}>
                FULL NAME
              </Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Your name"
                style={{ borderColor: "var(--border)", background: "var(--surface-warm)" }}
              />
            </div>
            <div>
              <Label className="text-xs font-semibold mb-1.5 block" style={{ color: "var(--text-muted)" }}>
                EMAIL
              </Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                placeholder="you@example.com"
                style={{ borderColor: "var(--border)", background: "var(--surface-warm)" }}
              />
            </div>
          </div>
          <div className="mt-4">
            <Label className="text-xs font-semibold mb-1.5 block" style={{ color: "var(--text-muted)" }}>
              MINIMUM SENIORITY
            </Label>
            <Select value={form.min_seniority} onValueChange={(v) => setForm((p) => ({ ...p, min_seniority: v ?? p.min_seniority }))}>
              <SelectTrigger style={{ borderColor: "var(--border)", background: "var(--surface-warm)" }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SENIORITY_LEVELS.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </section>

        {/* Target Roles */}
        <section
          className="rounded-xl p-5"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}
        >
          <h3 className="font-display text-base mb-4" style={{ color: "var(--text-primary)", fontWeight: 700 }}>
            Target Roles
          </h3>
          <TagInput
            label="ROLES"
            values={form.target_roles}
            onChange={(vals) => setForm((p) => ({ ...p, target_roles: vals }))}
            placeholder="e.g. AI Strategy Lead..."
          />
        </section>

        {/* Target Countries */}
        <section
          className="rounded-xl p-5"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}
        >
          <h3 className="font-display text-base mb-4" style={{ color: "var(--text-primary)", fontWeight: 700 }}>
            Target Countries
          </h3>
          <div className="grid grid-cols-4 gap-2 mb-3">
            {PRESET_COUNTRIES.map(({ name, flag }) => {
              const selected = form.target_countries.includes(name)
              return (
                <button
                  key={name}
                  onClick={() => toggleCountry(name)}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl text-center transition-all"
                  style={{
                    background: selected ? "var(--primary-light)" : "var(--surface-warm)",
                    border: `1px solid ${selected ? "var(--primary)" : "var(--border)"}`,
                    color: selected ? "var(--primary)" : "var(--text-muted)",
                  }}
                >
                  <span className="text-xl">{flag}</span>
                  <span className="text-xs font-medium leading-tight">{name}</span>
                </button>
              )
            })}
          </div>
          {/* Custom countries */}
          <TagInput
            label="CUSTOM COUNTRIES"
            values={form.target_countries.filter(
              (c) => !PRESET_COUNTRIES.map((p) => p.name).includes(c)
            )}
            onChange={(custom) => {
              const preset = form.target_countries.filter((c) =>
                PRESET_COUNTRIES.map((p) => p.name).includes(c)
              )
              setForm((p) => ({ ...p, target_countries: [...preset, ...custom] }))
            }}
            placeholder="Add another country..."
          />
        </section>

        {/* Key Skills */}
        <section
          className="rounded-xl p-5"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}
        >
          <h3 className="font-display text-base mb-4" style={{ color: "var(--text-primary)", fontWeight: 700 }}>
            Key Skills
          </h3>
          <TagInput
            label="SKILLS"
            values={form.key_skills}
            onChange={(vals) => setForm((p) => ({ ...p, key_skills: vals }))}
            placeholder="e.g. LangGraph, Prompt Engineering..."
          />
        </section>

        {/* Fit Score Threshold */}
        <section
          className="rounded-xl p-5"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}
        >
          <h3 className="font-display text-base mb-1" style={{ color: "var(--text-primary)", fontWeight: 700 }}>
            Fit Score Threshold
          </h3>
          <p className="text-xs mb-5" style={{ color: "var(--text-muted)" }}>
            Jobs below this score won&apos;t be saved
          </p>

          <div className="flex items-center gap-4 mb-3">
            <span
              className="text-3xl font-display font-800 shrink-0"
              style={{ color: "var(--primary)", minWidth: 32 }}
            >
              {form.fit_score_threshold}
            </span>
            <div className="flex-1">
              <Slider
                min={1}
                max={10}
                step={1}
                value={[form.fit_score_threshold]}
                onValueChange={(vals) => {
                  const v = Array.isArray(vals) ? vals[0] : vals
                  if (typeof v === "number") setForm((p) => ({ ...p, fit_score_threshold: v }))
                }}
              />
            </div>
            <span className="text-xs shrink-0" style={{ color: "var(--text-muted)" }}>10</span>
          </div>

          <div
            className="px-3 py-2.5 rounded-lg text-sm"
            style={{
              background: "var(--primary-light)",
              color: "var(--text-secondary)",
              border: "1px solid #f0c5b0",
            }}
          >
            {SCORE_DESCRIPTIONS[form.fit_score_threshold] ?? ""}
          </div>
        </section>

        {/* Save */}
        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={() => profile && setForm(profile)}
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
          >
            Reset
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="px-6 font-semibold"
            style={{ background: "var(--primary)", color: "#fff" }}
          >
            {mutation.isPending ? "Saving..." : "Save Profile"}
          </Button>
        </div>
      </motion.div>
    </div>
  )
}
