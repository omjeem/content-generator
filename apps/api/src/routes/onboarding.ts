import { Router, Response, NextFunction } from 'express'
import { authenticate, AuthRequest } from '../middleware/auth'

const router = Router()

router.use(authenticate)

/**
 * @swagger
 * /api/onboarding/chat:
 *   post:
 *     tags: [Onboarding]
 *     summary: Send message to interview agent (Agent 2) — implemented in Phase 3/4
 *     security:
 *       - cookieAuth: []
 */
router.post('/chat', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.status(501).json({ message: 'Implemented in Phase 3' })
  } catch (err) {
    next(err)
  }
})

/**
 * @swagger
 * /api/onboarding/session:
 *   get:
 *     tags: [Onboarding]
 *     summary: Get chat session history — implemented in Phase 4
 *     security:
 *       - cookieAuth: []
 */
router.get('/session', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.status(501).json({ message: 'Implemented in Phase 4' })
  } catch (err) {
    next(err)
  }
})

/**
 * @swagger
 * /api/onboarding/status:
 *   get:
 *     tags: [Onboarding]
 *     summary: Check interview completion status — implemented in Phase 4
 *     security:
 *       - cookieAuth: []
 */
router.get('/status', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.status(501).json({ message: 'Implemented in Phase 4' })
  } catch (err) {
    next(err)
  }
})

export default router
