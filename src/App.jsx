import React, { useState, useRef } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
const fmtK = (n) => n >= 1000 ? `$${Math.round(n / 1000)}K` : fmt(n)
const fmtPct = (n) => `${n.toFixed(2)}%`
const FREE_LIMIT = 2
const PRO_PRICE = 7

function calcMortgage(principal, annualRate, years) {
  const r = annualRate / 100 / 12
  const n = years * 12
  if (r === 0 || n === 0) return principal / (n || 1)
  return principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
}

function calcMetrics(f) {
  const price = f.price || 0
  const down = price * (f.downPct / 100)
  const closing = price * (f.closingPct / 100)
  const totalCashIn = down + closing + (f.renoFinanced ? 0 : f.reno)
  const loanAmt = price - down + (f.renoFinanced ? f.reno : 0)
  const monthlyMortgage = calcMortgage(loanAmt, f.rate, f.term)
  const effectiveRent = f.rent * (1 - f.vacancyPct / 100)
  const mgmt = effectiveRent * (f.mgmtPct / 100)
  const totalExpenses = f.taxes + f.insurance + mgmt + f.maintenance
  const noi = effectiveRent - totalExpenses
  const cashflow = noi - monthlyMortgage
  const annualCF = cashflow * 12
  const capRate = price > 0 ? (noi * 12 / price) * 100 : 0
  const coc = totalCashIn > 0 ? (annualCF / totalCashIn) * 100 : 0
  const grossYield = price > 0 ? (f.rent * 12 / price) * 100 : 0
  const breakeven = totalExpenses + monthlyMortgage
  const r = f.rate / 100 / 12
  const n = f.term * 12
  let balance = loanAmt
  const chartData = []
  for (let yr = 1; yr <= 10; yr++) {
    const growth = Math.pow(1 + 0.025, yr - 1)
    for (let m = 0; m < 12; m++) {
      const interest = balance * r
      const pmt = r === 0 ? loanAmt / n : loanAmt * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
      balance = Math.max(0, balance - (pmt - interest))
    }
    const appreciated = price * Math.pow(1.03, yr)
    chartData.push({ year: `Yr ${yr}`, cashflow: Math.round(cashflow * growth), noi: Math.round(noi * growth), equity: Math.round((appreciated - balance) / 1000) })
  }
  return { price, down, closing, totalCashIn, loanAmt, monthlyMortgage, noi, cashflow, annualCF, capRate, coc, grossYield, breakeven, chartData }
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
          <button onClick={onSubmit} style={{ width:'100%', padding:'13px', background:'#1a5fa8', color:'#fff', border:'none', borderRadius:8, fontSize:15, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)' }}>
            Create Free Account
          </button>
          <div style={{ textAlign:'center', fontSize:11, color:'var(--text3)', marginTop:10 }}>
            We respect your privacy · No credit card required
          </div>
        </div>
      </div>
    </div>
  )
}
function UpgradeModal({ onClose, trigger, onUpgrade }) {
  const features = [
    { icon: 'ti-building-store', label: 'Unlimited property saves', free: '2 properties', pro: 'Unlimited' },
    { icon: 'ti-chart-bar', label: 'Full portfolio dashboard', free: false, pro: true },
    { icon: 'ti-file-description', label: 'PDF report export', free: false, pro: true },
    { icon: 'ti-history', label: 'Rent comp history', free: false, pro: true },
    { icon: 'ti-link', label: 'Zillow import', free: true, pro: true },
    { icon: 'ti-calculator', label: 'All metrics & charts', free: true, pro: true },
  ]
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
          <button onClick={onUpgrade} style={{ width: '100%', padding: '13px', background: '#1a5fa8', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>Start Pro — ${PRO_PRICE}/month</button>
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
        <input
          type={type}
          id={inputId}
          name={inputId}
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={e => e.target.select()}
          aria-label={label}
          style={{ paddingLeft:prefix?18:10, paddingRight:suffix?28:10 }}
        />
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

function Portfolio({ saved, onDelete, isPro, onUpgrade }) {
  const totalCF = saved.reduce((s,p) => s + p.metrics.cashflow, 0)
  const totalEquity = saved.reduce((s,p) => s + (p.metrics.chartData[4]?.equity||0), 0)
  if (!isPro && saved.length === 0) return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12, color:'var(--text2)', padding:40 }}>
      <i className="ti ti-briefcase" style={{ fontSize:48, color:'var(--text3)' }} />
      <div style={{ fontSize:16, fontWeight:500, color:'var(--text)' }}>No saved properties yet</div>
      <div style={{ fontSize:13 }}>Save up to {FREE_LIMIT} properties on the free plan.</div>
    </div>
  )
  return (
    <div style={{ flex:1, overflowY:'auto', padding:24 }}>
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
    </div>
  )
}

const DEFAULT_FIELDS = {
  address:'5200 McCallister St, Milton, FL 32583', zip:'32583', neighborhood:'Milton',
  price:130000, downPct:25, closingPct:3, reno:5000, renoFinanced:false,
  rent:1400, vacancyPct:5,
  taxes:120, insurance:80, mgmtPct:10, maintenance:100,
  rate:7.25, term:30,
}

export default function App() {
  const [tab, setTab] = useState('analyzer')
  const [fields, setFields] = useState(DEFAULT_FIELDS)
  const [zillowUrl, setZillowUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [toast, setToast] = useState(null)
  const [showUpgrade, setShowUpgrade] = useState(false)
const [upgradeTrigger, setUpgradeTrigger] = useState('general')
const [showSignup, setShowSignup] = useState(false)
const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.getItem('ra_user')||'null') } catch { return null } })
const [signupForm, setSignupForm] = useState({ firstName:'', email:'', password:'', agreed:false })
const [signupError, setSignupError] = useState('')
  const [isPro, setIsPro] = useState(() => localStorage.getItem('ra_pro') === 'true')
  const [saved, setSaved] = useState(() => { try { return JSON.parse(localStorage.getItem('ra_portfolio')||'[]') } catch { return [] } })
  const toastTimer = useRef(null)

  const set = (key) => (val) => setFields(f => ({ ...f, [key]: ['address','zip','neighborhood'].includes(key) ? val : (parseFloat(val)||0) }))
  const metrics = calcMetrics(fields)

  const showToast = (msg, type='success') => {
    clearTimeout(toastTimer.current)
    setToast({ msg, type })
    toastTimer.current = setTimeout(() => setToast(null), 5000)
  }

  const openUpgrade = (trigger='general') => { setUpgradeTrigger(trigger); setShowUpgrade(true) }

const handleSave = () => {
    if (!user) { setShowSignup(true); return }
    if (!isPro && saved.length >= FREE_LIMIT) { openUpgrade('save'); return }
    const entry = { id:Date.now(), fields:{...fields}, metrics }
    const next = [...saved, entry]
    setSaved(next)
    localStorage.setItem('ra_portfolio', JSON.stringify(next))
    showToast(`Property saved! ${!isPro ? `${next.length}/${FREE_LIMIT} free saves used.` : ''}`)
  }

  const handleDelete = (id) => {
    const next = saved.filter(p => p.id !== id)
    setSaved(next)
    localStorage.setItem('ra_portfolio', JSON.stringify(next))
  }

  const handleUpgrade = () => {
    setIsPro(true)
    localStorage.setItem('ra_pro', 'true')
    setShowUpgrade(false)
    showToast('🎉 Welcome to Pro! All features unlocked.')
  }

const handleImport = async () => {
    if (!zillowUrl.trim()) return
    setImporting(true)
    try {
      const address = prompt('Enter the property address (e.g. 5200 McCallister St, Milton, FL 32583):')
      if (!address) { setImporting(false); return }
      const encoded = encodeURIComponent(address)
      const apiKey = import.meta.env.VITE_RENTCAST_API_KEY
      const [propRes, rentRes] = await Promise.all([
        fetch(`https://api.rentcast.io/v1/properties?address=${encoded}&limit=1`, { headers: { 'X-Api-Key': apiKey } }),
        fetch(`https://api.rentcast.io/v1/avm/rent/long-term?address=${encoded}`, { headers: { 'X-Api-Key': apiKey } })
      ])
      const propData = await propRes.json()
      const rentData = await rentRes.json()
      const prop = propData[0] || {}
      setFields(f => ({
        ...f,
        address: prop.formattedAddress || address,
        zip: prop.zipCode || f.zip,
        neighborhood: prop.city || f.neighborhood,
        price: prop.price || prop.assessedValue || f.price,
        rent: rentData.rent || f.rent,
        taxes: prop.propertyTaxes ? Math.round(prop.propertyTaxes / 12) : f.taxes,
      }))
      showToast(`Imported: ${[prop.formattedAddress && 'Address', rentData.rent && 'Rent estimate', prop.price && 'Price', prop.propertyTaxes && 'Taxes'].filter(Boolean).join(', ')}`)
    } catch (err) {
      showToast('Could not fetch property data. Please enter manually.', 'error')
    } finally {
      setImporting(false)
    }
  }

  const capColor = metrics.capRate>=8?'var(--green)':metrics.capRate>=5?'var(--amber)':'var(--red)'

 return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', overflow:'hidden' }} role="application" aria-label="Rental Analyst - Property Investment Calculator">
      <a href="#main-content" className="skip-nav">Skip to main content</a>
      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} trigger={upgradeTrigger} onUpgrade={handleUpgrade} />}
{showSignup && <SignupModal onClose={() => setShowSignup(false)} form={signupForm} setForm={setSignupForm} error={signupError} onSubmit={() => {
  if (!signupForm.firstName) { setSignupError('Please enter your first name.'); return }
  if (!signupForm.email.includes('@')) { setSignupError('Please enter a valid email.'); return }
  if (signupForm.password.length < 6) { setSignupError('Password must be at least 6 characters.'); return }
  if (!signupForm.agreed) { setSignupError('Please agree to receive updates.'); return }
  const newUser = { firstName: signupForm.firstName, email: signupForm.email, joinedAt: new Date().toISOString() }
  setUser(newUser)
  localStorage.setItem('ra_user', JSON.stringify(newUser))
  setShowSignup(false)
  setSignupError('')
  showToast(`Welcome, ${signupForm.firstName}! Now save your first property.`)
  fetch('https://script.google.com/macros/s/AKfycbwb4OwFfCC7NsQrpdmtUfdM6S-AsRkXVpqutyGYt6WfJvTx5exHyNmXXFdeBaQqXfZ8JA/exec', {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newUser)
  })
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
              {t==='portfolio' && saved.length>0 && <span style={{ background:'#4da8ff', color:'#fff', borderRadius:10, fontSize:10, padding:'0 6px', fontWeight:600 }}>{saved.length}</span>}
            </button>
          ))}
          {!isPro && (
      <button onClick={() => openUpgrade('nav')} aria-label="Upgrade to Pro" style={{ marginLeft:8, padding:'6px 14px', background:'linear-gradient(135deg,#4da8ff,#1a5fa8)', color:'#fff', border:'none', borderRadius:6, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)', display:'flex', alignItems:'center', gap:5 }}>
              <i className="ti ti-bolt" style={{ fontSize:13 }} /> Go Pro
            </button>
          )}
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
        <main id="main-content" style={{ display:'flex', flex:1, overflow:'hidden' }}>
          <div style={{ width:280, minWidth:280, background:'var(--surface)', borderRight:'1px solid var(--border)', overflowY:'auto', padding:16 }}>
            <div style={{ border:'1px solid var(--border)', borderRadius:12, padding:12, marginBottom:14 }}>
              <SectionLabel icon="link">Import from Zillow</SectionLabel>
              <div style={{ display:'flex', gap:6 }}>
                <input type="text" value={zillowUrl} onChange={e => setZillowUrl(e.target.value)} placeholder="Paste a Zillow listing URL…" style={{ flex:1, fontSize:12 }} />
                <button onClick={handleImport} disabled={importing} style={{ padding:'8px 12px', background:'#1a5fa8', color:'#fff', border:'none', borderRadius:6, fontSize:13, cursor:importing?'not-allowed':'pointer', fontWeight:500, fontFamily:'var(--font)', whiteSpace:'nowrap', opacity:importing?0.7:1 }}>
                  {importing?'Importing…':'Import'}
                </button>
              </div>
          {toast && (
  <div role="alert" aria-live="polite" style={{ marginTop:8, padding:'7px 10px', background:toast.type==='success'?'#eaf3de':'#faeeda', borderRadius:6, fontSize:12, color:toast.type==='success'?'#3b6d11':'#854f0b', display:'flex', gap:6, alignItems:'flex-start' }}>
    <i className="ti ti-circle-check" style={{ fontSize:14, marginTop:1 }} />{toast.msg}
  </div>
)}
            </div>
        <div style={{ marginBottom:14 }}>
  <button onClick={handleSave} aria-label="Save property to portfolio" style={{ width:'100%', padding:'8px 12px', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, fontSize:13, cursor:'pointer', color:'var(--text)', display:'flex', alignItems:'center', justifyContent:'center', gap:6, fontFamily:'var(--font)' }}>
    <i className="ti ti-bookmark" /> Save property
    {!isPro && <span style={{ marginLeft:'auto', fontSize:11, color:'var(--text3)' }}>{saved.length}/{FREE_LIMIT}</span>}
  </button>
              {!isPro && saved.length >= FREE_LIMIT && (
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
            <Field label="Renovation budget" id="reno" value={fields.reno} onChange={set('reno')} prefix="$" />
<div style={{ display:'flex', gap:6, marginTop:-6, marginBottom:12 }}>
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
            <Field label="Vacancy rate" id="vacancyPct" value={fields.vacancyPct} onChange={set('vacancyPct')} suffix="%" />
            <Divider />
            <SectionLabel icon="receipt">Monthly expenses</SectionLabel>
            <Field label="Property taxes" id="taxes" value={fields.taxes} onChange={set('taxes')} prefix="$" />
            <Field label="Insurance" id="insurance" value={fields.insurance} onChange={set('insurance')} prefix="$" />
            <Field label="Property management" id="mgmtPct" value={fields.mgmtPct} onChange={set('mgmtPct')} suffix="%" />
            <Field label="Maintenance / CapEx" id="maintenance" value={fields.maintenance} onChange={set('maintenance')} prefix="$" />
            <Divider />
            <SectionLabel icon="building-bank">Financing</SectionLabel>
            <Field label="Interest rate" id="rate" value={fields.rate} onChange={set('rate')} suffix="%" />
            <Field label="Loan term" id="term" value={fields.term} onChange={set('term')} suffix="yrs" />
          </div>
          <div style={{ flex:1, overflowY:'auto', padding:24 }}>
            <div style={{ background:'var(--navy)', color:'#fff', borderRadius:12, padding:'18px 22px', marginBottom:18 }}>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.5)', letterSpacing:'1px', textTransform:'uppercase', marginBottom:4 }}>Investment calculator</div>
              <div style={{ fontSize:20, fontWeight:600, marginBottom:2 }}>{fields.address||'Rental Property Analyzer'}</div>
              <div style={{ fontSize:13, color:'rgba(255,255,255,0.6)' }}>{fields.neighborhood&&fields.zip?`${fields.neighborhood}, ${fields.zip}`:'Enter property details to analyze'}</div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:12, marginBottom:18 }}>
              {[
                { label:'Monthly NOI', value:fmt(metrics.noi), pos:metrics.noi>=0 },
                { label:'Annual cash flow', value:fmt(metrics.annualCF), pos:metrics.annualCF>=0 },
                { label:'Monthly mortgage', value:fmt(metrics.monthlyMortgage)+'/mo' },
                { label:'Loan amount', value:fmtK(metrics.loanAmt) },
              ].map(m => (
                <div key={m.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'14px 16px' }}>
                  <div style={{ fontSize:11, color:'var(--text2)', marginBottom:4 }}>{m.label}</div>
                  <div style={{ fontSize:20, fontWeight:600, color:m.pos===false?'var(--red)':m.pos?'var(--green)':'var(--text)' }}>{m.value}</div>
                </div>
              ))}
            </div>
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
              <div style={{ fontSize:12, color:'var(--text2)', marginBottom:16 }}>10-year projection · 2.5% annual rent growth · 3% appreciation</div>
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
        <Portfolio saved={saved} onDelete={handleDelete} isPro={isPro} onUpgrade={() => openUpgrade('portfolio')} />
      )}
    </div>
  )
}
