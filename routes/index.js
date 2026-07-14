import { Router } from 'express'
import healthRoutes from './health.js'
import adminRoutes from './admin.js'
import catalogRoutes from './catalog.js'
import inventoryRoutes from './inventory.js'

const router = Router()

router.use(healthRoutes)
router.use('/catalog', catalogRoutes)
router.use('/admin', adminRoutes)
router.use('/admin/inventory', inventoryRoutes)

export default router
