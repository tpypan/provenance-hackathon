import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'

import ChainView from './ChainView.jsx'
import StatusDot from '../components/StatusDot.jsx'
import { getProduct, ApiError } from '../lib/api.js'
import styles from './ProductPage.module.css'

export default function ProductPage() {
  const { productId } = useParams()
  // status: 'verifying' (fetch + verify in flight) | 'ready' | 'notfound' | 'error'
  const [state, setState] = useState({ status: 'verifying', product: null, message: '' })

  useEffect(() => {
    let active = true
    setState({ status: 'verifying', product: null, message: '' })
    getProduct(productId)
      .then((product) => {
        if (!active) return
        if (!product) setState({ status: 'notfound', product: null, message: '' })
        else setState({ status: 'ready', product, message: '' })
      })
      .catch((err) => {
        if (!active) return
        const message = err instanceof ApiError ? err.message : 'Something went wrong while verifying this chain.'
        setState({ status: 'error', product: null, message })
      })
    return () => {
      active = false
    }
  }, [productId])

  if (state.status === 'notfound') {
    return (
      <div className={styles.centered}>
        <h1 className={styles.title}>Product not found</h1>
        <p className={styles.text}>
          No chain resolves to <span className="mono">{productId}</span>. It may be unanchored, or the id is wrong.
        </p>
        <Link to="/lookup" className={styles.link}>
          Back to lookup
        </Link>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className={styles.centered}>
        <h1 className={styles.title}>Couldn&apos;t verify this chain</h1>
        <p className={styles.text}>{state.message}</p>
        <Link to="/lookup" className={styles.link}>
          Back to lookup
        </Link>
      </div>
    )
  }

  if (state.status === 'verifying') {
    return (
      <div className={styles.centered}>
        <StatusDot state="verifying">Verifying chain…</StatusDot>
        <p className={styles.text}>Checking signatures, parent hashes, mass balance, and statistical fit.</p>
      </div>
    )
  }

  const { product } = state
  return (
    <ChainView
      mode="purchaser"
      product={product}
      chain={product.chain}
      verification={product.verification}
      anomaliesByAtt={product.anomaliesByAtt}
    />
  )
}
