// Vercel Serverless Function — /api/rentcast.js
const RATE_LIMIT = 10
const rateLimitMap = {}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // Get API key
  const apiKey = process.env.RENTCAST_API_KEY || process.env.VITE_RENTCAST_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' })
  }

  // Rate limiting
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || 'unknown'
  const now = Date.now()
  const windowMs = 60 * 60 * 1000
  if (!rateLimitMap[ip]) rateLimitMap[ip] = { count: 0, resetAt: now + windowMs }
  if (now > rateLimitMap[ip].resetAt) { rateLimitMap[ip] = { count: 0, resetAt: now + windowMs } }
  if (rateLimitMap[ip].count >= RATE_LIMIT) {
    return res.status(429).json({ error: 'Rate limit exceeded. Try again later.' })
  }
  rateLimitMap[ip].count++

  // Validate
  const { endpoint, address, limit } = req.query
  const allowed = ['properties', 'avm/rent/long-term', 'listings/rental/long-term']
  if (!endpoint || !allowed.includes(endpoint)) return res.status(400).json({ error: 'Invalid endpoint' })
  if (!address) return res.status(400).json({ error: 'Address required' })

  try {
    const encoded = encodeURIComponent(address)
    let url = `https://api.rentcast.io/v1/${endpoint}?address=${encoded}`
    if (limit) url += `&limit=${limit}`
    if (endpoint === 'listings/rental/long-term') url += '&radius=1'

    const response = await fetch(url, {
      headers: { 'X-Api-Key': apiKey }
    })
    const data = await response.json()
    res.setHeader('Cache-Control', 's-maxage=86400')
    return res.status(response.status).json(data)
  } catch (err) {
    return res.status(500).json({ error: 'Server error' })
  }
}
