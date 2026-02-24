'use client'
import { useState, useEffect, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PendingChangesCard } from '@/components/persona/PendingChangesCard'
import { PostInputCards } from '@/components/persona/PostInputCards'
import { PostBatchHistory } from '@/components/persona/PostBatchHistory'
import { PersonaDiffCard } from '@/components/persona/PersonaDiffCard'
import { personaChatApi, personaApi, ApiError } from '@/lib/api'
import type { IUserPersona, IPersonaPendingChanges, IMessage, IPersonaDiff } from '@repo/shared-types'

// ── Types ──────────────────────────────────────────────────────────────────────

interface PersonaChatResponse {
  reply: string
  sessionId: string
  pendingChanges?: IPersonaPendingChanges
  changesApplied: boolean
}

// ── Chat bubble ────────────────────────────────────────────────────────────────

function ChatBubble({ role, content }: { role: 'user' | 'assistant'; content: string }) {
  const isUser = role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-linkedin flex items-center justify-center text-white text-xs font-bold mr-2 mt-0.5 shrink-0">
          AI
        </div>
      )}
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'bg-linkedin text-white rounded-br-sm'
            : 'bg-gray-100 text-gray-800 rounded-bl-sm'
        }`}
      >
        {content}
      </div>
    </div>
  )
}

// ── Persona display card ───────────────────────────────────────────────────────

function PersonaField({ label, value }: { label: string; value: string | string[] | undefined }) {
  if (!value || (Array.isArray(value) && value.length === 0)) {
    return (
      <div className="py-2 border-b border-gray-100 last:border-0">
        <p className="text-xs font-medium text-gray-400">{label}</p>
        <p className="text-sm text-gray-300 italic">Not set</p>
      </div>
    )
  }
  return (
    <div className="py-2 border-b border-gray-100 last:border-0">
      <p className="text-xs font-medium text-gray-500 mb-0.5">{label}</p>
      <p className="text-sm text-gray-800">
        {Array.isArray(value) ? value.join(', ') : value}
      </p>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const [persona, setPersona] = useState<IUserPersona | null>(null)
  const [personaLoading, setPersonaLoading] = useState(true)

  const [messages, setMessages] = useState<IMessage[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [historyLoading, setHistoryLoading] = useState(true)

  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [chatError, setChatError] = useState('')

  const [pendingChanges, setPendingChanges] = useState<IPersonaPendingChanges | null>(null)
  const [applying, setApplying] = useState(false)
  const [applySuccess, setApplySuccess] = useState('')

  // Add More Posts section
  const [showAddPosts, setShowAddPosts] = useState(false)
  const [addPostsLoading, setAddPostsLoading] = useState(false)
  const [addPostsResult, setAddPostsResult] = useState<{ message: string; postsAdded: number; duplicatesSkipped: number } | null>(null)
  const [addPostsError, setAddPostsError] = useState('')
  const [addPostsDiff, setAddPostsDiff] = useState<IPersonaDiff | null>(null)

  const chatEndRef = useRef<HTMLDivElement>(null)

  // Load persona + history in parallel
  useEffect(() => {
    personaChatApi.getHistory()
      .then(({ messages: hist, sessionId: sid }) => {
        setMessages(hist as IMessage[])
        setSessionId(sid)
      })
      .catch(() => {})
      .finally(() => setHistoryLoading(false))

    personaChatApi.applyChanges // trigger fetch on mount via GET persona endpoint
    fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/persona-chat/persona`, {
      credentials: 'include',
    })
      .then((r) => r.json())
      .then((d) => { if (d.persona) setPersona(d.persona as IUserPersona) })
      .catch(() => {})
      .finally(() => setPersonaLoading(false))
  }, [])

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || sending) return

    setChatError('')
    const userMsg: IMessage = { role: 'user', content: text, timestamp: new Date().toISOString() }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setSending(true)

    try {
      const res: PersonaChatResponse = await personaChatApi.chat({ message: text, sessionId: sessionId ?? undefined })

      const assistantMsg: IMessage = {
        role: 'assistant',
        content: res.reply,
        timestamp: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, assistantMsg])
      setSessionId(res.sessionId)

      if (res.pendingChanges && Object.keys(res.pendingChanges).length > 0) {
        setPendingChanges(res.pendingChanges)
      }
    } catch (err) {
      setChatError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSending(false)
    }
  }

  const handleApplyChanges = async () => {
    if (!pendingChanges) return
    setApplying(true)
    setApplySuccess('')

    try {
      const res = await personaChatApi.applyChanges({ changes: pendingChanges })
      setPersona(res.persona)
      setPendingChanges(null)
      setApplySuccess('Profile updated successfully! ✓')
      setTimeout(() => setApplySuccess(''), 3000)
    } catch (err) {
      setChatError(err instanceof ApiError ? err.message : 'Failed to apply changes.')
    } finally {
      setApplying(false)
    }
  }

  const handleAddPosts = async (postsArray: string[]) => {
    setAddPostsError('')
    setAddPostsResult(null)
    setAddPostsDiff(null)
    setAddPostsLoading(true)
    try {
      const res = await personaApi.addPosts({ postsArray, mode: 'incremental', source: 'add-posts' })
      setPersona(res.persona)
      setAddPostsResult({ message: res.message, postsAdded: res.postsAdded, duplicatesSkipped: res.duplicatesSkipped })
      if (res.diff) setAddPostsDiff(res.diff)
      setShowAddPosts(false)
    } catch (err) {
      setAddPostsError(err instanceof ApiError ? err.message : 'Failed to add posts. Please try again.')
    } finally {
      setAddPostsLoading(false)
    }
  }

  const isReady = !historyLoading && !personaLoading

  return (
    <main className="container max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">My Content Profile</h1>
        <p className="text-gray-500 text-sm mt-1">
          Chat with your AI strategy coach to refine your persona, goals, and content pillars.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: Persona display */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardContent className="p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <span>👤</span> Current Persona
              </h2>

              {personaLoading ? (
                <div className="space-y-2 animate-pulse">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-8 bg-gray-100 rounded" />
                  ))}
                </div>
              ) : !persona ? (
                <p className="text-sm text-gray-400 italic">No persona found. Complete onboarding first.</p>
              ) : (
                <div>
                  {/* Persona version + last updated badge */}
                  {(persona.personaVersion || persona.lastPostAddedAt || persona.updatedAt) && (
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
                      {persona.personaVersion && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-linkedin bg-blue-50 px-2 py-0.5 rounded-full">
                          Persona v{persona.personaVersion}
                        </span>
                      )}
                      {(persona.lastPostAddedAt ?? persona.updatedAt) && (
                        <span className="text-xs text-gray-400">
                          Updated {new Date(persona.lastPostAddedAt ?? persona.updatedAt!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      )}
                      {(persona.totalPostsAnalyzed ?? 0) > 0 && (
                        <span className="ml-auto text-xs text-gray-400">
                          {persona.totalPostsAnalyzed} posts
                        </span>
                      )}
                    </div>
                  )}
                  <PersonaField label="Platform Goal" value={persona.platformGoal} />
                  <PersonaField label="Industry" value={persona.industry} />
                  <PersonaField label="Professional Goals" value={persona.goals} />
                  <PersonaField label="Target Audience" value={persona.targetAudience} />
                  <PersonaField label="Content Pillars" value={persona.contentPillars} />
                  <PersonaField label="Topics" value={persona.topics} />
                  <PersonaField label="Tone" value={persona.tone} />
                  <PersonaField label="Writing Style" value={persona.writingStyle} />
                  <PersonaField label="Posting Frequency" value={persona.postingFrequency} />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Add More Posts */}
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <span>📝</span> Add More Posts
                  </h2>
                  {persona && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {persona.totalPostsAnalyzed ?? persona.scrapedPosts?.length ?? 0} posts analyzed · v{persona.personaVersion ?? 1}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => {
                    setShowAddPosts((s) => !s)
                    setAddPostsError('')
                    setAddPostsResult(null)
                    setAddPostsDiff(null)
                  }}
                  className="text-xs text-linkedin hover:underline font-medium"
                >
                  {showAddPosts ? 'Cancel' : '+ Add posts'}
                </button>
              </div>

              {/* Success + diff (#28) */}
              {addPostsResult && !addPostsDiff && (
                <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700 mb-3">
                  {addPostsResult.message}
                  {addPostsResult.duplicatesSkipped > 0 && (
                    <span className="ml-1 text-xs text-green-600">
                      ({addPostsResult.duplicatesSkipped} duplicate{addPostsResult.duplicatesSkipped !== 1 ? 's' : ''} skipped)
                    </span>
                  )}
                </div>
              )}

              {/* Persona diff visualization (#28) */}
              {addPostsDiff && addPostsResult && (
                <PersonaDiffCard
                  diff={addPostsDiff}
                  postsAdded={addPostsResult.postsAdded}
                  className="mb-3"
                  onDismiss={() => setAddPostsDiff(null)}
                />
              )}

              {addPostsError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 mb-3">
                  {addPostsError}
                </div>
              )}

              {showAddPosts && (
                <PostInputCards
                  onSubmit={handleAddPosts}
                  loading={addPostsLoading}
                  submitLabel="Add Posts to Persona"
                  maxPosts={20}
                  minCharsPerPost={30}
                />
              )}

              {!showAddPosts && !addPostsResult && (
                <p className="text-xs text-gray-400 mb-3">
                  Adding more posts improves accuracy. Duplicates are automatically skipped.
                </p>
              )}

              {/* Batch history timeline (#20) */}
              {!showAddPosts && persona && (persona.postMetadata?.length ?? 0) > 0 && (
                <PostBatchHistory
                  batches={persona.postMetadata}
                  totalPostsAnalyzed={persona.totalPostsAnalyzed}
                  className="mt-1"
                />
              )}
            </CardContent>
          </Card>

          {/* Apply success */}
          {applySuccess && (
            <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700 font-medium">
              {applySuccess}
            </div>
          )}

          {/* Pending changes */}
          {pendingChanges && Object.keys(pendingChanges).length > 0 && (
            <PendingChangesCard
              changes={pendingChanges}
              onApply={handleApplyChanges}
              onDiscard={() => setPendingChanges(null)}
              applying={applying}
            />
          )}
        </div>

        {/* Right: Chat interface */}
        <div className="lg:col-span-3">
          <Card className="flex flex-col h-[600px]">
            {/* Chat header */}
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">💬 AI Strategy Coach</h2>
              <p className="text-xs text-gray-500">
                Chat to update your goals, pillars, tone, or any part of your profile
              </p>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {!isReady ? (
                <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                  Loading…
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-3">
                  <div className="text-4xl">🧠</div>
                  <div>
                    <p className="text-sm font-medium text-gray-700">Start a conversation</p>
                    <p className="text-xs text-gray-400 mt-1 max-w-xs">
                      Tell me what you&apos;d like to change about your content strategy and I&apos;ll help refine your profile.
                    </p>
                  </div>
                  {/* Quick start prompts */}
                  <div className="flex flex-wrap gap-2 justify-center pt-2">
                    {[
                      'Change my content pillars',
                      'Update my target audience',
                      'Shift to lead generation focus',
                      "I want to post more video content",
                    ].map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => setInput(prompt)}
                        className="text-xs rounded-full border border-gray-200 px-3 py-1 text-gray-600 hover:border-linkedin hover:text-linkedin transition-colors"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((msg, i) => (
                  <ChatBubble key={i} role={msg.role} content={msg.content} />
                ))
              )}

              {sending && (
                <div className="flex justify-start mb-3">
                  <div className="w-7 h-7 rounded-full bg-linkedin flex items-center justify-center text-white text-xs font-bold mr-2 mt-0.5 shrink-0">
                    AI
                  </div>
                  <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm text-gray-500">
                    <span className="inline-flex gap-1">
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Error */}
            {chatError && (
              <div className="mx-4 mb-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                {chatError}
              </div>
            )}

            {/* Input */}
            <div className="px-4 pb-4 pt-3 border-t border-gray-100 flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="e.g. I want to focus more on AI ethics content…"
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-linkedin focus:border-transparent"
                onKeyDown={(e) => { if (e.key === 'Enter') handleSend() }}
                disabled={sending}
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim() || sending}
                className="shrink-0"
              >
                Send
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </main>
  )
}
