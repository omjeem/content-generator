import { Router, Response, NextFunction } from 'express'
import { authenticate, AuthRequest } from '../middleware/auth'

const router = Router()

router.use(authenticate)

/**
 * @swagger
 * /api/trends:
 *   get:
 *     tags: [Trends]
 *     summary: Get trending topics for user's niche (Agent 3) — implemented in Phase 3/4
 *     security:
 *       - cookieAuth: []
 */
router.get('/', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.status(501).json({ message: 'Implemented in Phase 3' })
  } catch (err) {
    next(err)
  }
})

export default router
