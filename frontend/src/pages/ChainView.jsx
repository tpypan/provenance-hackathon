import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import ChainGraph from '../components/graph/ChainGraph.jsx'
import ProductSummary from '../components/purchaser/ProductSummary.jsx'
import NodeDetailPanel from '../components/purchaser/NodeDetailPanel.jsx'
import SupplierModal from '../components/supplier/SupplierModal.jsx'
import { directCost } from '../lib/format.js'
import { verifyChain, groupAnomalies } from '../lib/api.js'
import styles from './ChainView.module.css'

export default function ChainView({
  mode = 'purchaser',
  product,
  chain,
  verification,
  anomaliesByAtt = {},
  highlightId,
  banner,
}) {
  const [selectedId, setSelectedId] = useState(highlightId ?? null)
  const [modalOpen, setModalOpen] = useState(false)
  const [addedAttestations, setAddedAttestations] = useState([])
  const [newlyAddedId, setNewlyAddedId] = useState(null)
  // Verdict + per-node anomalies start from the server-rendered result and refresh live
  // whenever a supplier adds a node (re-running POST /verify on the working chain).
  const [liveVerification, setLiveVerification] = useState(verification)
  const [liveAnoms, setLiveAnoms] = useState(anomaliesByAtt)

  useEffect(() => {
    setLiveVerification(verification)
    setLiveAnoms(anomaliesByAtt)
  }, [verification, anomaliesByAtt])

  const workingChain = useMemo(() => {
    if (addedAttestations.length === 0) return chain
    return { ...chain, attestations: [...(chain?.attestations ?? []), ...addedAttestations] }
  }, [chain, addedAttestations])

  const attById = useMemo(
    () => new Map((workingChain?.attestations ?? []).map((a) => [a.attestation_id, a])),
    [workingChain],
  )
  const totalCost = useMemo(
    () => (workingChain?.attestations ?? []).reduce((s, a) => s + directCost(a), 0),
    [workingChain],
  )

  const selected = selectedId ? attById.get(selectedId) : null
  const selectedAnoms = selectedId ? liveAnoms[selectedId] ?? [] : []

  async function handleAttestation(att) {
    setAddedAttestations((prev) => [...prev, att])
    setNewlyAddedId(att.attestation_id)
    if (mode !== 'purchaser' || !chain?.product_attestation_id) return
    const attestations = [...(chain.attestations ?? []), ...addedAttestations, att]
    try {
      const v = await verifyChain({ product_attestation_id: chain.product_attestation_id, attestations })
      if (v) {
        setLiveVerification(v)
        setLiveAnoms(groupAnomalies(v.anomalies))
      }
    } catch {
      /* keep the previous verdict if the live re-verify fails */
    }
  }

  if (mode === 'supplier') {
    return (
      <div className={styles.supplier}>
        {banner}
        <ChainGraph
          chain={chain}
          anomaliesByAtt={anomaliesByAtt}
          productId={product?.id}
          highlightId={highlightId}
          selectedId={selectedId}
          onSelect={setSelectedId}
          showLegendAnomalies={false}
        />
      </div>
    )
  }

  return (
    <div className={styles.purchaser}>
      <div className={styles.split}>
        <div className={styles.graphWrap}>
          <Link to="/lookup" className={styles.homeBtn}>
            Home
          </Link>
          <button
            type="button"
            className={styles.addAttBtn}
            onClick={() => setModalOpen(true)}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
              <line x1="8" y1="2" x2="8" y2="14" />
              <line x1="2" y1="8" x2="14" y2="8" />
            </svg>
            Add attestation
          </button>
          <ChainGraph
            chain={workingChain}
            anomaliesByAtt={liveAnoms}
            productId={product?.id}
            highlightId={newlyAddedId ?? highlightId}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>
        <aside className={styles.side}>
          {selected ? (
            <NodeDetailPanel
              key={selectedId}
              attestation={selected}
              anomalies={selectedAnoms}
              totalCost={totalCost}
            />
          ) : (
            <ProductSummary product={product} verification={liveVerification} chain={workingChain} />
          )}
        </aside>
      </div>

      <SupplierModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        chain={workingChain}
        productId={product?.id}
        productName={product?.name}
        onAttestation={handleAttestation}
      />
    </div>
  )
}
