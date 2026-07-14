import { Router } from 'express'
import supabaseAdmin from '../server/lib/supabaseAdmin.js'

const router = Router()

router.get('/products', async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('products')
      .select(
        'id, name, slug, description, price, stock_quantity, prescription_required, is_active, images, categories(name, slug)',
      )
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (error) {
      throw error
    }

    const products = (data || []).map((product) => ({
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      price: product.price,
      stockQuantity: product.stock_quantity,
      prescriptionRequired: product.prescription_required,
      isActive: product.is_active,
      images: product.images,
      category: product.categories?.name || 'Uncategorized',
      categorySlug: product.categories?.slug || '',
    }))

    res.json({ products })
  } catch (error) {
    next(error)
  }
})

router.get('/categories', async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('categories')
      .select('id, name, slug, description, is_active')
      .eq('is_active', true)
      .order('name', { ascending: true })

    if (error) {
      throw error
    }

    res.json({ categories: data || [] })
  } catch (error) {
    next(error)
  }
})

export default router
