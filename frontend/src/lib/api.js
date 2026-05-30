// Backend client. BASE is empty by default so requests hit the same origin and the
// Vite dev proxy (and the compose frontend) forward /api + /verify to the verifier.
// Override with VITE_API_BASE to point at a backend on another origin.
const BASE = import.meta.env.VITE_API_BASE ?? ''

async function http(path, options) {
  let res
  try {
    res = await fetch(`${BASE}${path}`, options)
  } catch {
    throw new ApiError('network', 'Could not reach the verifier. Is the backend running?')
  }
  if (res.status === 404) return null
  if (!res.ok) {
    let detail = ''
    try {
      detail = (await res.json())?.detail ?? ''
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError('server', detail || `Request failed (${res.status}).`)
  }
  return res.json()
}

export class ApiError extends Error {
  constructor(kind, message) {
    super(message)
    this.kind = kind
  }
}

export function groupAnomalies(anomalies = []) {
  const byAtt = {}
  for (const a of anomalies) {
    const id = a?.attestation_id
    if (!id) continue
    ;(byAtt[id] ??= []).push(a)
  }
  return byAtt
}

// Map the backend product response onto the shape the pages/graph already consume.
function adaptProduct(resp) {
  if (!resp) return null
  const meta = resp.product ?? {}
  const verification = resp.verification ?? {}
  return {
    id: meta.product_attestation_id ?? resp.chain?.product_attestation_id,
    name: meta.name || 'Unnamed product',
    maker: meta.maker || '',
    hash: meta.content_hash || '',
    chain: resp.chain,
    verification,
    anomaliesByAtt: groupAnomalies(verification.anomalies),
    designationDetail: resp.designation_detail,
  }
}

// Resolve an attestation id OR a 64-hex content hash to a product id. null if unknown.
export async function resolve(query) {
  const q = String(query || '').trim()
  if (!q) return null
  const data = await http(`/api/resolve?q=${encodeURIComponent(q)}`)
  return data?.product_attestation_id ?? null
}

export async function getProduct(id) {
  return adaptProduct(await http(`/api/products/${encodeURIComponent(id)}`))
}

export async function verifyChain(payload) {
  return http('/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function listSuppliers() {
  return (await http('/api/suppliers')) ?? []
}

export async function issueAttestation(body) {
  return http('/api/attestations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}
