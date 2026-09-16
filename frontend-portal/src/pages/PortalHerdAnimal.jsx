import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, ArrowLeft, Syringe, Heart, Baby, FileText, Trash2, Stethoscope, StickyNote } from 'lucide-react';
import toast from 'react-hot-toast';
import PortalLayout from '../components/portal/PortalLayout';
import HerdAnimalPhoto from '../components/portal/HerdAnimalPhoto';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { portalBreederAPI } from '../services/portalApi';
import { animalLabel, genderLabel } from '../utils/animalTypes';
import { formatHerdDate, formatHerdDateTime, formatComputedAge, isoDate, dueStatus } from '../utils/herd';
import { usePortal } from '../context/PortalContext';

const TABS = ['profile', 'health', 'vaccinations', 'breeding', 'births'];

const emptyVacc = { vaccine_name: '', batch_number: '', administered_at: '', next_due_at: '', administered_by: '', notes: '' };
const emptyBreed = { event_type: 'natural', event_date: '', sire_id: '', sire_name: '', outcome: 'pending', expected_birth_date: '', notes: '' };
const emptyBirth = {
  birth_date: '', father_id: '', father_name: '', offspring_name: '', birth_weight: '',
  gender: 'unknown', register_offspring: true, notes: '',
};
const emptyNote = () => ({ body: '', noted_at: isoDate(new Date()) });

export default function PortalHerdAnimal() {
  const { t, i18n } = useTranslation();
  const { customer } = usePortal();
  const { animalId } = useParams();
  const navigate = useNavigate();
  const isAr = i18n.language === 'ar';
  const Back = isAr ? ArrowLeft : ArrowRight;

  const [tab, setTab] = useState('profile');
  const [pack, setPack] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photoBust, setPhotoBust] = useState(0);
  const [profile, setProfile] = useState(null);
  const [vaccForm, setVaccForm] = useState(emptyVacc);
  const [breedForm, setBreedForm] = useState(emptyBreed);
  const [birthForm, setBirthForm] = useState(emptyBirth);
  const [healthForm, setHealthForm] = useState(emptyNote);
  const [extraForm, setExtraForm] = useState(emptyNote);
  const [removing, setRemoving] = useState(false);

  const entitled = !!customer?.features?.breederDashboard;
  const canShare = !!customer?.features?.herdOwner;

  const herdError = (err) => {
    const code = err.response?.data?.error?.code;
    if (code === 'HAS_SAMPLES') return t('portal.herd.cannotDeleteHasSamples');
    if (code === 'OWNER_ONLY') return t('portal.herd.ownerOnlyAction');
    return err.response?.data?.error?.message || t('common.error');
  };

  const load = () => {
    if (!entitled) { setLoading(false); return; }
    setLoading(true);
    portalBreederAPI.getAnimal(animalId)
      .then(({ data }) => {
        setPack(data.data);
        const a = data.data.animal;
        setProfile({
          animal_type: a.animal_type,
          name_tag: a.name_tag || '',
          gender: a.gender || 'unknown',
          color: a.color || '',
          breed: a.breed || '',
          rfid_chip: a.rfid_chip || '',
          birth_date: isoDate(a.birth_date),
          weight: a.weight ?? '',
          age: a.age || '',
          registration_number: a.registration_number || '',
          sire_id: a.sire_id || '',
          dam_id: a.dam_id || '',
          sire_name: a.sire_name || '',
          dam_name: a.dam_name || '',
        });
      })
      .catch((err) => {
        toast.error(err.response?.data?.error?.message || t('portal.loadFailed'));
        navigate('/herd');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [animalId, entitled]);

  const animal = pack?.animal;

  const saveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await portalBreederAPI.updateAnimal(animalId, {
        ...profile,
        weight: profile.weight === '' ? null : Number(profile.weight),
        sire_id: profile.sire_id || null,
        dam_id: profile.dam_id || null,
        birth_date: profile.birth_date || null,
      });
      toast.success(t('portal.herd.animalSaved'));
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const onPhoto = async (file) => {
    if (!file) return;
    try {
      await portalBreederAPI.uploadPhoto(animalId, file);
      setPhotoBust((n) => n + 1);
      toast.success(t('portal.herd.photoSaved'));
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('portal.herd.photoFailed'));
    }
  };

  const addVacc = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await portalBreederAPI.addVaccination(animalId, { ...vaccForm, next_due_at: vaccForm.next_due_at || null });
      setVaccForm(emptyVacc);
      toast.success(t('portal.herd.saved'));
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('common.error'));
    } finally { setSaving(false); }
  };

  const addBreed = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await portalBreederAPI.addBreeding(animalId, {
        ...breedForm,
        sire_id: breedForm.sire_id || null,
        expected_birth_date: breedForm.expected_birth_date || null,
      });
      setBreedForm(emptyBreed);
      toast.success(t('portal.herd.saved'));
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('common.error'));
    } finally { setSaving(false); }
  };

  const addBirth = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await portalBreederAPI.addBirth(animalId, {
        ...birthForm,
        father_id: birthForm.father_id || null,
        birth_weight: birthForm.birth_weight === '' ? null : Number(birthForm.birth_weight),
      });
      setBirthForm(emptyBirth);
      toast.success(t('portal.herd.saved'));
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('common.error'));
    } finally { setSaving(false); }
  };

  const removeAnimal = async () => {
    if (!window.confirm(t('portal.herd.confirmDeleteAnimal'))) return;
    setRemoving(true);
    try {
      await portalBreederAPI.deactivateAnimal(animalId);
      toast.success(t('portal.herd.animalDeleted'));
      navigate('/herd');
    } catch (err) {
      toast.error(herdError(err));
    } finally {
      setRemoving(false);
    }
  };

  const addNote = async (e, kind) => {
    e.preventDefault();
    const form = kind === 'health' ? healthForm : extraForm;
    setSaving(true);
    try {
      await portalBreederAPI.addNote(animalId, {
        kind,
        body: form.body,
        noted_at: form.noted_at || isoDate(new Date()),
      });
      if (kind === 'health') setHealthForm(emptyNote());
      else setExtraForm(emptyNote());
      toast.success(t('portal.herd.saved'));
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('common.error'));
    } finally { setSaving(false); }
  };

  const removeRow = async (kind, id) => {
    if (!window.confirm(t('portal.herd.confirmDelete'))) return;
    try {
      if (kind === 'vacc') await portalBreederAPI.removeVaccination(id);
      if (kind === 'breed') await portalBreederAPI.removeBreeding(id);
      if (kind === 'birth') await portalBreederAPI.removeBirth(id);
      if (kind === 'note') await portalBreederAPI.removeNote(id);
      toast.success(t('portal.herd.deleted'));
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('common.error'));
    }
  };

  if (!entitled) {
    return (
      <PortalLayout title={t('portal.herd.title')}>
        <p className="text-muted-foreground text-sm">{t('portal.herd.notEntitled')}</p>
      </PortalLayout>
    );
  }

  const title = animal?.name_tag || animal?.animal_code || t('portal.herd.title');
  const field = (obj, setObj) => (k) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setObj((p) => ({ ...p, [k]: value }));
  };

  return (
    <PortalLayout title={title} subtitle={animal ? animalLabel(animal.animal_type, isAr) : ''} wide>
      <div className="mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/herd')}>
          <Back size={16} /> {t('portal.herd.back')}
        </Button>
      </div>

      {loading && <p className="text-center py-12 text-muted-foreground text-sm">{t('common.loading')}</p>}

      {!loading && animal && profile && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 flex gap-4">
              <label className="shrink-0 cursor-pointer">
                <HerdAnimalPhoto
                  animalId={animal.id}
                  hasPhoto={animal.has_photo}
                  animalType={animal.animal_type}
                  className="w-24 h-24 sm:w-32 sm:h-32 rounded-2xl"
                  iconSize={36}
                  bust={photoBust}
                />
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
              </label>
              <div className="min-w-0 flex-1 space-y-1">
                <h2 className="text-xl font-bold truncate">{animal.name_tag || animal.animal_code}</h2>
                <p className="text-sm text-muted-foreground">
                  {animalLabel(animal.animal_type, isAr)} · {genderLabel(animal.gender, isAr)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('portal.chipTag')}: {animal.rfid_chip || '—'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('portal.age')}: {formatComputedAge(animal.age_computed, isAr) || animal.age || '—'}
                </p>
                {animal.sire_display && (
                  <p className="text-xs text-muted-foreground">{t('portal.herd.sire')}: {animal.sire_display}</p>
                )}
                <div className="flex flex-wrap gap-2 mt-2">
                  <Button size="sm" variant="outline" onClick={() => navigate(`/animals/${animal.id}`)}>
                    <FileText size={14} /> {t('portal.herd.labHealth')}
                  </Button>
                  {canShare && (
                    <Button size="sm" variant="destructive" disabled={removing} onClick={removeAnimal}>
                      <Trash2 size={14} /> {t('portal.herd.deleteAnimal')}
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-1 overflow-x-auto pb-1">
            {TABS.map((key) => (
              <Button key={key} size="sm" variant={tab === key ? 'default' : 'outline'} onClick={() => setTab(key)}>
                {t(`portal.herd.tab.${key}`)}
              </Button>
            ))}
          </div>

          {tab === 'profile' && (
            <form onSubmit={saveProfile} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-sm space-y-1">
                <span>{t('portal.herd.name')}</span>
                <Input value={profile.name_tag} onChange={field(profile, setProfile)('name_tag')} />
              </label>
              <label className="text-sm space-y-1">
                <span>{t('portal.chipTag')}</span>
                <Input value={profile.rfid_chip} onChange={field(profile, setProfile)('rfid_chip')} />
              </label>
              <label className="text-sm space-y-1">
                <span>{t('portal.gender')}</span>
                <select className="h-10 w-full rounded-xl border border-input bg-background px-3" value={profile.gender} onChange={field(profile, setProfile)('gender')}>
                  <option value="female">{genderLabel('female', isAr)}</option>
                  <option value="male">{genderLabel('male', isAr)}</option>
                  <option value="unknown">{genderLabel('unknown', isAr)}</option>
                </select>
              </label>
              <label className="text-sm space-y-1">
                <span>{t('portal.herd.color')}</span>
                <Input value={profile.color} onChange={field(profile, setProfile)('color')} />
              </label>
              <label className="text-sm space-y-1">
                <span>{t('portal.herd.breed')}</span>
                <Input value={profile.breed} onChange={field(profile, setProfile)('breed')} />
              </label>
              <label className="text-sm space-y-1">
                <span>{t('portal.herd.birthDate')}</span>
                <Input type="date" value={profile.birth_date} onChange={field(profile, setProfile)('birth_date')} />
              </label>
              <label className="text-sm space-y-1">
                <span>{t('portal.herd.weight')}</span>
                <Input type="number" step="0.1" min="0" value={profile.weight} onChange={field(profile, setProfile)('weight')} />
              </label>
              <label className="text-sm space-y-1">
                <span>{t('portal.herd.registration')}</span>
                <Input value={profile.registration_number} onChange={field(profile, setProfile)('registration_number')} />
              </label>
              <label className="text-sm space-y-1">
                <span>{t('portal.herd.sireInHerd')}</span>
                <select className="h-10 w-full rounded-xl border border-input bg-background px-3" value={profile.sire_id} onChange={field(profile, setProfile)('sire_id')}>
                  <option value="">{t('portal.herd.none')}</option>
                  {(pack.sires || []).filter((s) => s.id !== animal.id).map((s) => (
                    <option key={s.id} value={s.id}>{s.name_tag || s.animal_code}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm space-y-1">
                <span>{t('portal.herd.sireName')}</span>
                <Input value={profile.sire_name} onChange={field(profile, setProfile)('sire_name')} placeholder={t('portal.herd.externalSire')} />
              </label>
              <label className="text-sm space-y-1">
                <span>{t('portal.herd.damInHerd')}</span>
                <select className="h-10 w-full rounded-xl border border-input bg-background px-3" value={profile.dam_id} onChange={field(profile, setProfile)('dam_id')}>
                  <option value="">{t('portal.herd.none')}</option>
                  {(pack.dams || []).filter((s) => s.id !== animal.id).map((s) => (
                    <option key={s.id} value={s.id}>{s.name_tag || s.animal_code}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm space-y-1">
                <span>{t('portal.herd.damName')}</span>
                <Input value={profile.dam_name} onChange={field(profile, setProfile)('dam_name')} />
              </label>
              <div className="sm:col-span-2 flex justify-end">
                <Button type="submit" disabled={saving}>{t('portal.herd.save')}</Button>
              </div>
            </form>
          )}

          {tab === 'health' && (
            <div className="space-y-6">
              <form onSubmit={(e) => addNote(e, 'health')} className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-2xl border border-border">
                <h3 className="sm:col-span-2 font-semibold flex items-center gap-2"><Stethoscope size={16} /> {t('portal.herd.healthTitle')}</h3>
                <label className="text-xs space-y-1">
                  <span>{t('portal.herd.addedOn')}</span>
                  <Input type="date" required value={healthForm.noted_at} onChange={field(healthForm, setHealthForm)('noted_at')} />
                </label>
                <div className="sm:col-span-2">
                  <textarea
                    required
                    rows={3}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                    placeholder={t('portal.herd.healthPlaceholder')}
                    value={healthForm.body}
                    onChange={field(healthForm, setHealthForm)('body')}
                  />
                </div>
                <div className="sm:col-span-2 flex justify-end">
                  <Button type="submit" disabled={saving}>{t('portal.herd.addHealth')}</Button>
                </div>
              </form>
              {(pack.health_notes || []).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">{t('portal.herd.noHealth')}</p>
              )}
              {(pack.health_notes || []).map((n) => (
                <Card key={n.id}>
                  <CardContent className="p-4 flex justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm whitespace-pre-wrap break-words">{n.body}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t('portal.herd.addedOn')}: {formatHerdDate(n.noted_at, isAr)}
                        {n.created_at ? ` · ${formatHerdDateTime(n.created_at, isAr)}` : ''}
                      </p>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => removeRow('note', n.id)}><Trash2 size={16} /></Button>
                  </CardContent>
                </Card>
              ))}

              <form onSubmit={(e) => addNote(e, 'extra')} className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-2xl border border-border">
                <h3 className="sm:col-span-2 font-semibold flex items-center gap-2"><StickyNote size={16} /> {t('portal.herd.extraTitle')}</h3>
                <div className="sm:col-span-2">
                  <textarea
                    required
                    rows={3}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                    placeholder={t('portal.herd.extraPlaceholder')}
                    value={extraForm.body}
                    onChange={field(extraForm, setExtraForm)('body')}
                  />
                </div>
                <div className="sm:col-span-2 flex justify-end">
                  <Button type="submit" disabled={saving}>{t('portal.herd.addExtra')}</Button>
                </div>
              </form>
              {(pack.extra_notes || []).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">{t('portal.herd.noExtra')}</p>
              )}
              {(pack.extra_notes || []).map((n) => (
                <Card key={n.id}>
                  <CardContent className="p-4 flex justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm whitespace-pre-wrap break-words">{n.body}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t('portal.herd.addedOn')}: {formatHerdDateTime(n.created_at || n.noted_at, isAr)}
                      </p>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => removeRow('note', n.id)}><Trash2 size={16} /></Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {tab === 'vaccinations' && (
            <div className="space-y-4">
              <form onSubmit={addVacc} className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-2xl border border-border">
                <h3 className="sm:col-span-2 font-semibold flex items-center gap-2"><Syringe size={16} /> {t('portal.herd.addVaccination')}</h3>
                <Input required placeholder={t('portal.herd.vaccineName')} value={vaccForm.vaccine_name} onChange={field(vaccForm, setVaccForm)('vaccine_name')} />
                <Input placeholder={t('portal.herd.batch')} value={vaccForm.batch_number} onChange={field(vaccForm, setVaccForm)('batch_number')} />
                <label className="text-xs space-y-1">
                  <span>{t('portal.herd.dateGiven')}</span>
                  <Input type="date" required value={vaccForm.administered_at} onChange={field(vaccForm, setVaccForm)('administered_at')} />
                </label>
                <label className="text-xs space-y-1">
                  <span>{t('portal.herd.nextDue')}</span>
                  <Input type="date" value={vaccForm.next_due_at} onChange={field(vaccForm, setVaccForm)('next_due_at')} />
                </label>
                <Input placeholder={t('portal.herd.givenBy')} value={vaccForm.administered_by} onChange={field(vaccForm, setVaccForm)('administered_by')} />
                <Input placeholder={t('portal.herd.notes')} value={vaccForm.notes} onChange={field(vaccForm, setVaccForm)('notes')} />
                <div className="sm:col-span-2 flex justify-end">
                  <Button type="submit" disabled={saving}>{t('portal.herd.save')}</Button>
                </div>
              </form>
              {(pack.vaccinations || []).map((v) => {
                const st = dueStatus(v.next_due_at);
                return (
                  <Card key={v.id}>
                    <CardContent className="p-4 flex justify-between gap-3">
                      <div>
                        <p className="font-medium">{v.vaccine_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatHerdDate(v.administered_at, isAr)}
                          {v.next_due_at ? ` · ${t('portal.herd.nextDue')}: ${formatHerdDate(v.next_due_at, isAr)}` : ''}
                        </p>
                        {st === 'overdue' && <p className="text-xs text-red-600">{t('portal.herd.overdue')}</p>}
                        {st === 'due' && <p className="text-xs text-amber-700">{t('portal.herd.dueSoon')}</p>}
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => removeRow('vacc', v.id)}><Trash2 size={16} /></Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {tab === 'breeding' && (
            <div className="space-y-4">
              <form onSubmit={addBreed} className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-2xl border border-border">
                <h3 className="sm:col-span-2 font-semibold flex items-center gap-2"><Heart size={16} /> {t('portal.herd.addBreeding')}</h3>
                <label className="text-xs space-y-1">
                  <span>{t('portal.herd.eventDate')}</span>
                  <Input type="date" required value={breedForm.event_date} onChange={field(breedForm, setBreedForm)('event_date')} />
                </label>
                <label className="text-xs space-y-1">
                  <span>{t('portal.herd.eventType')}</span>
                  <select className="h-10 w-full rounded-xl border border-input bg-background px-3" value={breedForm.event_type} onChange={field(breedForm, setBreedForm)('event_type')}>
                    <option value="natural">{t('portal.herd.typeNatural')}</option>
                    <option value="ai">{t('portal.herd.typeAi')}</option>
                    <option value="embryo">{t('portal.herd.typeEmbryo')}</option>
                  </select>
                </label>
                <label className="text-xs space-y-1">
                  <span>{t('portal.herd.sireInHerd')}</span>
                  <select className="h-10 w-full rounded-xl border border-input bg-background px-3" value={breedForm.sire_id} onChange={field(breedForm, setBreedForm)('sire_id')}>
                    <option value="">{t('portal.herd.none')}</option>
                    {(pack.sires || []).map((s) => (
                      <option key={s.id} value={s.id}>{s.name_tag || s.animal_code}</option>
                    ))}
                  </select>
                </label>
                <Input placeholder={t('portal.herd.sireName')} value={breedForm.sire_name} onChange={field(breedForm, setBreedForm)('sire_name')} />
                <label className="text-xs space-y-1">
                  <span>{t('portal.herd.outcome')}</span>
                  <select className="h-10 w-full rounded-xl border border-input bg-background px-3" value={breedForm.outcome} onChange={field(breedForm, setBreedForm)('outcome')}>
                    <option value="pending">{t('portal.herd.outcomePending')}</option>
                    <option value="pregnant">{t('portal.herd.outcomePregnant')}</option>
                    <option value="not_pregnant">{t('portal.herd.outcomeNotPregnant')}</option>
                    <option value="aborted">{t('portal.herd.outcomeAborted')}</option>
                    <option value="born">{t('portal.herd.outcomeBorn')}</option>
                  </select>
                </label>
                <label className="text-xs space-y-1">
                  <span>{t('portal.herd.expectedOn')}</span>
                  <Input type="date" value={breedForm.expected_birth_date} onChange={field(breedForm, setBreedForm)('expected_birth_date')} />
                </label>
                {pack.gestation_days ? (
                  <p className="sm:col-span-2 text-xs text-muted-foreground">{t('portal.herd.gestationHint', { days: pack.gestation_days })}</p>
                ) : null}
                <Input className="sm:col-span-2" placeholder={t('portal.herd.notes')} value={breedForm.notes} onChange={field(breedForm, setBreedForm)('notes')} />
                <div className="sm:col-span-2 flex justify-end">
                  <Button type="submit" disabled={saving}>{t('portal.herd.save')}</Button>
                </div>
              </form>
              {(pack.breeding || []).map((b) => (
                <Card key={b.id}>
                  <CardContent className="p-4 flex justify-between gap-3">
                    <div>
                      <p className="font-medium">{t(`portal.herd.type.${b.event_type}`, { defaultValue: b.event_type })} · {formatHerdDate(b.event_date, isAr)}</p>
                      <p className="text-xs text-muted-foreground">
                        {t('portal.herd.sire')}: {b.sire_display || '—'}
                        {b.expected_birth_date ? ` · ${t('portal.herd.expectedOn')}: ${formatHerdDate(b.expected_birth_date, isAr)}` : ''}
                      </p>
                      <p className="text-xs">{t(`portal.herd.outcome_${b.outcome}`, { defaultValue: b.outcome })}</p>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => removeRow('breed', b.id)}><Trash2 size={16} /></Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {tab === 'births' && (
            <div className="space-y-4">
              <form onSubmit={addBirth} className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-2xl border border-border">
                <h3 className="sm:col-span-2 font-semibold flex items-center gap-2"><Baby size={16} /> {t('portal.herd.addBirth')}</h3>
                <label className="text-xs space-y-1">
                  <span>{t('portal.herd.birthDate')}</span>
                  <Input type="date" required value={birthForm.birth_date} onChange={field(birthForm, setBirthForm)('birth_date')} />
                </label>
                <Input placeholder={t('portal.herd.offspringName')} value={birthForm.offspring_name} onChange={field(birthForm, setBirthForm)('offspring_name')} />
                <label className="text-xs space-y-1">
                  <span>{t('portal.herd.sireInHerd')}</span>
                  <select className="h-10 w-full rounded-xl border border-input bg-background px-3" value={birthForm.father_id} onChange={field(birthForm, setBirthForm)('father_id')}>
                    <option value="">{t('portal.herd.none')}</option>
                    {(pack.sires || []).map((s) => (
                      <option key={s.id} value={s.id}>{s.name_tag || s.animal_code}</option>
                    ))}
                  </select>
                </label>
                <Input placeholder={t('portal.herd.sireName')} value={birthForm.father_name} onChange={field(birthForm, setBirthForm)('father_name')} />
                <label className="text-xs space-y-1">
                  <span>{t('portal.gender')}</span>
                  <select className="h-10 w-full rounded-xl border border-input bg-background px-3" value={birthForm.gender} onChange={field(birthForm, setBirthForm)('gender')}>
                    <option value="unknown">{genderLabel('unknown', isAr)}</option>
                    <option value="female">{genderLabel('female', isAr)}</option>
                    <option value="male">{genderLabel('male', isAr)}</option>
                  </select>
                </label>
                <Input type="number" step="0.1" min="0" placeholder={t('portal.herd.birthWeight')} value={birthForm.birth_weight} onChange={field(birthForm, setBirthForm)('birth_weight')} />
                <label className="sm:col-span-2 flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={birthForm.register_offspring} onChange={field(birthForm, setBirthForm)('register_offspring')} />
                  {t('portal.herd.registerOffspring')}
                </label>
                <Input className="sm:col-span-2" placeholder={t('portal.herd.notes')} value={birthForm.notes} onChange={field(birthForm, setBirthForm)('notes')} />
                <div className="sm:col-span-2 flex justify-end">
                  <Button type="submit" disabled={saving}>{t('portal.herd.save')}</Button>
                </div>
              </form>
              {(pack.births || []).map((b) => (
                <Card key={b.id}>
                  <CardContent className="p-4 flex justify-between gap-3">
                    <div>
                      <p className="font-medium">{b.offspring_display || t('portal.herd.offspring')} · {formatHerdDate(b.birth_date, isAr)}</p>
                      <p className="text-xs text-muted-foreground">
                        {t('portal.herd.sire')}: {b.father_display || '—'}
                        {b.gender ? ` · ${genderLabel(b.gender, isAr)}` : ''}
                        {b.birth_weight ? ` · ${b.birth_weight}` : ''}
                      </p>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => removeRow('birth', b.id)}><Trash2 size={16} /></Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </PortalLayout>
  );
}
