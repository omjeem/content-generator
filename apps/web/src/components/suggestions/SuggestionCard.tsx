'use client'
import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ISuggestion } from '@repo/shared-types'

interface SuggestionCardProps {
  suggestion: ISuggestion
  index: number
}

const formatLabels: Record<string, string> = {
  carousel: 'Carousel',
  'text-post': 'Text Post',
  poll: 'Poll',
  'video-script': 'Video Script',
  list: 'List Post',
}

export function SuggestionCard({ suggestion, index }: SuggestionCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(suggestion.hook)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard not available
    }
  }

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-400">#{index + 1}</span>
            <Badge variant="format" format={suggestion.format}>
              {formatLabels[suggestion.format] ?? suggestion.format}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className={cn(
              'text-xs shrink-0',
              copied ? 'text-green-600' : 'text-gray-500'
            )}
          >
            {copied ? '✓ Copied!' : 'Copy Hook'}
          </Button>
        </div>

        {/* Hook — the scroll-stopper */}
        <blockquote className="text-base font-semibold text-gray-900 leading-snug mb-3 border-l-4 border-linkedin pl-3">
          &ldquo;{suggestion.hook}&rdquo;
        </blockquote>

        {/* Topic + Angle */}
        <div className="space-y-1 mb-3">
          <p className="text-sm">
            <span className="font-medium text-gray-700">Topic: </span>
            <span className="text-gray-600">{suggestion.topic}</span>
          </p>
          <p className="text-sm">
            <span className="font-medium text-gray-700">Angle: </span>
            <span className="text-gray-600">{suggestion.angle}</span>
          </p>
        </div>

        {/* Expandable "Why it fits" */}
        <button
          onClick={() => setExpanded((e) => !e)}
          className="text-xs text-linkedin hover:underline font-medium"
        >
          {expanded ? '▲ Hide' : '▼ Why this fits your voice'}
        </button>

        {expanded && (
          <p className="mt-2 text-sm text-gray-600 bg-blue-50 rounded-lg p-3 leading-relaxed">
            {suggestion.whyItFits}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
