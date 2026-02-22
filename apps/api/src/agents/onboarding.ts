import { Agent } from '@mastra/core/agent'
import { google } from '@ai-sdk/google'
import { z } from 'zod'
import { ChatSession } from '../models/ChatSession'
import { UserPersona } from '../models/UserPersona'
import { trackTokenUsage } from '../services/tokenUsage'
import mongoose from 'mongoose'

// ── Interview questions the agent must cover ──────────────────────────────────

const INTERVIEW_QUESTIONS = [
  'goals',
  'targetAudience',
  'industry',
  'contentPillars',
  'postingFrequency',
] as const

export type InterviewField = (typeof INTERVIEW_QUESTIONS)[number]

// ── Output schema for extracted interview answers ─────────────────────────────

export const InterviewAnswersSchema = z.object({
  goals: z.string().optional().describe('Professional goals for LinkedIn content'),
  targetAudience: z.string().optional().describe('Target audience description'),
  industry: z.string().optional().describe('Industry or niche'),
  contentPillars: z.array(z.string()).optional().describe('3 main content themes'),
  postingFrequency: z.string().optional().describe('How often they want to post'),
  interviewComplete: z.boolean().describe('True when all 5 questions have been answered'),
  questionsAnswered: z.number().describe('Number of questions answered so far (0-5)'),
})

export type InterviewAnswers = z.infer<typeof InterviewAnswersSchema>

// ── Agent ─────────────────────────────────────────────────────────────────────

export const onboardingAgent = new Agent({
  id: 'onboarding-interview',
  name: 'onboarding-interview',
  model: google('gemini-2.5-flash'),
  instructions: `You are a friendly LinkedIn content strategist conducting an onboarding interview.

Your job is to gather information about the user's LinkedIn content strategy by asking targeted questions ONE AT A TIME.

The 5 questions you must cover (in a natural, conversational way — don't make it feel like a form):
1. What are your main professional goals for posting on LinkedIn?
2. Who is your target audience? (their role, industry, seniority level)
3. What industry or niche are you in?
4. What are your 3 main content pillars — the topics you want to be known for?
5. How often do you want to post on LinkedIn? (daily, 3x/week, weekly, etc.)

Rules:
- Ask ONLY ONE question at a time
- Acknowledge the user's previous answer warmly before asking the next question
- If an answer is vague, ask a follow-up before moving on
- Track which questions have been answered based on conversation history
- When ALL 5 questions are answered, end with: "Perfect! I have everything I need to start finding content ideas for you. Head back to your dashboard to generate your first batch of personalized content suggestions!"
- Keep responses concise and friendly

At the END of each response, include a JSON block like this (hidden in your response):
<!--INTERVIEW_DATA
{
  "goals": "..or null if not yet answered",
  "targetAudience": "..or null",
  "industry": "..or null",
  "contentPillars": [".."] or null,
  "postingFrequency": "..or null",
  "questionsAnswered": 0,
  "interviewComplete": false
}
INTERVIEW_DATA-->`,
})

// ── Chat with working memory from MongoDB ─────────────────────────────────────

export interface OnboardingChatInput {
  userId: string
  message: string
}

export interface OnboardingChatOutput {
  reply: string
  sessionId: string
  interviewComplete: boolean
  questionsAnswered: number
  extractedData: Partial<InterviewAnswers>
}

export async function runOnboardingChat(input: OnboardingChatInput): Promise<OnboardingChatOutput> {
  const { userId, message } = input

  // Load or create the chat session for this user
  let session = await ChatSession.findOne({
    userId: new mongoose.Types.ObjectId(userId),
    agentType: 'onboarding',
  })

  if (!session) {
    session = await ChatSession.create({
      userId: new mongoose.Types.ObjectId(userId),
      sessionId: `onboarding-${userId}`,
      agentType: 'onboarding',
      messages: [],
    })
  }

  // Build conversation history for Mastra
  const history = session.messages.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))

  // Add the new user message
  history.push({ role: 'user', content: message })

  // Run the agent with full history as context
  const historyText = history
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n')

  const result = await onboardingAgent.generate(
    `Here is the conversation so far:\n\n${historyText}\n\nPlease respond to the user's latest message.`
  )

  const reply = result.text

  // Track token usage — fire-and-forget
  trackTokenUsage({
    userId,
    agent: 'onboarding',
    operation: 'onboarding_chat',
    inputTokens: result.usage?.inputTokens ?? 0,
    outputTokens: result.usage?.outputTokens ?? 0,
    totalTokens: (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0),
    metadata: { sessionId: session.sessionId },
  })

  // Persist new messages to MongoDB
  session.messages.push({ role: 'user', content: message, timestamp: new Date() })
  session.messages.push({ role: 'assistant', content: reply, timestamp: new Date() })
  await session.save()

  // Parse the hidden data block from the agent's response
  const extractedData = parseInterviewData(reply)

  // If interview is complete, update UserPersona
  if (extractedData.interviewComplete) {
    await UserPersona.findOneAndUpdate(
      { userId: new mongoose.Types.ObjectId(userId) },
      {
        $set: {
          goals: extractedData.goals,
          targetAudience: extractedData.targetAudience,
          industry: extractedData.industry,
          contentPillars: extractedData.contentPillars ?? [],
          postingFrequency: extractedData.postingFrequency,
          interviewComplete: true,
        },
      },
      { upsert: true, new: true }
    )
  }

  return {
    reply: stripInterviewDataBlock(reply),
    sessionId: session.sessionId,
    interviewComplete: extractedData.interviewComplete ?? false,
    questionsAnswered: extractedData.questionsAnswered ?? 0,
    extractedData,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseInterviewData(text: string): Partial<InterviewAnswers> {
  try {
    const match = text.match(/<!--INTERVIEW_DATA\s*([\s\S]*?)\s*INTERVIEW_DATA-->/)
    if (!match || !match[1]) return {}
    return JSON.parse(match[1]) as Partial<InterviewAnswers>
  } catch {
    return {}
  }
}

function stripInterviewDataBlock(text: string): string {
  return text.replace(/<!--INTERVIEW_DATA[\s\S]*?INTERVIEW_DATA-->/g, '').trim()
}

// ── Check interview status ────────────────────────────────────────────────────

export async function getInterviewStatus(userId: string): Promise<{
  complete: boolean
  missingFields: string[]
}> {
  const persona = await UserPersona.findOne({
    userId: new mongoose.Types.ObjectId(userId),
  })

  if (!persona) {
    return { complete: false, missingFields: INTERVIEW_QUESTIONS.slice() }
  }

  const missingFields: string[] = []
  if (!persona.goals) missingFields.push('goals')
  if (!persona.targetAudience) missingFields.push('targetAudience')
  if (!persona.industry) missingFields.push('industry')
  if (!persona.contentPillars?.length) missingFields.push('contentPillars')
  if (!persona.postingFrequency) missingFields.push('postingFrequency')

  return {
    complete: persona.interviewComplete,
    missingFields,
  }
}
