'use client';

/**
 * Phase 100 — Public Verifiable Credential verifier.
 *
 * Anyone (donor, regulator, auditor) can paste a Kuja-issued VC here
 * and see whether it's:
 *   - signed by Kuja's issuer DID
 *   - cryptographically intact
 *   - currently active (not revoked, not expired)
 *
 * Unauthenticated — this is the moat. The whole point of the VC is
 * portability; off-platform verifiers shouldn't need a Kuja account.
 *
 * Companion to the existing /trust/verify (which verifies a slug+token
 * combo, not a portable VC).
 */

import { useState } from 'react';
import { ShieldCheck, ShieldAlert, Loader2, Upload, FileText, ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface VerifyResult {
  valid: boolean;
  issuer_matches: boolean;
  verification_method_matches: boolean;
  signature_valid: boolean;
  status_active: boolean;
  revocation_reason: string | null;
  expired: boolean;
  credential_id?: string;
  passport_id?: number | null;
  errors: string[];
}

interface ApiResp {
  success: boolean;
  result: VerifyResult;
  verifier_did: string;
  canonicalization: string;
  verifier_howto: string;
}

const SAMPLE_HINT = `Paste the full VC JSON-LD here, including the "proof" block.
Example shape:

{
  "@context": [...],
  "id": "...",
  "type": ["VerifiableCredential", "KujaCapacityPassportCredential"],
  "issuer": "did:web:...",
  "issuanceDate": "...",
  "credentialSubject": {...},
  "credentialStatus": {...},
  "proof": {...}
}`;

export default function VerifyCredentialClient() {
  const [pasted, setPasted] = useState('');
  const [result, setResult] = useState<ApiResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    setError(null);
    setResult(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(pasted);
    } catch {
      setError("That isn't valid JSON. Paste the full VC body including the outer braces.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/credentials/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: parsed }),
      });
      const json = (await res.json()) as ApiResp | { success: false; error: string };
      if (!('success' in json) || !json.success) {
        setError(('error' in json && json.error) || 'Verification failed.');
        return;
      }
      setResult(json as ApiResp);
    } catch (e) {
      setError((e as Error).message || 'Network error.');
    } finally {
      setLoading(false);
    }
  };

  const handleFile = async (file: File) => {
    const text = await file.text();
    setPasted(text);
  };

  return (
    <div className="min-h-screen bg-[hsl(var(--kuja-quartz))] py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-5">
        <Card className="p-5 bg-gradient-to-r from-[hsl(var(--kuja-clay)/0.08)] to-[hsl(var(--kuja-sand-50))] border-[hsl(var(--kuja-clay)/0.25)]">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-8 h-8 text-[hsl(var(--kuja-clay))] shrink-0 mt-0.5" />
            <div>
              <h1 className="kuja-display text-2xl">Verify a Kuja credential</h1>
              <p className="text-xs text-muted-foreground mt-1">
                Drop or paste a W3C Verifiable Credential issued by Kuja
                and we&apos;ll confirm the signature, issuer, revocation
                status, and expiration. No login required — this is the
                whole point of a portable credential.
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold flex items-center gap-2">
              <FileText className="w-4 h-4" /> Paste the credential JSON
            </label>
            <label className="text-xs inline-flex items-center gap-1 cursor-pointer text-[hsl(var(--kuja-clay))] hover:underline">
              <Upload className="w-3 h-3" /> Upload .vc.json file
              <input
                type="file"
                accept="application/json,.json,.jsonld"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </label>
          </div>
          <textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={12}
            placeholder={SAMPLE_HINT}
            className="w-full font-mono text-[11px] rounded-md border border-border bg-card p-3 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--kuja-clay)/0.3)]"
          />
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <a
              href="/api/credentials/verifier-howto"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              How to verify this offline <ExternalLink className="w-3 h-3" />
            </a>
            <Button
              onClick={handleVerify}
              disabled={!pasted.trim() || loading}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              Verify credential
            </Button>
          </div>
          {error && (
            <div className="border-l-4 border-[hsl(var(--kuja-flag))] bg-[hsl(var(--kuja-flag)/0.05)] rounded-md p-3 text-xs">
              {error}
            </div>
          )}
        </Card>

        {result && (
          <Card className={`p-5 space-y-3 border-l-4 ${
            result.result.valid
              ? 'border-l-[hsl(var(--kuja-grow))]'
              : 'border-l-[hsl(var(--kuja-flag))]'
          }`}>
            <div className="flex items-start gap-3">
              {result.result.valid ? (
                <ShieldCheck className="w-8 h-8 text-[hsl(var(--kuja-grow))] shrink-0 mt-0.5" />
              ) : (
                <ShieldAlert className="w-8 h-8 text-[hsl(var(--kuja-flag))] shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <h2 className="kuja-display text-xl">
                  {result.result.valid ? 'Credential verified' : 'Credential failed verification'}
                </h2>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Verified against issuer <code className="font-mono">{result.verifier_did}</code>
                </p>
              </div>
            </div>

            <ul className="space-y-1.5 text-xs">
              <Check label="Issuer matches Kuja"             ok={result.result.issuer_matches} />
              <Check label="Verification method matches"     ok={result.result.verification_method_matches} />
              <Check label="Cryptographic signature is valid" ok={result.result.signature_valid} />
              <Check
                label={
                  result.result.status_active
                    ? 'Not revoked'
                    : `Revoked${result.result.revocation_reason ? ` (${result.result.revocation_reason})` : ''}`
                }
                ok={result.result.status_active}
              />
              <Check label="Not expired" ok={!result.result.expired} />
            </ul>

            {result.result.errors.length > 0 && (
              <div className="border-t border-border pt-3">
                <div className="text-xs font-semibold mb-1">Details:</div>
                <ul className="text-[11px] text-muted-foreground space-y-0.5">
                  {result.result.errors.map((e, i) => (
                    <li key={i}>· {e}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="border-t border-border pt-3 text-[10px] text-muted-foreground">
              Reproducible offline check:{' '}
              <code className="font-mono break-all">{result.canonicalization}</code>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={`inline-block w-3.5 h-3.5 rounded-full ${
          ok ? 'bg-[hsl(var(--kuja-grow))]' : 'bg-[hsl(var(--kuja-flag))]'
        }`}
        aria-hidden="true"
      />
      <span>{label}</span>
    </li>
  );
}
