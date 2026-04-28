'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useTranslation } from '@/lib/hooks/use-translation';
import { api } from '@/lib/api';
import {
  Building2, Save, Loader2, CheckCircle, MapPin, Calendar,
  DollarSign, Users, Target, Globe,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Organization } from '@/lib/types';

const SECTOR_OPTIONS = [
  'Health', 'Education', 'WASH', 'Food Security', 'Livelihoods',
  'Protection', 'Shelter', 'Gender Equality', 'Climate', 'Governance',
  'Peacebuilding', 'Emergency Response',
];

const inputCls =
  'w-full h-9 pl-9 pr-3 text-sm rounded-md border border-input bg-background text-foreground ' +
  'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-[hsl(var(--kuja-clay))] disabled:opacity-50';

function Field({
  label, icon: Icon, children,
}: { label: string; icon?: typeof Building2; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
        {label}
      </label>
      {children}
    </div>
  );
}

export default function OrgProfilePage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [yearEstablished, setYearEstablished] = useState('');
  const [annualBudget, setAnnualBudget] = useState('');
  const [staffCount, setStaffCount] = useState('');
  const [mission, setMission] = useState('');
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  const [website, setWebsite] = useState('');

  useEffect(() => {
    async function fetchOrg() {
      if (!user?.org_id) { setLoading(false); return; }
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
        // noop
      } finally { setLoading(false); }
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
        name, country,
        year_established: yearEstablished ? Number(yearEstablished) : null,
        annual_budget: annualBudget,
        staff_count: staffCount,
        mission, sectors: selectedSectors, website,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // noop
    } finally { setSaving(false); }
  }, [user?.org_id, name, country, yearEstablished, annualBudget, staffCount, mission, selectedSectors, website]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="kuja-shimmer h-10 w-64 rounded" />
        <div className="kuja-shimmer h-96 rounded-xl" />
      </div>
    );
  }

  if (!user?.org_id) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-background px-6 py-14 text-center">
        <Building2 className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
        <p className="kuja-display text-xl">{t('org.no_org_linked')}</p>
        <p className="text-sm text-muted-foreground mt-1">
          {t('org.no_org_hint')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="kuja-display text-3xl">{t('org.profile_title')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t('org.profile_subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="inline-flex items-center gap-1 text-sm text-[hsl(var(--kuja-grow))]">
              <CheckCircle className="h-4 w-4" /> {t('common.saved')}
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-clay-dark))] text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? t('org.saving') : t('common.save_changes')}
          </button>
        </div>
      </div>

      {/* Profile completion progress — shows the user how complete their
          profile is and motivates them to fill the gaps. AI suggestions
          and applications get sharper as more fields fill in. */}
      {(() => {
        const fields = [
          { key: 'name', filled: !!name.trim() },
          { key: 'country', filled: !!country.trim() },
          { key: 'year', filled: !!yearEstablished.trim() },
          { key: 'budget', filled: !!annualBudget.trim() },
          { key: 'staff', filled: !!staffCount.trim() },
          { key: 'website', filled: !!website.trim() },
          { key: 'mission', filled: !!mission.trim() },
          { key: 'sectors', filled: selectedSectors.length > 0 },
        ];
        const filled = fields.filter((f) => f.filled).length;
        const pct = Math.round((filled / fields.length) * 100);
        const tone = pct >= 80 ? 'bg-[hsl(var(--kuja-grow))]' : pct >= 50 ? 'bg-[hsl(var(--kuja-sun))]' : 'bg-[hsl(var(--kuja-flag))]';
        return (
          <div className="rounded-xl border border-border bg-background p-4">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-sm font-semibold">{t('org.profile_completion')}</div>
              <span className="kuja-numeric text-sm font-bold">{pct}%</span>
            </div>
            <p className="text-xs text-muted-foreground mb-2">{t('org.profile_completion_subtitle')}</p>
            <div className="h-2 bg-muted rounded overflow-hidden">
              <div className={cn('h-full transition-all', tone)} style={{ width: `${pct}%` }} />
            </div>
            {pct < 100 && (
              <p className="mt-2 text-xs text-muted-foreground">{t('org.complete_profile_cta')}</p>
            )}
          </div>
        );
      })()}

      {/* Status badges */}
      {org && (
        <div className="flex flex-wrap gap-2">
          <span className={cn(
            'kuja-severity border',
            org.verified
              ? 'bg-[hsl(142_68%_95%)] text-[hsl(var(--kuja-grow))] border-[hsl(142_55%_85%)]'
              : 'bg-[hsl(32_100%_95%)] text-[hsl(32_80%_35%)] border-[hsl(32_80%_85%)]',
          )}>
            {org.verified ? t('org_profile.verified_yes') : t('org_profile.verified_no')}
          </span>
          <span className="kuja-severity bg-muted text-muted-foreground border-border uppercase">
            {org.org_type || t('org_profile.org_type_default')}
          </span>
          {org.registration_number && (
            <span className="kuja-severity bg-muted text-muted-foreground border-border">
              {t('org_profile.reg_label')}: {org.registration_number}
            </span>
          )}
          {org.assess_score != null && (
            <span className="kuja-severity bg-[hsl(var(--kuja-sand-50))] text-[hsl(var(--kuja-clay-dark))] border-[hsl(var(--kuja-sand))]">
              {t('org_profile.capacity_label')} {org.assess_score}%
            </span>
          )}
        </div>
      )}

      {/* Basic info */}
      <div className="rounded-xl border border-border bg-background p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">{t('org.basic_info')}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t('org.field.name')} icon={Building2}>
            <div className="relative">
              <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input type="text" value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }}
                placeholder="Enter organization name" className={inputCls} />
            </div>
          </Field>
          <Field label={t('org.field.country')} icon={MapPin}>
            <div className="relative">
              <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input type="text" value={country} onChange={(e) => { setCountry(e.target.value); setSaved(false); }}
                placeholder="e.g., Kenya" className={inputCls} />
            </div>
          </Field>
          <Field label={t('org.field.year')} icon={Calendar}>
            <div className="relative">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input type="number" value={yearEstablished} onChange={(e) => { setYearEstablished(e.target.value); setSaved(false); }}
                placeholder="e.g., 2010" className={inputCls} />
            </div>
          </Field>
          <Field label={t('org.field.budget')} icon={DollarSign}>
            <div className="relative">
              <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input type="text" value={annualBudget} onChange={(e) => { setAnnualBudget(e.target.value); setSaved(false); }}
                placeholder="e.g., $500,000" className={inputCls} />
            </div>
          </Field>
          <Field label={t('org.field.staff')} icon={Users}>
            <div className="relative">
              <Users className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input type="text" value={staffCount} onChange={(e) => { setStaffCount(e.target.value); setSaved(false); }}
                placeholder="e.g., 50" className={inputCls} />
            </div>
          </Field>
          <Field label={t('org.field.website')} icon={Globe}>
            <div className="relative">
              <Globe className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input type="text" value={website} onChange={(e) => { setWebsite(e.target.value); setSaved(false); }}
                placeholder="https://example.org" className={inputCls} />
            </div>
          </Field>
        </div>
        <Field label={t('org.field.mission')}>
          <textarea
            value={mission}
            onChange={(e) => { setMission(e.target.value); setSaved(false); }}
            placeholder="Describe your organization's mission…"
            rows={4}
            className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--kuja-clay))]"
          />
        </Field>
      </div>

      {/* Sectors */}
      <div className="rounded-xl border border-border bg-background p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">{t('org.sectors')}</span>
        </div>
        <p className="text-xs text-muted-foreground">{t('org.sectors_subtitle')}</p>
        <div className="flex flex-wrap gap-2">
          {SECTOR_OPTIONS.map((sector) => {
            const active = selectedSectors.includes(sector);
            return (
              <button
                key={sector}
                type="button"
                onClick={() => toggleSector(sector)}
                className={cn(
                  'rounded-full border text-xs px-3 py-1.5 transition-colors',
                  active
                    ? 'bg-[hsl(var(--kuja-clay))] text-white border-transparent'
                    : 'border-border text-foreground hover:bg-muted',
                )}
              >
                {sector}
              </button>
            );
          })}
        </div>
        {selectedSectors.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {selectedSectors.length} sector{selectedSectors.length !== 1 ? 's' : ''} selected
          </p>
        )}
      </div>
    </div>
  );
}
