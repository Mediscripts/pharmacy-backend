import { sendResendEmail } from './resend.js'

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatLagosTime(value) {
  if (!value) return 'Not set'
  return new Intl.DateTimeFormat('en-NG', {
    timeZone: 'Africa/Lagos',
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(value)) + ' WAT'
}

function getNotificationEmail() {
  return String(process.env.PHARMACIST_BOOKING_NOTIFICATION_EMAIL || 'support@mediscriptspharmacy.com').trim()
}

export async function sendPharmacistBookingReceived(booking) {
  const name = booking.customer_name || 'there'
  const requestedTime = formatLagosTime(booking.requested_at)
  const phone = booking.customer_phone || 'Not provided'
  const adminUrl = `${String(process.env.FRONTEND_URL || 'https://www.mediscriptspharmacy.com').replace(/\/+$/, '')}/admin/pharmacist-bookings`

  const staffEmail = sendResendEmail({
    to: getNotificationEmail(),
    subject: 'New pharmacist call request',
    text: [
      'A new call with the pharmacist has been requested.',
      `Name: ${booking.customer_name || 'Not provided'}`,
      `Email: ${booking.customer_email}`,
      `Phone: ${phone}`,
      `Requested time: ${requestedTime}`,
      `Review requests: ${adminUrl}`,
    ].join('\n'),
    html: `<h2>New pharmacist call request</h2><p><strong>Name:</strong> ${escapeHtml(booking.customer_name || 'Not provided')}</p><p><strong>Email:</strong> ${escapeHtml(booking.customer_email)}</p><p><strong>Phone:</strong> ${escapeHtml(phone)}</p><p><strong>Requested time:</strong> ${escapeHtml(requestedTime)}</p><p><a href="${escapeHtml(adminUrl)}">Review this request in admin</a></p>`,
  })

  const customerEmail = sendResendEmail({
    to: booking.customer_email,
    subject: 'We received your pharmacist call request',
    text: [
      `Hello ${name},`,
      '',
      `We received your request for a call with our pharmacist at ${requestedTime}.`,
      'The pharmacy team will email you to confirm this time or suggest another one.',
      '',
      'Please do not email urgent or personal medical information. For urgent care, contact a healthcare professional directly.',
    ].join('\n'),
    html: `<p>Hello ${escapeHtml(name)},</p><p>We received your request for a call with our pharmacist at <strong>${escapeHtml(requestedTime)}</strong>.</p><p>The pharmacy team will email you to confirm this time or suggest another one.</p><p>Please do not email urgent or personal medical information. For urgent care, contact a healthcare professional directly.</p>`,
  })

  const results = await Promise.allSettled([staffEmail, customerEmail])
  return {
    staffEmailSent: results[0].status === 'fulfilled',
    customerEmailSent: results[1].status === 'fulfilled',
    errors: results.filter((result) => result.status === 'rejected').map((result) => result.reason?.message || 'Email failed.'),
  }
}

export async function sendPharmacistBookingUpdate(booking) {
  const name = booking.customer_name || 'there'
  const statusText = booking.status === 'confirmed'
    ? 'Your call with our pharmacist is confirmed.'
    : booking.status === 'rescheduled'
      ? 'We would like to reschedule your call with our pharmacist.'
      : 'We are unable to accommodate this call request.'
  const scheduledTime = formatLagosTime(booking.scheduled_at)
  const note = booking.admin_note ? `\n\nMessage from the pharmacy: ${booking.admin_note}` : ''

  return sendResendEmail({
    to: booking.customer_email,
    subject: booking.status === 'confirmed'
      ? 'Your pharmacist call is confirmed'
      : booking.status === 'rescheduled'
        ? 'A new time for your pharmacist call'
        : 'Update on your pharmacist call request',
    text: [
      `Hello ${name},`,
      '',
      statusText,
      booking.scheduled_at ? `Time: ${scheduledTime}` : '',
      note,
      '',
      'This is a general pharmacy education call, not an emergency service.',
    ].filter(Boolean).join('\n'),
    html: `<p>Hello ${escapeHtml(name)},</p><p>${escapeHtml(statusText)}</p>${booking.scheduled_at ? `<p><strong>Time:</strong> ${escapeHtml(scheduledTime)}</p>` : ''}${booking.admin_note ? `<p><strong>Message from the pharmacy:</strong> ${escapeHtml(booking.admin_note)}</p>` : ''}<p>This is a general pharmacy education call, not an emergency service.</p>`,
  })
}
