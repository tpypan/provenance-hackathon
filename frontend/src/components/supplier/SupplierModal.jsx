import { useEffect, useRef, useState } from 'react'
import Modal from '../Modal.jsx'
import AttestationForm from './AttestationForm.jsx'
import { issueAttestation, listSuppliers, ApiError } from '../../lib/api.js'
import { truncateMiddle } from '../../lib/format.js'
import styles from './SupplierModal.module.css'

export default function SupplierModal({ isOpen, onClose, chain, productId, productName, onAttestation }) {
  const [result, setResult] = useState(null)
  const [navState, setNavState] = useState({ isLast: false, stepIdx: 0, stepsLen: 1, isValid: false })
  const [suppliers, setSuppliers] = useState([])
  const [defaultSupplierId, setDefaultSupplierId] = useState('')
  const [signing, setSigning] = useState(false)
  const [error, setError] = useState('')
  const formRef = useRef(null)

  // Load signable suppliers once the modal opens; default to the chain's own leaf supplier.
  useEffect(() => {
    if (!isOpen) return
    let active = true
    listSuppliers()
      .then((all) => {
        if (!active) return
        const signable = all.filter((s) => s.has_private_key)
        setSuppliers(signable)
        const leafSupplier = chain?.attestations?.find(
          (a) => a.attestation_id === chain?.product_attestation_id,
        )?.supplier_id
        const preferred = signable.find((s) => s.supplier_id === leafSupplier)?.supplier_id
        setDefaultSupplierId(preferred || signable[0]?.supplier_id || '')
      })
      .catch(() => {
        if (active) setError('Could not load suppliers from the verifier.')
      })
    return () => {
      active = false
    }
  }, [isOpen, chain])

  async function handleSubmit(body) {
    setSigning(true)
    setError('')
    try {
      const signed = await issueAttestation(body)
      setResult(signed)
      onAttestation?.(signed)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign the attestation. Please try again.')
    } finally {
      setSigning(false)
    }
  }

  function handleClose() {
    setResult(null)
    setError('')
    setNavState({ isLast: false, stepIdx: 0, stepsLen: 1 })
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose}>
      {result ? (
        <div className={styles.success}>
          <div className={styles.check}>
            <svg viewBox="0 0 20 20" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 10 8 14 16 6" />
            </svg>
          </div>
          <h3 className={styles.successTitle}>Attestation signed and linked</h3>
          <p className={styles.attId}>
            <span className="mono">{truncateMiddle(result.attestation_id, 20, 8)}</span>
          </p>
          {productName && (
            <p className={styles.successSub}>
              Now part of <strong>{productName}</strong>.
            </p>
          )}
          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={() => setResult(null)}>
              Add another
            </button>
            <button type="button" className={styles.primary} onClick={handleClose}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.formWrapper}>
          <div className={styles.formScroll}>
            <AttestationForm
              ref={formRef}
              options={chain?.attestations ?? []}
              suppliers={suppliers}
              defaultSupplierId={defaultSupplierId}
              productId={productId}
              onSubmit={handleSubmit}
              onClose={handleClose}
              onNavChange={setNavState}
            />
          </div>
          <footer className={styles.formFooter}>
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            <div className={styles.footerRow}>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => formRef.current?.goBack()}
                style={{ visibility: navState.stepIdx > 0 ? 'visible' : 'hidden' }}
              >
                Back
              </button>
              <button
                type="button"
                className={styles.primary}
                onClick={() => formRef.current?.goNext()}
                disabled={!navState.isValid || signing}
              >
                {signing ? 'Signing…' : navState.isLast ? 'Sign & submit' : 'Continue'}
              </button>
            </div>
          </footer>
        </div>
      )}
    </Modal>
  )
}
