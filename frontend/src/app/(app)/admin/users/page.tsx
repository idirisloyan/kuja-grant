'use client';

/**
 * Phase 242 — Admin user search + list.
 *
 * Hits /api/admin/users?search=&role= and renders a simple table
 * with role chip and last_login_at. Lets the admin find a user
 * quickly without crawling org pages.
 */

import { useEffect, useState } from 'react';
import { Users, Search, Loader2, UserPlus, Copy, Check, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageShell, PageHeader, PageMain } from '@/components/layout/page-shell';

interface UserRow {
  id: number;
  name: string | null;
  email: string;
  role: string;
  org_id: number | null;
  org_name: string | null;
  created_at: string | null;
  last_login_at: string | null;
  is_active?: boolean;
  is_oversight_body?: boolean;
}

interface Resp {
  users: UserRow[];
}

interface OrgOption { id: number; name: string }

interface CreatedUser {
  user: UserRow;
  temp_password: string;
  ob_granted_to_org: string | null;
}

const ROLES = ['ngo', 'donor', 'reviewer', 'admin'] as const;

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

/**
 * Create-user dialog.
 *
 * Two things the form is deliberately explicit about, because both are
 * easy to get wrong and expensive to discover later:
 *
 *  - Oversight Body is granted to an ORGANISATION, not a person. The
 *    checkbox says so, and names the org, so nobody flags it thinking
 *    it applies to one individual.
 *  - The temporary password is shown exactly once. The dialog does not
 *    let you dismiss that screen by clicking away.
 */
function CreateUserDialog({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<(typeof ROLES)[number]>('ngo');
  const [orgQuery, setOrgQuery] = useState('');
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [orgId, setOrgId] = useState<number | ''>('');
  const [wantOb, setWantOb] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<CreatedUser | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const q = orgQuery.trim();
        const r = await api.get<{ organizations?: OrgOption[] }>(
          `/api/organizations/?limit=50${q ? `&search=${encodeURIComponent(q)}` : ''}`,
        );
        if (!cancelled) setOrgs(Array.isArray(r?.organizations) ? r.organizations : []);
      } catch {
        if (!cancelled) setOrgs([]);
      }
    })();
    return () => { cancelled = true; };
  }, [orgQuery]);

  const selectedOrg = orgs.find((o) => o.id === orgId);

  async function submit() {
    setError('');
    setBusy(true);
    try {
      const r = await api.post<CreatedUser & { success: boolean; error?: string }>(
        '/api/admin/users',
        {
          email: email.trim(),
          name: name.trim(),
          role,
          org_id: orgId === '' ? null : orgId,
          is_oversight_body: wantOb,
        },
      );
      if (r?.success) {
        setCreated(r);
        onCreated();
      } else {
        setError(r?.error || 'Could not create the user.');
      }
    } catch (e) {
      const msg = (e as { message?: string })?.message;
      setError(msg || 'Could not create the user.');
    } finally {
      setBusy(false);
    }
  }

  // Success state — the password is readable here and nowhere else.
  if (created) {
    return (
      <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg p-5 space-y-4">
          <h2 className="text-lg font-semibold">{created.user.name} is set up</h2>
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2">
            <p className="text-xs font-medium text-amber-900 dark:text-amber-200">
              This password is shown once. Copy it now and send it to them
              through a channel they already use — it is not recoverable
              from this screen or anywhere else.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-background rounded px-2 py-1.5 text-sm font-mono select-all">
                {created.temp_password}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(created.temp_password);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  } catch { /* clipboard blocked — the text is selectable */ }
                }}
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </Button>
            </div>
            <p className="text-xs text-amber-800 dark:text-amber-300">
              Ask them to change it after their first sign-in.
            </p>
          </div>
          {created.ob_granted_to_org && (
            <p className="text-xs text-muted-foreground">
              Oversight Body access was granted to{' '}
              <strong>{created.ob_granted_to_org}</strong>. Everyone in that
              organisation — now and in future — has it.
            </p>
          )}
          <div className="flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Add a user</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <label className="block text-sm">
          <span className="text-xs text-muted-foreground">Full name</span>
          <input
            type="text" value={name} onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          />
        </label>

        <label className="block text-sm">
          <span className="text-xs text-muted-foreground">Email</span>
          <input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          />
        </label>

        <label className="block text-sm">
          <span className="text-xs text-muted-foreground">Role</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])}
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          >
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>

        <label className="block text-sm">
          <span className="text-xs text-muted-foreground">Organisation</span>
          <input
            type="text" value={orgQuery} onChange={(e) => setOrgQuery(e.target.value)}
            placeholder="Type to search…"
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          />
          <select
            value={orgId}
            onChange={(e) => setOrgId(e.target.value === '' ? '' : Number(e.target.value))}
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          >
            <option value="">— none —</option>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>

        <label className="flex items-start gap-2 text-sm rounded-md border border-border p-2.5">
          <input
            type="checkbox" checked={wantOb}
            onChange={(e) => setWantOb(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium">Oversight Body access</span>
            <span className="block text-xs text-muted-foreground mt-0.5">
              Granted to the <strong>organisation</strong>, not the person.
              {selectedOrg
                ? ` Everyone at ${selectedOrg.name}, now and in future, will have it.`
                : ' Pick an organisation first.'}
            </span>
          </span>
        </label>

        {error && (
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !email.trim() || !name.trim()}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Create user'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default function AdminUsersPage() {
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<'' | (typeof ROLES)[number]>('');
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (role) params.set('role', role);
      params.set('limit', '100');
      const r = await api.get<Resp>(`/api/admin/users?${params.toString()}`);
      setRows(Array.isArray(r?.users) ? r.users : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function setActive(u: UserRow, active: boolean) {
    // "Remove" deactivates rather than deletes — the audit chain names
    // users as the actors behind money decisions, so the record has to
    // outlive their access. Confirm explicitly; this is not undoable
    // without a second deliberate click.
    if (!active && !window.confirm(
      `Revoke access for ${u.email}?\n\n`
      + 'They will not be able to sign in. Their past actions stay in the '
      + 'audit record, which is why this removes access rather than '
      + 'deleting the account. You can restore access later.',
    )) return;
    setBusyId(u.id);
    try {
      await api.post(
        `/api/admin/users/${u.id}/${active ? 'reactivate' : 'deactivate'}`, {},
      );
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="Users"
        icon={Users}
        subtitle="Search platform users by name or email. Filter by role."
        primaryAction={(
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <UserPlus className="w-3.5 h-3.5 mr-1.5" /> Add user
          </Button>
        )}
      />
      {showCreate && (
        <CreateUserDialog
          onClose={() => setShowCreate(false)}
          onCreated={load}
        />
      )}
      <PageMain>
        <Card className="p-4 space-y-3">
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && load()}
                placeholder="Name or email…"
                className="w-full rounded-md border border-border bg-background pl-8 pr-2 py-1.5 text-sm"
              />
            </div>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as '' | (typeof ROLES)[number])}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">All roles</option>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="rounded-md bg-[hsl(var(--kuja-clay))] text-white px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-60"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" /> : 'Search'}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-2 py-2 text-left">Name</th>
                  <th className="px-2 py-2 text-left">Email</th>
                  <th className="px-2 py-2 text-left">Role</th>
                  <th className="px-2 py-2 text-left">Org</th>
                  <th className="px-2 py-2 text-left">Last login</th>
                  <th className="px-2 py-2 text-left">Status</th>
                  <th className="px-2 py-2 text-right">Access</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id} className="border-b border-border last:border-b-0">
                    <td className="px-2 py-2 font-medium">{u.name ?? '—'}</td>
                    <td className="px-2 py-2 text-xs">{u.email}</td>
                    <td className="px-2 py-2 space-x-1 whitespace-nowrap">
                      <Badge variant="outline" className="text-[10px]">{u.role}</Badge>
                      {u.is_oversight_body && (
                        <Badge className="text-[10px] bg-[hsl(var(--kuja-clay))] text-white">OB</Badge>
                      )}
                    </td>
                    <td className="px-2 py-2 text-xs">{u.org_name ?? '—'}</td>
                    <td className="px-2 py-2 text-xs">{fmtDate(u.last_login_at)}</td>
                    <td className="px-2 py-2 text-xs">
                      {u.is_active === false
                        ? <span className="text-muted-foreground">No access</span>
                        : <span className="text-emerald-700 dark:text-emerald-400">Active</span>}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === u.id}
                        onClick={() => setActive(u, u.is_active === false)}
                      >
                        {busyId === u.id
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : u.is_active === false ? 'Restore' : 'Remove'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && rows.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No users match. Try a different search.
            </p>
          )}
        </Card>
      </PageMain>
    </PageShell>
  );
}
