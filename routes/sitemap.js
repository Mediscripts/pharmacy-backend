import { Router } from 'express'
import supabaseAdmin from '../server/lib/supabaseAdmin.js'

const router = Router()
const staticPaths = ['', 'products', 'health-hub', 'book-pharmacist', 'contact', 'track-order']

router.get('/sitemap.xml', async (req, res, next) => {
  try {
    const siteUrl = String(process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '')
    const [productsResult, articlesResult, categoriesResult] = await Promise.all([
      supabaseAdmin
      .from('products')
      .select('slug')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .range(0, 9999),
      supabaseAdmin
        .from('health_articles')
        .select('slug, updated_at')
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .range(0, 9999),
      supabaseAdmin
        .from('health_article_categories')
        .select('slug')
        .eq('is_active', true)
        .order('display_order', { ascending: true }),
    ])

    if (productsResult.error) throw productsResult.error
    if (articlesResult.error) throw articlesResult.error
    if (categoriesResult.error) throw categoriesResult.error

    const now = new Date().toISOString()
    const staticUrls = staticPaths.map((path) => `${siteUrl}/${path}`)
    const productUrls = Array.isArray(productsResult.data)
      ? productsResult.data
          .filter((product) => product?.slug)
          .map((product) => `${siteUrl}/products/${encodeURIComponent(product.slug)}`)
      : []
    const healthUrls = [
      ...(categoriesResult.data || []).map((category) => `${siteUrl}/health-hub/category/${encodeURIComponent(category.slug)}`),
      ...(articlesResult.data || []).map((article) => `${siteUrl}/health-hub/${encodeURIComponent(article.slug)}`),
    ]

    const allUrls = [...new Set([...staticUrls, ...productUrls, ...healthUrls])]

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls
  .map(
    (url) => `  <url>\n    <loc>${url}</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>weekly</changefreq>\n  </url>`,
  )
  .join('\n')}
</urlset>`

    res.header('Content-Type', 'application/xml')
    res.send(xml)
  } catch (error) {
    next(error)
  }
})

export default router
