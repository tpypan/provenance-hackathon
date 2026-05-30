import { useMemo, useCallback, useState, useEffect } from 'react'
import { ReactFlow, Background, Controls, Panel, MarkerType, applyNodeChanges } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import ProvenanceNode from './ProvenanceNode.jsx'
import GraphLegend from '../GraphLegend.jsx'
import { layoutChain } from '../../lib/graphLayout.js'
import styles from './ChainGraph.module.css'

const nodeTypes = { provenance: ProvenanceNode }

const EDGE = '#c8cade'
const EDGE_TAMPERED = '#c8202c'

export default function ChainGraph({
  chain,
  anomaliesByAtt = {},
  productId,
  highlightId,
  selectedId,
  onSelect,
  showLegendAnomalies = true,
}) {
  // Layout (positions + data) — excludes selection so selectedId changes don't reset positions
  const { layoutNodes, edges } = useMemo(() => {
    const laid = layoutChain(chain, { anomaliesByAtt, productId, highlightId })
    const styledEdges = laid.edges.map((e) => {
      const tampered = e.data?.tampered
      return {
        ...e,
        type: 'default',
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 16,
          height: 16,
          color: tampered ? EDGE_TAMPERED : EDGE,
        },
        style: tampered
          ? { stroke: EDGE_TAMPERED, strokeWidth: 1.5, strokeDasharray: '5 4' }
          : { stroke: EDGE, strokeWidth: 1.5 },
      }
    })
    return { layoutNodes: laid.nodes, edges: styledEdges }
  }, [chain, anomaliesByAtt, productId, highlightId])

  // Node state owns positions — applyNodeChanges keeps drag moves
  const [nodes, setNodes] = useState(layoutNodes)
  useEffect(() => {
    setNodes(layoutNodes)
  }, [layoutNodes])

  const onNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  )

  // Selection is a display overlay; doesn't touch stored positions
  const displayNodes = useMemo(
    () => nodes.map((n) => ({ ...n, selected: n.id === selectedId })),
    [nodes, selectedId],
  )

  const handleNodeClick = useCallback((_, node) => onSelect?.(node.id), [onSelect])
  const handlePaneClick = useCallback(() => onSelect?.(null), [onSelect])

  return (
    <div className={styles.wrap}>
      <ReactFlow
        nodes={displayNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        fitView
        fitViewOptions={{ padding: 0.22 }}
        minZoom={0.2}
        maxZoom={1.75}
        nodesDraggable={true}
        nodesConnectable={false}
        edgesFocusable={false}
        elementsSelectable
      >
        <Background color="#e2e4ed" gap={22} size={1} />
        <Controls showInteractive={false} position="bottom-right" />
        <Panel position="top-left">
          <GraphLegend showAnomalies={showLegendAnomalies} />
        </Panel>
      </ReactFlow>
    </div>
  )
}
