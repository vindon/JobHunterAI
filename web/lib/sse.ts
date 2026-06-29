"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import type { RunEvent, Job } from "@/lib/types"

const BASE = "http://localhost:8000/api"

interface UseSSEReturn {
  events: RunEvent[]
  isConnected: boolean
  error: string | null
  clearEvents: () => void
}

export function useSSE(runId: string | null): UseSSEReturn {
  const [events, setEvents] = useState<RunEvent[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const esRef = useRef<EventSource | null>(null)

  const clearEvents = useCallback(() => setEvents([]), [])

  useEffect(() => {
    if (!runId) {
      if (esRef.current) {
        esRef.current.close()
        esRef.current = null
        setIsConnected(false)
      }
      return
    }

    const url = `${BASE}/runs/stream/${runId}`
    const es = new EventSource(url)
    esRef.current = es
    setError(null)

    es.onopen = () => {
      setIsConnected(true)
      setError(null)
    }

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as RunEvent
        setEvents((prev) => [...prev, data])
        if (data.type === "complete" || data.type === "error") {
          es.close()
          setIsConnected(false)
        }
      } catch {
        // ignore malformed events
      }
    }

    es.addEventListener("log", (event: MessageEvent) => {
      setEvents((prev) => [...prev, { type: "log", payload: event.data }])
    })

    es.addEventListener("job", (event: MessageEvent) => {
      try {
        const job = JSON.parse(event.data) as Job
        setEvents((prev) => [...prev, { type: "job", payload: job }])
      } catch {
        // ignore
      }
    })

    es.addEventListener("complete", (event: MessageEvent) => {
      setEvents((prev) => [...prev, { type: "complete", payload: event.data }])
      es.close()
      setIsConnected(false)
    })

    es.addEventListener("error_event", (event: MessageEvent) => {
      setEvents((prev) => [...prev, { type: "error", payload: event.data }])
      es.close()
      setIsConnected(false)
    })

    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        setIsConnected(false)
      } else {
        setError("Connection lost. Retrying...")
      }
    }

    return () => {
      es.close()
      esRef.current = null
      setIsConnected(false)
    }
  }, [runId])

  return { events, isConnected, error, clearEvents }
}
