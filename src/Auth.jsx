import { useState } from 'react'
import { supabase } from './supabaseClient'

export default function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLogin, setIsLogin] = useState(true)
  const [isForgot, setIsForgot] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleAuth = async () => {
    setLoading(true)
    setMessage('')
    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setMessage(error.message)
    } else {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setMessage(error.message)
      else setMessage('Check your email to confirm your account!')
    }
    setLoading(false)
  }

  const handleForgot = async () => {
    setLoading(true)
    setMessage('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://rental-analyst.com'
    })
    if (error) setMessage(error.message)
    else setMessage('Password reset email sent! Check your inbox.')
    setLoading(false)
  }

  if (isForgot) {
    return (
      <div style={{ maxWidth: 400, margin: '80px auto', padding: 24, background: '#1a1a2e', borderRadius: 12, color: 'white' }}>
        <h2 style={{ textAlign: 'center', marginBottom: 24 }}>Reset Password</h2>
        <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} style={{ width: '100%', padding: 12, marginBottom: 16, borderRadius: 8, border: 'none', fontSize: 16 }} />
        <button onClick={handleForgot} disabled={loading} style={{ width: '100%', padding: 14, background: '#c8a951', color: '#000', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 'bold', cursor: 'pointer' }}>
          {loading ? 'Sending...' : 'Send Reset Email'}
        </button>
        {message && <p style={{ marginTop: 16, textAlign: 'center', color: '#c8a951' }}>{message}</p>}
        <p onClick={() => { setIsForgot(false); setMessage('') }} style={{ textAlign: 'center', marginTop: 16, cursor: 'pointer', color: '#c8a951' }}>
          Back to Sign In
        </p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 400, margin: '80px auto', padding: 24, background: '#1a1a2e', borderRadius: 12, color: 'white' }}>
      <h2 style={{ textAlign: 'center', marginBottom: 24 }}>
        {isLogin ? 'Sign In' : 'Create Account'}
      </h2>
      <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} style={{ width: '100%', padding: 12, marginBottom: 12, borderRadius: 8, border: 'none', fontSize: 16 }} />
      <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} style={{ width: '100%', padding: 12, marginBottom: 16, borderRadius: 8, border: 'none', fontSize: 16 }} />
      <button onClick={handleAuth} disabled={loading} style={{ width: '100%', padding: 14, background: '#c8a951', color: '#000', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 'bold', cursor: 'pointer' }}>
        {loading ? 'Loading...' : isLogin ? 'Sign In' : 'Sign Up'}
      </button>
      {message && <p style={{ marginTop: 16, textAlign: 'center', color: '#c8a951' }}>{message}</p>}
      {isLogin && (
        <p onClick={() => { setIsForgot(true); setMessage('') }} style={{ textAlign: 'center', marginTop: 8, cursor: 'pointer', color: '#888', fontSize: 14 }}>
          Forgot password?
        </p>
      )}
      <p onClick={() => setIsLogin(!isLogin)} style={{ textAlign: 'center', marginTop: 16, cursor: 'pointer', color: '#c8a951' }}>
        {isLogin ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
      </p>
    </div>
  )
}