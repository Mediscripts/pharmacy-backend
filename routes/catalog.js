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

router.get('/products/:slug', async (req, res, next) => {
  try {
    const { slug } = req.params

    const { data, error } = await supabaseAdmin
      .from('products')
      .select(
        'id, name, slug, description, price, stock_quantity, prescription_required, is_active, images, categories(name, slug)',
      )
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle()

    if (error) {
      throw error
    }

    if (!data) {
      return res.status(404).json({ message: 'Product not found.' })
    }

    res.json({
      product: {
        id: data.id,
        name: data.name,
        slug: data.slug,
        description: data.description,
        price: data.price,
        stockQuantity: data.stock_quantity,
        prescriptionRequired: data.prescription_required,
        isActive: data.is_active,
        images: data.images,
        category: data.categories?.name || 'Uncategorized',
        categorySlug: data.categories?.slug || '',
      },
    })
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
