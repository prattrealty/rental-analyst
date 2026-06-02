import React, { useState, useRef, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from './supabaseClient'
import Auth from './Auth'
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js');
  });
}
const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
const fmtK = (n) => n >= 1000 ? `$${Math.round(n / 1000)}K` : fmt(n)
const fmtPct = (n) => isNaN(n) ? '0.00%' : `${n.toFixed(2)}%`
const FREE_LIMIT = 2
const PRO_PRICE = 7.99

function calcMortgage(principal, annualRate, years) {
  const r = annualRate / 100 / 12
  const n = years * 12
  if (r === 0 || n === 0) return principal / (n || 1)
  return principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
}

function calcMetrics(f) {
  const price = f.price || 0
  const downPct = f.downPct || 0
  const closingPct = f.closingPct || 0
  const reno = f.reno || 0
  const rent = f.rent || 0
  const vacancyPct = f.vacancyPct || 0
  const taxesMonthly = f.taxesYearly > 0 ? Math.round(f.taxesYearly / 12) : (f.taxes || 0)
  const insuranceMonthly = f.insuranceYearly > 0 ? Math.round(f.insuranceYearly / 12) : (f.insurance > 0 ? f.insurance : (price > 0 ? Math.round(price * 0.008 / 12) : 0))
  const mgmtPct = f.mgmtPct || 0
  const rate = f.rate || 0
  const term = f.term || 30
  const rentGrowth = (f.rentGrowth !== undefined ? f.rentGrowth : 2.5) / 100
  const appreciation = (f.appreciation !== undefined ? f.appreciation : 3.0) / 100
  const otherIncome = f.otherIncome || 0
  const otherExpenses = f.otherExpenses || 0

  const effectiveRent = rent * (1 - vacancyPct / 100)
  const maintenance = f.maintenancePct > 0
    ? Math.round(effectiveRent * (f.maintenancePct / 100))
    : (f.maintenance > 0 ? f.maintenance : (price > 0 ? Math.round(price * 0.01 / 12) : 0))

  const down = price * (downPct / 100)
  const closing = price * (closingPct / 100)
  const totalCashIn = down + closing + (f.renoFinanced ? 0 : reno)
  const loanAmt = price - down + (f.renoFinanced ? reno : 0)
  const isCashDeal = downPct >= 100 || loanAmt <= 0
  const monthlyMortgage = isCashDeal ? 0 : calcMortgage(loanAmt, rate, term)
  const mgmt = effectiveRent * (mgmtPct / 100)
  const totalExpenses = taxesMonthly + insuranceMonthly + mgmt + maintenance + otherExpenses
  const totalIncome = effectiveRent + otherIncome
  const noi = totalIncome - totalExpenses
  const cashflow = noi - monthlyMortgage
  const annualCF = cashflow * 12
  const capRate = price > 0 ? (noi * 12 / price) * 100 : 0
  const coc = totalCashIn > 0 ? (annualCF / totalCashIn) * 100 : 0
  const grossYield = price > 0 ? (rent * 12 / price) * 100 : 0
  const breakeven = totalExpenses + monthlyMortgage
  const dscr = monthlyMortgage > 0 ? noi / monthlyMortgage : null
  const onePercentRule = price > 0 ? (rent / price) * 100 : 0
  const onePercentPass = onePercentRule >= 1

  const arvRate = rate > 0 ? rate : 7.25
  const targetDscr = 1.25
  const monthlyRateFactor = arvRate / 100 / 12
  const n = term * 12
  const mortgageConstant = monthlyRateFactor > 0 ? (monthlyRateFactor * Math.pow(1 + monthlyRateFactor, n)) / (Math.pow(1 + monthlyRateFactor, n) - 1) : 1 / n
  const maxLoanForDscr = noi > 0 && mortgageConstant > 0 ? Math.floor((noi / targetDscr) / mortgageConstant) : 0
  const cashOutPotential = maxLoanForDscr - loanAmt

  const rentNeededForDscr = !isCashDeal && monthlyMortgage > 0 ? Math.ceil((monthlyMortgage * targetDscr + totalExpenses - otherIncome) / (1 - vacancyPct / 100)) : 0
  const priceNeededForDscr = !isCashDeal && rate > 0 ? (() => {
    let lo = price * 0.5, hi = price
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2
      const loan = mid - mid * (downPct / 100) + (f.renoFinanced ? reno : 0)
      const pmt = calcMortgage(loan, rate, term)
      if (noi / pmt > targetDscr) hi = mid
      else lo = mid
    }
    return Math.round((lo + hi) / 2)
  })() : 0

  const r = rate / 100 / 12
  let balance = loanAmt
  const chartData = []
  const annualCashFlows = [-totalCashIn]

  for (let yr = 1; yr <= 10; yr++) {
    const growth = Math.pow(1 + rentGrowth, yr - 1)
    let yearCF = 0
    for (let m = 0; m < 12; m++) {
      const interest = balance * r
      const pmt = r === 0 ? loanAmt / n : loanAmt * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
      balance = Math.max(0, balance - (pmt - interest))
      yearCF += cashflow * growth
    }
    const appreciated = price * Math.pow(1 + appreciation, yr)
    const equity = appreciated - balance
    chartData.push({ year: 'Yr ' + yr, cashflow: Math.round(cashflow * growth), noi: Math.round(noi * growth), equity: Math.round(equity / 1000) })
    if (yr === 10) {
      annualCashFlows.push(yearCF + (appreciated - balance - appreciated * 0.06))
    } else {
      annualCashFlows.push(yearCF)
    }
  }

  let irr = 0
  try {
    let guess = 0.1
    for (let i = 0; i < 100; i++) {
      let npv = 0, dnpv = 0
      annualCashFlows.forEach((cf, t) => {
        npv += cf / Math.pow(1 + guess, t)
        dnpv -= t * cf / Math.pow(1 + guess, t + 1)
      })
      const next = guess - npv / dnpv
      if (Math.abs(next - guess) < 0.0001) { guess = next; break }
      guess = next
    }
    irr = guess * 100
  } catch(e) { irr = 0 }

  const totalReturn = annualCashFlows.slice(1).reduce((s, v) => s + v, 0)
  const equityMultiple = totalCashIn > 0 ? (totalReturn + totalCashIn) / totalCashIn : 0

  return {
    price, down, closing, totalCashIn, loanAmt, monthlyMortgage, noi, cashflow, annualCF,
    capRate, coc, grossYield, breakeven, dscr, onePercentRule, onePercentPass, irr, equityMultiple,
    insurance: insuranceMonthly, maintenance, taxes: taxesMonthly, chartData,
    rentGrowth: rentGrowth * 100, appreciation: appreciation * 100,
    rentNeededForDscr, priceNeededForDscr, otherIncome, otherExpenses,
    isCashDeal, maxLoanForDscr, cashOutPotential
  }
}

function calcDealScore(metrics) {
  if (metrics.price <= 0 || metrics.rent <= 0) return null
  let score = 0
  const breakdown = []

  const capPts = metrics.capRate >= 8 ? 35 : metrics.capRate >= 6 ? 26 : metrics.capRate >= 5 ? 18 : metrics.capRate >= 3 ? 9 : 2
  score += capPts
  breakdown.push({ label: 'Cap rate', score: capPts, max: 35, value: metrics.capRate.toFixed(2) + '%' })

  const cocPts = metrics.coc >= 8 ? 25 : metrics.coc >= 5 ? 18 : metrics.coc >= 2 ? 10 : metrics.coc >= 0 ? 4 : 0
  score += cocPts
  breakdown.push({ label: 'Cash-on-cash', score: cocPts, max: 25, value: metrics.coc.toFixed(2) + '%' })

  const gyPts = metrics.grossYield >= 9 ? 20 : metrics.grossYield >= 8 ? 15 : metrics.grossYield >= 7 ? 10 : metrics.grossYield >= 5 ? 5 : 2
  score += gyPts
  breakdown.push({ label: 'Gross yield', score: gyPts, max: 20, value: metrics.grossYield.toFixed(2) + '%' })

  const cfPts = metrics.cashflow >= 300 ? 18 : metrics.cashflow >= 100 ? 12 : metrics.cashflow >= 0 ? 6 : 0
  score += cfPts
  breakdown.push({ label: 'Monthly cash flow', score: cfPts, max: 18, value: '$' + Math.round(metrics.cashflow) + '/mo' })

  const beRatio = metrics.breakeven > 0 ? metrics.cashflow / metrics.breakeven : 0
  const bePts = beRatio >= 0.15 ? 7 : beRatio >= 0.05 ? 5 : beRatio >= 0 ? 2 : 0
  score += bePts
  breakdown.push({ label: 'Break-even buffer', score: bePts, max: 7, value: (beRatio * 100).toFixed(1) + '% above break-even' })

  const grade = score >= 75
    ? { label: 'Strong Deal', color: '#1a7a4a', bg: '#eaf3de', emoji: '🟢' }
    : score >= 50
    ? { label: 'Average Deal', color: '#854f0b', bg: '#faeeda', emoji: '🟡' }
    : { label: 'Below Market', color: '#a32d2d', bg: '#fcebeb', emoji: '🔴' }

  return { score: Math.min(score, 100), breakdown, grade }
}

function DealScoreCard({ metrics }) {
  const result = calcDealScore(metrics)
  if (!result) return null
  const { score, breakdown, grade } = result
  const circumference = 2 * Math.PI * 40
  const dash = (score / 100) * circumference
  return (
    <div style={{ background: 'var(--surface)', border: '2px solid ' + grade.color, borderRadius: 12, padding: '20px 22px', marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 16 }}>
        <div style={{ position: 'relative', width: 100, height: 100, flexShrink: 0 }}>
          <svg width="100" height="100" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="50" cy="50" r="40" fill="none" stroke="var(--border)" strokeWidth="8" />
            <circle cx="50" cy="50" r="40" fill="none" stroke={grade.color} strokeWidth="8"
              strokeDasharray={dash + ' ' + circumference} strokeLinecap="round"
              style={{ transition: 'stroke-dasharray 0.6s ease' }} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: grade.color, lineHeight: 1 }}>{score}</div>
            <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 500 }}>/ 100</div>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 }}>Deal Score</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: grade.color }}>{grade.emoji} {grade.label}</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4, maxWidth: 220 }}>
            {score >= 75 ? 'Strong fundamentals — this deal pencils out well.'
              : score >= 50 ? 'Decent deal with room to negotiate or optimize.'
              : 'Proceed with caution — numbers are tight for this market.'}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>Based on property fundamentals — financing-independent</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {breakdown.map(b => (
          <div key={b.label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text2)', marginBottom: 3 }}>
              <span>{b.label}</span>
              <span style={{ fontWeight: 500, color: 'var(--text)' }}>{b.value} <span style={{ color: grade.color }}>+{b.score}</span></span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: ((b.score / b.max) * 100) + '%', background: grade.color, borderRadius: 2, transition: 'width 0.5s ease' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function RentSlider({ rent, onChange }) {
  const base = (rent && rent > 100) ? rent : 1500
  const min = Math.max(100, Math.round(base * 0.7))
  const max = Math.round(base * 1.3)
  const [val, setVal] = React.useState(base)
  const prevBase = React.useRef(base)
  React.useEffect(() => {
    if (prevBase.current !== base) { prevBase.current = base; setVal(base) }
  }, [base])
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>💡 What-if rent scenario</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#1a7a4a' }}>${val.toLocaleString()}<span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text2)' }}>/mo</span></div>
      </div>
      <input type="range" min={min} max={max} value={val}
        onChange={e => { const v = Number(e.target.value); setVal(v); onChange(v) }}
        style={{ width: '100%', accentColor: '#1a5fa8', cursor: 'pointer' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
        <span>${min.toLocaleString()}</span>
        <span style={{ color: 'var(--text2)', fontSize: 11 }}>Drag to stress-test</span>
        <span>${max.toLocaleString()}</span>
      </div>
    </div>
  )
}

function CompsCard({ comps, loading }) {
  if (loading) return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px', marginBottom: 18, textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>
      <i className="ti ti-loader" style={{ fontSize: 18, marginBottom: 6, display: 'block' }} /> Loading comparable rentals...
    </div>
  )
  if (!comps || comps.length === 0) return null
  const avgRent = Math.round(comps.reduce((s, c) => s + (c.price || 0), 0) / comps.length)
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 22px', marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Comparable Rentals Nearby</div>
        <div style={{ fontSize: 12, color: 'var(--text2)' }}>Avg: <span style={{ fontWeight: 600, color: 'var(--text)' }}>${avgRent.toLocaleString()}/mo</span></div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {comps.slice(0, 5).map((c, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', background: 'var(--surface2)', borderRadius: 8, gap: 12 }}>
            <i className="ti ti-home" style={{ fontSize: 16, color: 'var(--text3)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.formattedAddress || 'Nearby property'}</div>
              <div style={{ fontSize: 11, color: 'var(--text2)' }}>{c.bedrooms || '?'}bd · {c.bathrooms || '?'}ba · {c.squareFootage ? c.squareFootage.toLocaleString() + ' sqft' : 'sqft N/A'}</div>
            </div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#1a5fa8', flexShrink: 0 }}>${(c.price || 0).toLocaleString()}<span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text2)' }}>/mo</span></div>
          </div>
        ))}
      </div>
    </div>
  )
}

function WalkthroughBubble({ onDone }) {
  const [step, setStep] = React.useState(0)
  const steps = [
    { icon: 'ti-link', title: 'Paste a Zillow URL', body: "Analyze any property by entering the address — or import from Zillow with Pro.", highlight: 'top-left' },
    { icon: 'ti-calculator', title: 'Enter the purchase price', body: "RentCast does not have live listing prices yet - just type in the price from Zillow. Everything else calculates instantly.", highlight: 'top-left' },
    { icon: 'ti-chart-bar', title: 'Read your Deal Score', body: "Your Deal Score (0-100) grades the investment on property fundamentals — cap rate, cash flow, gross yield, and more. Financing-independent, so cash deals score fairly too.", highlight: 'right' },
  ]
  const s = steps[step]
  const isLast = step === steps.length - 1
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', pointerEvents: 'auto' }} onClick={onDone} />
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'var(--surface)', borderRadius: 16, width: 360, boxShadow: '0 24px 60px rgba(0,0,0,0.35)', overflow: 'hidden', pointerEvents: 'auto' }}>
        <div style={{ background: 'var(--navy)', padding: '24px 24px 20px', color: '#fff', position: 'relative' }}>
          <button onClick={onDone} style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', width: 28, height: 28, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font)' }}><i className="ti ti-x" /></button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(77,168,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className={`ti ${s.icon}`} style={{ fontSize: 22, color: '#4da8ff' }} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 2 }}>Step {step + 1} of {steps.length}</div>
              <div style={{ fontSize: 17, fontWeight: 700 }}>{s.title}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {steps.map((_, i) => (<div key={i} style={{ height: 3, flex: 1, borderRadius: 2, background: i <= step ? '#4da8ff' : 'rgba(255,255,255,0.2)', transition: 'background 0.3s' }} />))}
          </div>
        </div>
        <div style={{ padding: '20px 24px 24px' }}>
          <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6, margin: '0 0 20px' }}>{s.body}</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            {step > 0 && (<button onClick={() => setStep(s => s - 1)} style={{ padding: '9px 16px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: 'var(--text2)', fontFamily: 'var(--font)' }}>Back</button>)}
            <button onClick={() => isLast ? onDone() : setStep(s => s + 1)} style={{ padding: '9px 20px', background: '#1a5fa8', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>{isLast ? "Let's go! 🚀" : 'Next →'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SignupModal({ onClose, form, setForm, onSubmit, error }) {
  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background:'var(--surface)', borderRadius:16, width:'100%', maxWidth:420, overflow:'hidden', boxShadow:'0 24px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ background:'var(--navy)', padding:'28px 28px 24px', color:'#fff', position:'relative' }}>
          <button onClick={onClose} style={{ position:'absolute', top:16, right:16, background:'rgba(255,255,255,0.1)', border:'none', borderRadius:6, color:'#fff', cursor:'pointer', width:28, height:28, fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}><i className="ti ti-x" /></button>
          <div style={{ fontSize:11, letterSpacing:'1px', textTransform:'uppercase', color:'#4da8ff', marginBottom:6, fontWeight:600 }}>Free account</div>
          <div style={{ fontSize:22, fontWeight:700, marginBottom:6 }}>Save your analysis</div>
          <div style={{ fontSize:14, color:'rgba(255,255,255,0.65)' }}>Create a free account to save properties and track your portfolio.</div>
        </div>
        <div style={{ padding:'24px 28px' }}>
          <div style={{ marginBottom:12 }}>
            <label style={{ display:'block', fontSize:11, fontWeight:600, color:'var(--text2)', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.5px' }}>First name</label>
            <input type="text" value={form.firstName} onChange={e => setForm(f => ({...f, firstName:e.target.value}))} placeholder="Scott" style={{ width:'100%' }} />
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={{ display:'block', fontSize:11, fontWeight:600, color:'var(--text2)', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.5px' }}>Email</label>
            <input type="text" value={form.email} onChange={e => setForm(f => ({...f, email:e.target.value}))} placeholder="scott@example.com" style={{ width:'100%' }} />
          </div>
          <div style={{ marginBottom:16 }}>
            <label style={{ display:'block', fontSize:11, fontWeight:600, color:'var(--text2)', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.5px' }}>Password</label>
            <input type="password" value={form.password} onChange={e => setForm(f => ({...f, password:e.target.value}))} placeholder="••••••••" style={{ width:'100%' }} />
          </div>
          <div style={{ display:'flex', alignItems:'flex-start', gap:8, marginBottom:16 }}>
            <input type="checkbox" id="agreed" checked={form.agreed} onChange={e => setForm(f => ({...f, agreed:e.target.checked}))} style={{ marginTop:2, width:'auto' }} />
            <label htmlFor="agreed" style={{ fontSize:12, color:'var(--text2)', lineHeight:1.4 }}>I agree to receive occasional updates from Rental Analyst. No spam, no selling your data.</label>
          </div>
          {error && <div style={{ fontSize:12, color:'var(--red)', marginBottom:12 }}>{error}</div>}
          <button onClick={onSubmit} style={{ width:'100%', padding:'13px', background:'#1a5fa8', color:'#fff', border:'none', borderRadius:8, fontSize:15, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)' }}>Create Free Account</button>
          <div style={{ textAlign:'center', fontSize:11, color:'var(--text3)', marginTop:10 }}>
            We respect your privacy · No credit card required · <a href='/privacy.html' target='_blank' style={{ color:'#1a5fa8', textDecoration:'none' }}>Privacy Policy</a>
          </div>
        </div>
      </div>
    </div>
  )
}

function UpgradeModal({ onClose, trigger, onUpgrade, trialStart, onStartTrial }) {
  const features = [
    { icon: 'ti-building-store', label: 'Unlimited property saves', free: '2 properties', pro: 'Unlimited' },
    { icon: 'ti-chart-bar', label: 'Full portfolio dashboard', free: false, pro: true },
    { icon: 'ti-file-description', label: 'PDF report export', free: false, pro: true },
    { icon: 'ti-history', label: 'Rent comp history', free: false, pro: true },
    { icon: 'ti-link', label: 'Zillow URL import', free: false, pro: true },
    { icon: 'ti-calculator', label: 'All metrics & charts', free: true, pro: true },
  ]
  const handleStripeCheckout = async () => {
    try {
      const res = await fetch('/api/stripe-checkout', { method: 'POST' })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } catch (err) { alert('Something went wrong. Please try again.') }
  }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 16, width: '100%', maxWidth: 520, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ background: 'var(--navy)', padding: '28px 28px 24px', color: '#fff', position: 'relative' }}>
          <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', width: 28, height: 28, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="ti ti-x" /></button>
          <div style={{ fontSize: 11, letterSpacing: '1px', textTransform: 'uppercase', color: '#4da8ff', marginBottom: 6, fontWeight: 600 }}>{trigger === 'save' ? '🔒 Free limit reached' : '⚡ Upgrade to Pro'}</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>{trigger === 'save' ? "You've saved 2 properties" : 'Unlock the full toolkit'}</div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)' }}>{trigger === 'save' ? 'Upgrade to Pro to save unlimited properties and track your full portfolio.' : 'Everything serious investors need — all in one place.'}</div>
        </div>
        <div style={{ padding: '20px 28px 0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>Free</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)' }}>$0</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>forever</div>
            </div>
            <div style={{ border: '2px solid #1a5fa8', borderRadius: 10, padding: '14px 16px', position: 'relative', background: '#f0f7ff' }}>
              <div style={{ position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)', background: '#1a5fa8', color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20, letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>MOST POPULAR</div>
              <div style={{ fontSize: 12, color: '#1a5fa8', fontWeight: 600, marginBottom: 4 }}>Pro</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)' }}>${PRO_PRICE}<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text2)' }}>/mo</span></div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>cancel anytime</div>
            </div>
          </div>
          <div style={{ marginBottom: 20 }}>
            {features.map(f => (
              <div key={f.label} style={{ display: 'flex', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <i className={`ti ${f.icon}`} style={{ fontSize: 15, color: 'var(--text3)', marginRight: 10, width: 18 }} />
                <div style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>{f.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', width: 70, textAlign: 'center' }}>
                  {f.free === true ? <i className="ti ti-check" style={{ color: 'var(--text2)' }} /> : f.free === false ? <i className="ti ti-x" style={{ color: 'var(--border-strong)' }} /> : <span style={{ fontSize: 11 }}>{f.free}</span>}
                </div>
                <div style={{ fontSize: 12, color: '#1a5fa8', width: 70, textAlign: 'center', fontWeight: 500 }}>
                  {f.pro === true ? <i className="ti ti-check" style={{ color: '#1a5fa8' }} /> : f.pro}
                </div>
              </div>
            ))}
          </div>
        </div>
      <div style={{ padding: '0 28px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {!trialStart && <button onClick={onStartTrial} style={{ width: '100%', padding: '13px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>🎉 Try Free for 7 Days</button>}
          <button onClick={handleStripeCheckout} style={{ width: '100%', padding: '13px', background: '#1a5fa8', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>Start Pro — ${PRO_PRICE}/month</button>
          <button onClick={onClose} style={{ width: '100%', padding: '10px', background: 'none', color: 'var(--text2)', border: 'none', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)' }}>Continue with free plan</button>
          <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text3)' }}>No contracts · Cancel anytime · Secure checkout</div>
        </div>
      </div>
    </div>
  )
}

function ProFeatureBlur({ label, icon, onUpgrade }) {
  return (
    <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ filter: 'blur(4px)', pointerEvents: 'none', userSelect: 'none', opacity: 0.5, background: 'var(--surface2)', padding: '28px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text3)' }}>████████</div>
        <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 6 }}>████ ██████ ████</div>
      </div>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <i className={`ti ${icon}`} style={{ fontSize: 22, color: 'var(--text2)' }} />
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{label}</div>
        <button onClick={onUpgrade} style={{ padding: '6px 14px', background: '#1a5fa8', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>Upgrade to Pro</button>
      </div>
    </div>
  )
}

function CapBadge({ capRate }) {
  if (capRate <= 0) return null
  if (capRate >= 8) return <span style={badge('#eaf3de','#3b6d11')}><i className="ti ti-trending-up" /> Strong deal</span>
  if (capRate >= 5) return <span style={badge('#faeeda','#854f0b')}><i className="ti ti-minus" /> Average</span>
  return <span style={badge('#fcebeb','#a32d2d')}><i className="ti ti-trending-down" /> Below market</span>
}
const badge = (bg,color) => ({ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 8px', borderRadius:4, fontSize:11, fontWeight:500, background:bg, color })

function MetricCard({ label, value, sub, valueStyle, badge: b }) {
  return (
    <div style={{ flex:1, minWidth:110, padding:'14px 18px', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', gap:2 }}>
      <div style={{ fontSize:11, color:'var(--text2)', lineHeight:1.3 }}>{label}</div>
      <div style={{ fontSize:22, fontWeight:600, letterSpacing:'-0.5px', ...valueStyle }}>{value}</div>
      {b}{sub && <div style={{ fontSize:11, color:'var(--text3)' }}>{sub}</div>}
    </div>
  )
}

function Field({ label, id, value, onChange, prefix, suffix, type='number' }) {
  const inputId = `field-${id}`
  return (
    <div style={{ marginBottom:12 }}>
      <label htmlFor={inputId} style={{ display:'block', fontSize:12, fontWeight:500, color:'var(--text2)', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.5px' }}>{label}</label>
      <div style={{ position:'relative' }}>
        {prefix && <span aria-hidden="true" style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', fontSize:13, color:'var(--text3)', pointerEvents:'none' }}>{prefix}</span>}
        <input type={type} id={inputId} name={inputId} value={value} onChange={e => onChange(e.target.value)} onFocus={e => e.target.select()} aria-label={label} style={{ paddingLeft:prefix?18:10, paddingRight:suffix?28:10 }} />
        {suffix && <span aria-hidden="true" style={{ position:'absolute', right:9, top:'50%', transform:'translateY(-50%)', fontSize:12, color:'var(--text3)', pointerEvents:'none' }}>{suffix}</span>}
      </div>
    </div>
  )
}

function FieldRow({ children }) {
  return <div style={{ display:'flex', gap:8 }}>{React.Children.map(children, c => <div style={{ flex:1 }}>{c}</div>)}</div>
}

function SectionLabel({ icon, children }) {
  return (
    <div style={{ fontSize:10, fontWeight:600, color:'var(--text3)', letterSpacing:'1px', textTransform:'uppercase', marginBottom:10, marginTop:4, display:'flex', alignItems:'center', gap:5 }}>
      {icon && <i className={`ti ti-${icon}`} style={{ fontSize:13 }} />}{children}
    </div>
  )
}

function Divider() { return <hr style={{ border:'none', borderTop:'1px solid var(--border)', margin:'14px 0' }} /> }

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border-strong)', borderRadius:8, padding:'10px 14px', fontSize:13 }}>
      <div style={{ fontWeight:600, marginBottom:6, color:'var(--text)' }}>{label}</div>
      {payload.map(p => <div key={p.name} style={{ color:p.color, display:'flex', justifyContent:'space-between', gap:16 }}><span>{p.name}</span><span style={{ fontWeight:500 }}>{p.name==='Equity ($K)' ? `$${p.value}K` : fmt(p.value)}</span></div>)}
    </div>
  )
}

// ── DEAL ALERTS COMPONENT ──────────────────────────────────────────────────
function BuyBoxPanel({ prefs, onSave }) {
  const [local, setLocal] = useState({ ...prefs })
  const [saved, setSaved] = useState(false)
  const set = (key, val) => setLocal(p => ({ ...p, [key]: val }))

  const handleSave = () => {
    onSave(local)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px', marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="ti ti-settings" style={{ fontSize: 15, color: '#1a5fa8' }} /> My Buy Box
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Only show deals that match your criteria</div>
        </div>
        <button onClick={handleSave} style={{ padding: '7px 16px', background: saved ? '#1a7a4a' : '#1a5fa8', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', gap: 5, transition: 'background 0.3s' }}>
          <i className={`ti ${saved ? 'ti-check' : 'ti-device-floppy'}`} style={{ fontSize: 13 }} />
          {saved ? 'Saved!' : 'Save'}
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            <span>Min Deal Score</span>
            <span style={{ color: '#1a5fa8', fontWeight: 700 }}>{local.min_score}</span>
          </div>
          <input type="range" min={0} max={100} step={5} value={local.min_score}
            onChange={e => set('min_score', Number(e.target.value))}
            style={{ width: '100%', accentColor: '#1a5fa8', cursor: 'pointer' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
            <span>0 (any)</span><span>50 (avg+)</span><span>75 (strong)</span>
          </div>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Max Price</label>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--text3)' }}>$</span>
            <input type="number" value={local.max_price} onChange={e => set('max_price', Number(e.target.value))}
              style={{ paddingLeft: 18, width: '100%' }} />
          </div>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Min Cash Flow</label>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--text3)' }}>$</span>
            <input type="number" value={local.min_cashflow} onChange={e => set('min_cashflow', Number(e.target.value))}
              style={{ paddingLeft: 18, width: '100%' }} />
            <span style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--text3)' }}>/mo</span>
          </div>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Min Cap Rate</label>
          <div style={{ position: 'relative' }}>
            <input type="number" value={local.min_cap_rate} onChange={e => set('min_cap_rate', Number(e.target.value))}
              style={{ paddingRight: 28, width: '100%' }} />
            <span style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--text3)' }}>%</span>
          </div>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Min CoC Return</label>
          <div style={{ position: 'relative' }}>
            <input type="number" value={local.min_coc} onChange={e => set('min_coc', Number(e.target.value))}
              style={{ paddingRight: 28, width: '100%' }} />
            <span style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--text3)' }}>%</span>
          </div>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Property Type</label>
          <select value={local.property_type} onChange={e => set('property_type', e.target.value)}
            style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--font)' }}>
            <option value="any">Any</option>
            <option value="sfr">Single Family (SFR)</option>
            <option value="multi">Multi-Family</option>
            <option value="condo">Condo / Townhome</option>
            <option value="commercial">Commercial</option>
          </select>
        </div>
      </div>
    </div>
  )
}

function DealAlerts({ deals, viewedIds, onLoadDeal, onMarkViewed, prefs, onSavePrefs }) {
  const DEFAULT_PREFS = { min_score: 0, max_price: 999999999, min_cashflow: 0, min_cap_rate: 0, min_coc: 0, property_type: 'any' }
  const activePref = prefs || DEFAULT_PREFS
  const hasSetPrefs = prefs !== null

  // Filter deals against user's buy box
  const matchingDeals = deals.filter(deal => {
    const d = deal.data || {}
    const m = d.metrics || {}
    const f = d.fields || {}
    const scoreResult = calcDealScore(m)
    const score = scoreResult?.score || deal.deal_score || 0
    const price = f.price || 0
    const cashflow = m.cashflow || 0
    const capRate = m.capRate || 0
    const coc = m.coc || 0

    if (score < activePref.min_score) return false
    if (price > activePref.max_price && activePref.max_price > 0) return false
    if (cashflow < activePref.min_cashflow) return false
    if (capRate < activePref.min_cap_rate) return false
    if (coc < activePref.min_coc) return false
    return true
  })

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
      <BuyBoxPanel prefs={activePref} onSave={onSavePrefs} />

      {!hasSetPrefs && (
        <div style={{ background: '#f0f7ff', border: '1px solid #c0d8f0', borderRadius: 10, padding: '14px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <i className="ti ti-info-circle" style={{ fontSize: 18, color: '#1a5fa8', flexShrink: 0 }} />
          <div style={{ fontSize: 13, color: '#0f2744' }}>Set your buy box above and hit <strong>Save</strong> to see matching deals.</div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>🔥 Matching Deals</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
            {matchingDeals.length} of {deals.length} deals match your buy box
          </div>
        </div>
        {matchingDeals.filter(d => !viewedIds.has(d.id)).length > 0 && (
          <span style={{ background: '#a32d2d', color: '#fff', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 10 }}>
            {matchingDeals.filter(d => !viewedIds.has(d.id)).length} new
          </span>
        )}
      </div>

      {matchingDeals.length === 0 && deals.length > 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text2)' }}>
          <i className="ti ti-filter-off" style={{ fontSize: 40, color: 'var(--text3)', marginBottom: 12, display: 'block' }} />
          <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text)', marginBottom: 6 }}>No deals match your criteria</div>
          <div style={{ fontSize: 13 }}>Try loosening your buy box — lower the min score or raise the max price.</div>
        </div>
      )}

      {matchingDeals.length === 0 && deals.length === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--text2)', padding: 40, textAlign: 'center' }}>
          <i className="ti ti-bell" style={{ fontSize: 48, color: 'var(--text3)' }} />
          <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--text)' }}>No deal alerts yet</div>
          <div style={{ fontSize: 13, maxWidth: 280 }}>When any property analyzed in the app scores 70 or above, it automatically appears here for all users.</div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {matchingDeals.map(deal => {
          const isNew = !viewedIds.has(deal.id)
          const d = deal.data || {}
          const m = d.metrics || {}
          const f = d.fields || {}
          const scoreResult = calcDealScore(m)
          const score = scoreResult?.score || deal.deal_score
          const grade = scoreResult?.grade || { color: '#1a7a4a', emoji: '🟢', label: 'Strong Deal' }
          return (
            <div key={deal.id} style={{ background: 'var(--surface)', border: isNew ? '2px solid ' + grade.color : '1px solid var(--border)', borderRadius: 12, padding: 16, position: 'relative', cursor: 'pointer', transition: 'box-shadow 0.2s' }}
              onClick={() => { onLoadDeal(d); onMarkViewed(deal.id) }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
              {isNew && (
                <div style={{ position: 'absolute', top: 12, right: 12, background: grade.color, color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 10, letterSpacing: '0.5px' }}>NEW</div>
              )}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 12 }}>
                <div style={{ width: 52, height: 52, borderRadius: 10, background: grade.color + '22', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: grade.color, lineHeight: 1 }}>{score}</div>
                  <div style={{ fontSize: 9, color: grade.color, fontWeight: 600 }}>SCORE</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)', marginBottom: 2 }}>{deal.address || f.address || 'Featured Deal'}</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>{grade.emoji} {grade.label} · {new Date(deal.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 12 }}>
                {[
                  { label: 'Cash flow', value: m.cashflow !== undefined ? fmt(m.cashflow) + '/mo' : '—', pos: m.cashflow >= 0 },
                  { label: 'Cap rate', value: m.capRate !== undefined ? fmtPct(m.capRate) : '—' },
                  { label: 'CoC return', value: m.coc !== undefined ? fmtPct(m.coc) : '—', pos: m.coc >= 0 },
                  { label: 'Price', value: f.price ? fmtK(f.price) : '—' },
                ].map(stat => (
                  <div key={stat.label} style={{ background: 'var(--surface2)', borderRadius: 6, padding: '8px 10px' }}>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2 }}>{stat.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: stat.pos === false ? 'var(--red)' : stat.pos ? 'var(--green)' : 'var(--text)' }}>{stat.value}</div>
                  </div>
                ))}
              </div>
              <button style={{ width: '100%', padding: '8px', background: grade.color, color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <i className="ti ti-calculator" style={{ fontSize: 13 }} /> Load Full Analysis
              </button>
            </div>
          )
        })}
      </div>
      <div style={{ marginTop: 20, padding: '12px 16px', background: 'var(--surface2)', borderRadius: 8, fontSize: 11, color: 'var(--text3)', textAlign: 'center', lineHeight: 1.5 }}>
        Deals auto-flag when Deal Score hits 70+. One alert per property, ever. · <em>Not financial advice — always do your own due diligence.</em>
      </div>
    </div>
  )
}

// ── PORTFOLIO COMPONENT ────────────────────────────────────────────────────
function Portfolio({ saved, onDelete, isPro, onUpgrade, dealAlerts, viewedDealIds, onLoadDeal, onMarkViewed, prefs, onSavePrefs }) {
  const [portfolioTab, setPortfolioTab] = useState('properties')
  const unreadCount = dealAlerts.filter(d => !viewedDealIds.has(d.id)).length
  const totalCF = saved.reduce((s,p) => s + p.metrics.cashflow, 0)
  const totalEquity = saved.reduce((s,p) => s + (p.metrics.chartData[4]?.equity||0), 0)

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
      {/* Sub-tabs */}
      <div style={{ display:'flex', background:'var(--surface)', borderBottom:'1px solid var(--border)', padding:'0 24px', flexShrink:0 }}>
        {[
          { key:'properties', label:'My Properties', icon:'ti-briefcase' },
          { key:'alerts', label:'Deal Alerts', icon:'ti-bell' },
        ].map(t => (
          <button key={t.key} onClick={() => setPortfolioTab(t.key)} style={{ padding:'12px 16px', fontSize:13, fontWeight:500, cursor:'pointer', border:'none', borderBottom: portfolioTab===t.key ? '2px solid #1a5fa8' : '2px solid transparent', background:'transparent', color: portfolioTab===t.key ? '#1a5fa8' : 'var(--text2)', fontFamily:'var(--font)', display:'flex', alignItems:'center', gap:6, marginRight:4 }}>
            <i className={`ti ${t.icon}`} style={{ fontSize:14 }} />
            {t.label}
            {t.key === 'alerts' && unreadCount > 0 && (
              <span style={{ background:'#a32d2d', color:'#fff', borderRadius:10, fontSize:10, padding:'0 6px', fontWeight:700 }}>{unreadCount}</span>
            )}
            {t.key === 'properties' && saved.length > 0 && (
              <span style={{ background:'var(--border)', color:'var(--text2)', borderRadius:10, fontSize:10, padding:'0 6px', fontWeight:600 }}>{saved.length}</span>
            )}
          </button>
        ))}
      </div>

      {portfolioTab === 'alerts' ? (
        <DealAlerts deals={dealAlerts} viewedIds={viewedDealIds} onLoadDeal={onLoadDeal} onMarkViewed={onMarkViewed} prefs={prefs} onSavePrefs={onSavePrefs} />
      ) : (
        <div style={{ flex:1, overflowY:'auto', padding:24 }}>
          {saved.length === 0 && !isPro ? (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12, color:'var(--text2)', padding:40 }}>
              <i className="ti ti-briefcase" style={{ fontSize:48, color:'var(--text3)' }} />
              <div style={{ fontSize:16, fontWeight:500, color:'var(--text)' }}>No saved properties yet</div>
              <div style={{ fontSize:13 }}>Save up to {FREE_LIMIT} properties on the free plan.</div>
            </div>
          ) : (
            <>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:12, marginBottom:24 }}>
                {[
                  { label:'Properties', value:`${saved.length}${!isPro ? ` / ${FREE_LIMIT}` : ''}` },
                  { label:'Total monthly CF', value:fmt(totalCF), color:totalCF>=0?'var(--green)':'var(--red)' },
                  { label:'Portfolio equity (Yr 5)', value:`$${totalEquity}K` },
                ].map(m => (
                  <div key={m.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'14px 16px' }}>
                    <div style={{ fontSize:11, color:'var(--text2)', marginBottom:4 }}>{m.label}</div>
                    <div style={{ fontSize:22, fontWeight:600, color:m.color||'var(--text)' }}>{m.value}</div>
                  </div>
                ))}
              </div>
              {!isPro && (
                <div style={{ background:'#f0f7ff', border:'1px solid #c0d8f0', borderRadius:10, padding:'14px 16px', marginBottom:18, display:'flex', alignItems:'center', gap:12 }}>
                  <i className="ti ti-lock" style={{ fontSize:20, color:'#1a5fa8' }} />
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:500, color:'#0f2744' }}>Free plan: {saved.length}/{FREE_LIMIT} properties saved</div>
                    <div style={{ fontSize:12, color:'#1a5fa8' }}>Upgrade to Pro for unlimited saves, PDF exports & full portfolio analytics.</div>
                  </div>
                  <button onClick={onUpgrade} style={{ padding:'7px 14px', background:'#1a5fa8', color:'#fff', border:'none', borderRadius:6, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)', whiteSpace:'nowrap' }}>Go Pro</button>
                </div>
              )}
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                {saved.map(p => (
                  <div key={p.id} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:16 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
                      <div>
                        <div style={{ fontWeight:600, fontSize:15 }}>{p.fields.address||'Unnamed property'}</div>
                        <div style={{ fontSize:12, color:'var(--text2)' }}>{fmt(p.fields.price)} · {p.fields.neighborhood}</div>
                      </div>
                      <button onClick={() => onDelete(p.id)} aria-label="Delete saved property" style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text3)', fontSize:16 }}><i className="ti ti-trash" /></button>
                    </div>
                    <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
                      {[
                        { label:'Cash flow', value:fmt(p.metrics.cashflow)+'/mo', pos:p.metrics.cashflow>=0 },
                        { label:'Cap rate', value:fmtPct(p.metrics.capRate) },
                        { label:'CoC return', value:fmtPct(p.metrics.coc), pos:p.metrics.coc>=0 },
                        { label:'Gross yield', value:fmtPct(p.metrics.grossYield) },
                      ].map(m => (
                        <div key={m.label}>
                          <div style={{ fontSize:11, color:'var(--text2)' }}>{m.label}</div>
                          <div style={{ fontWeight:600, color:m.pos===false?'var(--red)':m.pos?'var(--green)':'var(--text)' }}>{m.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {!isPro && (
                <div style={{ marginTop:20 }}>
                  <div style={{ fontSize:12, color:'var(--text3)', marginBottom:10, textTransform:'uppercase', letterSpacing:'0.5px', fontWeight:600 }}>Pro features preview</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                    <ProFeatureBlur label="PDF Report Export" icon="ti-file-description" onUpgrade={onUpgrade} />
                    <ProFeatureBlur label="Rent Comp History" icon="ti-history" onUpgrade={onUpgrade} />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

const DEFAULT_FIELDS = {
  address:'', zip:'', neighborhood:'',
  price:0, downPct:25, closingPct:3, reno:0, renoFinanced:false,
  rent:0, vacancyPct:5, rentRangeLow:0, rentRangeHigh:0,
  taxes:0, taxesYearly:0,
  insurance:0, insuranceYearly:0,
  mgmtPct:10, maintenance:0, maintenancePct:0,
  otherIncome:0, otherExpenses:0,
  rate:7.25, term:30,
  rentGrowth:2.5, appreciation:3.0,
}

export default function App() {
  const [supaUser, setSupaUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [dealAlerts, setDealAlerts] = useState([])
  const [viewedDealIds, setViewedDealIds] = useState(new Set())
  const [userPrefs, setUserPrefs] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const user = session?.user ?? null
      setSupaUser(user)
      if (user) {
        // Load saved properties
        const { data: propData } = await supabase.from('properties').select('data').eq('user_id', user.id).order('created_at', { ascending: true })
        if (propData) setSaved(propData.map(r => r.data))
        // Load deal alerts
        const { data: alertData } = await supabase.from('deal_alerts').select('*').order('created_at', { ascending: false })
        if (alertData) setDealAlerts(alertData)
        // Load which deals this user has viewed
        const { data: viewData } = await supabase.from('deal_alert_views').select('deal_id').eq('user_id', user.id)
        if (viewData) setViewedDealIds(new Set(viewData.map(v => v.deal_id)))
        // Load user preferences / buy box (maybeSingle avoids 406 when no row exists yet)
        const { data: prefsData } = await supabase.from('user_preferences').select('*').eq('user_id', user.id).maybeSingle()
        if (prefsData) setUserPrefs(prefsData)
      // Load trial status
      const { data: profileData, error: profileError } = await supabase.from('profiles').select('trial_start').eq('id', user.id).single()

     setTrialStart(profileData?.trial_start ?? null)
setAuthLoading(false)
})
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSupaUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  const [tab, setTab] = useState('analyzer')
  const [isMobile, setIsMobile] = useState(false)
  const [showWalkthrough, setShowWalkthrough] = useState(() => !localStorage.getItem('ra_toured'))
  const [fields, setFields] = useState(DEFAULT_FIELDS)
  const [maintenanceMode, setMaintenanceMode] = useState('$')
  const [zillowUrl, setZillowUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [toast, setToast] = useState(null)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [upgradeTrigger, setUpgradeTrigger] = useState('general')
  const [showSignup, setShowSignup] = useState(false)
  const [signupForm, setSignupForm] = useState({ firstName:'', email:'', password:'', agreed:false })
  const [signupError, setSignupError] = useState('')
  const [isPro, setIsPro] = useState(() => localStorage.getItem('ra_pro') === 'true')
  const [trialStart, setTrialStart] = useState(null)
  const trialActive = trialStart && (new Date() - new Date(trialStart)) < 7 * 24 * 60 * 60 * 1000
  const [saved, setSaved] = useState([])
  const [comps, setComps] = useState([])
  const [compsLoading, setCompsLoading] = useState(false)
  const [sliderRent, setSliderRent] = useState(0)
  const toastTimer = useRef(null)

  React.useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const set = (key) => (val) => setFields(f => ({ ...f, [key]: ['address','zip','neighborhood'].includes(key) ? val : (parseFloat(val) || 0) }))
  const activeRent = (sliderRent > 0 && sliderRent !== fields.rent) ? sliderRent : fields.rent
  const metrics = calcMetrics({ ...fields, rent: activeRent, maintenancePct: maintenanceMode === '%' ? fields.maintenancePct : 0 })

  const showToast = (msg, type='success') => {
    clearTimeout(toastTimer.current)
    setToast({ msg, type })
    toastTimer.current = setTimeout(() => setToast(null), 5000)
  }

 const openUpgrade = (trigger='general') => { setUpgradeTrigger(trigger); setShowUpgrade(true) }

  const startTrial = async () => {
    console.log('startTrial called, supaUser:', supaUser)
    const now = new Date().toISOString()
    await supabase.from('profiles').update({ trial_start: now }).eq('id', supaUser.id)
    setTrialStart(now)
    showToast('🎉 Your 7-day free trial has started!', 'success')
setShowUpgrade(false)
  }

  // Save user buy box preferences
  const handleSavePrefs = async (newPrefs) => {
    const record = { ...newPrefs, user_id: supaUser.id, updated_at: new Date().toISOString() }
    const { data } = await supabase.from('user_preferences').upsert(record, { onConflict: 'user_id' }).select().single()
    if (data) setUserPrefs(data)
  }

  // Mark a deal as viewed by this user
  const handleMarkViewed = async (dealId) => {
    if (viewedDealIds.has(dealId)) return
    setViewedDealIds(prev => new Set([...prev, dealId]))
    await supabase.from('deal_alert_views').upsert({ user_id: supaUser.id, deal_id: dealId }, { onConflict: 'user_id,deal_id' })
  }

  // Load a deal alert into the analyzer
  const handleLoadDeal = (dealData) => {
    if (dealData?.fields) {
      setFields({ ...DEFAULT_FIELDS, ...dealData.fields })
      setSliderRent(0)
      setTab('analyzer')
      showToast('Deal loaded! Review the full analysis below.')
    }
  }

  const handleSave = async () => {
    if (!supaUser) return
    
    if (!isPro && !trialActive && saved.length >= FREE_LIMIT) { openUpgrade('save'); return }
    const entry = { id: Date.now(), fields: { ...fields }, metrics }
    const { error } = await supabase.from('properties').insert({
      user_id: supaUser.id,
      address: fields.address || 'Unnamed',
      data: entry
    })
    if (error) { showToast('Error saving property.', 'error'); return }
    const next = [...saved, entry]
    setSaved(next)
    showToast(`Property saved! ${!isPro ? `${next.length}/${FREE_LIMIT} free saves used.` : ''}`)

    // Auto-flag as deal alert if score >= 70
    const scoreResult = calcDealScore(metrics)
    if (scoreResult && scoreResult.score >= 70) {
      const address = fields.address || 'Unnamed'
      // Check for duplicate — don't alert same address twice
      const { data: existing } = await supabase.from('deal_alerts').select('id').eq('address', address).limit(1)
      if (!existing || existing.length === 0) {
        const { data: newAlert } = await supabase.from('deal_alerts').insert({
          address,
          zip: fields.zip || null,
          deal_score: scoreResult.score,
          data: entry
        }).select().single()
        if (newAlert) {
          setDealAlerts(prev => [newAlert, ...prev])
          showToast(`🔥 Deal Score ${scoreResult.score} — this property was added to Deal Alerts for all users!`)
        }
      }
    }
  }

  const handleDelete = async (id) => {
    await supabase.from('properties').delete().eq('data->>id', String(id)).eq('user_id', supaUser.id)
    setSaved(prev => prev.filter(p => p.id !== id))
  }

  const handleUpgrade = () => {
    setIsPro(true)
    localStorage.setItem('ra_pro', 'true')
    setShowUpgrade(false)
    showToast('🎉 Welcome to Pro! All features unlocked.')
  }

  const [importAddress, setImportAddress] = useState('')
  const [showAddressFallback, setShowAddressFallback] = useState(false)

  const extractAddressFromZillow = (url) => {
    try {
      const match = url.match(/homedetails\/([^/]+)\//)
      if (!match) return null
      const slug = match[1]
      return slug.replace(/-\d{5}(\d*)$/, m => m.replace(/-/, ' ')).replace(/-/g, ' ').replace(/\b(\w)/g, c => c.toUpperCase()).replace(/\s+/g, ' ').trim()
    } catch { return null }
  }

  const runImport = async (address) => {
    setImporting(true)
    setShowAddressFallback(false)
    try {
      const encoded = encodeURIComponent(address)
      const base = '/api/rentcast'
      const [propRes, rentRes] = await Promise.all([
        fetch(`${base}?endpoint=properties&address=${encoded}&limit=1`),
        fetch(`${base}?endpoint=avm/rent/long-term&address=${encoded}`)
      ])
      if (propRes.status === 429) { showToast('Too many requests — please wait a moment and try again.', 'error'); setImporting(false); return }
      const propData = await propRes.json()
      const rentData = await rentRes.json()
      const prop = Array.isArray(propData) ? (propData[0] || {}) : (propData || {})
      const importedFields = {}
      importedFields.address = prop.formattedAddress || address
      if (prop.zipCode) importedFields.zip = String(prop.zipCode)
      if (prop.city) importedFields.neighborhood = prop.city
      const rentcastPrice = parseFloat(prop.price || prop.assessedValue) || 0
      if (rentcastPrice > 0) importedFields.price = rentcastPrice
      if (rentData.rent) importedFields.rent = parseFloat(rentData.rent) || 0
      if (rentData.rentRangeLow) importedFields.rentRangeLow = parseFloat(rentData.rentRangeLow) || 0
      if (rentData.rentRangeHigh) importedFields.rentRangeHigh = parseFloat(rentData.rentRangeHigh) || 0
      if (prop.propertyTaxes) {
        importedFields.taxesYearly = Math.round(parseFloat(prop.propertyTaxes) || 0)
        importedFields.taxes = Math.round((parseFloat(prop.propertyTaxes) || 0) / 12)
      }
      setFields(f => ({ ...f, ...importedFields }))
      const gotData = importedFields.rent || importedFields.price || importedFields.taxes
      if (!gotData && !prop.formattedAddress) {
        setImportAddress(address); setShowAddressFallback(true)
        showToast('Could not match that address. Edit it below and retry.', 'error')
      } else {
        showToast('Imported: ' + [importedFields.address && 'Address', importedFields.rent && 'Rent estimate', importedFields.price && 'Price', importedFields.taxes && 'Taxes'].filter(Boolean).join(', '))
      }
    } catch (err) {
      setImportAddress(address); setShowAddressFallback(true)
      showToast('API error — edit the address below and retry.', 'error')
    } finally { setImporting(false) }
  }

  const handleImport = async () => {
    const url = zillowUrl.trim()
    if (!url) { showToast('Paste a Zillow listing URL first.', 'error'); return }
    if (!isPro) { openUpgrade('import'); return }
    const address = extractAddressFromZillow(url)
    if (!address) { showToast('Could not read address from that URL.', 'error'); return }
    setImportAddress(address)
    await runImport(address)
  }

  const capColor = metrics.capRate>=8?'var(--green)':metrics.capRate>=5?'var(--amber)':'var(--red)'
  const totalUnread = dealAlerts.filter(d => !viewedDealIds.has(d.id)).length

  if (authLoading) return <div style={{color:'white',textAlign:'center',marginTop:80}}>Loading...</div>
  if (!supaUser) return <Auth />

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', overflow:'hidden' }} role="application" aria-label="Rental Analyst - Property Investment Calculator">
      <a href="#main-content" className="skip-nav">Skip to main content</a>
      {showWalkthrough && <WalkthroughBubble onDone={() => { setShowWalkthrough(false); localStorage.setItem('ra_toured', '1') }} />}
      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} trigger={upgradeTrigger} onUpgrade={handleUpgrade} trialStart={trialStart} onStartTrial={startTrial} />}
      {showSignup && <SignupModal onClose={() => setShowSignup(false)} form={signupForm} setForm={setSignupForm} error={signupError} onSubmit={() => {
        if (!signupForm.firstName) { setSignupError('Please enter your first name.'); return }
        if (!signupForm.email.includes('@')) { setSignupError('Please enter a valid email.'); return }
        if (signupForm.password.length < 6) { setSignupError('Password must be at least 6 characters.'); return }
        if (!signupForm.agreed) { setSignupError('Please agree to receive updates.'); return }
        const newUser = { firstName: signupForm.firstName, email: signupForm.email, joinedAt: new Date().toISOString() }
        setShowSignup(false); setSignupError('')
        showToast(`Welcome, ${signupForm.firstName}! Now save your first property.`)
        fetch('https://script.google.com/macros/s/AKfycbwb4OwFfCC7NsQrpdmtUfdM6S-AsRkXVpqutyGYt6WfJvTx5exHyNmXXFdeBaQqXfZ8JA/exec', { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newUser) })
      }} />}

      <header style={{ background:'var(--navy)', color:'#fff', padding:'0 20px', display:'flex', alignItems:'center', height:52, flexShrink:0, gap:16 }} role="banner">
        <div style={{ display:'flex', alignItems:'center', gap:8, fontWeight:600, fontSize:15, letterSpacing:'-0.3px' }}>
          <i className="ti ti-home-dollar" style={{ fontSize:20, color:'#4da8ff' }} />
          Rental Analyst
        </div>
        {isPro && <span style={{ background:'#4da8ff', color:'#fff', fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:10, letterSpacing:'0.5px' }}>PRO</span>}
        <div style={{ marginLeft:'auto', display:'flex', gap:4, alignItems:'center' }}>
          {['analyzer','portfolio'].map(t => (
            <button key={t} onClick={() => setTab(t)} aria-label={t === 'analyzer' ? 'Analyzer tab' : 'Portfolio tab'} style={{ padding:'6px 14px', borderRadius:6, fontSize:13, cursor:'pointer', border:'none', background:tab===t?'rgba(255,255,255,0.15)':'transparent', color:tab===t?'#fff':'rgba(255,255,255,0.55)', display:'flex', alignItems:'center', gap:6, fontFamily:'var(--font)' }}>
              <i className={`ti ti-${t==='analyzer'?'calculator':'briefcase'}`} style={{ fontSize:14 }} />
              {t.charAt(0).toUpperCase()+t.slice(1)}
              {t==='portfolio' && totalUnread > 0 && (
                <span style={{ background:'#a32d2d', color:'#fff', borderRadius:10, fontSize:10, padding:'0 6px', fontWeight:700 }}>{totalUnread}</span>
              )}
              {t==='portfolio' && totalUnread === 0 && saved.length > 0 && (
                <span style={{ background:'#4da8ff', color:'#fff', borderRadius:10, fontSize:10, padding:'0 6px', fontWeight:600 }}>{saved.length}</span>
              )}
            </button>
          ))}
          {!isPro && (
            <button onClick={() => openUpgrade('nav')} aria-label="Upgrade to Pro" style={{ marginLeft:8, padding:'6px 14px', background:'linear-gradient(135deg,#4da8ff,#1a5fa8)', color:'#fff', border:'none', borderRadius:6, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)', display:'flex', alignItems:'center', gap:5 }}>
              <i className="ti ti-bolt" style={{ fontSize:13 }} /> Go Pro
            </button>
          )}
          <button onClick={() => supabase.auth.signOut()} aria-label="Sign out" title="Sign out" style={{ marginLeft:4, padding:'6px 10px', background:'rgba(255,255,255,0.08)', color:'rgba(255,255,255,0.7)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:6, fontSize:16, cursor:'pointer', fontFamily:'var(--font)', display:'flex', alignItems:'center' }}>
            <i className="ti ti-logout" />
          </button>
        </div>
      </header>

      {tab==='analyzer' && (
        <div style={{ display:'flex', background:'var(--surface)', borderBottom:'1px solid var(--border)', overflowX:'auto', flexShrink:0 }}>
          <MetricCard label="Monthly cash flow (Yr 1)" value={fmt(metrics.cashflow)+'/mo'} sub="After all expenses + debt" valueStyle={{ color:metrics.cashflow>=0?'var(--green)':'var(--red)' }} />
          <MetricCard label="Cap rate (Yr 1)" value={fmtPct(metrics.capRate)} sub="NOI ÷ property value" valueStyle={{ color:capColor }} badge={<CapBadge capRate={metrics.capRate} />} />
          <MetricCard label="Cash-on-cash (Yr 1)" value={fmtPct(metrics.coc)} sub="Annual CF ÷ cash invested" valueStyle={{ color:metrics.coc>=0?'var(--green)':'var(--red)' }} />
          <MetricCard label="Gross yield (Yr 1)" value={fmtPct(metrics.grossYield)} sub="Annual rent ÷ purchase price" valueStyle={{}} />
          <MetricCard label="Total cash in" value={fmt(metrics.totalCashIn)} sub="Down + closing + reno" valueStyle={{}} />
          <div style={{ flex:1, minWidth:110, padding:'14px 18px', display:'flex', flexDirection:'column', gap:2 }}>
            <div style={{ fontSize:11, color:'var(--text2)' }}>Break-even rent</div>
            <div style={{ fontSize:22, fontWeight:600 }}>{fmt(metrics.breakeven)}/mo</div>
            <div style={{ fontSize:11, color:'var(--text3)' }}>Min rent to cover costs</div>
          </div>
        </div>
      )}

      {tab==='analyzer' ? (
        <main id="main-content" style={{ display:'flex', flex:1, overflow: isMobile ? 'auto' : 'hidden', flexDirection: isMobile ? 'column' : 'row' }}>
          <div style={{ width: isMobile ? '100%' : 280, minWidth: isMobile ? 'unset' : 280, background:'var(--surface)', borderRight: isMobile ? 'none' : '1px solid var(--border)', borderBottom: isMobile ? '1px solid var(--border)' : 'none', overflowY: isMobile ? 'visible' : 'auto', padding:16 }}>
            <div style={{ border:'1px solid var(--border)', borderRadius:12, padding:12, marginBottom:14 }}>
              <SectionLabel icon="link">Import from Zillow</SectionLabel>
              <div style={{ display:'flex', gap:6 }}>
                <input type="text" value={zillowUrl} onChange={e => setZillowUrl(e.target.value)} placeholder="Paste a Zillow listing URL…" aria-label="Zillow listing URL" style={{ flex:1, fontSize:12 }} />
                <button onClick={handleImport} disabled={importing} style={{ padding:'8px 12px', background:'#1a5fa8', color:'#fff', border:'none', borderRadius:6, fontSize:13, cursor:importing?'not-allowed':'pointer', fontWeight:500, fontFamily:'var(--font)', whiteSpace:'nowrap', opacity:importing?0.7:1, display:'flex', alignItems:'center', gap:5 }}>
                  {importing ? 'Importing…' : isPro ? 'Import' : <><i className="ti ti-bolt" style={{fontSize:12}}/> Pro</>}
                </button>
              </div>
              {showAddressFallback && (
                <div style={{ marginTop:8 }}>
                  <div style={{ fontSize:11, color:"var(--text2)", marginBottom:4 }}>Edit address and retry:</div>
                  <div style={{ display:"flex", gap:6 }}>
                    <input type="text" value={importAddress} onChange={e => setImportAddress(e.target.value)} style={{ flex:1, fontSize:12 }} placeholder="123 Main St, City, ST 12345" />
                    <button onClick={() => runImport(importAddress)} disabled={importing} style={{ padding:"6px 10px", background:"#1a5fa8", color:"#fff", border:"none", borderRadius:6, fontSize:12, cursor:"pointer", fontWeight:500, fontFamily:"var(--font)", whiteSpace:"nowrap" }}>Retry</button>
                  </div>
                </div>
              )}
              {toast && (
                <div role="alert" aria-live="polite" style={{ marginTop:8, padding:"7px 10px", background:toast.type==="success"?"#eaf3de":"#faeeda", borderRadius:6, fontSize:11, color:toast.type==="success"?"#3b6d11":"#854f0b", display:"flex", gap:6, alignItems:"flex-start", wordBreak:"break-word" }}>
                  <i className={`ti ${toast.type==="success"?"ti-circle-check":"ti-alert-circle"}`} style={{ fontSize:14, marginTop:1, flexShrink:0 }} />{toast.msg}
                </div>
              )}
            </div>
            <div style={{ marginBottom:14 }}>
              <button onClick={handleSave} aria-label="Save property to portfolio" style={{ width:'100%', padding:'8px 12px', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, fontSize:13, cursor:'pointer', color:'var(--text)', display:'flex', alignItems:'center', justifyContent:'center', gap:6, fontFamily:'var(--font)' }}>
                <i className="ti ti-bookmark" /> Save property
                {!isPro && <span style={{ marginLeft:'auto', fontSize:11, color:'var(--text3)' }}>{saved.length}/{FREE_LIMIT}</span>}
              </button>
              {!isPro && !trialActive && saved.length >= FREE_LIMIT && (
                <div style={{ fontSize:11, color:'#a32d2d', marginTop:4, textAlign:'center' }}>
                  Free limit reached — <button onClick={() => openUpgrade('save')} style={{ background:'none', border:'none', color:'#1a5fa8', fontSize:11, cursor:'pointer', padding:0, fontFamily:'var(--font)', textDecoration:'underline' }}>upgrade to save more</button>
                </div>
              )}
            </div>
            <SectionLabel>Property details</SectionLabel>
            <Field label="Address / nickname" id="address" value={fields.address} onChange={set('address')} type="text" />
            <FieldRow>
              <Field label="Zip" id="zip" value={fields.zip} onChange={set('zip')} type="text" />
              <Field label="Neighborhood" id="neighborhood" value={fields.neighborhood} onChange={set('neighborhood')} type="text" />
            </FieldRow>
            <Divider />
            <SectionLabel icon="home">Purchase</SectionLabel>
            <Field label="Purchase price" id="price" value={fields.price} onChange={set('price')} prefix="$" />
            <FieldRow>
              <Field label="Down payment" id="downPct" value={fields.downPct} onChange={set('downPct')} suffix="%" />
              <Field label="Closing costs" id="closingPct" value={fields.closingPct} onChange={set('closingPct')} suffix="%" />
            </FieldRow>
            {fields.price > 0 && fields.downPct < 100 && (
              <div style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, padding:'8px 12px', fontSize:12, marginBottom:8, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ color:'var(--text2)' }}>💵 Down: <strong style={{ color:'var(--text)' }}>{fmt(metrics.down)}</strong></span>
                <span style={{ color:'var(--text2)' }}>🏦 Financed: <strong style={{ color:'#1a5fa8' }}>{fmt(metrics.loanAmt)}</strong></span>
              </div>
            )}
            {fields.downPct >= 100 && (
              <div style={{ background:'#eaf3de', border:'1px solid #b7d9a0', borderRadius:6, padding:'6px 10px', fontSize:11, color:'#3b6d11', marginBottom:8, display:'flex', alignItems:'center', gap:6 }}>
                <i className="ti ti-cash" style={{ fontSize:13 }} /> Cash purchase — no mortgage
              </div>
            )}
            <Field label="Renovation budget" id="reno" value={fields.reno} onChange={set('reno')} prefix="$" />
            <div style={{ fontSize:11, color:'var(--text3)', marginTop:-8, marginBottom:6, lineHeight:1.4 }}>How is the renovation funded?</div>
            <div style={{ display:'flex', gap:6, marginBottom:12 }}>
              {['Cash','Financed'].map(opt => (
                <button key={opt} onClick={() => setFields(f => ({...f, renoFinanced: opt==='Financed'}))}
                  style={{ flex:1, padding:'6px', fontSize:12, fontWeight:500, borderRadius:6, cursor:'pointer', fontFamily:'var(--font)',
                    background: (opt==='Financed') === fields.renoFinanced ? '#1a5fa8' : 'var(--surface2)',
                    color: (opt==='Financed') === fields.renoFinanced ? '#fff' : 'var(--text2)',
                    border: '1px solid var(--border)' }}>
                  {opt}
                </button>
              ))}
            </div>
            <Divider />
            <SectionLabel icon="currency-dollar">Income</SectionLabel>
            <Field label="Monthly rent" id="rent" value={fields.rent} onChange={set('rent')} prefix="$" />
            <Field label="Other income (laundry, parking, etc.)" id="otherIncome" value={fields.otherIncome} onChange={set('otherIncome')} prefix="$" />
            <Field label="Vacancy rate" id="vacancyPct" value={fields.vacancyPct} onChange={set('vacancyPct')} suffix="%" />
            <Divider />
            <SectionLabel icon="receipt">Monthly expenses</SectionLabel>
            <FieldRow>
              <Field label="Property taxes (yearly)" id="taxesYearly" value={fields.taxesYearly} onChange={val => setFields(f => ({...f, taxesYearly: parseFloat(val)||0, taxes: Math.round((parseFloat(val)||0)/12)}))} prefix="$" />
              <div style={{ flex:1 }}>
                <div style={{ fontSize:12, fontWeight:500, color:'var(--text2)', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.5px' }}>Monthly</div>
                <div style={{ padding:'8px 10px', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, fontSize:13, color:'var(--text3)' }}>{fmt(metrics.taxes)}/mo</div>
              </div>
            </FieldRow>
            <FieldRow>
              <Field label="Insurance (yearly)" id="insuranceYearly" value={fields.insuranceYearly} onChange={val => setFields(f => ({...f, insuranceYearly: parseFloat(val)||0, insurance: Math.round((parseFloat(val)||0)/12)}))} prefix="$" />
              <div style={{ flex:1 }}>
                <div style={{ fontSize:12, fontWeight:500, color:'var(--text2)', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.5px' }}>Monthly</div>
                <div style={{ padding:'8px 10px', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, fontSize:13, color:'var(--text3)' }}>{fmt(metrics.insurance)}/mo</div>
              </div>
            </FieldRow>
            <Field label="Property management" id="mgmtPct" value={fields.mgmtPct} onChange={set('mgmtPct')} suffix="%" />
            <div style={{ marginBottom:12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                <label style={{ fontSize:12, fontWeight:500, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.5px' }}>Maintenance / CapEx</label>
                <div style={{ display:'flex', gap:4 }}>
                  {['$','%'].map(m => (
                    <button key={m} onClick={() => setMaintenanceMode(m)} style={{ padding:'2px 8px', fontSize:11, borderRadius:4, cursor:'pointer', fontFamily:'var(--font)', background: maintenanceMode===m ? '#1a5fa8' : 'var(--surface2)', color: maintenanceMode===m ? '#fff' : 'var(--text2)', border:'1px solid var(--border)' }}>{m}</button>
                  ))}
                </div>
              </div>
              {maintenanceMode === '$'
                ? <div style={{ position:'relative' }}><span style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', fontSize:13, color:'var(--text3)', pointerEvents:'none' }}>$</span><input type="number" value={fields.maintenance} onChange={e => set('maintenance')(e.target.value)} onFocus={e => e.target.select()} style={{ paddingLeft:18 }} /></div>
                : <div style={{ position:'relative' }}><input type="number" value={fields.maintenancePct} onChange={e => set('maintenancePct')(e.target.value)} onFocus={e => e.target.select()} style={{ paddingRight:28 }} /><span style={{ position:'absolute', right:9, top:'50%', transform:'translateY(-50%)', fontSize:12, color:'var(--text3)', pointerEvents:'none' }}>% rent</span></div>
              }
              <div style={{ fontSize:11, color:'var(--text3)', marginTop:4 }}>
                {maintenanceMode === '%' ? `= ${fmt(metrics.maintenance)}/mo (${fields.maintenancePct}% of effective rent)` : 'Industry avg: 8-10% of gross rent'}
              </div>
            </div>
            <Field label="Other monthly expenses (utilities, lawn, etc.)" id="otherExpenses" value={fields.otherExpenses} onChange={set('otherExpenses')} prefix="$" />
            <Divider />
            <SectionLabel icon="building-bank">Financing</SectionLabel>
            <Field label="Interest rate" id="rate" value={fields.rate} onChange={set('rate')} suffix="%" />
            <Field label="Loan term" id="term" value={fields.term} onChange={set('term')} suffix="yrs" />
            <Divider />
            <SectionLabel icon="trending-up">Projection Assumptions</SectionLabel>
            <FieldRow>
              <Field label="Rent growth" id="rentGrowth" value={fields.rentGrowth} onChange={set('rentGrowth')} suffix="%" />
              <Field label="Appreciation" id="appreciation" value={fields.appreciation} onChange={set('appreciation')} suffix="%" />
            </FieldRow>
            <div style={{ fontSize:11, color:'var(--text3)', marginTop:-6, marginBottom:8, lineHeight:1.5 }}>
              Annual rates used in 10-year projection. National avg: 2-3% rent growth, 3-4% appreciation.
            </div>
          </div>
          <div style={{ flex:1, overflowY:'auto', padding:24 }}>
            <div style={{ background:'var(--navy)', color:'#fff', borderRadius:12, padding:'18px 22px', marginBottom:18 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4 }}>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.5)', letterSpacing:'1px', textTransform:'uppercase' }}>Investment calculator</div>
                {metrics.isCashDeal && <span style={{ background:'rgba(77,168,255,0.25)', color:'#4da8ff', fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:10, letterSpacing:'0.5px' }}>💵 CASH DEAL</span>}
              </div>
              <div style={{ fontSize:20, fontWeight:600, marginBottom:2 }}>{fields.address||'Rental Property Analyzer'}</div>
              <div style={{ fontSize:13, color:'rgba(255,255,255,0.6)' }}>{fields.neighborhood&&fields.zip?`${fields.neighborhood}, ${fields.zip}`:'Enter property details to analyze'}</div>
              {fields.rentRangeLow > 0 && (
                <div style={{ marginTop:8, display:'flex', gap:8, flexWrap:'wrap' }}>
                  <span style={{ background:'rgba(255,255,255,0.1)', borderRadius:6, padding:'3px 10px', fontSize:12, color:'rgba(255,255,255,0.85)' }}>
                    🏠 Market rent: ${fields.rentRangeLow.toLocaleString()}–${fields.rentRangeHigh.toLocaleString()}/mo
                  </span>
                  {fields.rent > 0 && (
                    <span style={{ background: fields.rent >= fields.rentRangeLow ? 'rgba(26,122,74,0.4)' : 'rgba(163,45,45,0.4)', borderRadius:6, padding:'3px 10px', fontSize:12, color:'rgba(255,255,255,0.9)' }}>
                      {fields.rent >= fields.rentRangeLow ? '✅ At or above market' : '⚠️ Below market range'}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:12, marginBottom:18 }}>
              {[
                { label:'Monthly NOI', value:fmt(metrics.noi), pos:metrics.noi>=0 },
                { label:'Annual cash flow', value:fmt(metrics.annualCF), pos:metrics.annualCF>=0 },
                { label: metrics.isCashDeal ? 'No mortgage' : 'Monthly mortgage', value: metrics.isCashDeal ? 'Cash purchase' : fmt(metrics.monthlyMortgage)+'/mo' },
                { label:'Loan amount', value: metrics.isCashDeal ? 'N/A' : fmtK(metrics.loanAmt) },
              ].map(m => (
                <div key={m.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'14px 16px' }}>
                  <div style={{ fontSize:11, color:'var(--text2)', marginBottom:4 }}>{m.label}</div>
                  <div style={{ fontSize:20, fontWeight:600, color:m.pos===false?'var(--red)':m.pos?'var(--green)':'var(--text)' }}>{m.value}</div>
                </div>
              ))}
            </div>
            {metrics.price > 0 && fields.rent > 0 && (
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'18px 20px', marginBottom:18 }}>
                <div style={{ fontSize:13, fontWeight:600, marginBottom:14, display:'flex', alignItems:'center', gap:6 }}>
                  <i className="ti ti-chart-pie" style={{ fontSize:15, color:'#1a5fa8' }} /> Investor Metrics
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:10 }}>
                  {[
                    !metrics.isCashDeal && {
                      label:'DSCR',
                      value: metrics.dscr !== null ? metrics.dscr.toFixed(2) + 'x' : 'N/A',
                      sub: metrics.dscr >= 1.25 ? 'Lender approved' : metrics.dscr >= 1.0 ? 'Borderline' : 'Below threshold',
                      color: metrics.dscr >= 1.25 ? 'var(--green)' : metrics.dscr >= 1.0 ? 'var(--amber)' : 'var(--red)',
                      tip: 'Debt Service Coverage Ratio — lenders want 1.25x+. Not included in Deal Score.'
                    },
                    metrics.isCashDeal && {
                      label:'Refi potential',
                      value: metrics.maxLoanForDscr > 0 ? fmtK(metrics.maxLoanForDscr) : 'N/A',
                      sub: metrics.cashOutPotential > 0 ? `~${fmtK(metrics.cashOutPotential)} cash-out` : 'At current NOI',
                      color: metrics.maxLoanForDscr > 0 ? 'var(--green)' : 'var(--text2)',
                      tip: 'Max loan amount where DSCR stays at 1.25x — useful for BRRRR or cash-out refi planning.'
                    },
                    { label:'1% Rule', value: metrics.onePercentRule.toFixed(2) + '%', sub: metrics.onePercentPass ? 'Passes' : 'Does not pass', color: metrics.onePercentPass ? 'var(--green)' : 'var(--red)', tip: 'Monthly rent / purchase price. 1%+ is ideal.' },
                    { label:'IRR (10yr)', value: isNaN(metrics.irr) || !isFinite(metrics.irr) ? 'N/A' : metrics.irr.toFixed(1) + '%', sub: metrics.irr >= 12 ? 'Strong' : metrics.irr >= 8 ? 'Good' : 'Below avg', color: metrics.irr >= 12 ? 'var(--green)' : metrics.irr >= 8 ? 'var(--amber)' : 'var(--red)', tip: 'Internal Rate of Return over 10 years including sale' },
                    { label:'Equity Multiple', value: isNaN(metrics.equityMultiple) ? 'N/A' : metrics.equityMultiple.toFixed(2) + 'x', sub: metrics.equityMultiple >= 2 ? 'Strong' : metrics.equityMultiple >= 1.5 ? 'Good' : 'Low', color: metrics.equityMultiple >= 2 ? 'var(--green)' : metrics.equityMultiple >= 1.5 ? 'var(--amber)' : 'var(--red)', tip: 'Total return / cash invested over 10 years' },
                  ].filter(Boolean).map(m => (
                    <div key={m.label} title={m.tip} style={{ background:'var(--surface2)', borderRadius:8, padding:'12px 14px', cursor:'help' }}>
                      <div style={{ fontSize:11, color:'var(--text2)', marginBottom:2 }}>{m.label} <i className="ti ti-info-circle" style={{ fontSize:10, color:'var(--text3)' }} /></div>
                      <div style={{ fontSize:18, fontWeight:700, color:m.color }}>{m.value}</div>
                      <div style={{ fontSize:11, color:m.color, marginTop:2 }}>{m.sub}</div>
                    </div>
                  ))}
                </div>
                {!metrics.isCashDeal && metrics.dscr !== null && (() => {
                  const color = metrics.dscr >= 1.25 ? 'var(--green)' : metrics.dscr >= 1.0 ? 'var(--amber)' : 'var(--red)'
                  const bg = metrics.dscr >= 1.25 ? '#eaf3de' : metrics.dscr >= 1.0 ? '#faeeda' : '#fcebeb'
                  const text = metrics.dscr >= 1.25
                    ? `Your DSCR of ${metrics.dscr.toFixed(2)}x meets most lenders' minimum of 1.25x. This property qualifies for a DSCR loan as-is.`
                    : metrics.dscr >= 1.0
                    ? `Your DSCR of ${metrics.dscr.toFixed(2)}x is below the 1.25x most lenders require. To qualify: increase rent to ${fmt(metrics.rentNeededForDscr)}/mo or negotiate the price to ${fmt(metrics.priceNeededForDscr)}.`
                    : `Your DSCR of ${metrics.dscr.toFixed(2)}x is below lender threshold. You'd need rent of ${fmt(metrics.rentNeededForDscr)}/mo or a purchase price around ${fmt(metrics.priceNeededForDscr)} to qualify for a DSCR loan.`
                  return <div style={{ marginTop:14, padding:'10px 14px', background:bg, borderRadius:8, fontSize:12, color, lineHeight:1.5 }}><strong>DSCR insight:</strong> {text}</div>
                })()}
                {metrics.isCashDeal && metrics.maxLoanForDscr > 0 && (
                  <div style={{ marginTop:14, padding:'10px 14px', background:'#eaf3de', borderRadius:8, fontSize:12, color:'#1a7a4a', lineHeight:1.5 }}>
                    <strong>Refi insight:</strong> Based on current NOI, you could refinance up to {fmtK(metrics.maxLoanForDscr)} and still maintain a 1.25x DSCR.{metrics.cashOutPotential > 0 ? ` That's approximately ${fmtK(metrics.cashOutPotential)} in potential cash-out above your current loan balance.` : ''}
                  </div>
                )}
                <div style={{ marginTop:14, paddingTop:12, borderTop:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                  <div style={{ fontSize:11, color:'var(--text2)', fontWeight:500 }}>Est. expenses:</div>
                  <span style={{ fontSize:11, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:4, padding:'2px 8px' }}>Insurance: {fmt(metrics.insurance)}/mo</span>
                  <span style={{ fontSize:11, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:4, padding:'2px 8px' }}>Maintenance: {fmt(metrics.maintenance)}/mo</span>
                  <span style={{ fontSize:10, color:'var(--text3)' }}>(auto-estimated from price — override in fields)</span>
                </div>
              </div>
            )}
            {metrics.price > 0
              ? <DealScoreCard metrics={metrics} />
              : <div style={{ background:'#f0f7ff', border:'2px dashed #c0d8f0', borderRadius:12, padding:'18px 22px', marginBottom:18, textAlign:'center' }}>
                  <i className="ti ti-calculator" style={{ fontSize:24, color:'#1a5fa8', marginBottom:8, display:'block' }} />
                  <div style={{ fontSize:14, fontWeight:600, color:'#0f2744', marginBottom:4 }}>Enter purchase price to see Deal Score</div>
                  <div style={{ fontSize:12, color:'#1a5fa8' }}>A 0–100 score based on cap rate, cash flow, CoC return, and more.</div>
                </div>
            }
            <RentSlider rent={fields.rent || 1500} onChange={v => setSliderRent(v)} />
            <div style={{ background:'var(--navy)', borderRadius:12, padding:'18px 20px', marginBottom:18, display:'flex', alignItems:'flex-start', gap:14 }}>
              <div style={{ width:44, height:44, borderRadius:10, background:'rgba(77,168,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <i className="ti ti-home-dollar" style={{ fontSize:22, color:'#4da8ff' }} />
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.5)', textTransform:'uppercase', letterSpacing:'1px', marginBottom:4 }}>Built by</div>
                <div style={{ fontSize:15, fontWeight:700, color:'#fff', marginBottom:2 }}>Scott O. Pratt, Broker</div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,0.6)', marginBottom:8 }}>Pratt & Associates · Woodstock, GA</div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,0.75)', lineHeight:1.5, marginBottom:12, fontStyle:'italic' }}>
                  "I built this tool so investors could see what I see. If the numbers work — let's make it happen."
                </div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  <a href="mailto:paroffice@gmail.com" style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 12px', background:'#1a5fa8', borderRadius:6, fontSize:12, color:'#fff', textDecoration:'none', fontWeight:500 }}>
                    <i className="ti ti-mail" style={{ fontSize:13 }} /> Email Scott
                  </a>
                </div>
              </div>
            </div>
            <CompsCard comps={comps} loading={compsLoading} />
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'20px 20px 10px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:2 }}>
                <div style={{ fontSize:15, fontWeight:600 }}>Cash flow over time</div>
                {!isPro && (
                  <button onClick={() => openUpgrade('pdf')} style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 10px', background:'#f0f7ff', border:'1px solid #c0d8f0', borderRadius:6, fontSize:12, color:'#1a5fa8', fontWeight:500, cursor:'pointer', fontFamily:'var(--font)' }}>
                    <i className="ti ti-file-description" style={{ fontSize:13 }} /> Export PDF
                    <span style={{ background:'#1a5fa8', color:'#fff', fontSize:9, padding:'1px 5px', borderRadius:8, fontWeight:700 }}>PRO</span>
                  </button>
                )}
              </div>
              <div style={{ fontSize:12, color:'var(--text2)', marginBottom:16 }}>10-year projection · {fields.rentGrowth}% annual rent growth · {fields.appreciation}% appreciation</div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={metrics.chartData} margin={{ top:4, right:60, left:0, bottom:0 }} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="year" tick={{ fontSize:11, fill:'#888' }} />
                  <YAxis yAxisId="left" tick={{ fontSize:11, fill:'#888' }} tickFormatter={v => '$'+v.toLocaleString()} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize:11, fill:'#888' }} tickFormatter={v => `$${v}K`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar yAxisId="left" dataKey="cashflow" name="Monthly CF" fill="#1a5fa8" radius={[3,3,0,0]} />
                  <Bar yAxisId="left" dataKey="noi" name="NOI" fill="#d4a017" radius={[3,3,0,0]} />
                  <Bar yAxisId="right" dataKey="equity" name="Equity ($K)" fill="#1a7a4a" radius={[3,3,0,0]} opacity={0.8} />
                </BarChart>
              </ResponsiveContainer>
              <div style={{ display:'flex', gap:18, marginTop:8, fontSize:12, color:'var(--text2)' }}>
                {[['#1a5fa8','Monthly CF'],['#d4a017','NOI'],['#1a7a4a','Equity ($K)']].map(([c,l]) => (
                  <span key={l} style={{ display:'flex', alignItems:'center', gap:5 }}>
                    <span style={{ width:10, height:10, borderRadius:2, background:c, display:'inline-block' }} />{l}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </main>
      ) : (
        <Portfolio
          saved={saved}
          onDelete={handleDelete}
          isPro={isPro}
          onUpgrade={() => openUpgrade('portfolio')}
          dealAlerts={dealAlerts}
          viewedDealIds={viewedDealIds}
          onLoadDeal={handleLoadDeal}
          onMarkViewed={handleMarkViewed}
          prefs={userPrefs}
          onSavePrefs={handleSavePrefs}
        />
      )}
    </div>
  )
}