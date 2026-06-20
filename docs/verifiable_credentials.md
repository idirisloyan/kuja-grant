# Kuja Verifiable Credentials — verifier guide

Kuja issues W3C Verifiable Credentials over published Capacity Passports
so any third-party donor or regulator can verify the NGO's Trust Profile
without round-tripping through Kuja's API.

## TL;DR

1. The NGO downloads the VC as JSON-LD: a button on
   `/trust` → "Download VC" emits a file named
   `kuja-capacity-passport-<id>.vc.json`.
2. The verifier resolves Kuja's issuer DID:
   `did:web:web-production-6f8a.up.railway.app` (set
   `KUJA_PUBLIC_HOST` to override).
   The DID document is at `https://<host>/.well-known/did.json`.
3. The verifier reconstructs the signing digest, validates the Ed25519
   signature, and checks revocation status against the StatusList2021
   credential at `https://<host>/api/credentials/status-list/2021`.
4. Anyone who'd rather hand off the work: paste the VC into
   `https://<host>/verify-credential` — that page calls the
   `POST /api/credentials/verify` endpoint.

## Cryptography

| Item | Value |
|---|---|
| Suite | `Ed25519Signature2020` |
| Key type | Ed25519 (RFC 8032) |
| Issuer DID method | `did:web` |
| Verification method | `<issuer>#keys-1` |
| Multibase prefix | `z` (base58btc) |
| Multicodec prefix on key | `0xED 0x01` (ed25519-pub) |
| Canonical JSON | `json.dumps(obj, sort_keys=True, separators=(',', ':'), ensure_ascii=False)` |
| Digest | SHA-256 over canonical JSON, signed/verified directly |
| Revocation | `StatusList2021Entry` referencing `/api/credentials/status-list/2021` |

We deliberately do not use JCS-RDF normalisation. Our VC shape is small
and flat; the simpler RFC-8259-style canonical JSON is enough, and it
takes ~10 lines to reproduce in any language.

## VC shape

```json
{
  "@context": [
    "https://www.w3.org/2018/credentials/v1",
    "https://w3id.org/security/suites/ed25519-2020/v1",
    "https://w3id.org/vc/status-list/2021/v1",
    "https://<host>/.well-known/kuja-vc-context.jsonld"
  ],
  "id": "https://<host>/api/passport/123/vc",
  "type": ["VerifiableCredential", "KujaCapacityPassportCredential"],
  "issuer": "did:web:<host>",
  "issuanceDate": "2026-06-19T12:00:00+00:00",
  "expirationDate": "2027-06-19T12:00:00+00:00",
  "credentialSubject": {
    "id": "urn:kuja:org:42",
    "organizationName": "Amani Community Development",
    "organizationCountry": "Kenya",
    "organizationType": "ngo",
    "capacityScore": 78.0,
    "diligenceScore": 81.5,
    "compositeScore": 79.5,
    "pillars": {
      "governance": 80,
      "finance": 76,
      "programs": 78,
      "compliance": 81
    },
    "snapshotHash": "f3c7…ab12"
  },
  "credentialStatus": {
    "id": "https://<host>/api/credentials/status-list/2021#123",
    "type": "StatusList2021Entry",
    "statusPurpose": "revocation",
    "statusListIndex": "123",
    "statusListCredential": "https://<host>/api/credentials/status-list/2021"
  },
  "proof": {
    "type": "Ed25519Signature2020",
    "created": "2026-06-19T12:00:00+00:00",
    "verificationMethod": "did:web:<host>#keys-1",
    "proofPurpose": "assertionMethod",
    "cryptosuite": "ed25519-2020",
    "proofValue": "z58…",
    "canonicalization": "json-sorted-keys-rfc8259"
  }
}
```

## Offline verification in 30 lines of Python

```python
import base64, gzip, hashlib, json, urllib.request
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

# 1. The VC the NGO handed you.
vc = json.loads(open('kuja-capacity-passport-123.vc.json').read())

# 2. Fetch the issuer DID document.
host = vc['issuer'].split('did:web:', 1)[1]
did_doc = json.loads(urllib.request.urlopen(f'https://{host}/.well-known/did.json').read())
vm = did_doc['verificationMethod'][0]

# 3. Multibase-decode the public key (strip 'z', base58btc-decode,
#    strip the 2-byte 0xED 0x01 multicodec prefix).
ALPHABET = b'123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
def b58decode(s):
    n = 0
    for ch in s: n = n * 58 + ALPHABET.index(ch.encode())
    return n.to_bytes((n.bit_length() + 7) // 8, 'big')
pk_raw = b58decode(vm['publicKeyMultibase'][1:])[2:]   # strip 0xED 0x01
pub = Ed25519PublicKey.from_public_bytes(pk_raw)

# 4. Verify the signature over the canonical JSON of `vc` minus the proof.
stripped = {k: v for k, v in vc.items() if k != 'proof'}
digest = hashlib.sha256(
    json.dumps(stripped, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()
).digest()
sig = b58decode(vc['proof']['proofValue'][1:])
pub.verify(sig, digest)   # raises InvalidSignature if tampered

# 5. Check revocation.
sl = json.loads(urllib.request.urlopen(vc['credentialStatus']['statusListCredential']).read())
bits = gzip.decompress(base64.b64decode(sl['credentialSubject']['encodedList']))
i = int(vc['credentialStatus']['statusListIndex'])
revoked = bool(bits[i // 8] & (1 << (7 - (i % 8))))
print('Revoked' if revoked else 'Active')
```

## Issuing your own key (ops)

In Railway, set `KUJA_VC_SIGNING_KEY_HEX` to a 32-byte Ed25519 private key
encoded as 64 hex characters. Generate one locally with:

```sh
py -3 -c "from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey; print(Ed25519PrivateKey.generate().private_bytes_raw().hex())"
```

Without this env var the platform generates an ephemeral key on each
process restart. Existing VCs become unverifiable across restarts in
that mode — fine for dev, NOT for production. Set this once and rotate
when you suspect a key compromise.

Setting `KUJA_PUBLIC_HOST` controls the `did:web` DID. Default is the
Railway production hostname; override for a custom domain.

## What is NOT signed

- Per-application or per-grant data. The VC summarises the Trust
  Profile, not the NGO's grant history.
- Diligence sub-findings. Pillar scores are shown; specific findings
  stay on the platform.
- Anything not in `credentialSubject`. Don't trust fields outside that
  object as platform claims.

## Rotation + revocation

- Revocation is per-passport, surfaced via StatusList2021. Calling
  `POST /api/passport/<id>/revoke` flips bit `id` in the status list
  to 1; any verifier checking status sees `Revoked` immediately on
  next refresh.
- Key rotation: rotate `KUJA_VC_SIGNING_KEY_HEX`. All previously-issued
  VCs become unverifiable (signed by the prior key). When that
  matters in practice — i.e. when there are external verifiers
  relying on long-lived VCs — extend the DID document with multiple
  `verificationMethod` entries and reference the right `#keys-N` in
  the proof. The current single-key setup is suitable for low-stakes
  rollout; multi-key is one PR away when the moment comes.
