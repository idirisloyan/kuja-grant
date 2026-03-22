'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';

import {
  Building2, Save, Loader2, CheckCircle, MapPin, Calendar,
  DollarSign, Users, Target, Globe,
} from 'lucide-react';
import type { Organization } from '@/lib/types';

const SECTOR_OPTIONS = [
  'Health',
  'Education',
  'WASH',
  'Food Security',
  'Livelihoods',
  'Protection',
  'Shelter',
  'Gender Equality',
  'Climate',
  'Governance',
  'Peacebuilding',
  'Emergency Response',
];

export default function OrgProfilePage() {
  const user = useAuthStore((s) => s.user);
  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [yearEstablished, setYearEstablished] = useState('');
  const [annualBudget, setAnnualBudget] = useState('');
  const [staffCount, setStaffCount] = useState('');
  const [mission, setMission] = useState('');
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  const [website, setWebsite] = useState('');

  // Fetch org data
  useEffect(() => {
    async function fetchOrg() {
      if (!user?.org_id) {
        setLoading(false);
        return;
      }
      try {
        const res = await api.get<{ organization: Organization }>(`/organizations/${user.org_id}`);
        const o = res.organization;
        setOrg(o);
        setName(o.name || '');
        setCountry(o.country || '');
        setYearEstablished(o.year_established ? String(o.year_established) : '');
        setAnnualBudget(o.annual_budget || '');
        setStaffCount(o.staff_count || '');
        setMission(o.mission || '');
        setSelectedSectors(o.sectors || []);
        setWebsite(o.website || '');
      } catch {
        // Failed to fetch org
      } finally {
        setLoading(false);
      }
    }
    fetchOrg();
  }, [user?.org_id]);

  const toggleSector = useCallback((sector: string) => {
    setSelectedSectors((prev) =>
      prev.includes(sector) ? prev.filter((s) => s !== sector) : [...prev, sector],
    );
    setSaved(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (!user?.org_id) return;
    setSaving(true);
    setSaved(false);
    try {
      await api.put(`/organizations/${user.org_id}`, {
        name,
        country,
        year_established: yearEstablished ? Number(yearEstablished) : null,
        annual_budget: annualBudget,
        staff_count: staffCount,
        mission,
        sectors: selectedSectors,
        website,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // Error handling
    } finally {
      setSaving(false);
    }
  }, [user?.org_id, name, country, yearEstablished, annualBudget, staffCount, mission, selectedSectors, website]);

  if (loading) {
    return (
      <Stack spacing={3}>
        <Skeleton variant="text" width={260} height={40} />
        <Skeleton variant="rounded" height={400} sx={{ borderRadius: 2 }} />
      </Stack>
    );
  }

  if (!user?.org_id) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Building2 size={48} color="#CBD5E1" style={{ margin: '0 auto 12px' }} />
        <Typography variant="body1" sx={{ fontWeight: 500, color: 'text.secondary' }}>No organization linked</Typography>
        <Typography variant="body2" sx={{ color: 'text.disabled', mt: 0.5 }}>
          Contact an administrator to link your account to an organization
        </Typography>
      </Box>
    );
  }

  return (
    <Stack spacing={3}>
      {/* Header */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { sm: 'center' }, justifyContent: 'space-between', gap: 2 }}>
        <Box>
          <Typography variant="h2" sx={{ color: 'text.primary' }}>
            Organization Profile
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Manage your organization&apos;s information
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {saved && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <CheckCircle size={16} color="#059669" />
              <Typography variant="body2" sx={{ color: '#059669' }}>Saved</Typography>
            </Box>
          )}
          <Button
            variant="contained"
            disabled={saving}
            startIcon={saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            onClick={handleSave}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </Box>
      </Box>

      {/* Org Status */}
      {org && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          <Chip
            label={org.verified ? 'Verified' : 'Unverified'}
            variant="outlined"
            size="small"
            color={org.verified ? 'success' : 'warning'}
            sx={{ fontWeight: 500, fontSize: '0.6875rem' }}
          />
          <Chip
            label={org.org_type?.toUpperCase() || 'NGO'}
            variant="outlined"
            size="small"
            sx={{ fontWeight: 500, fontSize: '0.6875rem', borderColor: 'divider' }}
          />
          {org.registration_number && (
            <Chip
              label={`Reg: ${org.registration_number}`}
              variant="outlined"
              size="small"
              sx={{ fontWeight: 500, fontSize: '0.6875rem', borderColor: 'divider' }}
            />
          )}
          {org.assess_score !== null && org.assess_score !== undefined && (
            <Chip
              label={`Capacity Score: ${org.assess_score}%`}
              variant="outlined"
              size="small"
              color="primary"
              sx={{ fontWeight: 500, fontSize: '0.6875rem' }}
            />
          )}
        </Box>
      )}

      {/* Profile Form */}
      <Card>
        <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5 }}>
            <Building2 size={16} />
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
              Basic Information
            </Typography>
          </Box>
          <Stack spacing={2.5}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2.5 }}>
              <TextField
                label="Organization Name"
                size="small"
                fullWidth
                value={name}
                onChange={(e) => { setName(e.target.value); setSaved(false); }}
                placeholder="Enter organization name"
                InputProps={{
                  startAdornment: <Building2 size={14} color="#94A3B8" style={{ marginRight: 8 }} />,
                }}
              />
              <TextField
                label="Country"
                size="small"
                fullWidth
                value={country}
                onChange={(e) => { setCountry(e.target.value); setSaved(false); }}
                placeholder="e.g., Kenya"
                InputProps={{
                  startAdornment: <MapPin size={14} color="#94A3B8" style={{ marginRight: 8 }} />,
                }}
              />
              <TextField
                label="Year Established"
                size="small"
                fullWidth
                type="number"
                value={yearEstablished}
                onChange={(e) => { setYearEstablished(e.target.value); setSaved(false); }}
                placeholder="e.g., 2010"
                InputProps={{
                  startAdornment: <Calendar size={14} color="#94A3B8" style={{ marginRight: 8 }} />,
                }}
              />
              <TextField
                label="Annual Budget"
                size="small"
                fullWidth
                value={annualBudget}
                onChange={(e) => { setAnnualBudget(e.target.value); setSaved(false); }}
                placeholder="e.g., $500,000"
                InputProps={{
                  startAdornment: <DollarSign size={14} color="#94A3B8" style={{ marginRight: 8 }} />,
                }}
              />
              <TextField
                label="Staff Count"
                size="small"
                fullWidth
                value={staffCount}
                onChange={(e) => { setStaffCount(e.target.value); setSaved(false); }}
                placeholder="e.g., 50"
                InputProps={{
                  startAdornment: <Users size={14} color="#94A3B8" style={{ marginRight: 8 }} />,
                }}
              />
              <TextField
                label="Website"
                size="small"
                fullWidth
                value={website}
                onChange={(e) => { setWebsite(e.target.value); setSaved(false); }}
                placeholder="https://example.org"
                InputProps={{
                  startAdornment: <Globe size={14} color="#94A3B8" style={{ marginRight: 8 }} />,
                }}
              />
            </Box>

            <TextField
              label="Mission Statement"
              size="small"
              fullWidth
              multiline
              rows={4}
              value={mission}
              onChange={(e) => { setMission(e.target.value); setSaved(false); }}
              placeholder="Describe your organization's mission..."
            />
          </Stack>
        </CardContent>
      </Card>

      {/* Sectors */}
      <Card>
        <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Target size={16} />
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
              Sectors
            </Typography>
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 2 }}>
            Select the sectors your organization works in
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {SECTOR_OPTIONS.map((sector) => {
              const isSelected = selectedSectors.includes(sector);
              return (
                <Chip
                  key={sector}
                  label={sector}
                  onClick={() => toggleSector(sector)}
                  variant={isSelected ? 'filled' : 'outlined'}
                  color={isSelected ? 'primary' : 'default'}
                  size="small"
                  sx={{
                    fontWeight: isSelected ? 600 : 400,
                    borderColor: isSelected ? 'primary.main' : 'divider',
                  }}
                />
              );
            })}
          </Box>
          {selectedSectors.length > 0 && (
            <Typography variant="caption" sx={{ color: 'text.disabled', mt: 1.5, display: 'block' }}>
              {selectedSectors.length} sector{selectedSectors.length !== 1 ? 's' : ''} selected
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* Bottom Save */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
        {saved && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <CheckCircle size={16} color="#059669" />
            <Typography variant="body2" sx={{ color: '#059669' }}>Changes saved</Typography>
          </Box>
        )}
        <Button
          variant="contained"
          disabled={saving}
          startIcon={saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          onClick={handleSave}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </Box>
    </Stack>
  );
}
