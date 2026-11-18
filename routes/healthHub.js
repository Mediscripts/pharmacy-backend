import { Router } from 'express'
import supabaseAdmin from '../server/lib/supabaseAdmin.js'

const router = Router()

router.get('/categories', async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('health_article_categories')
      .select('id, name, slug, description, display_order')
      .eq('is_active', true)
      .order('display_order', { ascending: true })

    if (error) throw error
    res.json({ categories: data || [] })
  } catch (error) {
    next(error)
  }
})

router.get('/articles', async (req, res, next) => {
  try {
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1)
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 12, 1), 36)
    const search = String(req.query.q || '').trim().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/[%_]/g, '\\$&')
    const categorySlug = String(req.query.category || '').trim()
    const start = (page - 1) * limit

    let categoryId = ''
    if (categorySlug) {
      const { data: category, error: categoryError } = await supabaseAdmin
        .from('health_article_categories')
        .select('id')
        .eq('slug', categorySlug)
        .eq('is_active', true)
        .maybeSingle()
      if (categoryError) throw categoryError
      if (!category) return res.json({ articles: [], page, limit, hasMore: false })
      categoryId = category.id
    }

    let query = supabaseAdmin
      .from('health_articles')
      .select('id, title, slug, summary, cover_image_url, cover_image_credit, cover_image_source_url, author_name, reviewer_name, reviewed_at, published_at, category_id, health_article_categories(name, slug)', { count: 'exact' })
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .range(start, start + limit)

    if (categoryId) query = query.eq('category_id', categoryId)
    if (search) query = query.or(`title.ilike.%${search}%,summary.ilike.%${search}%,body.ilike.%${search}%`)

    const { data, error, count } = await query
    if (error) throw error

    const rows = data || []
    res.json({
      articles: rows.slice(0, limit).map((article) => ({
        ...article,
        category: article.health_article_categories?.name || '',
        category_slug: article.health_article_categories?.slug || '',
        health_article_categories: undefined,
      })),
      page,
      limit,
      hasMore: start + limit < (count || 0),
    })
  } catch (error) {
    next(error)
  }
})

router.get('/articles/:slug', async (req, res, next) => {
  try {
    const { data: article, error } = await supabaseAdmin
      .from('health_articles')
      .select('id, title, slug, summary, body, cover_image_url, cover_image_credit, cover_image_source_url, author_name, reviewer_name, reviewed_at, published_at, category_id, seo_title, seo_description, health_article_categories(name, slug)')
      .eq('slug', req.params.slug)
      .eq('status', 'published')
      .maybeSingle()

    if (error) throw error
    if (!article) return res.status(404).json({ message: 'Article not found.' })

    const { data: related, error: relatedError } = await supabaseAdmin
      .from('health_articles')
      .select('id, title, slug, summary, cover_image_url, cover_image_credit, cover_image_source_url, published_at, health_article_categories(name, slug)')
      .eq('status', 'published')
      .eq('category_id', article.category_id)
      .neq('id', article.id)
      .order('published_at', { ascending: false })
      .limit(3)

    if (relatedError) throw relatedError

    res.json({
      article: {
        ...article,
        category: article.health_article_categories?.name || '',
        category_slug: article.health_article_categories?.slug || '',
        health_article_categories: undefined,
      },
      related: related || [],
    })
  } catch (error) {
    next(error)
  }
})

export default router
