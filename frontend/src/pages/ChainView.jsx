import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import ChainGraph from '../components/graph/ChainGraph.jsx'
import ProductSummary from '../components/purchaser/ProductSummary.jsx'
import NodeDetailPanel from '../components/purchaser/NodeDetailPanel.jsx'
import SupplierModal from '../components/supplier/SupplierModal.jsx'
import { directCost } from '../lib/format.js'
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
  const selectedAnoms = selectedId ? anomaliesByAtt[selectedId] ?? [] : []

  function handleAttestation(att) {
    setAddedAttestations((prev) => [...prev, att])
    setNewlyAddedId(att.attestation_id)
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
            anomaliesByAtt={anomaliesByAtt}
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
            <ProductSummary product={product} verification={verification} chain={workingChain} />
          )}
        </aside>
      </div>

      <SupplierModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        chain={workingChain}
        productName={product?.name}
        onAttestation={handleAttestation}
      />
    </div>
  )
}
