// Vercel Serverless Function — /api/rentcast.js
//
// Balanced protection:
//   - CORS locked to your own domain(s) instead of "*"
//   - Anonymous (logged-out) callers get a small free allowance per hour so new
//     visitors can try the tool before signing up (protects your funnel).
//   - Signed-in Supabase users get a higher allowance.
//   - 24h CDN cache preserved (cuts repeat lookups of the same address).
//
// Env vars used:
//   RENTCAST_API_KEY (or VITE_RENTCAST_API_KEY)
//   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY   (for verifying signed-in users)

const ANON_RATE_LIMIT = 10  // logged-out: ~5 properties (2 calls each) to try before signing up
const USER_RATE_LIMIT = 60  // signed-in: ~30 properties/hour, comfortable working headroom

// Allowed origins that may call this endpoint from a browser.
const ALLOWED_ORIGINS = [
  'https://rental-analyst.com',
  'https://www.rental-analyst.com',
]

const rateLimitMap = {}

// Verify a Supabase access token by asking Supabase who it belongs to.
// Returns the user object if valid, or null if missing/invalid/expired.
async function getVerifiedUser(req) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) return null

  const auth = req.headers['authorization'] || req.headers['Authorization'] || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return null

  try {
    const r = await fetch(supabaseUrl.replace(/\/$/, '') + '/auth/v1/user', {
      method: 'GET',
      headers: { apikey: anonKey, authorization: 'Bearer ' + token },
    })
    if (!r.ok) return null
    const user = await r.json()
    return user && user.id ? user : null
  } catch {
    return null
  }
}

export default async function handler(req, res) {
  // ---- CORS: only allow our own site(s) ----
  const origin = req.headers.origin
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')
  res.setHeader('Vary', 'Origin')
  if (req.method === 'OPTIONS') return res.status(200).end()
  // ------------------------------------------

  // Get API key
  const apiKey = process.env.RENTCAST_API_KEY || process.env.VITE_RENTCAST_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' })
  }

  // Identify caller: signed-in user gets a higher limit and a per-user bucket;
  // anonymous callers get a small allowance bucketed by IP.
  const user = await getVerifiedUser(req)
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown'
  const bucketKey = user ? 'user:' + user.id : 'ip:' + ip
  const limit = user ? USER_RATE_LIMIT : ANON_RATE_LIMIT

  // Rate limiting (per hour, per bucket)
  const now = Date.now()
  const windowMs = 60 * 60 * 1000
  if (!rateLimitMap[bucketKey] || now > rateLimitMap[bucketKey].resetAt) {
    rateLimitMap[bucketKey] = { count: 0, resetAt: now + windowMs }
  }
  if (rateLimitMap[bucketKey].count >= limit) {
    return res.status(429).json({
      error: user
        ? 'Rate limit exceeded. Try again later.'
        : 'Free preview limit reached. Sign in for more analyses.',
      needsSignIn: !user,
    })
  }
  rateLimitMap[bucketKey].count++

  // Validate
  const { endpoint, address, limit: qLimit } = req.query
  const allowed = ['properties', 'avm/rent/long-term', 'listings/rental/long-term']
  if (!endpoint || !allowed.includes(endpoint)) return res.status(400).json({ error: 'Invalid endpoint' })
  if (!address) return res.status(400).json({ error: 'Address required' })

  try {
    const encoded = encodeURIComponent(address)
    let url = `https://api.rentcast.io/v1/${endpoint}?address=${encoded}`
    if (qLimit) url += `&limit=${qLimit}`
    if (endpoint === 'listings/rental/long-term') url += '&radius=1'

    const response = await fetch(url, {
      headers: { 'X-Api-Key': apiKey },
    })
    const data = await response.json()
    res.setHeader('Cache-Control', 's-maxage=86400')
    return res.status(response.status).json(data)
  } catch (err) {
    return res.status(500).json({ error: 'Server error' })
  }
}