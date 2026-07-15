import { Router } from 'express'
import supabaseAdmin from '../server/lib/supabaseAdmin.js'

const router = Router()

router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'mediscript-backend',
    timestamp: new Date().toISOString(),
  })
})

router.get('/health/keepalive', async (req, res, next) => {
  try {
    const expectedSecret = process.env.KEEPALIVE_SECRET
    const providedSecret = req.get('x-keepalive-secret')

    if (!expectedSecret) {
      return res.status(500).json({
        status: 'error',
        message: 'Keepalive secret is not configured.',
      })
    }

    if (!providedSecret || providedSecret !== expectedSecret) {
      return res.status(401).json({
        status: 'error',
        message: 'Unauthorized keepalive request.',
      })
    }

    const { error } = await supabaseAdmin.from('products').select('id').limit(1)

    if (error) {
      throw error
    }

    res.json({
      status: 'ok',
      service: 'mediscript-backend',
      touched: 'supabase.products',
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    next(error)
  }
})

export default router
