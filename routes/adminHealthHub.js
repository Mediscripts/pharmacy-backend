import { Router } from 'express'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import supabaseAdmin from '../server/lib/supabaseAdmin.js'
import { logAdminAction } from '../server/lib/adminAudit.js'

const router = Router()
const articleFields = 'id, category_id, title, slug, summary, body, cover_image_url, cover_image_credit, cover_image_source_url, author_name, reviewer_name, reviewed_at, status, published_at, seo_title, seo_description, created_by, updated_by, created_at, updated_at'

function inputError(message) {
  const error = new Error(message)
  error.statusCode = 400
  return error
}

function throwContentWriteError(error) {
  if (error?.code === '23505') throw inputError('That article URL slug is already in use. Choose another slug.')
  if (error?.code === '23503') throw inputError('Choose an available Health Hub category.')
  throw error
}

function slugify(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function text(value, maxLength, label, required = false) {
  const normalized = String(value ?? '').trim()
  if (required && !normalized) throw inputError(`${label} is required.`)
  if (normalized.length > maxLength) throw inputError(`${label} must be ${maxLength} characters or fewer.`)
  return normalized
}

function imageUrl(value, label = 'Image URL') {
  const normalized = text(value, 2048, label)
  if (!normalized) return null
  let parsed
  try { parsed = new URL(normalized) } catch { throw inputError(`${label} must be a valid HTTPS address.`) }
  if (parsed.protocol !== 'https:') throw inputError(`${label} must use HTTPS.`)
  return parsed.toString()
}

function buildPayload(body, actorId, { creating = false, existingArticle = null } = {}) {
  const title = text(body.title, 180, 'Title', creating)
  const payload = {
    updated_by: actorId,
  }

  if (creating || body.title !== undefined) payload.title = title
  if (creating || body.slug !== undefined || body.title !== undefined) {
    payload.slug = slugify(text(body.slug || title, 180, 'URL slug', true))
    if (!payload.slug) throw inputError('URL slug must contain letters or numbers.')
  }
  if (creating || body.categoryId !== undefined) {
    payload.category_id = text(body.categoryId, 80, 'Category', creating)
  }
  if (creating || body.summary !== undefined) payload.summary = text(body.summary, 500, 'Summary')
  if (creating || body.body !== undefined) payload.body = text(body.body, 100000, 'Article body')
  if (creating || body.coverImageUrl !== undefined) payload.cover_image_url = imageUrl(body.coverImageUrl)
  if (creating || body.coverImageCredit !== undefined) payload.cover_image_credit = text(body.coverImageCredit, 180, 'Image credit') || null
  if (creating || body.coverImageSourceUrl !== undefined) payload.cover_image_source_url = imageUrl(body.coverImageSourceUrl, 'Image source URL')
  const coverImageUrl = payload.cover_image_url !== undefined ? payload.cover_image_url : existingArticle?.cover_image_url
  const coverCredit = payload.cover_image_credit !== undefined ? payload.cover_image_credit : existingArticle?.cover_image_credit
  const coverSource = payload.cover_image_source_url !== undefined ? payload.cover_image_source_url : existingArticle?.cover_image_source_url
  if (body.coverImageIsOurs === false && coverImageUrl && !coverCredit && !coverSource) {
    throw inputError('Add a cover image credit or source link for an image not owned by Mediscripts.')
  }
  if (creating || body.authorName !== undefined) payload.author_name = text(body.authorName, 120, 'Author name')
  if (creating || body.seoTitle !== undefined) payload.seo_title = text(body.seoTitle, 180, 'SEO title') || null
  if (creating || body.seoDescription !== undefined) payload.seo_description = text(body.seoDescription, 320, 'SEO description') || null

  if (body.status !== undefined) {
    if (!['draft', 'in_review', 'published'].includes(body.status)) {
      throw inputError('Choose a valid article status.')
    }
    payload.status = body.status
    if (body.status === 'published') {
      const reviewerName = text(body.reviewerName, 120, 'Reviewer name', true)
      if (body.reviewConfirmed !== true) {
        throw inputError('Confirm that a qualified pharmacist or clinician reviewed this version before publishing.')
      }
      payload.reviewer_name = reviewerName
      payload.reviewed_at = new Date().toISOString()
      payload.published_at = new Date().toISOString()
    } else if (body.status === 'draft') {
      payload.published_at = null
    }
  }

  return payload
}

async function recordAdminAction(actorId, action, article, beforeData = null) {
  try {
    await logAdminAction({
      supabaseAdmin,
      actorId,
      action,
      entityType: 'health_article',
      entityId: article.id,
      summary: `${action === 'create' ? 'Created' : action === 'publish' ? 'Published' : 'Updated'} health article ${article.title}.`,
      beforeData,
      afterData: article,
    })
  } catch {
  }
}

router.use(requireAuth, requireAdmin)

router.get('/categories', async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('health_article_categories')
      .select('id, name, slug, description, display_order, is_active')
      .order('display_order', { ascending: true })
    if (error) throw error
    res.json({ categories: data || [] })
  } catch (error) {
    next(error)
  }
})

router.post('/categories', async (req, res, next) => {
  try {
    const name = text(req.body?.name, 100, 'Category name', true)
    const slug = slugify(text(req.body?.slug || name, 120, 'Category URL slug', true))
    if (!slug) throw inputError('Category URL slug must contain letters or numbers.')
    const description = text(req.body?.description, 300, 'Category description') || null
    const { data: lastCategory, error: orderError } = await supabaseAdmin
      .from('health_article_categories')
      .select('display_order')
      .order('display_order', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (orderError) throw orderError

    const { data, error } = await supabaseAdmin
      .from('health_article_categories')
      .insert({
        name,
        slug,
        description,
        display_order: Number(lastCategory?.display_order || 0) + 1,
        is_active: true,
      })
      .select('id, name, slug, description, display_order, is_active')
      .single()
    if (error) {
      if (error.code === '23505') throw inputError('That category URL is already in use.')
      throw error
    }

    try {
      await logAdminAction({
        supabaseAdmin,
        actorId: req.auth.user.id,
        action: 'create',
        entityType: 'health_article_category',
        entityId: data.id,
        summary: `Created Health Hub category ${data.name}.`,
        afterData: data,
      })
    } catch {
    }
    res.status(201).json({ category: data })
  } catch (error) {
    next(error)
  }
})

router.get('/articles', async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('health_articles')
      .select(`${articleFields}, health_article_categories(name, slug)`)
      .order('updated_at', { ascending: false })
      .limit(200)
    if (error) throw error
    res.json({ articles: data || [] })
  } catch (error) {
    next(error)
  }
})

router.get('/articles/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('health_articles')
      .select(articleFields)
      .eq('id', req.params.id)
      .maybeSingle()
    if (error) throw error
    if (!data) return res.status(404).json({ message: 'Article not found.' })
    res.json({ article: data })
  } catch (error) {
    next(error)
  }
})

router.post('/articles', async (req, res, next) => {
  try {
    const payload = buildPayload(req.body || {}, req.auth.user.id, { creating: true })
    payload.status = 'draft'
    payload.created_by = req.auth.user.id
    const { data, error } = await supabaseAdmin
      .from('health_articles')
      .insert(payload)
      .select(articleFields)
      .single()
    if (error) throwContentWriteError(error)
    await recordAdminAction(req.auth.user.id, 'create', data)
    res.status(201).json({ article: data })
  } catch (error) {
    next(error)
  }
})

router.patch('/articles/:id', async (req, res, next) => {
  try {
    const { data: before, error: loadError } = await supabaseAdmin
      .from('health_articles')
      .select(articleFields)
      .eq('id', req.params.id)
      .maybeSingle()
    if (loadError) throw loadError
    if (!before) return res.status(404).json({ message: 'Article not found.' })

    const payload = buildPayload(req.body || {}, req.auth.user.id, { existingArticle: before })
    if (before.status === 'published' && payload.status === undefined) {
      payload.status = 'in_review'
      payload.reviewer_name = null
      payload.reviewed_at = null
      payload.published_at = null
    }
    if (payload.status === 'in_review') {
      payload.reviewer_name = null
      payload.reviewed_at = null
      payload.published_at = null
    }

    const { data, error } = await supabaseAdmin
      .from('health_articles')
      .update(payload)
      .eq('id', req.params.id)
      .select(articleFields)
      .single()
    if (error) throwContentWriteError(error)

    const action = data.status === 'published' && before.status !== 'published' ? 'publish' : 'update'
    await recordAdminAction(req.auth.user.id, action, data, before)
    res.json({ article: data })
  } catch (error) {
    next(error)
  }
})

router.delete('/articles/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('health_articles')
      .update({ status: 'draft', published_at: null, updated_by: req.auth.user.id })
      .eq('id', req.params.id)
      .select('id, title')
      .single()
    if (error) throw error
    await recordAdminAction(req.auth.user.id, 'unpublish', data)
    res.json({ message: 'Article returned to drafts.' })
  } catch (error) {
    next(error)
  }
})

export default router
