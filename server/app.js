import express from 'express'
import cors from 'cors'
import routes from '../routes/index.js'
import sitemapRoutes from '../routes/sitemap.js'
import supabaseAdmin from './lib/supabaseAdmin.js'
import { notFoundHandler, errorHandler } from '../middleware/errorHandler.js'



const app = express()

function normalizeCorsOrigin(value) {
  const origin = String(value || '').trim()
  if (origin === '*') return origin
  try {
    return new URL(origin).origin
  } catch {
    return ''
  }
}

const configuredCorsOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(normalizeCorsOrigin)
  .filter(Boolean)
const frontendOrigin = (() => {
  try {
    return process.env.FRONTEND_URL ? new URL(process.env.FRONTEND_URL).origin : ''
  } catch {
    return ''
  }
})()
const allowedCorsOrigins = new Set([
  ...configuredCorsOrigins,
  frontendOrigin,
  'https://mediscriptspharmacy.com',
  'https://www.mediscriptspharmacy.com',
  'http://localhost:5173',
].filter(Boolean))
const corsOptions = {
  origin(origin, callback) {
    if (!origin || configuredCorsOrigins.includes('*') || allowedCorsOrigins.has(origin)) {
      return callback(null, true)
    }
    return callback(null, false)
  },
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'Accept', 'Origin'],
  optionsSuccessStatus: 204,
}

app.use(cors(corsOptions))
app.use(
  express.json({
    limit: '15mb',
    verify: (req, _res, buffer) => {
      req.rawBody = buffer
    },
  }),
)
app.use(express.urlencoded({ extended: true }))

app.get('/', (_req, res) => {
  res.json({
    name: 'Mediscript API',
    status: 'ok',
  })
})

app.use('/api', routes)
app.use('/', sitemapRoutes)
app.use(notFoundHandler)
app.use(errorHandler)

export default app
