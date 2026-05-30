// Anomaly + severity metadata. Two encoding channels (DESIGN.md):
// colour (border/tint) AND shape (dot cue + dashed border) so it survives colour-blindness.

export const SEVERITY = {
  critical: { rank: 3, label: 'Critical', border: 'var(--crit-border)', tint: 'var(--crit-tint)', dashed: false },
  warning: { rank: 2, label: 'Warning', border: 'var(--warn-border)', tint: 'var(--warn-tint)', dashed: false },
  subtle: { rank: 1, label: 'Subtle', border: 'var(--subtle-border)', tint: 'var(--subtle-tint)', dashed: true },
}

// Hard violations that read as red (crypto + structural integrity), vs amber for the
// remaining hard checks (plausibility / economic). Statistical "soft" anomalies are violet.
const CRITICAL_TYPES = new Set([
  'signature_invalid',
  'invalid_signature',
  'parent_hash_mismatch',
  'anchor_mismatch',
  'replay_within_chain',
  'replay_cross_chain',
  'circular_reference',
  'dangling_parent',
])

// Statistical (t4) outliers — used as a fallback when the backend severity is absent.
const SUBTLE_TYPES = new Set([
  'cost_anomaly',
  'labour_anomaly',
  'origin_anomaly',
  'timing_anomaly',
  't4_perturbed',
])

// Short human messages keyed by the backend's anomaly type vocabulary.
const MESSAGES = {
  signature_invalid: 'Signature does not verify',
  invalid_signature: 'Signature does not verify',
  signature_unknown_supplier: 'Supplier not in registry',
  unknown_supplier: 'Supplier not in registry',
  parent_hash_mismatch: 'Parent hash mismatch',
  anchor_mismatch: 'Anchor registry hash mismatch',
  replay_within_chain: 'Attestation replayed within chain',
  replay_cross_chain: 'Attestation replayed from another chain',
  circular_reference: 'Circular parent reference',
  dangling_parent: 'Parent not present in chain',
  mass_balance_violation: 'Over-consumed vs produced',
  unit_mismatch: 'Unit does not match parent output',
  timestamp_inversion: 'Timestamp precedes a parent',
  timestamp_anomaly: 'Timestamp out of expected range',
  transformation_implausible: 'Implausible transformation',
  cost_role_violation: 'Cost not allowed for this step',
  cost_anomaly: 'Unusual cost for this kind of step',
  labour_anomaly: 'Unusual labour for this kind of step',
  origin_anomaly: 'Unusual Canadian-origin claim',
  timing_anomaly: 'Unusual time of day for this step',
  t4_perturbed: 'Statistically anomalous',
}

function humanize(t) {
  return String(t || 'anomaly')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

// backendSeverity is the verifier's "hard" | "soft" tag (optional). Type drives red-vs-amber
// for hard cases; "soft" (or a known statistical type) is the violet/subtle tier.
export function anomalyMeta(type, backendSeverity) {
  let severity
  if (backendSeverity === 'soft' || SUBTLE_TYPES.has(type)) severity = 'subtle'
  else if (CRITICAL_TYPES.has(type)) severity = 'critical'
  else severity = 'warning'
  return { severity, label: humanize(type), message: MESSAGES[type] ?? humanize(type) }
}

export function severityMeta(severity) {
  return SEVERITY[severity] ?? SEVERITY.warning
}

// Worst severity name across a list of anomaly objects ({ type, severity }). null if empty.
export function worstSeverity(anomalies = []) {
  let worst = null
  for (const a of anomalies) {
    const sev = anomalyMeta(a.type, a.severity).severity
    if (!worst || SEVERITY[sev].rank > SEVERITY[worst].rank) worst = sev
  }
  return worst
}
