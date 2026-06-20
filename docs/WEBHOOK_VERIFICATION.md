# Verifying Kuja webhook signatures

Every outbound webhook from Kuja includes an `X-Kuja-Signature` header
with an HMAC-SHA256 of the raw request body. Receivers should verify
this before trusting any payload — otherwise an attacker who learns
your endpoint URL could POST arbitrary JSON to it.

## What you receive

```
POST /your-receiver
Content-Type: application/json
User-Agent: KujaWebhook/1.0
X-Kuja-Event: application.submitted
X-Kuja-Signature: sha256=<64-hex-chars>

{"event":"application.submitted","org_id":42,"fired_at":1719842400,"payload":{...}}
```

The signature is computed over the **raw bytes of the request body**,
not over a re-serialised JSON. If your framework deserialises the
JSON and you re-serialise it for verification, the byte layout will
differ and the signature will not match. Capture the body before
JSON parsing.

## Your shared secret

When you register a webhook at `/settings/webhooks`, the API response
contains a `secret` field — a 32-byte URL-safe random string. **It is
returned exactly once** at creation time; we never expose it again.
Store it securely (e.g., as an environment variable in your receiver
service). Treat it like a password.

## Python receiver (Flask)

```python
import hmac
import hashlib
import os
from flask import Flask, request, abort

app = Flask(__name__)
KUJA_WEBHOOK_SECRET = os.environ['KUJA_WEBHOOK_SECRET']


def _verify(raw_body: bytes, signature_header: str) -> bool:
    if not signature_header or not signature_header.startswith('sha256='):
        return False
    expected = signature_header.split('=', 1)[1]
    computed = hmac.new(
        KUJA_WEBHOOK_SECRET.encode('utf-8'),
        raw_body,
        hashlib.sha256,
    ).hexdigest()
    # Constant-time comparison defeats timing attacks.
    return hmac.compare_digest(expected, computed)


@app.post('/kuja-webhook')
def receive():
    raw = request.get_data()  # raw bytes, before JSON parse
    if not _verify(raw, request.headers.get('X-Kuja-Signature', '')):
        abort(401)
    payload = request.get_json()
    # do something with payload[...]
    return '', 204
```

## Node.js receiver (Express)

```javascript
import crypto from 'crypto';
import express from 'express';

const app = express();
const KUJA_WEBHOOK_SECRET = process.env.KUJA_WEBHOOK_SECRET;

// IMPORTANT: use express.raw, not express.json — we need the raw bytes.
app.post('/kuja-webhook',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const sigHeader = req.headers['x-kuja-signature'];
    if (!sigHeader || !sigHeader.startsWith('sha256=')) {
      return res.status(401).end();
    }
    const expected = sigHeader.slice(7);
    const computed = crypto
      .createHmac('sha256', KUJA_WEBHOOK_SECRET)
      .update(req.body)
      .digest('hex');
    if (!crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(computed, 'hex'),
    )) {
      return res.status(401).end();
    }
    const payload = JSON.parse(req.body.toString('utf8'));
    // do something with payload[...]
    res.status(204).end();
  },
);
```

## Bash (testing / debugging)

```bash
BODY='{"event":"kuja.test","org_id":1,"fired_at":0,"payload":{}}'
SECRET="<your-secret>"

EXPECTED=$(printf "%s" "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')
echo "X-Kuja-Signature: sha256=$EXPECTED"
```

## What you should NOT do

- **Don't trust the `X-Kuja-Event` header in lieu of verifying the
  signature.** Headers are trivial to spoof.
- **Don't parse JSON before verifying.** Verifying against a
  re-serialised JSON loses byte fidelity.
- **Don't return a 200 unless you've actually processed the payload.**
  Our retry logic (200ms then 600ms exponential backoff, 3 attempts)
  treats a non-2xx response as a transient failure and will redeliver.
- **Don't compare the secret in your URL** (e.g., `?secret=…`). Use the
  header.

## Retry semantics

Kuja retries delivery on:

- Connection errors (DNS failure, TCP reset, timeout)
- 5xx response codes

It does **not** retry on:

- 4xx response codes (we treat these as permanent receiver-side rejects)
- 2xx — success

Each delivery has at most 3 attempts. The total wait between
attempts is ~800ms. Failed deliveries are logged per-attempt in your
`/settings/webhooks` history pane.

## Replay protection

The signed body includes a `fired_at` Unix timestamp (seconds). For
replay protection, your receiver should reject any payload whose
`fired_at` is more than ~5 minutes outside the current wall clock.
This bounds the window in which an intercepted-and-replayed payload
can land in your system.
