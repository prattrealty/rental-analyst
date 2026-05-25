// Vercel Serverless Function — /api/rentcast.js
// Proxies RentCast API calls so the key never hits the browser
// Also enforces rate limiting per IP

const RENTCAST_API_KEY = process.env.RENTCAST_API_KEY
const RATE_LIMIT = 10 // max calls per IP per hour
const rateLimitMap = new Map() // in-memory (resets on cold start)

function getRateLimit(ip) {
  const now = Date.now()
  const windowMs = 60 * 60 * 1000 // 1 hour
  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, { count: 0, resetAt: now + windowMs })
  }
  const entry = rateLimitMap.get(ip)
  if (now > entry.resetAt) {
    entry.count = 0
    entry.resetAt = now + windowMs
  }
  return entry
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', 'https://rental-analyst.com')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  // Rate limiting
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || 'unknown'
  const limit = getRateLimit(ip)
  if (limit.count >= RATE_LIMIT) {
    return res.status(429).json({ error: 'Rate limit exceeded. Please try again later.', resetAt: limit.resetAt })
  }
  limit.count++

  // Validate endpoint param
  const { endpoint, address, limit: queryLimit } = req.query
  const allowedEndpoints = ['properties', 'avm/rent/long-term', 'listings/rental/long-term']
  if (!endpoint || !allowedEndpoints.includes(endpoint)) {
    return res.status(400).json({ error: 'Invalid endpoint' })
  }
  if (!address) {
    return res.status(400).json({ error: 'Address is required' })
  }

  try {
    const encoded = encodeURIComponent(address)
    let url = `https://api.rentcast.io/v1/${endpoint}?address=${encoded}`
    if (queryLimit) url += `&limit=${queryLimit}`
    if (endpoint === 'listings/rental/long-term') url += '&radius=1'

    const response = await fetch(url, {
      headers: { 'X-Api-Key': RENTCAST_API_KEY }
    })

    if (!response.ok) {
      return res.status(response.status).json({ error: 'RentCast API error', status: response.status })
    }

    const data = await response.json()
    res.setHeader('Cache-Control', 's-maxage=3600') // cache for 1 hour on Vercel CDN
    return res.status(200).json(data)
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' })
  }
}
