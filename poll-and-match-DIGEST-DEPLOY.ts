import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RENTCAST_API_KEY = Deno.env.get('RENTCAST_API_KEY')
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SECRET_KEYS = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}')
const SUPABASE_SECRET_KEY = SUPABASE_SECRET_KEYS['default']

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY)

function calculateDealScore(capRate: number, coc: number, dscr: number): number {
  let score = 0
  if (capRate >= 8) score += 35
  else if (capRate >= 6) score += 25
  else if (capRate >= 4) score += 15
  else if (capRate >= 2) score += 5
  if (coc >= 12) score += 35
  else if (coc >= 8) score += 25
  else if (coc >= 5) score += 15
  else if (coc >= 2) score += 5
  if (dscr >= 1.5) score += 30
  else if (dscr >= 1.25) score += 20
  else if (dscr >= 1.0) score += 10
  return Math.min(score, 100)
}

function calculateMetrics(price: number, rent: number) {
  const downPayment = price * 0.25
  const loanAmount = price * 0.75
  const monthlyRate = 0.07 / 12
  const numPayments = 360
  const monthlyMortgage = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1)
  const monthlyExpenses = rent * 0.45
  const monthlyNOI = rent - monthlyExpenses
  const annualNOI = monthlyNOI * 12
  const capRate = (annualNOI / price) * 100
  const annualCashFlow = (monthlyNOI - monthlyMortgage) * 12
  const coc = (annualCashFlow / downPayment) * 100
  const dscr = monthlyNOI / monthlyMortgage
  const dealScore = calculateDealScore(capRate, coc, dscr)
  return { capRate, coc, dscr, dealScore, annualCashFlow, monthlyMortgage }
}

function dealCardHtml(deal: { address: string, city: string, state: string, price: number, rent_estimate: number, metrics: any }): string {
  const { address, city, state, price, rent_estimate, metrics } = deal
  const monthlyFlow = Math.round(metrics.annualCashFlow / 12)
  const flowSign = metrics.annualCashFlow >= 0 ? '+' : ''

  return `
    <div style="background: #f4f1eb; border-radius: 8px; padding: 20px; margin: 16px 0;">
      <p style="margin: 0 0 4px; font-size: 18px; font-weight: 700; color: #1B3A6B;">${address}</p>
      <p style="margin: 0 0 16px; color: #888; font-size: 14px;">${city}, ${state}</p>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #e8e4dc; font-size: 14px; color: #555;">List Price</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #e8e4dc; font-size: 14px; font-weight: 700; text-align: right;">$${price?.toLocaleString()}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #e8e4dc; font-size: 14px; color: #555;">Est. Rent</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #e8e4dc; font-size: 14px; font-weight: 700; text-align: right;">$${rent_estimate?.toLocaleString()}/mo</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #e8e4dc; font-size: 14px; color: #555;">Cap Rate</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #e8e4dc; font-size: 14px; font-weight: 700; text-align: right;">${metrics.capRate.toFixed(1)}%</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #e8e4dc; font-size: 14px; color: #555;">Cash-on-Cash</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #e8e4dc; font-size: 14px; font-weight: 700; text-align: right;">${metrics.coc.toFixed(1)}%</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-size: 14px; color: #555;">Monthly Cash Flow</td>
          <td style="padding: 8px 0; font-size: 14px; font-weight: 700; color: ${metrics.annualCashFlow >= 0 ? '#1a7a3a' : '#c0392b'}; text-align: right;">${flowSign}$${monthlyFlow}/mo</td>
        </tr>
      </table>
      <div style="background: #1B3A6B; border-radius: 6px; padding: 12px 16px; margin-top: 16px; text-align: center;">
        <span style="font-size: 24px; font-weight: 800; color: #C9A84C;">${metrics.dealScore}</span>
        <span style="font-size: 14px; color: rgba(255,255,255,0.7);"> / 100 Deal Score</span>
      </div>
    </div>
  `
}

async function sendDigestEmail(userEmail: string, userName: string, deals: Array<{ address: string, city: string, state: string, price: number, rent_estimate: number, metrics: any }>): Promise<boolean> {
  const count = deals.length
  const dealsHtml = deals.map(dealCardHtml).join('')

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'Rental Analyst <alerts@rental-analyst.com>',
      to: userEmail,
      subject: `🏠 ${count} New Deal Match${count > 1 ? 'es' : ''} — Your Buy Box Alert`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1B3A6B; padding: 24px; border-radius: 8px 8px 0 0;">
            <h1 style="color: #C9A84C; margin: 0; font-size: 20px;">${count} New Deal Match${count > 1 ? 'es' : ''} Found</h1>
            <p style="color: rgba(255,255,255,0.8); margin: 4px 0 0; font-size: 14px;">Rental Analyst Alert</p>
          </div>
          <div style="background: #fff; border: 1px solid #ddd; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
            <p style="color: #333; font-size: 15px;">Hey ${userName}, ${count} new listing${count > 1 ? 's' : ''} just hit that match${count > 1 ? '' : 'es'} your buy box:</p>
            ${dealsHtml}
            <div style="text-align: center; margin: 24px 0;">
              <a href="https://www.rental-analyst.com" style="background: #1B3A6B; color: #fff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 14px;">View Deals →</a>
            </div>
            <p style="color: #999; font-size: 12px; text-align: center; margin-top: 24px;">
              You're receiving this because you have deal alerts enabled on Rental Analyst.<br>
              <a href="https://www.rental-analyst.com/unsubscribe" style="color: #999;">Unsubscribe</a>
            </p>
          </div>
        </div>
      `
    })
  })

  if (!res.ok) {
    const errorBody = await res.text()
    console.error(`Resend API error sending to ${userEmail}:`, res.status, errorBody)
    return false
  }

  return true
}

Deno.serve(async (req) => {
  try {
    // 1. Get all users with email alerts enabled
    const { data: criteriaList, error: criteriaError } = await supabase
      .from('user_alert_criteria')
      .select('*')
      .eq('email_alerts', true)

    if (criteriaError) throw criteriaError
    if (!criteriaList || criteriaList.length === 0) {
      return new Response(JSON.stringify({ message: 'No users with alerts enabled' }), { status: 200 })
    }

    // 2. Get user emails from auth.users via admin API
    const userIds = criteriaList.map(c => c.user_id)
    const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers()
    if (usersError) throw usersError

    const userMap: Record<string, { email: string, name: string }> = {}
    for (const user of users) {
      if (userIds.includes(user.id)) {
        userMap[user.id] = {
          email: user.email || '',
          name: user.user_metadata?.full_name?.split(' ')[0] || 'Investor'
        }
      }
    }

    // 3. Get unique markets across all users
    const allMarkets = [...new Set(criteriaList.flatMap(c => c.markets || []))]
    console.log('Markets to poll:', allMarkets)

    const newListingsFound: any[] = []

    // 4. Poll Rentcast for each market
    for (const market of allMarkets) {
      const [city, state] = market.split(', ')
      if (!city || !state) continue

      const rentcastUrl = `https://api.rentcast.io/v1/listings/sale?city=${encodeURIComponent(city)}&state=${encodeURIComponent(state)}&limit=10&status=Active`

      const rentcastRes = await fetch(rentcastUrl, {
        headers: { 'X-Api-Key': RENTCAST_API_KEY }
      })

      if (!rentcastRes.ok) {
        console.error(`Rentcast error for ${market}:`, rentcastRes.status, await rentcastRes.text())
        continue
      }

      const listings = await rentcastRes.json()
      if (!listings || listings.length === 0) continue

      for (const listing of listings) {
        const rentcastId = listing.id || listing.formattedAddress
        if (!rentcastId) continue

        // 5. Skip already seen listings
        const { data: existing } = await supabase
          .from('polled_listings')
          .select('id')
          .eq('rentcast_id', rentcastId)
          .maybeSingle()

        if (existing) continue

        // 6. Get rent estimate
        let rentEstimate = listing.rentEstimate || 0
        if (!rentEstimate && listing.formattedAddress) {
          const rentRes = await fetch(
            `https://api.rentcast.io/v1/avm/rent/long-term?address=${encodeURIComponent(listing.formattedAddress)}`,
            { headers: { 'X-Api-Key': RENTCAST_API_KEY } }
          )
          if (rentRes.ok) {
            const rentData = await rentRes.json()
            rentEstimate = rentData.rent || 0
          }
        }

        if (!rentEstimate || !listing.price) continue

        // 7. Score the deal
        const metrics = calculateMetrics(listing.price, rentEstimate)

        // 8. Save to polled_listings
        const { error: insertError } = await supabase
          .from('polled_listings')
          .insert({
            rentcast_id: rentcastId,
            address: listing.formattedAddress,
            city: city,
            state: state,
            market: market,
            price: listing.price,
            bedrooms: listing.bedrooms,
            bathrooms: listing.bathrooms,
            sqft: listing.squareFootage,
            property_type: listing.propertyType,
            rent_estimate: rentEstimate,
            deal_score: metrics.dealScore,
            cap_rate: metrics.capRate,
            cash_on_cash: metrics.coc,
            listing_url: `https://www.zillow.com/homes/${encodeURIComponent(listing.formattedAddress)}`
          })

        if (!insertError) {
          newListingsFound.push({ listing, metrics, market, rentEstimate })
        }
      }
    }

    console.log(`Found ${newListingsFound.length} new listings`)

    // 9. Match and alert — one digest email per user per 24h, covering all qualifying deals
    let emailsSent = 0
    const ONE_DAY_MS = 24 * 60 * 60 * 1000

    for (const criteria of criteriaList) {
      const userInfo = userMap[criteria.user_id]
      if (!userInfo?.email) continue

      const matches = newListingsFound.filter(({ listing, metrics, market }) => {
        if (!criteria.markets?.includes(market)) return false
        if (criteria.max_price && listing.price > criteria.max_price) return false
        if (criteria.min_coc && metrics.coc < criteria.min_coc) return false
        if (criteria.property_types && !criteria.property_types.includes('any')) {
          if (!criteria.property_types.includes(listing.propertyType)) return false
        }
        if (metrics.dealScore < 70) return false
        return true
      })

      if (matches.length === 0) continue

      const lastEmailedAt = criteria.last_emailed_at ? new Date(criteria.last_emailed_at).getTime() : 0
      if (Date.now() - lastEmailedAt < ONE_DAY_MS) continue

      const deals = matches.map(({ listing, metrics, market, rentEstimate }) => {
        const [listingCity, listingState] = market.split(', ')
        return {
          address: listing.formattedAddress,
          city: listingCity,
          state: listingState,
          price: listing.price,
          rent_estimate: rentEstimate,
          metrics
        }
      })

      const sent = await sendDigestEmail(userInfo.email, userInfo.name, deals)
      if (sent) {
        emailsSent++
        await supabase
          .from('user_alert_criteria')
          .update({ last_emailed_at: new Date().toISOString() })
          .eq('user_id', criteria.user_id)
      }
    }

    return new Response(JSON.stringify({
      success: true,
      markets_polled: allMarkets.length,
      new_listings_found: newListingsFound.length,
      emails_sent: emailsSent
    }), { status: 200 })

  } catch (err) {
    console.error('poll-and-match error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})
