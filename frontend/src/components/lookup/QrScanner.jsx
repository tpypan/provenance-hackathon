import { Scanner } from '@yudiel/react-qr-scanner'
import styles from './QrScanner.module.css'

// Thin wrapper around the camera scanner. Decoded text is handed straight to the
// shared lookup resolver, so scanning and typing follow the exact same path.
export default function QrScanner({ onScan, onError }) {
  return (
    <div className={styles.wrap}>
      <Scanner
        formats={['qr_code']}
        onScan={(codes) => {
          const text = codes?.[0]?.rawValue
          if (text) onScan?.(text)
        }}
        onError={() => onError?.('Camera unavailable — allow camera access or type the id/hash instead.')}
        components={{ finder: true }}
        styles={{ container: { width: '100%', borderRadius: 'var(--r-input)', overflow: 'hidden' } }}
      />
      <p className={styles.hint}>Point your camera at a product&apos;s QR code.</p>
    </div>
  )
}
