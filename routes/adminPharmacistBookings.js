import { Router } from 'express'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import supabaseAdmin from '../server/lib/supabaseAdmin.js'
import { logAdminAction } from '../server/lib/adminAudit.js'
import { sendPharmacistBookingUpdate } from '../server/lib/pharmacistBookingEmail.js'

const router = Router()
const bookingFields = 'id, customer_name, customer_email, customer_phone, requested_at, scheduled_at, status, admin_note, created_at, updated_at'

function inputError(message) {
  const error = new Error(message)
  error.statusCode = 400
  return error
}

router.use(requireAuth, requireAdmin)

router.get('/', async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('pharmacist_bookings')
      .select(bookingFields)
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) throw error
    res.json({ bookings: data || [] })
  } catch (error) {
    next(error)
  }
})

router.patch('/:id', async (req, res, next) => {
  try {
    const status = String(req.body?.status || '').trim()
    if (!['confirmed', 'rescheduled', 'declined'].includes(status)) {
      throw inputError('Choose confirm, reschedule, or decline for this request.')
    }

    const { data: existing, error: loadError } = await supabaseAdmin
      .from('pharmacist_bookings')
      .select(bookingFields)
      .eq('id', req.params.id)
      .maybeSingle()
    if (loadError) throw loadError
    if (!existing) return res.status(404).json({ message: 'Booking request not found.' })

    let scheduledAt = null
    if (status === 'confirmed' || status === 'rescheduled') {
      scheduledAt = new Date(req.body?.scheduledAt)
      if (!req.body?.scheduledAt || Number.isNaN(scheduledAt.getTime())) {
        throw inputError('Choose the confirmed call date and time.')
      }
      if (scheduledAt.getTime() <= Date.now()) {
        throw inputError('Choose a future date and time.')
      }
    }
    const adminNote = String(req.body?.adminNote || '').trim()
    if (adminNote.length > 500) throw inputError('The message must be 500 characters or fewer.')

    const { data: booking, error } = await supabaseAdmin
      .from('pharmacist_bookings')
      .update({
        status,
        scheduled_at: scheduledAt?.toISOString() || null,
        admin_note: adminNote || null,
      })
      .eq('id', req.params.id)
      .select(bookingFields)
      .single()
    if (error) throw error

    try {
      await logAdminAction({
        supabaseAdmin,
        actorId: req.auth.user.id,
        action: 'update',
        entityType: 'pharmacist_booking',
        entityId: booking.id,
        summary: `${status} pharmacist call request for ${booking.customer_email}.`,
        beforeData: existing,
        afterData: booking,
      })
    } catch {
    }

    try {
      await sendPharmacistBookingUpdate(booking)
      res.json({ booking, emailSent: true })
    } catch (emailError) {
      console.error('[pharmacist booking update email]', { bookingId: booking.id, message: emailError?.message || 'Email failed.' })
      res.json({
        booking,
        emailSent: false,
        message: 'The booking was updated, but the email could not be sent. Check the server email configuration and try again.',
      })
    }
  } catch (error) {
    next(error)
  }
})

export default router
