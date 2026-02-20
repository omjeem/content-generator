'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Navbar } from '@/components/layout/Navbar'
import { ChatInterface } from '@/components/chat/ChatInterface'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { personaApi, onboardingApi, authApi, ApiError } from '@/lib/api'
import type { IMessage } from '@repo/shared-types'

type Step = 'profile-input' | 'interview' | 'complete'
type InputTab = 'url' | 'paste'

export default function OnboardingPage() {
  const router = useRouter()

  // User
  const [userName, setUserName] = useState('')

  // Step management
  const [step, setStep] = useState<Step>('profile-input')
  const [tab, setTab] = useState<InputTab>('url')

  // Profile input
  const [linkedinUrl, setLinkedinUrl] = useState('')
  const [manualPosts, setManualPosts] = useState('')
  const [analyzeLoading, setAnalyzeLoading] = useState(false)
  const [analyzeError, setAnalyzeError] = useState('')
  const [scrapingBlocked, setScrapingBlocked] = useState(false)

  // Interview chat
  const [messages, setMessages] = useState<IMessage[]>([])
  const [chatLoading, setChatLoading] = useState(false)
  const [questionsAnswered, setQuestionsAnswered] = useState(0)
  const [interviewComplete, setInterviewComplete] = useState(false)

  // Load current user + restore any existing session
  useEffect(() => {
    async function init() {
      try {
        const { user } = await authApi.me()
        setUserName(user.name)
      } catch {
        router.push('/login')
        return
      }

      // Restore existing chat session
      try {
        const session = await onboardingApi.getSession()
        if (session.messages.length > 0) {
          setMessages(session.messages)
          setStep('interview')
        }
        if (session.interviewComplete) {
          setInterviewComplete(true)
          setStep('complete')
        }
      } catch {
        // No session yet — stay on profile-input step
      }
    }
    init()
  }, [router])

  // Step 1: Analyze LinkedIn profile
  async function handleAnalyze() {
    setAnalyzeError('')
    setScrapingBlocked(false)
    setAnalyzeLoading(true)

    try {
      const body = tab === 'url'
        ? { linkedinUrl }
        : { manualPosts }

      await personaApi.analyze(body)
      setStep('interview')

      // Send the first message to start the interview
      setChatLoading(true)
      const reply = await onboardingApi.chat({ message: "Hi! I'm ready to set up my content strategy." })
      setMessages([
        { role: 'user', content: "Hi! I'm ready to set up my content strategy.", timestamp: new Date().toISOString() },
        { role: 'assistant', content: reply.reply, timestamp: new Date().toISOString() },
      ])
      setQuestionsAnswered(reply.questionsAnswered)
      setChatLoading(false)
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setScrapingBlocked(true)
        setTab('paste')
        setAnalyzeError('LinkedIn scraping was blocked. Please paste your posts manually below.')
      } else {
        setAnalyzeError(err instanceof ApiError ? err.message : 'Analysis failed. Please try again.')
      }
    } finally {
      setAnalyzeLoading(false)
    }
  }

  // Step 2: Interview chat
  const handleChatSend = useCallback(async (message: string) => {
    const userMsg: IMessage = { role: 'user', content: message, timestamp: new Date().toISOString() }
    setMessages((prev) => [...prev, userMsg])
    setChatLoading(true)

    try {
      const reply = await onboardingApi.chat({ message })
      const assistantMsg: IMessage = { role: 'assistant', content: reply.reply, timestamp: new Date().toISOString() }
      setMessages((prev) => [...prev, assistantMsg])
      setQuestionsAnswered(reply.questionsAnswered)

      if (reply.interviewComplete) {
        setInterviewComplete(true)
        setStep('complete')
      }
    } catch (err) {
      const errorMsg: IMessage = {
        role: 'assistant',
        content: err instanceof ApiError ? err.message : 'Something went wrong. Please try again.',
        timestamp: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, errorMsg])
    } finally {
      setChatLoading(false)
    }
  }, [])

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar userName={userName} />

      <main className="flex-1 container max-w-3xl mx-auto px-4 py-8">
        {/* Progress indicator */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            {(['profile-input', 'interview', 'complete'] as Step[]).map((s, i) => (
              <div key={s} className="flex items-center gap-3">
                <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors
                  ${step === s ? 'bg-linkedin text-white' : s < step || (s === 'complete' && interviewComplete) ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                  {s < step || (s === 'complete' && interviewComplete) ? '✓' : i + 1}
                </div>
                {i < 2 && <div className={`h-0.5 w-12 ${step !== 'profile-input' && i === 0 ? 'bg-green-500' : 'bg-gray-200'}`} />}
              </div>
            ))}
          </div>
          <div className="flex gap-8 text-xs text-gray-500 ml-1">
            <span className={step === 'profile-input' ? 'text-linkedin font-medium' : ''}>Profile Analysis</span>
            <span className={step === 'interview' ? 'text-linkedin font-medium' : ''}>Interview</span>
            <span className={step === 'complete' ? 'text-green-600 font-medium' : ''}>Complete</span>
          </div>
        </div>

        {/* ── STEP 1: Profile Input ──────────────────────────────────────── */}
        {step === 'profile-input' && (
          <Card>
            <CardHeader>
              <CardTitle>Step 1: Analyse Your LinkedIn Profile</CardTitle>
              <CardDescription>
                We&apos;ll analyse your writing style, tone, and topics to generate
                content that sounds authentically like you.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Tab switcher */}
              <div className="flex rounded-lg bg-gray-100 p-1 mb-6 w-fit">
                <button
                  onClick={() => setTab('url')}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors
                    ${tab === 'url' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  LinkedIn URL
                </button>
                <button
                  onClick={() => setTab('paste')}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors
                    ${tab === 'paste' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Paste Posts
                </button>
              </div>

              {tab === 'url' ? (
                <div className="space-y-4">
                  <Input
                    label="Your LinkedIn Profile URL"
                    type="url"
                    placeholder="https://www.linkedin.com/in/yourprofile/"
                    value={linkedinUrl}
                    onChange={(e) => setLinkedinUrl(e.target.value)}
                  />
                  <p className="text-xs text-gray-500">
                    Note: LinkedIn may block automated scraping. If it fails, use the &quot;Paste Posts&quot; tab.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <Textarea
                    label="Paste Your LinkedIn Posts"
                    placeholder={`Paste 3–20 of your recent LinkedIn posts here.\n\nSeparate each post with a blank line or "---"\n\nExample:\nAI is changing how we work...\n\n---\n\n5 lessons I learned from launching my startup...`}
                    value={manualPosts}
                    onChange={(e) => setManualPosts(e.target.value)}
                    rows={10}
                  />
                  <p className="text-xs text-gray-500">
                    The more posts you provide, the more accurately we can match your voice.
                  </p>
                </div>
              )}

              {scrapingBlocked && (
                <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                  LinkedIn blocked our scraper. Please paste your posts manually in the &quot;Paste Posts&quot; tab.
                </div>
              )}

              {analyzeError && !scrapingBlocked && (
                <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {analyzeError}
                </div>
              )}

              <Button
                onClick={handleAnalyze}
                loading={analyzeLoading}
                className="mt-6 w-full"
                size="lg"
                disabled={tab === 'url' ? !linkedinUrl : !manualPosts}
              >
                {analyzeLoading ? 'Analysing your content...' : 'Analyse My Profile →'}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── STEP 2: Interview Chat ─────────────────────────────────────── */}
        {step === 'interview' && (
          <div className="space-y-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-gray-900">Step 2: Strategy Interview</h2>
                    <p className="text-sm text-gray-500">
                      Answer 5 quick questions to personalise your content strategy
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-linkedin">{questionsAnswered}/5</div>
                    <div className="text-xs text-gray-500">answered</div>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="mt-3 h-1.5 rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-linkedin transition-all duration-500"
                    style={{ width: `${(questionsAnswered / 5) * 100}%` }}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="flex flex-col" style={{ height: '520px' }}>
              <ChatInterface
                messages={messages}
                onSend={handleChatSend}
                loading={chatLoading}
                placeholder="Type your answer..."
              />
            </Card>
          </div>
        )}

        {/* ── STEP 3: Complete ───────────────────────────────────────────── */}
        {step === 'complete' && (
          <Card>
            <CardContent className="p-10 text-center">
              <div className="text-5xl mb-4">🎉</div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">You&apos;re all set!</h2>
              <p className="text-gray-500 mb-6 max-w-md mx-auto">
                We&apos;ve analysed your LinkedIn presence and gathered your content strategy.
                Head to your dashboard to generate your first batch of personalised content ideas.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button size="lg" onClick={() => router.push('/dashboard')}>
                  Generate Content Ideas →
                </Button>
                <Button variant="outline" size="lg" asChild>
                  <Link href="/onboarding">Update Profile</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}
