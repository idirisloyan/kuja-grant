'use client';

/**
 * DisbursementMethodsPanel — Phase 645 (June 2026).
 *
 * Lists the partner's disbursement methods and (for the OB) provides
 * an inline form to attach a new method through the FSP registry
 * shipped in Phase 639. Each FSP kind asks for the right identifier
 * shape (bank: holder + account, hawala: phone + office, mobile_money:
 * MSISDN). The route layer validates the per-kind required fields
 * server-side too, so a malformed submission just shows an inline
 * error and the user can correct it.
 *
 * Verify is OB-only and one-click — mirrors the original Phase 632
 * bank_verify flow but at the per-method level.
 */

import { useEffect, useState } from 'react';
import { Loader2, Banknote, Smartphone, Check, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/hooks/use-translation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface FSP {
  id: number;
  name: string;
  name_ar: string | null;
  kind: 'bank' | 'hawala' | 'mobile_money';
  locality: string | null;
  is_active: boolean;
}

interface Method {
  id: number;
  partner_id: number;
  fsp: FSP | null;
  identifier: Record<string, string>;
  display: string;
  status: string;
  verified_at: string | null;
}

function kindIcon(kind?: string) {
  if (kind === 'mobile_money') return <Smartphone className="w-3.5 h-3.5" />;
  return <Banknote className="w-3.5 h-3.5" />;
}

export function DisbursementMethodsPanel({
  partnerId,
  isAdmin,
  onChanged,
}: {
  partnerId: number | string;
  isAdmin: boolean;
  // Fired after a method is successfully added or verified, so a parent
  // (e.g. the partner page's bank-verify gate) can re-read the count.
  onChanged?: () => void;
}) {
  const { t } = useTranslation();
  const [methods, setMethods] = useState<Method[]>([]);
  const [fsps, setFsps] = useState<FSP[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add-method form state
  const [showForm, setShowForm] = useState(false);
  const [selectedFspId, setSelectedFspId] = useState<string>('');
  const [identifier, setIdentifier] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const [m, f] = await Promise.all([
        api.get<{ methods: Method[] }>(
          `/api/proximate/partners/${partnerId}/disbursement-methods`,
        ),
        api.get<{ fsps: FSP[] }>('/api/proximate/fsps'),
      ]);
      setMethods(m.methods || []);
      setFsps(f.fsps || []);
    } catch {
      setError(t('proximate.disbursement.load_failed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId]);

  const selectedFsp = fsps.find((f) => String(f.id) === selectedFspId);

  // Per-kind identifier field list. Mirrors the server's validation
  // map exactly so we don't ship a form the route will reject.
  const requiredFields: { key: string; label: string }[] = (() => {
    if (!selectedFsp) return [];
    if (selectedFsp.kind === 'bank') {
      return [
        { key: 'account_holder_name', label: t('proximate.disbursement.holder') },
        { key: 'account_number', label: t('proximate.disbursement.account_number') },
      ];
    }
    if (selectedFsp.kind === 'hawala') {
      return [
        { key: 'recipient_phone', label: t('proximate.disbursement.recipient_phone') },
        { key: 'broker_office', label: t('proximate.disbursement.broker_office') },
        { key: 'recipient_name', label: t('proximate.disbursement.recipient_name') },
      ];
    }
    if (selectedFsp.kind === 'mobile_money') {
      return [
        { key: 'msisdn', label: t('proximate.disbursement.msisdn') },
        { key: 'holder_name', label: t('proximate.disbursement.holder') },
      ];
    }
    return [];
  })();

  const handleSubmit = async () => {
    if (!selectedFspId) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post(
        `/api/proximate/partners/${partnerId}/disbursement-methods`,
        { fsp_id: Number(selectedFspId), identifier },
      );
      setShowForm(false);
      setSelectedFspId('');
      setIdentifier({});
      await refresh();
      onChanged?.();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t('proximate.disbursement.add_failed'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async (methodId: number) => {
    try {
      await api.post(
        `/api/proximate/disbursement-methods/${methodId}/verify`,
      );
      await refresh();
      onChanged?.();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t('proximate.disbursement.verify_failed'),
      );
    }
  };

  if (loading) {
    return (
      <Card className="p-4">
        <p className="text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-3 h-3 animate-spin" />
          {t('proximate.disbursement.loading')}
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium">
          {t('proximate.disbursement.title')} ({methods.length})
        </p>
        {isAdmin && !showForm && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setShowForm(true)}
          >
            <Plus className="w-3.5 h-3.5 me-1" />
            {t('proximate.disbursement.add')}
          </Button>
        )}
      </div>

      {methods.length === 0 && !showForm && (
        <p className="text-xs text-muted-foreground">
          {t('proximate.disbursement.none')}
        </p>
      )}

      {methods.length > 0 && (
        <ul className="space-y-2 mb-3">
          {methods.map((m) => (
            <li
              key={m.id}
              className="text-xs flex items-center gap-2 rounded-md border p-2"
            >
              {kindIcon(m.fsp?.kind)}
              <span className="font-mono">{m.display}</span>
              <Badge
                variant="outline"
                className={
                  m.status === 'verified'
                    ? 'border-emerald-500 text-emerald-700'
                    : 'border-amber-500 text-amber-700'
                }
              >
                {m.status}
              </Badge>
              {isAdmin && m.status !== 'verified' && (
                <Button
                  size="sm"
                  variant="outline"
                  className="ms-auto h-6 text-xs"
                  onClick={() => handleVerify(m.id)}
                >
                  <Check className="w-3 h-3 me-1" />
                  {t('proximate.disbursement.verify')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {showForm && (
        <div className="space-y-3 border-t pt-3 mt-1">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              {t('proximate.disbursement.fsp_picker')}
            </label>
            <select
              className="w-full text-sm rounded-md border bg-background p-2"
              value={selectedFspId}
              onChange={(e) => {
                setSelectedFspId(e.target.value);
                setIdentifier({});
              }}
            >
              <option value="">{t('proximate.disbursement.pick_fsp')}</option>
              {fsps.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.kind})
                </option>
              ))}
            </select>
          </div>

          {requiredFields.map((field) => (
            <div key={field.key}>
              <label className="text-xs text-muted-foreground block mb-1">
                {field.label}
              </label>
              <input
                type="text"
                className="w-full text-sm rounded-md border bg-background p-2"
                value={identifier[field.key] || ''}
                onChange={(e) =>
                  setIdentifier((prev) => ({
                    ...prev,
                    [field.key]: e.target.value,
                  }))
                }
              />
            </div>
          ))}

          {/* PRX-FSP-001 — don't let Save fire before the per-kind
              identifier fields are filled. Previously Save enabled the
              moment an FSP was picked, so a click posted an empty
              identifier and the server bounced it with a 400. */}
          {selectedFsp && requiredFields.some((f) => !identifier[f.key]?.trim()) && (
            <p className="text-xs text-muted-foreground">
              {t('proximate.disbursement.fill_all_fields')
                || 'Fill in all fields above to save this route.'}
            </p>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={handleSubmit}
              disabled={
                submitting
                || !selectedFspId
                || requiredFields.some((f) => !identifier[f.key]?.trim())
              }
            >
              {submitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin me-1" />
              ) : null}
              {t('proximate.disbursement.save')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setShowForm(false);
                setSelectedFspId('');
                setIdentifier({});
                setError(null);
              }}
            >
              {t('proximate.disbursement.cancel')}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
