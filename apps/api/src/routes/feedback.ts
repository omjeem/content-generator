/**
 * Feedback Routes — Phase C #15
 *
 * POST /api/suggestions/:setId/feedback   Submit feedback on one suggestion
 * GET  /api/suggestions/:setId/feedback   Get all feedback for a set (by this user)
 * GET  /api/feedback/summary              Aggregated feedback summary for the user
 */

import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import { authenticate, AuthRequest } from "../middleware/auth";
import { SuggestionFeedback } from "../models/SuggestionFeedback";
import { ContentSuggestion } from "../models/ContentSuggestion";
import { processFeedback } from "../services/feedbackProcessor";

const router = Router();
router.use(authenticate);

// ── Validation ────────────────────────────────────────────────────────────────

const feedbackBodySchema = z.object({
  suggestionIndex: z.number().int().min(0),
  rating: z.enum(["loved", "good", "meh", "bad"]).optional(),
  action: z.enum(["saved", "draft", "published", "dismissed"]),
  feedbackText: z.string().max(1000).optional(),
});

// ── POST /api/suggestions/:setId/feedback ─────────────────────────────────────
/**
 * @swagger
 * /api/suggestions/{setId}/feedback:
 *   post:
 *     tags: [Feedback]
 *     summary: Submit feedback on a specific suggestion in a set
 *     description: |
 *       Records quality rating + action taken for one suggestion.
 *       Snapshots the suggestion at time of feedback for historical context.
 *       Triggers background signal processing (LLM text parse + periodic learning).
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: setId
 *         required: true
 *         schema:
 *           type: string
 *         description: ContentSuggestion._id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [suggestionIndex, action]
 *             properties:
 *               suggestionIndex:
 *                 type: integer
 *                 description: 0-based index of the suggestion within the set
 *               rating:
 *                 type: string
 *                 enum: [loved, good, meh, bad]
 *               action:
 *                 type: string
 *                 enum: [saved, draft, published, dismissed]
 *               feedbackText:
 *                 type: string
 *                 maxLength: 1000
 *     responses:
 *       201:
 *         description: Feedback saved
 *       400:
 *         description: Invalid input or suggestion index out of range
 *       404:
 *         description: Suggestion set not found
 *       409:
 *         description: Feedback already submitted for this suggestion
 */
router.post(
  "/suggestions/:setId/feedback",
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { setId } = req.params as { setId: string };

      if (!mongoose.Types.ObjectId.isValid(setId)) {
        res.status(400).json({ error: "Invalid suggestion set ID" });
        return;
      }

      const body = feedbackBodySchema.parse(req.body);
      const userId = new mongoose.Types.ObjectId(req.userId!);

      // Verify the suggestion set exists and belongs to this user
      const suggestionSet = await ContentSuggestion.findOne({
        _id: setId,
        userId,
      }).lean();

      if (!suggestionSet) {
        res.status(404).json({ error: "Suggestion set not found." });
        return;
      }

      // Validate index is in range
      if (body.suggestionIndex >= suggestionSet.suggestions.length) {
        res.status(400).json({
          error: `Suggestion index ${body.suggestionIndex} is out of range (set has ${suggestionSet.suggestions.length} suggestions)`,
        });
        return;
      }

      // Snapshot the suggestion at time of feedback
      const suggestion = suggestionSet.suggestions[body.suggestionIndex]!;
      const suggestionSnapshot = {
        topic: suggestion.topic,
        angle: suggestion.angle,
        format: suggestion.format,
        hook: suggestion.hook,
      };

      // Upsert — if feedback already exists, update the rating/action/text
      // (allows the user to change their mind)
      const feedback = await SuggestionFeedback.findOneAndUpdate(
        {
          userId,
          suggestionSetId: new mongoose.Types.ObjectId(setId),
          suggestionIndex: body.suggestionIndex,
        },
        {
          $set: {
            rating: body.rating,
            action: body.action,
            feedbackText: body.feedbackText,
            suggestionSnapshot,
          },
        },
        { upsert: true, new: true },
      );

      // Fire-and-forget background processing (signal parsing + learning trigger)
      processFeedback(feedback);

      res.status(201).json({
        message: "Feedback saved",
        feedbackId: feedback._id,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /api/suggestions/:setId/feedback ──────────────────────────────────────
/**
 * @swagger
 * /api/suggestions/{setId}/feedback:
 *   get:
 *     tags: [Feedback]
 *     summary: Get all feedback submitted by this user for a suggestion set
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: setId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of feedback records for this set
 */
router.get(
  "/suggestions/:setId/feedback",
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { setId } = req.params as { setId: string };

      if (!mongoose.Types.ObjectId.isValid(setId)) {
        res.status(400).json({ error: "Invalid suggestion set ID" });
        return;
      }

      const userId = new mongoose.Types.ObjectId(req.userId!);

      const feedbacks = await SuggestionFeedback.find({
        userId,
        suggestionSetId: new mongoose.Types.ObjectId(setId),
      })
        .sort({ suggestionIndex: 1 })
        .lean();

      // Return as a map keyed by suggestionIndex for easy frontend lookup
      const feedbackMap: Record<
        number,
        {
          rating?: string;
          action: string;
          feedbackText?: string;
          feedbackId: string;
        }
      > = {};

      for (const fb of feedbacks) {
        feedbackMap[fb.suggestionIndex] = {
          feedbackId: String(fb._id),
          rating: fb.rating,
          action: fb.action,
          feedbackText: fb.feedbackText,
        };
      }

      res.json({ feedbacks: feedbackMap, total: feedbacks.length });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /api/feedback/summary ─────────────────────────────────────────────────
/**
 * @swagger
 * /api/feedback/summary:
 *   get:
 *     tags: [Feedback]
 *     summary: Get aggregated feedback summary for the current user
 *     description: |
 *       Returns preferred topics, avoided topics, format distribution,
 *       and average rating — useful for the dashboard persona widget.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Feedback summary
 */
router.get(
  "/feedback/summary",
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = new mongoose.Types.ObjectId(req.userId!);

      // Aggregate recent feedback (last 50)
      const feedbacks = await SuggestionFeedback.find({ userId })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();

      if (feedbacks.length === 0) {
        res.json({
          totalFeedback: 0,
          preferredTopics: [],
          avoidTopics: [],
          formatDistribution: {},
          ratingDistribution: {},
          averageRating: 0,
        });
        return;
      }

      // Tally ratings
      const ratingCounts: Record<string, number> = {};
      const RATING_NUMERIC: Record<string, number> = {
        loved: 4,
        good: 3,
        meh: 2,
        bad: 1,
      };
      let ratingSum = 0;
      let ratingCount = 0;

      // Tally formats
      const formatCounts: Record<string, number> = {};

      // Tally topics
      const topicPositive: Record<string, number> = {};
      const topicNegative: Record<string, number> = {};

      for (const fb of feedbacks) {
        // Ratings
        if (fb.rating) {
          ratingCounts[fb.rating] = (ratingCounts[fb.rating] ?? 0) + 1;
          ratingSum += RATING_NUMERIC[fb.rating] ?? 2;
          ratingCount++;
        }

        // Format
        const fmt = fb.suggestionSnapshot?.format;
        if (fmt) {
          formatCounts[fmt] = (formatCounts[fmt] ?? 0) + 1;
        }

        // Topic sentiment
        const topic = fb.suggestionSnapshot?.topic;
        if (topic) {
          if (fb.rating === "loved" || fb.rating === "good") {
            topicPositive[topic] = (topicPositive[topic] ?? 0) + 1;
          } else if (fb.rating === "bad") {
            topicNegative[topic] = (topicNegative[topic] ?? 0) + 1;
          }
        }
      }

      // Build preferred / avoid lists
      const preferredTopics = Object.entries(topicPositive)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([topic]) => topic);

      const avoidTopics = Object.entries(topicNegative)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([topic]) => topic);

      // Normalise format distribution to percentages
      const total = feedbacks.length;
      const formatDistribution: Record<string, number> = {};
      for (const [fmt, count] of Object.entries(formatCounts)) {
        formatDistribution[fmt] = Math.round((count / total) * 100);
      }

      const averageRating =
        ratingCount > 0
          ? Math.round((ratingSum / ratingCount) * 100) / 100
          : 0;

      res.json({
        totalFeedback: feedbacks.length,
        preferredTopics,
        avoidTopics,
        formatDistribution,
        ratingDistribution: ratingCounts,
        averageRating,
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
