'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Search, Building2, Eye, ShieldCheck, MapPin, Loader2,
} from 'lucide-react';
import type { Organization } from '@/lib/types';

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function OrgSearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Organization[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setSearching(true);
    setHasSearched(true);
    try {
      const res = await api.get<{ organizations: Organization[] }>(
        `/organizations/?search=${encodeURIComponent(query.trim())}`,
      );
      setResults(res.organizations ?? []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Organization Search</h1>
        <p className="text-sm text-slate-500 mt-1">
          Search for organizations in the Kuja Grant system
        </p>
      </div>

      {/* Search Bar */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search by name, country, or type..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="pl-9"
          />
        </div>
        <Button
          onClick={handleSearch}
          disabled={searching || !query.trim()}
          className="gap-1 bg-brand-600 hover:bg-brand-700"
        >
          {searching ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
          Search
        </Button>
      </div>

      {/* Loading */}
      {searching && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}
        </div>
      )}

      {/* Results */}
      {!searching && hasSearched && results.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No organizations found</p>
            <p className="text-sm text-slate-400 mt-1">Try a different search term.</p>
          </CardContent>
        </Card>
      )}

      {!searching && results.length > 0 && (
        <Card>
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-sm text-slate-500">
              {results.length} result{results.length !== 1 ? 's' : ''} found
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organization</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Verified</TableHead>
                <TableHead className="text-right">Assessment Score</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((org) => (
                <TableRow key={org.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="font-medium text-slate-900">{org.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs capitalize">
                      {org.org_type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {org.country ? (
                      <div className="flex items-center gap-1 text-sm text-slate-600">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        {org.country}
                      </div>
                    ) : (
                      <span className="text-slate-400">--</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {org.verified ? (
                      <div className="flex items-center gap-1 text-emerald-600">
                        <ShieldCheck className="w-4 h-4" />
                        <span className="text-xs font-medium">Verified</span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">Not verified</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {org.assess_score != null ? (
                      <span
                        className={`text-sm font-semibold ${
                          org.assess_score >= 80
                            ? 'text-emerald-600'
                            : org.assess_score >= 60
                              ? 'text-amber-600'
                              : 'text-rose-600'
                        }`}
                      >
                        {org.assess_score}%
                      </span>
                    ) : (
                      <span className="text-slate-400">--</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 h-7 text-xs"
                      onClick={() => router.push(`/organizations/profile?id=${org.id}`)}
                    >
                      <Eye className="w-3 h-3" /> View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Initial State */}
      {!hasSearched && (
        <Card>
          <CardContent className="py-12 text-center">
            <Search className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">Search for organizations</p>
            <p className="text-sm text-slate-400 mt-1">
              Enter a search term above to find organizations by name, country, or type.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
