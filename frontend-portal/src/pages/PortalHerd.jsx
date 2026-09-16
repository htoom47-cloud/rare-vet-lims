import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Syringe, Baby, AlertTriangle, Trash2, LayoutGrid, List, Share2 } from 'lucide-react';
import toast from 'react-hot-toast';
import PortalLayout from '../components/portal/PortalLayout';
import HerdAnimalPhoto from '../components/portal/HerdAnimalPhoto';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { portalBreederAPI } from '../services/portalApi';
import { animalLabel, genderLabel } from '../utils/animalTypes';
import { formatHerdDate, formatComputedAge, dueStatus, filterHerdAnimals } from '../utils/herd';
import { usePortal } from '../context/PortalContext';
import HerdNavIcon from '../components/portal/HerdNavIcon';

const VIEW_KEY = 'portalHerdViewMode';
const selectClass = 'h-10 w-full rounded-xl border border-input bg-background px-3 text-sm';
const emptyAnimal = {
  animal_type: 'camel',
  name_tag: '',
  gender: 'female',
  color: '',
  breed: '',
  rfid_chip: '',
  birth_date: '',
  weight: '',
  age: '',
  registration_number: '',
  sire_name: '',
  dam_name: '',
};

export default function PortalHerd() {
  const { t, i18n } = useTranslation();
  const { customer } = usePortal();
  const navigate = useNavigate();
  const isAr = i18n.language === 'ar';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyAnimal);
  const [photoFile, setPhotoFile] = useState(null);
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
    } catch {
      return 'grid';
    }
  });
  const [roleFilter, setRoleFilter] = useState('all');
  const [ageFilter, setAgeFilter] = useState('all');
  const [vaxFilter, setVaxFilter] = useState('all');
  const [shareOpen, setShareOpen] = useState(false);
  const [shares, setShares] = useState([]);
  const [shareForm, setShareForm] = useState({ mobile: '', name: '', role: 'worker' });

  const entitled = !!customer?.features?.breederDashboard;
  const canShare = !!customer?.features?.herdOwner;

  const load = () => {
    if (!entitled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    portalBreederAPI.dashboard()
      .then(({ data: res }) => setData(res.data))
      .catch((err) => toast.error(err.response?.data?.error?.message || t('portal.loadFailed')))
      .finally(() => setLoading(false));
  };

  const loadShares = () => {
    if (!canShare) return;
    portalBreederAPI.listShares()
      .then(({ data: res }) => setShares(res.data || []))
      .catch(() => setShares([]));
  };

  useEffect(() => { load(); }, [entitled, t]);
  useEffect(() => { loadShares(); }, [canShare]);

  const species = data?.species || [];
  const stats = data?.stats || {};

  const setField = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const herdError = (err) => {
    const code = err.response?.data?.error?.code;
    if (code === 'HAS_SAMPLES') return t('portal.herd.cannotDeleteHasSamples');
    if (code === 'OWNER_ONLY') return t('portal.herd.ownerOnlyAction');
    if (code === 'CANNOT_SHARE_SELF') return t('portal.herd.shareSelf');
    if (code === 'SHARE_LIMIT') return t('portal.herd.shareLimit');
    if (code === 'ALREADY_SHARED') return t('portal.herd.shareExists');
    if (code === 'INVALID_MOBILE') return t('portal.herd.shareInvalid');
    if (code === 'CUSTOMER_INACTIVE') return t('portal.herd.shareInactive');
    return err.response?.data?.error?.message || t('common.error');
  };

  const removeAnimal = async (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(t('portal.herd.confirmDeleteAnimal'))) return;
    try {
      await portalBreederAPI.deactivateAnimal(id);
      toast.success(t('portal.herd.animalDeleted'));
      load();
    } catch (err) {
      toast.error(herdError(err));
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        weight: form.weight === '' ? null : Number(form.weight),
        birth_date: form.birth_date || null,
      };
      const { data: created } = await portalBreederAPI.createAnimal(payload);
      const id = created.data?.id;
      if (id && photoFile) {
        await portalBreederAPI.uploadPhoto(id, photoFile);
      }
      toast.success(t('portal.herd.animalSaved'));
      setModalOpen(false);
      setForm(emptyAnimal);
      setPhotoFile(null);
      if (id) navigate(`/herd/${id}`);
      else load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const handleShare = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await portalBreederAPI.addShare(shareForm);
      toast.success(t('portal.herd.shareSaved'));
      setShareForm({ mobile: '', name: '', role: 'worker' });
      loadShares();
    } catch (err) {
      toast.error(herdError(err));
    } finally {
      setSaving(false);
    }
  };

  const revokeShare = async (id) => {
    if (!window.confirm(t('portal.herd.confirmRevokeShare'))) return;
    try {
      await portalBreederAPI.removeShare(id);
      toast.success(t('portal.herd.shareRevoked'));
      loadShares();
    } catch (err) {
      toast.error(herdError(err));
    }
  };

  const cards = useMemo(() => ([
    { key: 'animals', value: stats.animals || 0, label: t('portal.herd.statAnimals'), icon: HerdNavIcon },
    { key: 'vacc', value: stats.vaccinations_due || 0, label: t('portal.herd.statVaccDue'), icon: Syringe, warn: (stats.vaccinations_due || 0) > 0 },
    { key: 'births', value: stats.expected_births || 0, label: t('portal.herd.statExpectedBirths'), icon: Baby },
    { key: 'recent', value: stats.recent_births || 0, label: t('portal.herd.statRecentBirths'), icon: Baby },
  ]), [stats, t]);

  const filteredAnimals = useMemo(
    () => filterHerdAnimals(data?.animals || [], { role: roleFilter, age: ageFilter, vax: vaxFilter }),
    [data?.animals, roleFilter, ageFilter, vaxFilter]
  );

  const setView = (mode) => {
    setViewMode(mode);
    try { localStorage.setItem(VIEW_KEY, mode); } catch { /* ignore */ }
  };

  const animalFacts = (a) => (
    <>
      <p className="font-bold truncate">{a.name_tag || a.animal_code}</p>
      <p className="text-xs text-muted-foreground truncate">
        {animalLabel(a.animal_type, isAr)} · {genderLabel(a.gender, isAr)}
        {a.rfid_chip ? ` · ${a.rfid_chip}` : ''}
      </p>
      <p className="text-xs text-muted-foreground truncate">
        {formatComputedAge(a.age_computed, isAr) || a.age || t('portal.herd.ageUnknown')}
        {a.color ? ` · ${a.color}` : ''}
      </p>
      {a.vaccination_count > 0 ? (
        a.vaccinations_due > 0
          ? <p className="text-xs text-amber-700">{t('portal.herd.vaccDueCount', { count: a.vaccinations_due })}</p>
          : <p className="text-xs text-emerald-700">{t('portal.herd.vaccinated')}</p>
      ) : (
        <p className="text-xs text-muted-foreground">{t('portal.herd.unvaccinated')}</p>
      )}
    </>
  );

  if (!entitled) {
    return (
      <PortalLayout title={t('portal.herd.title')} subtitle={t('portal.herd.subtitle')}>
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <HerdNavIcon className="mx-auto text-muted-foreground/50" size={40} />
            <p className="text-muted-foreground">{t('portal.herd.notEntitled')}</p>
          </CardContent>
        </Card>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout title={t('portal.herd.title')} subtitle={t('portal.herd.subtitle')} wide>
      {loading && <p className="text-center py-12 text-muted-foreground text-sm">{t('common.loading')}</p>}

      {!loading && data && (
        <div className="space-y-6">
          {(data.share?.is_delegate || customer?.features?.herdShared) && (
            <Card>
              <CardContent className="p-3 text-sm text-muted-foreground">
                {data.share?.owner_name
                  ? t('portal.herd.sharedBannerNamed', { name: data.share.owner_name })
                  : t('portal.herd.sharedBanner')}
              </CardContent>
            </Card>
          )}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {cards.map((c) => (
              <Card key={c.key}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <c.icon size={14} />
                    {c.label}
                  </div>
                  <p className={`text-2xl font-bold ${c.warn ? 'text-amber-600' : 'text-foreground'}`}>{c.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {data.due_vaccinations?.length > 0 && (
            <Card>
              <CardContent className="p-4 space-y-2">
                <h2 className="font-semibold flex items-center gap-2 text-sm">
                  <AlertTriangle size={16} className="text-amber-600" />
                  {t('portal.herd.vaccinationCalendar')}
                </h2>
                {data.due_vaccinations.map((v) => {
                  const st = dueStatus(v.next_due_at);
                  return (
                    <button
                      key={v.id}
                      type="button"
                      className="w-full text-start rounded-xl border border-border/60 px-3 py-2 hover:bg-accent"
                      onClick={() => navigate(`/herd/${v.animal_id}`)}
                    >
                      <p className="font-medium text-sm truncate">{v.name_tag || v.animal_code} · {v.vaccine_name}</p>
                      <p className={`text-xs ${st === 'overdue' ? 'text-red-600' : 'text-amber-700'}`}>
                        {t('portal.herd.nextDue')}: {formatHerdDate(v.next_due_at, isAr)}
                        {st === 'overdue' ? ` · ${t('portal.herd.overdue')}` : ''}
                      </p>
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {data.expected_births?.length > 0 && (
            <Card>
              <CardContent className="p-4 space-y-2">
                <h2 className="font-semibold flex items-center gap-2 text-sm">
                  <Baby size={16} /> {t('portal.herd.expectedBirths')}
                </h2>
                {data.expected_births.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    className="w-full text-start rounded-xl border border-border/60 px-3 py-2 hover:bg-accent"
                    onClick={() => navigate(`/herd/${b.animal_id}`)}
                  >
                    <p className="font-medium text-sm truncate">{b.name_tag || b.animal_code}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('portal.herd.expectedOn')}: {formatHerdDate(b.expected_birth_date, isAr)}
                      {b.sire_display ? ` · ${t('portal.herd.sire')}: ${b.sire_display}` : ''}
                    </p>
                  </button>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">{t('portal.herd.myHerd')}</h2>
            <div className="flex items-center gap-2">
              <div className="flex rounded-xl border border-input overflow-hidden">
                <Button
                  type="button"
                  size="icon"
                  variant={viewMode === 'grid' ? 'default' : 'ghost'}
                  className="rounded-none h-9 w-9"
                  aria-label={t('portal.herd.viewGrid')}
                  onClick={() => setView('grid')}
                >
                  <LayoutGrid size={16} />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant={viewMode === 'list' ? 'default' : 'ghost'}
                  className="rounded-none h-9 w-9"
                  aria-label={t('portal.herd.viewList')}
                  onClick={() => setView('list')}
                >
                  <List size={16} />
                </Button>
              </div>
              <Button size="sm" onClick={() => { setForm({ ...emptyAnimal, animal_type: species[0]?.code || 'camel' }); setModalOpen(true); }}>
                <Plus size={16} /> {t('portal.herd.addAnimal')}
              </Button>
              {canShare && (
                <Button size="sm" variant="outline" onClick={() => setShareOpen(true)}>
                  <Share2 size={16} /> {t('portal.herd.share')}
                </Button>
              )}
            </div>
          </div>

          {(data.animals || []).length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <label className="text-xs space-y-1">
                <span className="text-muted-foreground">{t('portal.herd.filterRole')}</span>
                <select className={selectClass} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                  <option value="all">{t('portal.herd.filterAll')}</option>
                  <option value="mothers">{t('portal.herd.filterMothers')}</option>
                  <option value="sires">{t('portal.herd.filterSires')}</option>
                  <option value="offspring">{t('portal.herd.filterOffspring')}</option>
                </select>
              </label>
              <label className="text-xs space-y-1">
                <span className="text-muted-foreground">{t('portal.herd.filterAge')}</span>
                <select className={selectClass} value={ageFilter} onChange={(e) => setAgeFilter(e.target.value)}>
                  <option value="all">{t('portal.herd.filterAll')}</option>
                  <option value="under1">{t('portal.herd.ageUnder1')}</option>
                  <option value="1to3">{t('portal.herd.age1to3')}</option>
                  <option value="3to5">{t('portal.herd.age3to5')}</option>
                  <option value="over5">{t('portal.herd.ageOver5')}</option>
                  <option value="unknown">{t('portal.herd.ageUnknown')}</option>
                </select>
              </label>
              <label className="text-xs space-y-1">
                <span className="text-muted-foreground">{t('portal.herd.filterVax')}</span>
                <select className={selectClass} value={vaxFilter} onChange={(e) => setVaxFilter(e.target.value)}>
                  <option value="all">{t('portal.herd.filterAll')}</option>
                  <option value="vaccinated">{t('portal.herd.vaccinated')}</option>
                  <option value="unvaccinated">{t('portal.herd.unvaccinated')}</option>
                  <option value="due">{t('portal.herd.statVaccDue')}</option>
                </select>
              </label>
            </div>
          )}

          {(!data.animals || data.animals.length === 0) && (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground text-sm">
                {t('portal.herd.noAnimals')}
              </CardContent>
            </Card>
          )}

          {data.animals?.length > 0 && filteredAnimals.length === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground text-sm">
                {t('portal.herd.noFilterResults')}
              </CardContent>
            </Card>
          )}

          {viewMode === 'grid' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredAnimals.map((a) => (
                <div key={a.id} className="relative">
                  <button
                    type="button"
                    className="text-start w-full"
                    onClick={() => navigate(`/herd/${a.id}`)}
                  >
                    <Card className="hover:shadow-md transition-shadow overflow-hidden h-full">
                      <HerdAnimalPhoto
                        animalId={a.id}
                        hasPhoto={a.has_photo}
                        animalType={a.animal_type}
                        className="w-full h-40"
                        iconSize={40}
                      />
                      <CardContent className="p-4 space-y-1">
                        {animalFacts(a)}
                      </CardContent>
                    </Card>
                  </button>
                  {canShare && (
                    <Button
                      type="button"
                      size="icon"
                      variant="destructive"
                      className="absolute top-2 end-2 h-9 w-9 z-10 shadow-md"
                      aria-label={t('portal.herd.deleteAnimal')}
                      onClick={(e) => removeAnimal(e, a.id)}
                    >
                      <Trash2 size={16} />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {viewMode === 'list' && (
            <div className="space-y-2">
              {filteredAnimals.map((a) => (
                <div key={a.id} className="relative">
                  <button
                    type="button"
                    className="text-start w-full"
                    onClick={() => navigate(`/herd/${a.id}`)}
                  >
                    <Card className="hover:shadow-md transition-shadow">
                      <CardContent className="p-3 flex items-center gap-3">
                        <HerdAnimalPhoto
                          animalId={a.id}
                          hasPhoto={a.has_photo}
                          animalType={a.animal_type}
                          className="w-14 h-14 rounded-xl shrink-0"
                          iconSize={22}
                        />
                        <div className="min-w-0 flex-1 space-y-0.5 pe-10">
                          {animalFacts(a)}
                        </div>
                      </CardContent>
                    </Card>
                  </button>
                  {canShare && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="absolute top-1/2 -translate-y-1/2 end-2 h-9 w-9 z-10 text-red-600"
                      aria-label={t('portal.herd.deleteAnimal')}
                      onClick={(e) => removeAnimal(e, a.id)}
                    >
                      <Trash2 size={16} />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <button type="button" className="absolute inset-0 bg-black/40" onClick={() => setModalOpen(false)} aria-label="Close" />
          <form onSubmit={handleCreate} className="relative w-full sm:max-w-lg bg-card rounded-t-2xl sm:rounded-2xl p-5 space-y-3 max-h-[90vh] overflow-y-auto shadow-xl">
            <h3 className="font-semibold text-lg">{t('portal.herd.addAnimal')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-sm space-y-1">
                <span>{t('portal.herd.name')}</span>
                <Input value={form.name_tag} onChange={(e) => setField('name_tag', e.target.value)} required />
              </label>
              <label className="text-sm space-y-1">
                <span>{t('portal.herd.species')}</span>
                <select className="input-field h-10 w-full rounded-xl border border-input bg-background px-3" value={form.animal_type} onChange={(e) => setField('animal_type', e.target.value)}>
                  {species.map((s) => (
                    <option key={s.code} value={s.code}>{isAr ? (s.name_ar || s.name_en) : s.name_en}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm space-y-1">
                <span>{t('portal.gender')}</span>
                <select className="input-field h-10 w-full rounded-xl border border-input bg-background px-3" value={form.gender} onChange={(e) => setField('gender', e.target.value)}>
                  <option value="female">{genderLabel('female', isAr)}</option>
                  <option value="male">{genderLabel('male', isAr)}</option>
                  <option value="unknown">{genderLabel('unknown', isAr)}</option>
                </select>
              </label>
              <label className="text-sm space-y-1">
                <span>{t('portal.chipTag')}</span>
                <Input value={form.rfid_chip} onChange={(e) => setField('rfid_chip', e.target.value)} />
              </label>
              <label className="text-sm space-y-1">
                <span>{t('portal.herd.color')}</span>
                <Input value={form.color} onChange={(e) => setField('color', e.target.value)} />
              </label>
              <label className="text-sm space-y-1">
                <span>{t('portal.herd.breed')}</span>
                <Input value={form.breed} onChange={(e) => setField('breed', e.target.value)} />
              </label>
              <label className="text-sm space-y-1">
                <span>{t('portal.herd.birthDate')}</span>
                <Input type="date" value={form.birth_date} onChange={(e) => setField('birth_date', e.target.value)} />
              </label>
              <label className="text-sm space-y-1">
                <span>{t('portal.herd.weight')}</span>
                <Input type="number" step="0.1" min="0" value={form.weight} onChange={(e) => setField('weight', e.target.value)} />
              </label>
              <label className="text-sm space-y-1 sm:col-span-2">
                <span>{t('portal.herd.photo')}</span>
                <Input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPhotoFile(e.target.files?.[0] || null)} />
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>{t('common.cancel') || t('portal.herd.cancel')}</Button>
              <Button type="submit" disabled={saving}>{t('portal.herd.save')}</Button>
            </div>
          </form>
        </div>
      )}

      {shareOpen && canShare && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <button type="button" className="absolute inset-0 bg-black/40" onClick={() => setShareOpen(false)} aria-label="Close" />
          <div className="relative w-full sm:max-w-lg bg-card rounded-t-2xl sm:rounded-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto shadow-xl">
            <h3 className="font-semibold text-lg">{t('portal.herd.shareTitle')}</h3>
            <p className="text-sm text-muted-foreground">{t('portal.herd.shareHint')}</p>
            <form onSubmit={handleShare} className="space-y-3">
              <label className="text-sm space-y-1 block">
                <span>{t('portal.herd.shareMobile')}</span>
                <Input value={shareForm.mobile} onChange={(e) => setShareForm((p) => ({ ...p, mobile: e.target.value }))} required placeholder="05xxxxxxxx" />
              </label>
              <label className="text-sm space-y-1 block">
                <span>{t('portal.herd.shareName')}</span>
                <Input value={shareForm.name} onChange={(e) => setShareForm((p) => ({ ...p, name: e.target.value }))} placeholder={t('portal.herd.shareNamePlaceholder')} />
              </label>
              <label className="text-sm space-y-1 block">
                <span>{t('portal.herd.shareRole')}</span>
                <select className={selectClass} value={shareForm.role} onChange={(e) => setShareForm((p) => ({ ...p, role: e.target.value }))}>
                  <option value="worker">{t('portal.herd.roleWorker')}</option>
                  <option value="agent">{t('portal.herd.roleAgent')}</option>
                </select>
              </label>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShareOpen(false)}>{t('portal.herd.cancel')}</Button>
                <Button type="submit" disabled={saving}>{t('portal.herd.shareAdd')}</Button>
              </div>
            </form>
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">{t('portal.herd.shareList')}</h4>
              {shares.length === 0 && (
                <p className="text-sm text-muted-foreground">{t('portal.herd.shareEmpty')}</p>
              )}
              {shares.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{s.name || s.mobile}</p>
                    <p className="text-xs text-muted-foreground">{s.mobile} · {s.role === 'agent' ? t('portal.herd.roleAgent') : t('portal.herd.roleWorker')}</p>
                  </div>
                  <Button type="button" size="sm" variant="ghost" className="text-red-600" onClick={() => revokeShare(s.id)}>
                    {t('portal.herd.shareRevoke')}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </PortalLayout>
  );
}
