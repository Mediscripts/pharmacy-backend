export function notFoundHandler(_req, res) {
  res.status(404).json({ message: 'Route not found.' })
}

function getSafeErrorMessage(error) {
  const message = String(error?.message || '').trim()
  const normalized = message.toLowerCase()
  const safePatterns = [
    'required',
    'cannot',
    "can't",
    'please choose',
    'please add',
    'please',
    'add a',
    'not found',
    'empty',
    'valid',
    'cart is empty',
    'no changes',
    'one or more products',
    'does not have enough stock',
    'does not use manual transfer payment',
    'could not match that order and email',
    'payment record not found',
    'order number is required',
    'email address is required',
    'phone number is required',
    'delivery address is required',
    'receipt file is required',
    'receipt file must be sent as a data url',
    'receipt file is empty',
    'invalid webhook signature',
    'webhook payload is missing a payment reference',
    'route not found',
  ]

  if (!message) {
    return ''
  }

  if (error?.publicMessage) {
    return String(error.publicMessage).trim()
  }

  if (Number(error?.statusCode || error?.status || 500) < 500) {
    return message
  }

  if (safePatterns.some((pattern) => normalized.includes(pattern))) {
    return message
  }

  return ''
}

export function errorHandler(error, req, res, _next) {
  const statusCode = Number(error?.statusCode || error?.status || 500)
  const schemaErrorCodes = new Set(['42P01', '42703', 'PGRST200', 'PGRST204', 'PGRST205'])
  const isHealthHubSchemaError = req.originalUrl.includes('/health-hub') && schemaErrorCodes.has(String(error?.code || ''))

  if (statusCode >= 500) {
    console.error('[api error]', {
      method: req.method,
      path: req.originalUrl,
      code: error?.code || null,
      message: error?.message || 'Unknown server error',
    })
  }

  const publicMessage = isHealthHubSchemaError
    ? 'Health Hub database setup is incomplete or outdated. Apply the latest backend/migrations/009_add_health_hub.sql in Supabase, then restart the API.'
    : getSafeErrorMessage(error)

  res.status(isHealthHubSchemaError ? 503 : statusCode >= 400 ? statusCode : 500).json({
    message: publicMessage || 'We could not complete that request right now. Please try again.',
  })
}
