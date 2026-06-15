import { useState } from 'react'
import { supabase } from './supabaseClient'

// Shown when a user arrives via a password-recovery link.
// App.jsx detects the PASSWORD_RECOVERY event and renders this
// INSTEAD of the normal app, even though Supabase has briefly
// signed the user in to allow the password update.
export default function ResetPassword({ onDone }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleUpdate = async () => {
    setMessage('')

    if (password.length < 6) {
      setMessage('Password must be at least 6 characters.')
      return
    }
    if (password !== confirm) {
      setMessage('Passwords do not match.')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      setMessage(error.message)
    } else {
      setMessage('Password updated! Signing you in...')
      setTimeout(() => {
        if (onDone) onDone()
      }, 1200)
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: '80px auto', padding: 24, background: '#1a1a2e', borderRadius: 12, color: 'white' }}>
      <h2 style={{ textAlign: 'center', marginBottom: 24 }}>Set New Password</h2>
      <input
        type="password"
        placeholder="New password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        style={{ width: '100%', padding: 12, marginBottom: 12, borderRadius: 8, border: 'none', fontSize: 16 }}
      />
      <input
        type="password"
        placeholder="Confirm new password"
        value={confirm}
        onChange={e => setConfirm(e.target.value)}
        style={{ width: '100%', padding: 12, marginBottom: 16, borderRadius: 8, border: 'none', fontSize: 16 }}
      />
      <button
        onClick={handleUpdate}
        disabled={loading}
        style={{ width: '100%', padding: 14, background: '#c8a951', color: '#000', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 'bold', cursor: 'pointer' }}
      >
        {loading ? 'Updating...' : 'Update Password'}
      </button>
      {message && <p style={{ marginTop: 16, textAlign: 'center', color: '#c8a951' }}>{message}</p>}
    </div>
  )
}