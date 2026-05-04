import db from '../db.js'

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing token' })
  }
  const token = header.slice(7)
  try {
    // Verify token with Supabase — works for both Google OAuth and phone OTP sessions
    const { data, error } = await db.auth.getUser(token)
    const user = data?.user
    if (error || !user) return res.status(401).json({ error: 'Invalid or expired token' })
    req.userId = user.id      // Supabase auth UUID, used as shop identifier
    req.user   = user
    next()
  } catch (err) {
    console.error('[auth] requireAuth threw:', err.message)
    return res.status(500).json({ error: 'Auth service unavailable — check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars' })
  }
}
