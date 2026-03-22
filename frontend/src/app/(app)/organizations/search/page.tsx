'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Skeleton from '@mui/material/Skeleton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import InputAdornment from '@mui/material/InputAdornment';

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
    <Stack spacing={3}>
      {/* Header */}
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>
          Organization Search
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          Search for organizations in the Kuja Grant system
        </Typography>
      </Box>

      {/* Search Bar */}
      <Box sx={{ display: 'flex', gap: 1.5 }}>
        <TextField
          placeholder="Search by name, country, or type..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          size="small"
          sx={{ flex: 1, maxWidth: 480 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search size={16} style={{ color: '#94A3B8' }} />
              </InputAdornment>
            ),
          }}
        />
        <Button
          variant="contained"
          disabled={searching || !query.trim()}
          startIcon={
            searching
              ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              : <Search size={16} />
          }
          onClick={handleSearch}
        >
          Search
        </Button>
      </Box>

      {/* Loading */}
      {searching && (
        <Stack spacing={1.5}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rounded" height={64} sx={{ borderRadius: 2 }} />
          ))}
        </Stack>
      )}

      {/* Results */}
      {!searching && hasSearched && results.length === 0 && (
        <Card>
          <CardContent sx={{ py: 8, textAlign: 'center' }}>
            <Building2 size={48} style={{ color: '#CBD5E1', margin: '0 auto 12px' }} />
            <Typography variant="body1" sx={{ fontWeight: 500, color: 'text.secondary' }}>
              No organizations found
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.disabled', mt: 0.5 }}>
              Try a different search term.
            </Typography>
          </CardContent>
        </Card>
      )}

      {!searching && results.length > 0 && (
        <Card>
          <Box sx={{ px: 2.5, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {results.length} result{results.length !== 1 ? 's' : ''} found
            </Typography>
          </Box>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Organization</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Country</TableCell>
                <TableCell>Verified</TableCell>
                <TableCell align="right">Assessment Score</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {results.map((org) => (
                <TableRow key={org.id} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Building2 size={16} style={{ color: '#94A3B8', flexShrink: 0 }} />
                      <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }}>
                        {org.name}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={org.org_type}
                      size="small"
                      variant="outlined"
                      sx={{ fontSize: '0.6875rem', textTransform: 'capitalize' }}
                    />
                  </TableCell>
                  <TableCell>
                    {org.country ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <MapPin size={12} style={{ color: '#94A3B8' }} />
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                          {org.country}
                        </Typography>
                      </Box>
                    ) : (
                      <Typography variant="body2" sx={{ color: 'text.disabled' }}>--</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {org.verified ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'success.main' }}>
                        <ShieldCheck size={16} />
                        <Typography variant="caption" sx={{ fontWeight: 500 }}>
                          Verified
                        </Typography>
                      </Box>
                    ) : (
                      <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                        Not verified
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {org.assess_score != null ? (
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 600,
                          color:
                            org.assess_score >= 80 ? 'success.main' :
                            org.assess_score >= 60 ? 'warning.main' : 'error.main',
                        }}
                      >
                        {org.assess_score}%
                      </Typography>
                    ) : (
                      <Typography variant="body2" sx={{ color: 'text.disabled' }}>--</Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<Eye size={14} />}
                      onClick={() => router.push(`/organizations/profile?id=${org.id}`)}
                      sx={{ fontSize: '0.75rem', height: 28 }}
                    >
                      View
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
          <CardContent sx={{ py: 8, textAlign: 'center' }}>
            <Search size={48} style={{ color: '#CBD5E1', margin: '0 auto 12px' }} />
            <Typography variant="body1" sx={{ fontWeight: 500, color: 'text.secondary' }}>
              Search for organizations
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.disabled', mt: 0.5 }}>
              Enter a search term above to find organizations by name, country, or type.
            </Typography>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}
