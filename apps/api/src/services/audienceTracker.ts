import mongoose from "mongoose";
import { AudienceInsight } from "../models/AudienceInsight";

export interface IAudienceInsightsResult {
  topPerformingTopics: { topic: string; avgEngagement: number; count: number }[];
  bestPostingTimes: { dayOfWeek: string; timeOfDay: string; avgEngagement: number }[];
  formatPerformance: { format: string; avgEngagement: number; count: number }[];
  totalRecords: number;
  overallAvgEngagement: number;
}

/**
 * Record a new audience engagement data point.
 */
export async function recordEngagement(data: {
  userId: string;
  postDraftId?: string;
  postContent: string;
  engagement: { likes: number; comments: number; reposts: number; impressions?: number };
  topics: string[];
  format: string;
  dayOfWeek: string;
  timeOfDay: string;
  audienceQuestions?: string[];
}) {
  return AudienceInsight.create({
    userId: new mongoose.Types.ObjectId(data.userId),
    postDraftId: data.postDraftId ? new mongoose.Types.ObjectId(data.postDraftId) : undefined,
    postContent: data.postContent,
    engagement: data.engagement,
    topics: data.topics,
    format: data.format,
    dayOfWeek: data.dayOfWeek,
    timeOfDay: data.timeOfDay,
    audienceQuestions: data.audienceQuestions ?? [],
    recordedAt: new Date(),
  });
}

/**
 * Compute audience insights from all recorded engagement data for a user.
 */
export async function getAudienceInsights(userId: string): Promise<IAudienceInsightsResult> {
  const userObjectId = new mongoose.Types.ObjectId(userId);

  const records = await AudienceInsight.find({ userId: userObjectId })
    .sort({ recordedAt: -1 })
    .limit(100)
    .lean();

  if (records.length === 0) {
    return {
      topPerformingTopics: [],
      bestPostingTimes: [],
      formatPerformance: [],
      totalRecords: 0,
      overallAvgEngagement: 0,
    };
  }

  const engagementScore = (e: { likes: number; comments: number; reposts: number }) =>
    e.likes + e.comments * 2 + e.reposts * 3;

  // Topic performance
  const topicMap = new Map<string, { total: number; count: number }>();
  for (const r of records) {
    const score = engagementScore(r.engagement);
    for (const topic of r.topics) {
      const entry = topicMap.get(topic) ?? { total: 0, count: 0 };
      entry.total += score;
      entry.count += 1;
      topicMap.set(topic, entry);
    }
  }
  const topPerformingTopics = Array.from(topicMap.entries())
    .map(([topic, { total, count }]) => ({ topic, avgEngagement: Math.round(total / count), count }))
    .sort((a, b) => b.avgEngagement - a.avgEngagement)
    .slice(0, 10);

  // Posting time performance
  const timeMap = new Map<string, { total: number; count: number }>();
  for (const r of records) {
    const key = `${r.dayOfWeek}|${r.timeOfDay}`;
    const score = engagementScore(r.engagement);
    const entry = timeMap.get(key) ?? { total: 0, count: 0 };
    entry.total += score;
    entry.count += 1;
    timeMap.set(key, entry);
  }
  const bestPostingTimes = Array.from(timeMap.entries())
    .map(([key, { total, count }]) => {
      const [dayOfWeek, timeOfDay] = key.split("|");
      return { dayOfWeek: dayOfWeek!, timeOfDay: timeOfDay!, avgEngagement: Math.round(total / count) };
    })
    .sort((a, b) => b.avgEngagement - a.avgEngagement)
    .slice(0, 5);

  // Format performance
  const formatMap = new Map<string, { total: number; count: number }>();
  for (const r of records) {
    const score = engagementScore(r.engagement);
    const entry = formatMap.get(r.format) ?? { total: 0, count: 0 };
    entry.total += score;
    entry.count += 1;
    formatMap.set(r.format, entry);
  }
  const formatPerformance = Array.from(formatMap.entries())
    .map(([format, { total, count }]) => ({ format, avgEngagement: Math.round(total / count), count }))
    .sort((a, b) => b.avgEngagement - a.avgEngagement);

  // Overall
  const totalEngagement = records.reduce((sum, r) => sum + engagementScore(r.engagement), 0);

  return {
    topPerformingTopics,
    bestPostingTimes,
    formatPerformance,
    totalRecords: records.length,
    overallAvgEngagement: Math.round(totalEngagement / records.length),
  };
}

/**
 * Build a prompt section for the content generator with audience signals.
 */
export function buildAudienceSignalsSection(insights: IAudienceInsightsResult): string {
  if (insights.totalRecords < 3) return "";

  const lines: string[] = ["\n## AUDIENCE RESONANCE DATA"];
  lines.push(`Based on ${insights.totalRecords} tracked posts:`);

  if (insights.topPerformingTopics.length > 0) {
    const topTopics = insights.topPerformingTopics.slice(0, 5).map(t => `${t.topic} (avg ${t.avgEngagement} engagement)`);
    lines.push(`\nTop-performing topics: ${topTopics.join(", ")}`);
    lines.push("→ Prioritize these topics when relevant to trending topics.");
  }

  if (insights.bestPostingTimes.length > 0) {
    const bestTime = insights.bestPostingTimes[0]!;
    lines.push(`\nBest posting time: ${bestTime.dayOfWeek} ${bestTime.timeOfDay} (avg ${bestTime.avgEngagement} engagement)`);
  }

  if (insights.formatPerformance.length > 0) {
    const topFormat = insights.formatPerformance[0]!;
    lines.push(`\nTop-performing format: ${topFormat.format} (avg ${topFormat.avgEngagement} engagement)`);
    lines.push("→ Favor this format unless the user explicitly requested a different one.");
  }

  return lines.join("\n");
}
