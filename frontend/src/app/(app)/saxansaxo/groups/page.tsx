'use client';

/**
 * Saxansaxo community groups — list + permission-first intake (v0).
 *
 * SCLR step 1: a group can only enter the system together with the
 * gatekeeper's permission — the create form makes granted_by_name and
 * granted_by_role mandatory, mirroring the backend 400.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Users, Plus, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  PageShell, PageHeader, PageMain,
} from '@/components/layout/page-shell';
import { SAX_STAGE_LABELS, SAX_STAGE_TONES } from '@/lib/saxansaxo';

interface Group {
  id: number;
  name: string;
  name_so: string | null;
  locality: string;
  region: string | null;
  stage: string;
  contact_name: string | null;
  created_at: string | null;
}

export default function SaxansaxoGroupsPage() {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', name_so: '', locality: '', region: '',
    contact_name: '', contact_phone: '',
    granted_by_name: '', granted_by_role: '', permission_note: '',
  });

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ groups: Group[] }>('/saxansaxo/groups');
      setGroups(res.groups);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load groups');
      setGroups([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.post('/saxansaxo/groups', {
        ...form,
        name_so: form.name_so || undefined,
        region: form.region || undefined,
        contact_name: form.contact_name || undefined,
        contact_phone: form.contact_phone || undefined,
        permission_note: form.permission_note || undefined,
      });
      setForm({
        name: '', name_so: '', locality: '', region: '',
        contact_name: '', contact_phone: '',
        granted_by_name: '', granted_by_role: '', permission_note: '',
      });
      setShowForm(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create group');
    } finally {
      setSaving(false);
    }
  };

  const canCreate = form.name.trim() && form.locality.trim()
    && form.granted_by_name.trim() && form.granted_by_role.trim();

  return (
    <PageShell>
      <PageHeader
        title="Community groups"
        subtitle="Self-organizing groups on the SCLR journey — permission first, always."
        icon={Users}
        breadcrumbs={[{ label: 'Saxansaxo', href: '/saxansaxo/admin' }]}
        primaryAction={
          <Button size="sm" onClick={() => setShowForm((v) => !v)}>
            <Plus className="w-4 h-4 mr-1" /> New group
          </Button>
        }
      />
      <PageMain>
        <div className="space-y-4">
          {error && (
            <Card className="p-3 text-sm text-red-600 dark:text-red-400">{error}</Card>
          )}

          {showForm && (
            <Card className="p-4 space-y-3">
              <div className="text-sm font-semibold">New community group</div>
              <div className="grid gap-2 md:grid-cols-2">
                <Input placeholder="Group name *" value={form.name} onChange={set('name')} />
                <Input placeholder="Somali name (magaca kooxda)" value={form.name_so} onChange={set('name_so')} />
                <Input placeholder="Locality *" value={form.locality} onChange={set('locality')} />
                <Input placeholder="Region" value={form.region} onChange={set('region')} />
                <Input placeholder="Contact name" value={form.contact_name} onChange={set('contact_name')} />
                <Input placeholder="Contact phone" value={form.contact_phone} onChange={set('contact_phone')} />
              </div>
              <div className="rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2">
                <div className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                  Permission — who agreed this group can take part? (required before anything else)
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <Input placeholder="Granted by (name) *" value={form.granted_by_name} onChange={set('granted_by_name')} />
                  <Input placeholder="Their role (chief / elder / leader) *" value={form.granted_by_role} onChange={set('granted_by_role')} />
                </div>
                <Input placeholder="Note (optional)" value={form.permission_note} onChange={set('permission_note')} />
              </div>
              <Button size="sm" onClick={create} disabled={!canCreate || saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create group'}
              </Button>
            </Card>
          )}

          {groups === null ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
            </div>
          ) : groups.length === 0 ? (
            <Card className="p-6 text-sm text-muted-foreground">
              No groups yet. Start with a group that already has its gatekeeper&apos;s permission.
            </Card>
          ) : (
            <Card className="divide-y divide-border p-0">
              {groups.map((g) => (
                <Link
                  key={g.id}
                  href={`/saxansaxo/groups/${g.id}/`}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {g.name}
                      {g.name_so && (
                        <span className="ml-2 text-xs text-muted-foreground">{g.name_so}</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {g.locality}{g.region ? ` · ${g.region}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${SAX_STAGE_TONES[g.stage] || ''}`}>
                      {SAX_STAGE_LABELS[g.stage] || g.stage}
                    </span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </Link>
              ))}
            </Card>
          )}
        </div>
      </PageMain>
    </PageShell>
  );
}
