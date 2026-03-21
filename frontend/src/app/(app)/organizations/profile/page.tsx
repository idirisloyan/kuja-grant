'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!user?.org_id) {
    return (
      <div className="text-center py-12">
        <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500 font-medium">No organization linked</p>
        <p className="text-sm text-slate-400 mt-1">Contact an administrator to link your account to an organization</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Organization Profile</h1>
          <p className="text-sm text-slate-500 mt-1">Manage your organization&apos;s information</p>
        </div>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="flex items-center gap-1 text-sm text-emerald-600">
              <CheckCircle className="w-4 h-4" /> Saved
            </span>
          )}
          <Button
            className="gap-2 bg-brand-600 hover:bg-brand-700"
            disabled={saving}
            onClick={handleSave}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" /> Save Changes
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Org Status */}
      {org && (
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className={org.verified ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}>
            {org.verified ? 'Verified' : 'Unverified'}
          </Badge>
          <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">
            {org.org_type?.toUpperCase() || 'NGO'}
          </Badge>
          {org.registration_number && (
            <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">
              Reg: {org.registration_number}
            </Badge>
          )}
          {org.assess_score !== null && org.assess_score !== undefined && (
            <Badge variant="outline" className="bg-brand-50 text-brand-700 border-brand-200">
              Capacity Score: {org.assess_score}%
            </Badge>
          )}
        </div>
      )}

      {/* Profile Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="w-4 h-4 text-brand-600" />
            Basic Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="org-name" className="flex items-center gap-1">
                <Building2 className="w-3 h-3 text-slate-400" /> Organization Name
              </Label>
              <Input
                id="org-name"
                value={name}
                onChange={(e) => { setName(e.target.value); setSaved(false); }}
                placeholder="Enter organization name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="org-country" className="flex items-center gap-1">
                <MapPin className="w-3 h-3 text-slate-400" /> Country
              </Label>
              <Input
                id="org-country"
                value={country}
                onChange={(e) => { setCountry(e.target.value); setSaved(false); }}
                placeholder="e.g., Kenya"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="org-year" className="flex items-center gap-1">
                <Calendar className="w-3 h-3 text-slate-400" /> Year Established
              </Label>
              <Input
                id="org-year"
                type="number"
                value={yearEstablished}
                onChange={(e) => { setYearEstablished(e.target.value); setSaved(false); }}
                placeholder="e.g., 2010"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="org-budget" className="flex items-center gap-1">
                <DollarSign className="w-3 h-3 text-slate-400" /> Annual Budget
              </Label>
              <Input
                id="org-budget"
                value={annualBudget}
                onChange={(e) => { setAnnualBudget(e.target.value); setSaved(false); }}
                placeholder="e.g., $500,000"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="org-staff" className="flex items-center gap-1">
                <Users className="w-3 h-3 text-slate-400" /> Staff Count
              </Label>
              <Input
                id="org-staff"
                value={staffCount}
                onChange={(e) => { setStaffCount(e.target.value); setSaved(false); }}
                placeholder="e.g., 50"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="org-website" className="flex items-center gap-1">
                <Globe className="w-3 h-3 text-slate-400" /> Website
              </Label>
              <Input
                id="org-website"
                value={website}
                onChange={(e) => { setWebsite(e.target.value); setSaved(false); }}
                placeholder="https://example.org"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="org-mission">Mission Statement</Label>
            <Textarea
              id="org-mission"
              value={mission}
              onChange={(e) => { setMission(e.target.value); setSaved(false); }}
              placeholder="Describe your organization's mission..."
              rows={4}
            />
          </div>
        </CardContent>
      </Card>

      {/* Sectors */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="w-4 h-4 text-brand-600" />
            Sectors
          </CardTitle>
          <p className="text-sm text-slate-500">Select the sectors your organization works in</p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {SECTOR_OPTIONS.map((sector) => {
              const isSelected = selectedSectors.includes(sector);
              return (
                <button
                  key={sector}
                  onClick={() => toggleSector(sector)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    isSelected
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300 hover:text-brand-600'
                  }`}
                >
                  {sector}
                </button>
              );
            })}
          </div>
          {selectedSectors.length > 0 && (
            <p className="text-xs text-slate-400 mt-3">
              {selectedSectors.length} sector{selectedSectors.length !== 1 ? 's' : ''} selected
            </p>
          )}
        </CardContent>
      </Card>

      {/* Bottom Save */}
      <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
        {saved && (
          <span className="flex items-center gap-1 text-sm text-emerald-600 self-center">
            <CheckCircle className="w-4 h-4" /> Changes saved
          </span>
        )}
        <Button
          className="gap-2 bg-brand-600 hover:bg-brand-700"
          disabled={saving}
          onClick={handleSave}
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" /> Save Changes
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
