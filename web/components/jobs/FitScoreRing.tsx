"use client"

import { useEffect, useRef } from "react"

interface FitScoreRingProps {
  score: number
  size?: "sm" | "md" | "lg"
}

const SIZE_MAP = {
  sm: { outer: 36, stroke: 3, fontSize: 10, gap: 4 },
  md: { outer: 56, stroke: 4, fontSize: 14, gap: 6 },
  lg: { outer: 80, stroke: 5, fontSize: 20, gap: 8 },
}

function getScoreColor(score: number): string {
  if (score >= 8) return "#E8734A" // primary / terracotta
  if (score >= 6) return "#5B8B6E" // success / sage
  if (score >= 4) return "#E8A23A" // warning / amber
  return "#9B8B78"                  // muted
}

function getScoreLabel(score: number): string {
  if (score >= 9) return "Excellent"
  if (score >= 7) return "Strong"
  if (score >= 5) return "Good"
  return "Fair"
}

export function FitScoreRing({ score, size = "md" }: FitScoreRingProps) {
  const config = SIZE_MAP[size]
  const radius = (config.outer - config.stroke * 2 - config.gap * 2) / 2
  const circumference = 2 * Math.PI * radius
  const fraction = Math.min(Math.max(score / 10, 0), 1)
  const dashOffset = circumference * (1 - fraction)
  const color = getScoreColor(score)
  const cx = config.outer / 2
  const cy = config.outer / 2

  const dashRef = useRef<SVGCircleElement>(null)

  useEffect(() => {
    const el = dashRef.current
    if (!el) return
    // Animate from full offset (empty) to target
    el.style.strokeDashoffset = String(circumference)
    const raf = requestAnimationFrame(() => {
      el.style.transition = "stroke-dashoffset 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)"
      el.style.strokeDashoffset = String(dashOffset)
    })
    return () => cancelAnimationFrame(raf)
  }, [score, circumference, dashOffset])

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={config.outer} height={config.outer} style={{ display: "block" }}>
        {/* Background ring */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="#EDE8E0"
          strokeWidth={config.stroke}
        />
        {/* Score ring */}
        <circle
          ref={dashRef}
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={config.stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
        {/* Score text */}
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={config.fontSize}
          fontWeight="700"
          fontFamily="Inter, system-ui, sans-serif"
          fill={color}
        >
          {score}
        </text>
      </svg>
      {size !== "sm" && (
        <span
          className="text-xs font-medium"
          style={{ color, fontSize: 10 }}
        >
          {getScoreLabel(score)}
        </span>
      )}
    </div>
  )
}
