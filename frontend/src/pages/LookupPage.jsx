import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import QrScanner from '../components/lookup/QrScanner.jsx'
import { resolve, ApiError } from '../lib/api.js'
import styles from './LookupPage.module.css'

export default function LookupPage() {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [scanning, setScanning] = useState(false)
  const navigate = useNavigate()

  // Shared resolution path for both the text box and the QR scanner.
  const lookup = useCallback(
    async (raw) => {
      const q = String(raw || '').trim()
      if (!q) return
      setBusy(true)
      setError('')
      try {
        const id = await resolve(q)
        if (id) navigate(`/product/${id}`)
        else setError('No chain matches that id or hash. Check the value and try again.')
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Lookup failed. Try again.')
      } finally {
        setBusy(false)
      }
    },
    [navigate],
  )

  function submit(e) {
    e.preventDefault()
    lookup(value)
  }

  function handleScan(text) {
    setScanning(false)
    setValue(text)
    lookup(text)
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Look up a product</h1>
        <p className={styles.sub}>Enter a product attestation id or content hash to verify its provenance.</p>

        <form onSubmit={submit} className={styles.form}>
          <input
            className={styles.input}
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setError('')
            }}
            placeholder="att-anchor-0012  ·  64-character content hash"
            aria-label="Product attestation id or content hash"
            autoComplete="off"
            spellCheck="false"
          />
          <button type="submit" className={styles.primary} disabled={busy}>
            {busy ? 'Verifying…' : 'Verify'}
          </button>
        </form>

        <button type="button" className={styles.scanBtn} onClick={() => setScanning((s) => !s)}>
          {scanning ? 'Close scanner' : 'Scan QR code'}
        </button>

        {scanning && <QrScanner onScan={handleScan} onError={(m) => setError(m)} />}

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
