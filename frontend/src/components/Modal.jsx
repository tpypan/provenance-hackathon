import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from './Modal.module.css'

export default function Modal({ isOpen, onClose, children }) {
  const [visible, setVisible] = useState(false)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setClosing(false)
      setVisible(true)
      return
    }
    setClosing(true)
    const id = setTimeout(() => {
      setClosing(false)
      setVisible(false)
    }, 240)
    return () => clearTimeout(id)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!visible) return null

  return createPortal(
    <div
      className={`${styles.backdrop} ${closing ? styles.backdropOut : ''}`}
      onClick={onClose}
    >
      <div
        className={`${styles.panel} ${closing ? styles.panelOut : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className={styles.body}>{children}</div>
      </div>
    </div>,
    document.body,
  )
}
