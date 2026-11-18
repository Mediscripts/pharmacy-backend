import { Router } from 'express'
import supabaseAdmin from '../server/lib/supabaseAdmin.js'
import { sendPharmacistBookingReceived } from '../server/lib/pharmacistBookingEmail.js'

const router = Router()

function inputError(message) {
  const error = new Error(message)
  error.statusCode = 400
  return error
}

function normalizeText(value, maxLength, label, required = false) {
  const text = String(value || '').trim()
  if (required && !text) throw inputError(`${label} is required.`)
  if (text.length > maxLength) throw inputError(`${label} must be ${maxLength} characters or fewer.`)
  return text
}

router.post('/pharmacist-bookings', async (req, res, next) => {
  try {
    if (String(req.body?.companyWebsite || '').trim()) {
      return res.status(202).json({ message: 'Thanks. Your request has been received.' })
    }

    const customerName = normalizeText(req.body?.name, 120, 'Name')
    const customerEmail = normalizeText(req.body?.email, 254, 'Email address', true).toLowerCase()
    const customerPhone = normalizeText(req.body?.phone, 40, 'Phone number')
    const requestedAt = new Date(req.body?.requestedAt)

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
      throw inputError('Enter a valid email address.')
    }
    if (!req.body?.requestedAt || Number.isNaN(requestedAt.getTime())) {
      throw inputError('Choose a valid date and time for the call.')
    }
    if (requestedAt.getTime() <= Date.now()) {
      throw inputError('Choose a future date and time.')
    }

    const { data: booking, error } = await supabaseAdmin
      .from('pharmacist_bookings')
      .insert({
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone || null,
        requested_at: requestedAt.toISOString(),
      })
      .select('id, customer_name, customer_email, customer_phone, requested_at, scheduled_at, status, created_at')
      .single()

    if (error) throw error

    let emailResult = { staffEmailSent: false, customerEmailSent: false, errors: [] }
    try {
      emailResult = await sendPharmacistBookingReceived(booking)
      if (emailResult.errors.length) {
        console.error('[pharmacist booking email]', { bookingId: booking.id, errors: emailResult.errors })
      }
    } catch (emailError) {
      console.error('[pharmacist booking email]', { bookingId: booking.id, message: emailError?.message || 'Email failed.' })
    }

    res.status(201).json({
      booking: { id: booking.id, status: booking.status },
      staffEmailSent: emailResult.staffEmailSent,
      customerEmailSent: emailResult.customerEmailSent,
    })
  } catch (error) {
    next(error)
  }
})

export default router
