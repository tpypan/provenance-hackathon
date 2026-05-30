import json
import os
import sys
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Any

# Ensure backend/ and project root are on the path (works locally and in Docker)
_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
for _p in [_HERE, _ROOT]:
    if _p not in sys.path:
        sys.path.insert(0, _p)

from deterministic_checks import run_all_checks

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Resolve registry path: Docker mounts project at /project, locally it's _ROOT
_REGISTRY = os.path.join(
    "/project/registry" if os.path.isdir("/project/registry")
    else os.path.join(_ROOT, "registry")
)

with open(os.path.join(_REGISTRY, "supplier_public_keys.json")) as f:
    SUPPLIER_KEYS: dict = json.load(f)["keys"]

with open(os.path.join(_REGISTRY, "anchor_registry.json")) as f:
    _registry = json.load(f)
    ANCHOR_REGISTRY: dict = {
        a["attestation_id"]: a for a in _registry.get("anchors", [])
    }


class VerifyRequest(BaseModel):
    product_attestation_id: str
    attestations: list[dict[str, Any]]


class Anomaly(BaseModel):
    type: str
    attestation_id: str
    details: str = ""


class VerifyResponse(BaseModel):
    product_attestation_id: str
    canadian_content_percentage: float
    designation: str
    chain_valid: bool
    anomalies: list[Anomaly]


@app.post("/verify", response_model=VerifyResponse)
def verify(body: VerifyRequest):
    result = run_all_checks(
        product_attestation_id=body.product_attestation_id,
        attestations=body.attestations,
        public_keys=SUPPLIER_KEYS,
        anchor_registry=ANCHOR_REGISTRY,
    )
    return VerifyResponse(**result)


@app.get("/health")
def health():
    return {"status": "ok"}
