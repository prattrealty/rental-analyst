// /api/analyze.js — Vercel serverless function (Node runtime)
// Holds the Anthropic API key server-side. NEVER expose the key in the React bundle.
//
// Env var required in Vercel project settings:
//   ANTHROPIC_API_KEY = sk-ant-...
//
// Request body (POST, JSON): { metrics: {...}, fields: {...} }
//   metrics: the object returned by calcMetrics()
//   fields:  the user's input fields (for address/context only)
//
// Response (JSON): { call: "Buy"|"Maybe"|"Pass", verdict: "<one short paragraph>" }
//
// The model only ever sees the numbers the user entered. The prompt is framed
// as analysis of those entered numbers, NOT personalized investment advice.

const MODEL = 'claude-haiku-4-5-20251001'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    // No key configured — tell the client to fall back to the template verdict.
    return res.status(200).json({ fallback: true })
  }

  let metrics, fields
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    metrics = body.metrics || {}
    fields = body.fields || {}
  } catch {
    return res.status(400).json({ error: 'Bad request body' })
  }

  // Only run on a real, complete analysis. Guards against empty/abusive calls.
  if (!(metrics.price > 0) || !(fields.rent > 0)) {
    return res.status(200).json({ fallback: true })
  }

  // Round everything we send — the model needs the shape of the deal, not decimals.
  const n = (v) => (typeof v === 'number' && isFinite(v) ? Math.round(v) : null)
  const n2 = (v) => (typeof v === 'number' && isFinite(v) ? Number(v.toFixed(2)) : null)

  const dealData = {
    address: fields.address || 'the property',
    purchase_price: n(metrics.price),
    monthly_rent: n(fields.rent),
    down_payment_pct: n(fields.downPct),
    monthly_cash_flow: n(metrics.cashflow),
    cash_on_cash_pct: n2(metrics.coc),
    cap_rate_pct: n2(metrics.capRate),
    gross_yield_pct: n2(metrics.grossYield),
    dscr: metrics.dscr == null ? null : n2(metrics.dscr),
    is_cash_deal: !!metrics.isCashDeal,
    one_percent_rule_pct: n2(metrics.onePercentRule),
    break_even_rent: n(metrics.breakeven),
    deal_score_0_100: n(metrics.__score),
  }

  const system = [
    'You are an experienced rental-property analyst writing a one-paragraph verdict',
    'on a deal, in the plain-spoken voice of a working real-estate broker.',
    'You are analyzing ONLY the numbers the user entered into a calculator.',
    'You are NOT giving personalized investment advice and you have not seen the',
    'actual property. Never invent facts not present in the numbers (no claims about',
    'roof age, neighborhood, schools, crime, or rent growth — those are not provided).',
    'Lead with one of exactly three calls: Buy, Maybe, or Pass. Then 2-4 sentences:',
    'name the single biggest strength and the single biggest concern in the numbers,',
    'and if relevant, what would change the call (a lower price, more down, higher rent).',
    'Be direct and concrete. No hedging filler, no disclaimers in the paragraph itself.',
    'Respond ONLY with a JSON object: {"call": "Buy"|"Maybe"|"Pass", "verdict": "..."}.',
    'No markdown, no code fences, no preamble.',
  ].join(' ')

  const userMsg =
    'Here are the numbers entered for ' + dealData.address + ':\n' +
    JSON.stringify(dealData, null, 2) +
    '\n\nWrite the verdict JSON now.'

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system,
        messages: [{ role: 'user', content: userMsg }],
      }),
    })

    if (!r.ok) {
      // Upstream error — let the client fall back to the template.
      return res.status(200).json({ fallback: true })
    }

    const data = await r.json()
    const text = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()

    // Parse the JSON the model returned; strip any stray fences defensively.
    let parsed = null
    try {
      parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
    } catch {
      return res.status(200).json({ fallback: true })
    }

    const call = ['Buy', 'Maybe', 'Pass'].includes(parsed.call) ? parsed.call : 'Maybe'
    const verdict = typeof parsed.verdict === 'string' ? parsed.verdict.trim() : ''
    if (!verdict) return res.status(200).json({ fallback: true })

    return res.status(200).json({ call, verdict })
  } catch {
    return res.status(200).json({ fallback: true })
  }
}