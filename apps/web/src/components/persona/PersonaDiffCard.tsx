'use client'
import type { IPersonaDiff } from '@repo/shared-types'

// ── Props ─────────────────────────────────────────────────────────────────────

interface PersonaDiffCardProps {
  diff: IPersonaDiff
  postsAdded: number
  className?: string
  onDismiss?: () => void
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Displays a "before/after" diff card when posts are added to a persona.
 * Shows new topics, removed topics, new formats, and style/tone changes.
 */
export function PersonaDiffCard({ diff, postsAdded, className = '', onDismiss }: PersonaDiffCardProps) {
  const hasChanges =
    diff.topicsAdded.length > 0 ||
    diff.topicsRemoved.length > 0 ||
    diff.formatsAdded.length > 0 ||
    diff.writingStyleChanged ||
    diff.toneChanged

  if (!hasChanges) {
    return (
      <div className={`rounded-lg bg-green-50 border border-green-200 px-4 py-3 ${className}`}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-green-700">
              ✓ {postsAdded} post{postsAdded !== 1 ? 's' : ''} added — persona already up to date
            </p>
            <p className="text-xs text-green-600 mt-0.5">
              No significant changes detected from the new posts.
            </p>
          </div>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="text-green-400 hover:text-green-600 text-xs shrink-0"
              aria-label="Dismiss"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={`rounded-lg border border-blue-200 bg-blue-50 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-blue-100 bg-blue-100/50">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-blue-800">
            ✨ Persona updated
          </span>
          <span className="text-xs text-blue-600 font-medium">
            +{postsAdded} post{postsAdded !== 1 ? 's' : ''} analysed
          </span>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-blue-400 hover:text-blue-600 text-xs"
            aria-label="Dismiss"
          >
            ✕
          </button>
        )}
      </div>

      {/* Changes list */}
      <div className="px-4 py-3 space-y-2">
        {diff.topicsAdded.length > 0 && (
          <DiffRow
            icon="+"
            color="green"
            label="New topics detected"
            items={diff.topicsAdded}
          />
        )}
        {diff.topicsRemoved.length > 0 && (
          <DiffRow
            icon="−"
            color="red"
            label="Topics no longer prominent"
            items={diff.topicsRemoved}
          />
        )}
        {diff.formatsAdded.length > 0 && (
          <DiffRow
            icon="+"
            color="blue"
            label="New post formats detected"
            items={diff.formatsAdded}
          />
        )}
        {diff.writingStyleChanged && (
          <ChangedBadge label="Writing style updated" />
        )}
        {diff.toneChanged && (
          <ChangedBadge label="Tone updated" />
        )}
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function DiffRow({
  icon,
  color,
  label,
  items,
}: {
  icon: '+' | '−'
  color: 'green' | 'red' | 'blue'
  label: string
  items: string[]
}) {
  const colorMap = {
    green: 'text-green-700 bg-green-100 border-green-200',
    red:   'text-red-700 bg-red-50 border-red-200',
    blue:  'text-blue-700 bg-blue-100 border-blue-200',
  }
  const iconColorMap = {
    green: 'text-green-600 font-bold',
    red:   'text-red-500 font-bold',
    blue:  'text-blue-600 font-bold',
  }

  return (
    <div className="flex items-start gap-2">
      <span className={`text-xs mt-0.5 shrink-0 ${iconColorMap[color]}`}>{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 mb-1">{label}:</p>
        <div className="flex flex-wrap gap-1">
          {items.map((item) => (
            <span
              key={item}
              className={`inline-flex text-xs px-1.5 py-0.5 rounded border ${colorMap[color]}`}
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function ChangedBadge({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-amber-600 font-bold">↻</span>
      <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
        {label}
      </span>
    </div>
  )
}
