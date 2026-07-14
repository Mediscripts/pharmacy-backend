import { Router } from 'express'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import supabaseAdmin from '../server/lib/supabaseAdmin.js'

const router = Router()

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function parsePrice(value) {
  const price = Number(value)

  if (Number.isNaN(price) || price < 0) {
    throw new Error('Price must be a valid non-negative number.')
  }

  return price.toFixed(2)
}

function parseStockQuantity(value) {
  const stockQuantity = Number.parseInt(value, 10)

  if (Number.isNaN(stockQuantity) || stockQuantity < 0) {
    throw new Error('Stock quantity must be a valid non-negative whole number.')
  }

  return stockQuantity
}

function buildProductPayload(body) {
  const name = String(body.name || '').trim()
  const description = String(body.description || '').trim()

  if (!name) {
    throw new Error('Product name is required.')
  }

  if (!description) {
    throw new Error('Product description is required.')
  }

  const images = Array.isArray(body.images)
    ? body.images.filter((image) => typeof image === 'string' && image.trim())
    : []

  return {
    name,
    slug: String(body.slug || '').trim() || slugify(name),
    description,
    price: parsePrice(body.price ?? 0),
    category_id: body.categoryId || null,
    stock_quantity: parseStockQuantity(body.stockQuantity ?? 0),
    prescription_required: Boolean(body.prescriptionRequired),
    is_active: body.isActive === undefined ? true : Boolean(body.isActive),
    images,
  }
}

function buildCategoryPayload(body) {
  const name = String(body.name || '').trim()

  if (!name) {
    throw new Error('Category name is required.')
  }

  return {
    name,
    slug: String(body.slug || '').trim() || slugify(name),
    description: String(body.description || '').trim() || null,
    is_active: body.isActive === undefined ? true : Boolean(body.isActive),
  }
}

router.get('/me', requireAuth, requireAdmin, (req, res) => {
  res.json({
    user: {
      id: req.auth.user.id,
      email: req.auth.user.email,
      fullName: req.auth.profile?.full_name || '',
      role: req.auth.profile?.role || 'customer',
    },
  })
})

router.get('/dashboard', requireAuth, requireAdmin, (_req, res) => {
  res.json({ message: 'Admin dashboard endpoint ready.' })
})

router.get('/summary', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const [
      totalOrders,
      pendingOrders,
      pendingPrescriptionReviews,
      totalProducts,
      lowStockProducts,
      outOfStockProducts,
      revenueResult,
    ] = await Promise.all([
      supabaseAdmin.from('orders').select('id', { count: 'exact', head: true }),
      supabaseAdmin
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'Pending Payment'),
      supabaseAdmin
        .from('prescriptions')
        .select('id', { count: 'exact', head: true })
        .eq('review_status', 'Pending'),
      supabaseAdmin.from('products').select('id', { count: 'exact', head: true }),
      supabaseAdmin
        .from('products')
        .select('id', { count: 'exact', head: true })
        .gt('stock_quantity', 0)
        .lte('stock_quantity', 10),
      supabaseAdmin
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('stock_quantity', 0),
      supabaseAdmin
        .from('payments')
        .select('amount')
        .eq('status', 'Verified'),
    ])

    if (
      totalOrders.error ||
      pendingOrders.error ||
      pendingPrescriptionReviews.error ||
      totalProducts.error ||
      lowStockProducts.error ||
      outOfStockProducts.error ||
      revenueResult.error
    ) {
      throw (
        totalOrders.error ||
        pendingOrders.error ||
        pendingPrescriptionReviews.error ||
        totalProducts.error ||
        lowStockProducts.error ||
        outOfStockProducts.error ||
        revenueResult.error
      )
    }

    const revenue = (revenueResult.data || []).reduce(
      (sum, payment) => sum + Number(payment.amount || 0),
      0,
    )

    res.json({
      metrics: {
        totalOrders: totalOrders.count || 0,
        pendingOrders: pendingOrders.count || 0,
        pendingPrescriptionReviews: pendingPrescriptionReviews.count || 0,
        totalProducts: totalProducts.count || 0,
        lowStockProducts: lowStockProducts.count || 0,
        outOfStockProducts: outOfStockProducts.count || 0,
        revenue,
      },
    })
  } catch (error) {
    next(error)
  }
})

router.get('/products', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('products')
      .select(
        'id, name, slug, description, price, stock_quantity, prescription_required, is_active, images, category_id, categories(name, slug)',
      )
      .order('created_at', { ascending: false })

    if (error) {
      throw error
    }

    res.json({ products: data || [] })
  } catch (error) {
    next(error)
  }
})

router.get('/products/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('products')
      .select(
        'id, name, slug, description, price, stock_quantity, prescription_required, is_active, images, category_id, categories(name, slug)',
      )
      .eq('id', req.params.id)
      .maybeSingle()

    if (error) {
      throw error
    }

    if (!data) {
      return res.status(404).json({ message: 'Product not found.' })
    }

    res.json({ product: data })
  } catch (error) {
    next(error)
  }
})

router.post('/products', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const payload = buildProductPayload(req.body)

    const { data, error } = await supabaseAdmin
      .from('products')
      .insert(payload)
      .select(
        'id, name, slug, description, price, stock_quantity, prescription_required, is_active, images, category_id, categories(name, slug)',
      )
      .single()

    if (error) {
      throw error
    }

    res.status(201).json({ product: data })
  } catch (error) {
    next(error)
  }
})

router.patch('/products/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const updates = {}

    if (req.body.name !== undefined) updates.name = String(req.body.name || '').trim()
    if (req.body.description !== undefined) updates.description = String(req.body.description || '').trim()
    if (req.body.slug !== undefined) updates.slug = String(req.body.slug || '').trim()
    if (req.body.price !== undefined) updates.price = parsePrice(req.body.price)
    if (req.body.categoryId !== undefined) updates.category_id = req.body.categoryId || null
    if (req.body.stockQuantity !== undefined) updates.stock_quantity = parseStockQuantity(req.body.stockQuantity)
    if (req.body.prescriptionRequired !== undefined) updates.prescription_required = Boolean(req.body.prescriptionRequired)
    if (req.body.isActive !== undefined) updates.is_active = Boolean(req.body.isActive)
    if (req.body.images !== undefined) {
      updates.images = Array.isArray(req.body.images)
        ? req.body.images.filter((image) => typeof image === 'string' && image.trim())
        : []
    }

    if (updates.name && !updates.slug) {
      updates.slug = slugify(updates.name)
    }

    if (updates.name === '') {
      throw new Error('Product name cannot be empty.')
    }

    if (updates.description === '') {
      throw new Error('Product description cannot be empty.')
    }

    const { data, error } = await supabaseAdmin
      .from('products')
      .update(updates)
      .eq('id', req.params.id)
      .select(
        'id, name, slug, description, price, stock_quantity, prescription_required, is_active, images, category_id, categories(name, slug)',
      )
      .single()

    if (error) {
      throw error
    }

    res.json({ product: data })
  } catch (error) {
    next(error)
  }
})

router.delete('/products/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { error } = await supabaseAdmin
      .from('products')
      .update({ is_active: false })
      .eq('id', req.params.id)

    if (error) {
      throw error
    }

    res.json({ message: 'Product archived.' })
  } catch (error) {
    next(error)
  }
})

router.get('/categories', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('categories')
      .select('id, name, slug, description, is_active, created_at, updated_at')
      .order('name', { ascending: true })

    if (error) {
      throw error
    }

    res.json({ categories: data || [] })
  } catch (error) {
    next(error)
  }
})

router.post('/categories', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const payload = buildCategoryPayload(req.body)

    const { data, error } = await supabaseAdmin
      .from('categories')
      .insert(payload)
      .select('id, name, slug, description, is_active, created_at, updated_at')
      .single()

    if (error) {
      throw error
    }

    res.status(201).json({ category: data })
  } catch (error) {
    next(error)
  }
})

router.patch('/categories/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const updates = {}

    if (req.body.name !== undefined) {
      const name = String(req.body.name || '').trim()
      if (!name) {
        throw new Error('Category name cannot be empty.')
      }
      updates.name = name
      if (req.body.slug === undefined) {
        updates.slug = slugify(name)
      }
    }

    if (req.body.slug !== undefined) updates.slug = String(req.body.slug || '').trim()
    if (req.body.description !== undefined) updates.description = String(req.body.description || '').trim() || null
    if (req.body.isActive !== undefined) updates.is_active = Boolean(req.body.isActive)

    const { data, error } = await supabaseAdmin
      .from('categories')
      .update(updates)
      .eq('id', req.params.id)
      .select('id, name, slug, description, is_active, created_at, updated_at')
      .single()

    if (error) {
      throw error
    }

    res.json({ category: data })
  } catch (error) {
    next(error)
  }
})

router.delete('/categories/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { error } = await supabaseAdmin
      .from('categories')
      .update({ is_active: false })
      .eq('id', req.params.id)

    if (error) {
      throw error
    }

    res.json({ message: 'Category archived.' })
  } catch (error) {
    next(error)
  }
})

export default router
