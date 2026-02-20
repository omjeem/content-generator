import { Router, Response, NextFunction } from 'express'
import { authenticate, AuthRequest } from '../middleware/auth'

const router = Router()

// All persona routes require authentication
router.use(authenticate)

/**
 * @swagger
 * /api/persona/analyze:
 *   post:
 *     tags: [Persona]
 *     summary: Analyze LinkedIn profile (Agent 1) — implemented in Phase 3/4
 *     security:
 *       - cookieAuth: []
 */
router.post('/analyze', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.status(501).json({ message: 'Implemented in Phase 3' })
  } catch (err) {
    next(err)
  }
})

/**
 * @swagger
 * /api/persona:
 *   get:
 *     tags: [Persona]
 *     summary: Get current user persona — implemented in Phase 4
 *     security:
 *       - cookieAuth: []
 */
router.get('/', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.status(501).json({ message: 'Implemented in Phase 4' })
  } catch (err) {
    next(err)
  }
})

export default router
