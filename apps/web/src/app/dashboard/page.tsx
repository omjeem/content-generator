'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { SuggestionCard } from '@/components/suggestions/SuggestionCard'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { personaApi, suggestionsApi, ApiError } from '@/lib/api'
import type { ISuggestion, IUserPersona } from '@repo/shared-types'

type GenerateState = 'idle' | 'loading' | 'done' | 'error'

const LOADING_STEPS = [
  'Analysing your LinkedIn persona…',
  'Fetching trending topics in your niche…',
  'Generating personalised content ideas…',
  'Finalising your suggestions…',
]

export default function DashboardPage() {
  const router = useRouter()

  const [persona, setPersona] = useState<IUserPersona | null>(null)
  const [personaLoading, setPersonaLoading] = useState(true)

  const [generateState, setGenerateState] = useState<GenerateState>('idle')
  const [loadingStep, setLoadingStep] = useState(0)
  const [suggestions, setSuggestions] = useState<ISuggestion[]>([])
  const [trendsUsed, setTrendsUsed] = useState<string[]>([])
  const [generateError, setGenerateError] = useState('')

  // Load persona on mount
  useEffect(() => {
    personaApi.get()
      .then(({ persona }) => setPersona(persona))
      .catch(() => setPersona(null))
      .finally(() => setPersonaLoading(false))
  }, [])

  // Cycle through loading step messages while generating
  useEffect(() => {
    if (generateState !== 'loading') return
    setLoadingStep(0)
    const interval = setInterval(() => {
      setLoadingStep((s) => (s + 1) % LOADING_STEPS.length)
    }, 2500)
    return () => clearInterval(interval)
  }, [generateState])

  const handleGenerate = useCallback(async () => {
    setGenerateError('')
    setGenerateState('loading')
    setSuggestions([])

    try {
      const result = await suggestionsApi.generate()
      setSuggestions(result.suggestions)
      setTrendsUsed(result.trendsUsed)
      setGenerateState('done')
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        // Interview not complete — redirect to onboarding
        router.push('/onboarding')
        return
      }
      setGenerateError(err instanceof ApiError ? err.message : 'Generation failed. Please try again.')
      setGenerateState('error')
    }
  }, [router])

  // ── Render ─────────────────────────────────────────────────────────────────

  const interviewComplete = persona?.interviewComplete ?? false
  const personaReady = !personaLoading && persona !== null

  return (
    <main className="container max-w-5xl mx-auto px-4 py-8">
      {/* Page header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Content Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">Generate AI-powered LinkedIn post ideas tailored to your voice</p>
        </div>
        <Link href="/dashboard/suggestions" className="text-sm text-linkedin hover:underline font-medium">
          View History →
        </Link>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatusCard
          label="Profile Analysis"
          value={personaLoading ? '…' : persona ? 'Complete' : 'Pending'}
          ok={personaReady && persona !== null}
          pending={personaLoading}
          action={!personaLoading && !persona ? { label: 'Set up profile', href: '/onboarding' } : undefined}
        />
        <StatusCard
          label="Strategy Interview"
          value={personaLoading ? '…' : interviewComplete ? 'Complete' : 'Pending'}
          ok={interviewComplete}
          pending={personaLoading}
          action={!personaLoading && !interviewComplete ? { label: 'Finish interview', href: '/onboarding' } : undefined}
        />
        <StatusCard
          label="Content Pillars"
          value={
            personaLoading ? '…'
            : persona?.contentPillars?.length
            ? persona.contentPillars.slice(0, 2).join(', ')
            : 'Not set'
          }
          ok={!!persona?.contentPillars?.length}
          pending={personaLoading}
        />
      </div>

      {/* Generate section */}
      {generateState !== 'done' && (
        <Card className="mb-8">
          <CardContent className="p-8 text-center">
            {generateState === 'idle' && (
              <>
                <p className="text-gray-600 mb-4 max-w-md mx-auto">
                  {!personaReady
                    ? 'Loading your profile…'
                    : !interviewComplete
                    ? 'Complete your strategy interview first to unlock content generation.'
                    : 'Ready to generate personalised LinkedIn post ideas based on your voice and trending topics.'}
                </p>
                {generateError && (
                  <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                    {generateError}
                  </div>
                )}
                <Button
                  size="lg"
                  onClick={handleGenerate}
                  disabled={!interviewComplete || personaLoading}
                  className="min-w-[220px]"
                >
                  Generate Content Ideas →
                </Button>
                {!interviewComplete && personaReady && (
                  <p className="mt-3 text-sm text-gray-500">
                    <Link href="/onboarding" className="text-linkedin hover:underline">
                      Complete your onboarding
                    </Link>{' '}
                    first.
                  </p>
                )}
              </>
            )}

            {generateState === 'loading' && (
              <div className="space-y-4">
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-linkedin/10 mb-2">
                  <span className="text-2xl animate-spin">⚙️</span>
                </div>
                <p className="text-gray-700 font-medium">{LOADING_STEPS[loadingStep]}</p>
                <div className="mx-auto max-w-xs h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-linkedin rounded-full animate-pulse" style={{ width: '60%' }} />
                </div>
                <p className="text-xs text-gray-400">This takes 10–20 seconds</p>
              </div>
            )}

            {generateState === 'error' && (
              <>
                <p className="text-red-600 mb-4">{generateError || 'Something went wrong.'}</p>
                <Button onClick={handleGenerate} size="lg">
                  Try Again
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {generateState === 'done' && suggestions.length > 0 && (
        <div className="space-y-6">
          {/* Trends used */}
          {trendsUsed.length > 0 && (
            <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3">
              <p className="text-sm text-blue-700">
                <span className="font-medium">Trending topics used: </span>
                {trendsUsed.join(', ')}
              </p>
            </div>
          )}

          {/* Suggestion cards */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              {suggestions.length} Content Ideas
            </h2>
            <Button variant="outline" size="sm" onClick={() => setGenerateState('idle')}>
              + Generate New
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {suggestions.map((s, i) => (
              <SuggestionCard key={i} suggestion={s} index={i} />
            ))}
          </div>

          <div className="text-center pt-4">
            <Link href="/dashboard/suggestions" className="text-sm text-linkedin hover:underline">
              View all past suggestion sets →
            </Link>
          </div>
        </div>
      )}
    </main>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusCard({
  label,
  value,
  ok,
  pending,
  action,
}: {
  label: string
  value: string
  ok: boolean
  pending: boolean
  action?: { label: string; href: string }
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</p>
        <div className="flex items-center gap-2">
          <span className={`text-lg ${pending ? 'text-gray-300' : ok ? 'text-green-500' : 'text-amber-400'}`}>
            {pending ? '○' : ok ? '✓' : '!'}
          </span>
          <span className={`text-sm font-medium ${ok ? 'text-gray-900' : 'text-gray-500'}`}>{value}</span>
        </div>
        {action && (
          <Link href={action.href} className="mt-2 block text-xs text-linkedin hover:underline">
            {action.label} →
          </Link>
        )}
      </CardContent>
    </Card>
  )
}
