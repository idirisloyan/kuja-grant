'use client';

/**
 * Phase 242 — Admin user search + list.
 *
 * Hits /api/admin/users?search=&role= and renders a simple table
 * with role chip and last_login_at. Lets the admin find a user
 * quickly without crawling org pages.
 */

import { useEffect, useState } from 'react';
import { Users, Search, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
}

interface Resp {
  users: UserRow[];
}

const ROLES = ['ngo', 'donor', 'reviewer', 'admin'] as const;

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

export default function AdminUsersPage() {
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<'' | (typeof ROLES)[number]>('');
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);

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

  return (
    <PageShell>
      <PageHeader
        title="Users"
        icon={Users}
        subtitle="Search platform users by name or email. Filter by role."
      />
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
                  <th className="px-2 py-2 text-left">Created</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id} className="border-b border-border last:border-b-0">
                    <td className="px-2 py-2 font-medium">{u.name ?? '—'}</td>
                    <td className="px-2 py-2 text-xs">{u.email}</td>
                    <td className="px-2 py-2">
                      <Badge variant="outline" className="text-[10px]">{u.role}</Badge>
                    </td>
                    <td className="px-2 py-2 text-xs">{u.org_name ?? '—'}</td>
                    <td className="px-2 py-2 text-xs">{fmtDate(u.last_login_at)}</td>
                    <td className="px-2 py-2 text-xs">{fmtDate(u.created_at)}</td>
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
