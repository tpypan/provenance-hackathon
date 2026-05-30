import { useRef, useState } from 'react'
import Modal from '../Modal.jsx'
import AttestationForm from './AttestationForm.jsx'
import { truncateMiddle } from '../../lib/format.js'
import styles from './SupplierModal.module.css'

export default function SupplierModal({ isOpen, onClose, chain, productName, onAttestation }) {
  const [result, setResult] = useState(null)
  const [navState, setNavState] = useState({ isLast: false, stepIdx: 0, stepsLen: 1 })
  const formRef = useRef(null)

  function handleSubmit(attestation) {
    setResult(attestation)
    onAttestation?.(attestation)
  }

  function handleClose() {
    setResult(null)
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
              onSubmit={handleSubmit}
              onClose={handleClose}
              onNavChange={setNavState}
            />
          </div>
          <footer className={styles.formFooter}>
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
            >
              {navState.isLast ? 'Sign & submit' : 'Continue'}
            </button>
          </footer>
        </div>
      )}
    </Modal>
  )
}
