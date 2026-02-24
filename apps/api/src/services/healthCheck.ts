/**
 * healthCheck.ts
 *
 * Degradation tracking and health check service.
 *
 * Exposes:
 *   - `getHealthStatus()`: async checks for DB connectivity + dependency status
 *   - In-memory error counters per service (incremented by callers)
 *   - Rolling error rate over a 5-minute window
 *
 * Used by `GET /api/health` to return a rich status object.
 */

import mongoose from 'mongoose'

// ── Error tracking ────────────────────────────────────────────────────────────

export type ServiceName =
  | 'mongodb'
  | 'gemini'
  | 'hackernews'
  | 'tavily'
  | 'rss'
  | 'linkedin-scraper'

const WINDOW_MS = 5 * 60 * 1000  // 5-minute rolling window
const ERROR_THRESHOLD = 3         // ≥3 errors in window = degraded

interface ErrorEvent {
  service: ServiceName
  message: string
  timestamp: number
}

const errorLog: ErrorEvent[] = []

/**
 * Record an error event for a service.
 * Call this from catch blocks when a dependency fails.
 */
export function recordServiceError(service: ServiceName, message: string): void {
  errorLog.push({ service, message, timestamp: Date.now() })
  // Evict events older than 2× window to keep array bounded
  const cutoff = Date.now() - WINDOW_MS * 2
  while (errorLog.length > 0 && (errorLog[0]?.timestamp ?? 0) < cutoff) {
    errorLog.shift()
  }
}

/**
 * Get error count for a service in the rolling window.
 */
function getErrorCount(service: ServiceName): number {
  const cutoff = Date.now() - WINDOW_MS
  return errorLog.filter((e) => e.service === service && e.timestamp >= cutoff).length
}

// ── Health check ──────────────────────────────────────────────────────────────

export type HealthStatus = 'healthy' | 'degraded' | 'down'

export interface ServiceHealth {
  status: HealthStatus
  errorsInWindow: number
  message?: string
}

export interface HealthReport {
  status: HealthStatus          // overall status (worst of all services)
  uptime: number                // process uptime in seconds
  timestamp: string
  services: {
    mongodb: ServiceHealth
    gemini: ServiceHealth
    hackernews: ServiceHealth
    tavily: ServiceHealth
    rss: ServiceHealth
    linkedinScraper: ServiceHealth
  }
  memoryMB: number
  nodeVersion: string
}

function makeServiceHealth(service: ServiceName, extraDown?: boolean): ServiceHealth {
  const count = getErrorCount(service)
  const status: HealthStatus = extraDown
    ? 'down'
    : count >= ERROR_THRESHOLD
    ? 'degraded'
    : 'healthy'

  return {
    status,
    errorsInWindow: count,
    message: count > 0 ? `${count} error(s) in last 5 min` : undefined,
  }
}

/**
 * Returns the current health report.
 * Checks MongoDB connectivity live; other services are inferred from error counters.
 */
export async function getHealthStatus(): Promise<HealthReport> {
  // Live MongoDB ping
  let mongoDown = false
  try {
    if (mongoose.connection.readyState !== 1) {
      mongoDown = true
      recordServiceError('mongodb', 'Connection readyState is not 1 (connected)')
    } else {
      if (mongoose.connection.db) {
        await mongoose.connection.db.admin().ping()
      }
    }
  } catch (err) {
    mongoDown = true
    recordServiceError('mongodb', (err as Error).message)
  }

  const services = {
    mongodb: makeServiceHealth('mongodb', mongoDown),
    gemini: makeServiceHealth('gemini'),
    hackernews: makeServiceHealth('hackernews'),
    tavily: makeServiceHealth('tavily'),
    rss: makeServiceHealth('rss'),
    linkedinScraper: makeServiceHealth('linkedin-scraper'),
  }

  // Overall status = worst individual status
  const statuses = Object.values(services).map((s) => s.status)
  const overallStatus: HealthStatus = statuses.includes('down')
    ? 'down'
    : statuses.includes('degraded')
    ? 'degraded'
    : 'healthy'

  const mem = process.memoryUsage()

  return {
    status: overallStatus,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    services,
    memoryMB: Math.round(mem.rss / 1024 / 1024),
    nodeVersion: process.version,
  }
}
