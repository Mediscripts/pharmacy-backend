import supabaseAdmin from '../server/lib/supabaseAdmin.js'

async function loadProfile(userId) {
  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return profile
}

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization

  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing access token.' })
  }

  const token = header.slice(7)
  const { data, error } = await supabaseAdmin.auth.getUser(token)

  if (error || !data?.user) {
    return res.status(401).json({ message: 'Invalid or expired access token.' })
  }

  try {
    const profile = await loadProfile(data.user.id)

    req.auth = {
      user: data.user,
      profile,
      accessToken: token,
    }

    return next()
  } catch (profileError) {
    return next(profileError)
  }
}

export function requireAdmin(req, res, next) {
  if (req.auth?.profile?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required.' })
  }

  return next()
}
