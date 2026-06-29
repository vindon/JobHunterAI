# JobHunterAI — Design System

## Design Principles

**1. Warm, not clinical**
Job hunting is emotionally exhausting. The tool should feel like a supportive companion, not a cold enterprise dashboard. Every colour and typography choice reinforces warmth and humanity.

**2. Transparent AI**
The AI reasoning (fit notes, score, why a job was ranked the way it was) is always visible. We never hide that AI made a decision — we show the reasoning so the user can verify and override it.

**3. Focused**
One thing per page. No information overload. The Dashboard gives you the daily summary. The Jobs Board gives you the list. The Run Agent page shows you what's happening. No modal soup.

**4. Progress visible**
A job seeker needs to feel momentum. The pipeline visualiser, fit score rings, and Kanban board are all designed around making progress feel real and tangible.

**5. Purposeful motion**
Animations serve a function: the pipeline nodes lighting up tells you *where* the agent is; the Kanban card spring tells you *that* the card moved successfully. No animation purely for decoration.

---

## Colour Palette

The palette is built around terracotta (action, warmth, AI presence) and cream/warm white (content areas), with structured greys for text hierarchy and green/amber/red for semantic states.

### Primary

| Name | Hex | Usage |
|------|-----|-------|
| `terracotta-500` | `#C17B4E` | Primary action buttons, active pipeline nodes, fit score ring foreground |
| `terracotta-400` | `#D4956D` | Hover states, active tab indicators |
| `terracotta-600` | `#A36038` | Pressed states, darker badges |
| `terracotta-100` | `#F5E8DF` | Tinted card backgrounds, score ring track, tag backgrounds |
| `terracotta-50` | `#FAF3EE` | Subtle section highlights |

### Neutral / Surface

| Name | Hex | Usage |
|------|-----|-------|
| `cream-50` | `#FDFAF7` | Page background |
| `cream-100` | `#F7F2EC` | Card backgrounds, sidebar background |
| `warm-gray-200` | `#E8E2DA` | Card borders, dividers, table row separators |
| `warm-gray-400` | `#B8AFA6` | Placeholder text, disabled states |
| `warm-gray-600` | `#7A6F67` | Secondary text, metadata labels |
| `warm-gray-800` | `#3D3531` | Primary body text |
| `warm-gray-950` | `#1A1512` | Headings |

### Semantic

| Name | Hex | Usage |
|------|-----|-------|
| `score-high` | `#22C55E` | Fit score 8–10 (green) |
| `score-mid` | `#F59E0B` | Fit score 5–7 (amber) |
| `score-low` | `#EF4444` | Fit score 0–4 (red) |
| `status-new` | `#6366F1` | "New" status badge (indigo) |
| `status-applied` | `#3B82F6` | "Applied" status badge (blue) |
| `status-interview` | `#A855F7` | "Interview" status badge (purple) |
| `status-offer` | `#22C55E` | "Offer" status badge (green) |
| `status-pass` | `#9CA3AF` | "Pass" status badge (grey) |
| `urgent` | `#EF4444` | URGENT badge background |
| `active` | `#10B981` | Active/running pipeline node |

### Dark mode

Dark mode uses the same hue family but inverted:
- Background: `#1C1714` (very dark terracotta-tinted)
- Card: `#252019`
- Border: `#3A322C`
- Primary text: `#F0EBE5`
- Terracotta primary: unchanged (works on dark backgrounds)

---

## Typography

Three font families, each with a distinct role.

### Plus Jakarta Sans — Display and headings

Used for: page titles, card headings, stat numbers, hero text.

```css
font-family: 'Plus Jakarta Sans', sans-serif;
```

| Role | Size | Weight | Line height |
|------|------|--------|-------------|
| Page title (H1) | 30px / 1.875rem | 700 | 1.2 |
| Section heading (H2) | 24px / 1.5rem | 600 | 1.3 |
| Card heading (H3) | 18px / 1.125rem | 600 | 1.4 |
| Stat number | 36px / 2.25rem | 700 | 1.0 |
| Stat label | 13px / 0.8125rem | 500 | 1.4 |

### Inter — Body text and UI

Used for: body copy, table cells, form labels, buttons, metadata.

```css
font-family: 'Inter', sans-serif;
```

| Role | Size | Weight | Line height |
|------|------|--------|-------------|
| Body / table cell | 14px / 0.875rem | 400 | 1.6 |
| UI label | 13px / 0.8125rem | 500 | 1.5 |
| Button text | 14px / 0.875rem | 500 | 1.0 |
| Caption / timestamp | 12px / 0.75rem | 400 | 1.5 |
| Fit notes | 13px / 0.8125rem | 400 | 1.6 |

### JetBrains Mono — Log output and code

Used for: the streaming log panel on the Run Agent page, run IDs, LangSmith URLs.

```css
font-family: 'JetBrains Mono', monospace;
```

| Role | Size | Weight |
|------|------|--------|
| Log line (info) | 12px | 400 |
| Log line (warning) | 12px | 400 (amber colour) |
| Log line (error) | 12px | 400 (red colour) |
| Node name in log | 12px | 600 |
| Run ID | 11px | 500 |

### Loading fonts

```tsx
// app/layout.tsx — Next.js font optimisation
import { Plus_Jakarta_Sans, Inter, JetBrains_Mono } from 'next/font/google'

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta' })
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' })
```

---

## Spacing Scale

Based on a 4px base unit. Components snap to multiples of 4.

| Token | Value | Usage |
|-------|-------|-------|
| `space-1` | 4px | Icon padding, tight gaps |
| `space-2` | 8px | Badge padding, compact list gaps |
| `space-3` | 12px | Button padding (vertical), form field inner padding |
| `space-4` | 16px | Card padding, section gaps |
| `space-5` | 20px | Standard section padding |
| `space-6` | 24px | Large gaps between cards |
| `space-8` | 32px | Page section spacing |
| `space-10` | 40px | Page top padding |
| `space-12` | 48px | Large layout gaps |
| `space-16` | 64px | Max content width padding |

---

## Component Patterns

### Card

The base content container. Warm white background, subtle border, gentle shadow.

```tsx
// Usage
<Card className="p-4 rounded-xl border border-warm-gray-200 bg-cream-100 shadow-sm">
  {children}
</Card>
```

- Background: `cream-100` (#F7F2EC)
- Border: `warm-gray-200` (#E8E2DA), 1px solid
- Border radius: `0.75rem` (12px)
- Shadow: `0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03)`
- Hover (clickable cards): shadow increases to `0 4px 12px rgba(0,0,0,0.08)`, `translateY(-1px)`, 150ms ease

### Badge

Small label pill for job type, remote scope, country.

- Size: auto-width, 20px height, 6px horizontal padding
- Font: Inter 11px, weight 500
- Border radius: 999px (fully rounded)
- Variants by context:

| Variant | Background | Text |
|---------|-----------|------|
| `job-type` | `terracotta-100` | `terracotta-600` |
| `remote` | `#E8F5E9` | `#2E7D32` |
| `country` | `#EEF2FF` | `#3730A3` |
| `urgent` | `#FEE2E2` | `#B91C1C` |

### FitScoreRing

Circular SVG progress ring showing the fit score visually.

- Sizes: `sm` (28px), `md` (40px), `lg` (56px)
- Foreground colour: `score-high` (8–10), `score-mid` (5–7), `score-low` (0–4)
- Track colour: `terracotta-100`
- Number centred in ring: Plus Jakarta Sans, bold
- Animation: ring fills on mount with a spring (stiffness 100, damping 15)

```tsx
<FitScoreRing score={8} size="md" />
// Renders 40px ring, 80% filled, green
```

### StatusBadge

Shows the application pipeline status with an emoji and colour.

| Status | Emoji | Background | Text |
|--------|-------|-----------|------|
| New | 🆕 | `#EEF2FF` | `#3730A3` |
| Reviewing | ⏳ | `#FEF3C7` | `#92400E` |
| Applied | 📤 | `#DBEAFE` | `#1E40AF` |
| Interview | 🎤 | `#F3E8FF` | `#6B21A8` |
| Offer | ✅ | `#DCFCE7` | `#15803D` |
| Pass | ❌ | `#F3F4F6` | `#6B7280` |

### PipelineNode

Used in the Run Agent page pipeline visualiser. Each of the 6 nodes (Plan, Search, Parse, Rank, Write, Report) is displayed as a box.

States:
- **idle** — background `warm-gray-200`, text `warm-gray-600`, no border
- **active** — background `terracotta-100`, border 2px `terracotta-500`, text `terracotta-600`, pulsing ring animation
- **complete** — background `#DCFCE7`, border 1px `#86EFAC`, text `#15803D`, checkmark icon
- **error** — background `#FEE2E2`, border 1px `#FCA5A5`, text `#B91C1C`, X icon

Animation between states: Framer Motion `layout` prop, `AnimatePresence` for smooth transitions.

---

## Page Layouts

### Dashboard (`/`)

```
┌────────────────────────────────────────────────────────┐
│  Sidebar (240px, sticky)     │  Main content            │
│                              │                          │
│  [Logo + name]               │  Page title + last run   │
│                              │                          │
│  Navigation                  │  StatsGrid (2×2)         │
│  · Dashboard                 │  ┌──────┐ ┌──────┐      │
│  · Jobs Board                │  │ New  │ │Appld │      │
│  · Run Agent                 │  └──────┘ └──────┘      │
│  · Settings                  │  ┌──────┐ ┌──────┐      │
│                              │  │Intrvw│ │ Avg  │      │
│  Run status                  │  └──────┘ └──────┘      │
│  (last run time)             │                          │
│                              │  ScoreDistribution       │
│                              │  (bar chart, Recharts)   │
│                              │                          │
│                              │  Recent Jobs (top 5)     │
│                              │                          │
│                              │  Run History (table)     │
└──────────────────────────────┴──────────────────────────┘
```

### Jobs Board (`/jobs`)

```
┌────────────────────────────────────────────────────────┐
│  Sidebar (240px)             │  Main content            │
│                              │                          │
│                              │  FilterBar               │
│                              │  [search][country][type] │
│                              │  [score range slider]    │
│                              │                          │
│                              │  ViewToggle [Table|Board]│
│                              │                          │
│                              │  ┌──── Table View ────┐  │
│                              │  │ Role | Co | Score  │  │
│                              │  │ ...  | .. | ●●●○○  │  │
│                              │  └────────────────────┘  │
│                              │       OR                  │
│                              │  ┌──── Kanban View ───┐  │
│                              │  │ New│Applied│Intrvw │  │
│                              │  │ 🎴  │  🎴   │  🎴  │  │
│                              │  └────────────────────┘  │
└──────────────────────────────┴──────────────────────────┘
```

### Run Agent (`/run`)

Three-panel layout:

```
┌────────────────────────────────────────────────────────┐
│  Sidebar (240px)  │  Panel 1 (30%)  │  Panel 2 (70%)  │
│                   │                 │                  │
│                   │  Pipeline       │  [Logs] [Results]│
│                   │                 │                  │
│                   │  ┌──────────┐   │  Log stream:     │
│                   │  │  Plan ✓  │   │  08:00:01 INFO   │
│                   │  └────┬─────┘   │  SEARCH: query 1 │
│                   │       │         │  08:00:08 INFO   │
│                   │  ┌────▼─────┐   │  PARSE: 15 items │
│                   │  │ Search ● │   │  ...             │
│                   │  └────┬─────┘   │                  │
│                   │       │         │  Results tab:    │
│                   │  ┌────▼─────┐   │  ┌────────────┐ │
│                   │  │  Parse   │   │  │ Head of AI │ │
│                   │  └──────────┘   │  │ 8/10  🌍   │ │
│                   │  ...            │  └────────────┘ │
│                   │                 │  (appear live)   │
└───────────────────┴─────────────────┴──────────────────┘
```

---

## Animation Principles

**Spring physics (not duration-based)**
All interactive animations use Framer Motion's spring physics rather than `ease` curves. This makes motion feel physical and intentional.

Recommended spring presets:
```tsx
// Snappy — button press, card hover
{ type: 'spring', stiffness: 400, damping: 30 }

// Gentle — page transitions, panel slides
{ type: 'spring', stiffness: 100, damping: 20 }

// Elastic — FitScoreRing fill, Kanban card drop
{ type: 'spring', stiffness: 80, damping: 12 }
```

**Purposeful only**
Every animation communicates state. The pipeline node pulsing ring communicates "this is running". The Kanban card spring communicates "it landed". Page transitions communicate navigation direction. Nothing animates for decoration.

**Reduced motion**
All animations MUST be wrapped with `useReducedMotion()` from Framer Motion. When reduced motion is preferred:
- Duration: set to 0ms
- Springs: replaced with instant transitions
- No fades (use instant show/hide)

```tsx
const prefersReduced = useReducedMotion()
const animation = prefersReduced ? {} : { scale: [1, 0.95, 1] }
```

**Log stream**
New log lines appear with a fade-in only (`opacity: 0 → 1`, 100ms linear). No vertical slide — this keeps the auto-scroll feel smooth when many lines arrive quickly.

---

## Accessibility Notes

- **Colour contrast:** All text on background combinations meet WCAG AA (4.5:1 for normal text, 3:1 for large text). Score colours (green/amber/red) are supplemented with numeric text — colour alone does not convey the score value.
- **Focus indicators:** All interactive elements have a 2px terracotta-500 outline on focus (not `outline: none`)
- **ARIA labels:** FitScoreRing includes `aria-label="Fit score: 8 out of 10"`. StatusBadge includes `aria-label="Status: Applied"`. PipelineNode includes `aria-live="polite"` when state changes.
- **Keyboard navigation:** Kanban board supports keyboard-driven card movement (Space to pick up, arrow keys to move, Space/Enter to drop) via dnd-kit's keyboard sensor.
- **Screen reader:** Log stream uses `aria-live="polite"` and `aria-atomic="false"` so each new line is announced without interrupting the previous one.

---

## Design Inspirations and Reasoning

**Warm terracotta palette**
Inspired by Mediterranean ceramics and earthy tones. The intent is to make the tool feel warm and approachable — a contrast to the cold blues and greys typical of enterprise SaaS. Job hunting is personal. The tool reflects that.

**FitScoreRing**
Inspired by Apple Watch Activity rings and Duolingo's streak indicators. Circular progress is immediately legible as "how much" without needing to read a number. The colour coding (green/amber/red) provides a second dimension.

**Three-panel Run Agent**
Inspired by IDE debugger panels (VS Code, JetBrains). Left panel = structure (pipeline), centre = process (logs), right = output (results). Users familiar with developer tools find this layout immediately comfortable.

**Kanban board**
Inspired by Linear and Notion. Application tracking is inherently a pipeline/workflow problem. The statuses (New → Reviewing → Applied → Interview → Offer / Pass) map directly to how job seekers already think about their pipeline.

**JetBrains Mono for logs**
Monospace fonts in log streams serve two purposes: alignment (timestamps and node names are the same width, making it easy to scan) and context-setting (the user sees they're watching real machine output, not a stylised UI element). JetBrains Mono was chosen over system monospace for its improved readability at 12px.
