<script setup lang="ts">
import { onMounted, reactive, ref, computed, watch, nextTick, onBeforeUnmount } from 'vue';
import { useRoute } from 'vue-router';
import { useSession } from '../composables/session.js';

type Person = {
  id_personne: number; nom: string; prenom: string; email: string;
};

type Demande = {
  id_demande: number;
  id_personne: number;
  date_depot: string;
  statut: 'soumise'|'en_etude'|'approuvee'|'refusee'|'expiree'|'annulee';
  type_logement: string | null;
  jardin: 0|1|null;
  accord_proprio: 0|1|null;
  enfants: 0|1|null;
  autres_animaux: string | null;
  experience_animaux: string | null;
  preferences: string | null;
  commentaire: string | null;
  nom: string; prenom: string; email: string;
  nb_animaux: number;
};

type Animal = {
  id_animal: number;
  nom_usuel: string|null;
  espece_libelle: string;
  sexe: string;
  comportement_ok_chiens: 0 | 1 | null;
  comportement_ok_chats: 0 | 1 | null;
  comportement_ok_enfants: 0 | 1 | null;
  comportement_score: number | null;
  comportement_commentaire: string | null;
  comportement_date_note: string | null;
};
type Reservation = {
  id_reservation: number;
  id_animal: number;
  id_demande: number;
  date_debut: string;
  date_fin: string | null;
  statut: 'active'|'expiree'|'annulee'|'convertie';
  motif: string | null;
  animal_nom: string;
  animal_statut: string;
  personne_nom: string;
  personne_prenom: string;
};

type AdoptionRecord = {
  id_adoption: number;
  numero_contrat: string;
  id_animal: number;
  id_personne: number;
  date_contrat: string;
  frais_total: number;
  statut: 'brouillon'|'finalisee'|'annulee'|'retour';
  conditions_particulieres: string | null;
  animal_nom: string;
  personne_nom: string;
  personne_prenom: string;
  total_paye: number;
  retour_id: number | null;
  retour_date: string | null;
  retour_suite: AdoptionReturn['suite'] | null;
  retour_motif: string | null;
  retour_commentaires: string | null;
};

type Payment = {
  id_paiement: number;
  id_adoption: number;
  date_paiement: string;
  montant: number;
  mode: 'especes'|'carte'|'virement';
  reference: string | null;
};

type AdoptionReturn = {
  id_retour: number;
  id_adoption: number;
  date_retour: string;
  motif: string | null;
  suite: 'repropose'|'transfert'|'decede'|'autre'|null;
  commentaires: string | null;
};

const people = ref<Person[]>([]);
const demandes = ref<Demande[]>([]);
const adoptables = ref<Animal[]>([]);
const reservations = ref<Reservation[]>([]);
const adoptions = ref<AdoptionRecord[]>([]);
const paymentsByAdoption = ref<Record<number, Payment[]>>({});
const returnsByAdoption = ref<Record<number, AdoptionReturn | null>>({});
const route = useRoute();
const highlightedAdoptionId = ref<number | null>(null);
const pendingAdoptionScroll = ref<number | null>(null);
let adoptionHighlightTimer: number | null = null;

const createForm = reactive({
  id_personne: null as number | null,
  type_logement: '',
  jardin: 0 as 0 | 1,
  accord_proprio: 0 as 0 | 1,
  enfants: 0 as 0 | 1,
  autres_animaux: '',
  experience_animaux: '',
  preferences: '',
  commentaire: ''
});

const reservationForm = reactive({
  id_demande: null as number | null,
  id_animal: null as number | null,
  date_debut: '',
  date_fin: '',
  statut: 'active' as Reservation['statut'],
  motif: ''
});

const reservationUpdates = reactive<Record<number, { statut: Reservation['statut']; date_fin: string; motif: string }>>({});

const adoptionForm = reactive({
  id_animal: null as number | null,
  id_personne: null as number | null,
  numero_contrat: '',
  date_contrat: '',
  frais_total: '',
  statut: 'brouillon' as AdoptionRecord['statut'],
  conditions_particulieres: ''
});

const reservationStatuses: Reservation['statut'][] = ['active','expiree','annulee','convertie'];
const adoptionStatuses: AdoptionRecord['statut'][] = ['brouillon','finalisee','annulee','retour'];
const paymentModes: Payment['mode'][] = ['especes','carte','virement'];

const paymentForm = reactive({
  montant: '',
  mode: 'especes' as Payment['mode'],
  date_paiement: '',
  reference: ''
});

const filters = reactive({
  statut: 'all' as 'all' | Demande['statut'],
  jardin: 'all' as 'all' | '1' | '0',
  accord: 'all' as 'all' | '1' | '0',
  enfants: 'all' as 'all' | '1' | '0'
});
const demandeStatusOptions: Demande['statut'][] = ['soumise','en_etude','approuvee','refusee','expiree','annulee'];

const returnForm = reactive({
  date_retour: '',
  motif: '',
  suite: 'autre' as AdoptionReturn['suite'],
  commentaires: ''
});
const editingReturnId = ref<number|null>(null);

// session / authorization helper
const { state: sessionState, init: sessionInit } = useSession();
const canCreate = computed(() => !!sessionState.user && ['admin', 'agent'].includes(sessionState.user.role));
const canDeleteAdoption = computed(() => !!sessionState.user && sessionState.user.role === 'admin');

const editingId = ref<number|null>(null);
const edit = reactive<Partial<Demande>>({});
const animalsByDemande = ref<Record<number, Animal[]>>({});
const ui = reactive({ loading:false, error:'' });
const returnError = ref('');
const openAdoptionId = ref<number|null>(null);
const editingReservationId = ref<number|null>(null);
const demandeFilter = ref('');
const adoptableFilter = ref('');
const stats = computed(() => {
  const totalDemandes = demandes.value.length;
  const pendingDemandes = demandes.value.filter(d => ['soumise', 'en_etude'].includes(d.statut)).length;
  const totalAdoptables = adoptables.value.length;
  const totalReservations = reservations.value.length;
  const activeReservations = reservations.value.filter(r => r.statut === 'active').length;
  const totalAdoptions = adoptions.value.length;
  const returns = adoptions.value.filter(ad => ad.retour_id).length;
  return {
    totalDemandes,
    pendingDemandes,
    totalAdoptables,
    totalReservations,
    activeReservations,
    totalAdoptions,
    returns
  };
});
const hasActiveFilters = computed(() => {
  return !!(
    demandeFilter.value.trim() ||
    adoptableFilter.value.trim() ||
    filters.statut !== 'all' ||
    filters.jardin !== 'all' ||
    filters.accord !== 'all' ||
    filters.enfants !== 'all'
  );
});

function parseIdParam(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const raw = Array.isArray(value) ? value[0] : value;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

async function focusAdoption(id: number | null) {
  if (!id) return;
  pendingAdoptionScroll.value = id;
  if (openAdoptionId.value !== id) {
    await openAdoptionDetails(id);
  } else {
    await Promise.all([
      loadPaymentsForAdoption(id),
      loadReturnForAdoption(id)
    ]);
  }
  scrollToAdoption(id);
  startAdoptionHighlight(id);
}

function scrollToAdoption(id: number) {
  nextTick(() => {
    const el = document.querySelector<HTMLElement>(`[data-adoption-id="${id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.classList.add('pulse');
      setTimeout(() => el.classList.remove('pulse'), 1200);
    }
  });
}

function startAdoptionHighlight(id: number) {
  highlightedAdoptionId.value = id;
  if (adoptionHighlightTimer !== null) window.clearTimeout(adoptionHighlightTimer);
  adoptionHighlightTimer = window.setTimeout(() => {
    highlightedAdoptionId.value = null;
    adoptionHighlightTimer = null;
  }, 8000);
}

const filteredDemandes = computed(() => {
  const termRaw = demandeFilter.value.trim();
  const tokens = termRaw.split(/\s+/).map(normalizeText).filter(Boolean);
  return demandes.value.filter((d) => {
    const haystack = [
      `#${d.id_demande}`,
      d.nom,
      d.prenom,
      d.email,
      d.statut,
      d.type_logement,
      d.autres_animaux,
      d.experience_animaux,
      d.preferences,
      d.commentaire
    ].map(normalizeText).join(' ');
    const matchesText = tokens.length ? tokens.every(token => haystack.includes(token)) : true;
    const matchesStatut = filters.statut === 'all' || d.statut === filters.statut;
    const matchesJardin = filters.jardin === 'all' || String(Number(d.jardin ?? 0)) === filters.jardin;
    const matchesAccord = filters.accord === 'all' || String(Number(d.accord_proprio ?? 0)) === filters.accord;
    const matchesEnfants = filters.enfants === 'all' || String(Number(d.enfants ?? 0)) === filters.enfants;
    return matchesText && matchesStatut && matchesJardin && matchesAccord && matchesEnfants;
  });
});
const filteredAdoptables = computed(() => {
  const termRaw = adoptableFilter.value.trim();
  const today = toDateInput(new Date());
  const term = normalizeText(termRaw);
  return adoptables.value.filter((a) => {
    const reserved = reservations.value.some(r => r.id_animal === a.id_animal && r.statut === 'active' && (!r.date_fin || r.date_fin >= today));
    if (reserved) return false;
    if (!term) return true;
    const haystack = [
      `#${a.id_animal}`,
      a.nom_usuel ?? '',
      a.espece_libelle ?? '',
      a.sexe ?? ''
    ].map(normalizeText).join(' ');
    return haystack.includes(term);
  });
});

function toDateInput(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) {
    const tzOffset = value.getTimezoneOffset();
    const adjusted = new Date(value.getTime() - tzOffset * 60_000);
    return `${adjusted.getFullYear()}-${String(adjusted.getMonth() + 1).padStart(2, '0')}-${String(adjusted.getDate()).padStart(2, '0')}`;
  }
  return '';
}

function formatDateDisplay(value: unknown): string {
  const v = toDateInput(value);
  return v || '—';
}
function compatLabel(value: 0 | 1 | null): string {
  if (value === 1) return 'OK';
  if (value === 0) return 'Non';
  return 'Inconnu';
}
function compatClass(value: 0 | 1 | null): string {
  if (value === 1) return 'ok';
  if (value === 0) return 'ko';
  return 'unknown';
}
function behaviourSummary(animal: Animal) {
  return [
    { key: 'Chiens', value: animal.comportement_ok_chiens },
    { key: 'Chats', value: animal.comportement_ok_chats },
    { key: 'Enfants', value: animal.comportement_ok_enfants },
  ] as const;
}
function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  const normalized = typeof str.normalize === 'function' ? str.normalize('NFD') : str;
  return normalized.replace(/[\u0300-\u036f]/g, '').toLowerCase();
}


function resetReturnForm() {
  returnForm.date_retour = '';
  returnForm.motif = '';
  returnForm.suite = 'autre' as AdoptionReturn['suite'];
  returnForm.commentaires = '';
}

function resetFilters() {
  demandeFilter.value = '';
  adoptableFilter.value = '';
  filters.statut = 'all';
  filters.jardin = 'all';
  filters.accord = 'all';
  filters.enfants = 'all';
}

// Map des <details> par id_demande pour pouvoir les ouvrir au clic sur "Voir"
const detailRefs = ref<Record<number, HTMLDetailsElement | null>>({});
const setDetailRef = (id: number) => (...args: any[]) => {
  const el = args[0] as Element | null | undefined;
  if (el && el instanceof HTMLDetailsElement) {
    detailRefs.value[id] = el;
  } else {
    detailRefs.value[id] = null;
  }
};

async function onVoir(id_demande: number) {
  // Charge les animaux, puis ouvre la section correspondante et scroll jusqu'à elle
  await loadAnimalsForDemande(id_demande);
  const el = detailRefs.value[id_demande] as HTMLDetailsElement | null | undefined;
  if (el) {
    el.open = true;
    // petite temporisation pour que le layout s'applique avant le scroll
    requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
}

onMounted(async () => {
  ui.error = '';
  // Ensure session is initialized so we know the current user/role
  try {
    await useSession().init();
  } catch (e) {
    // ignore
  }
  try {
    await loadPeople();
    await loadAdoptables();
    await refresh();
    await Promise.all([loadReservations(), loadAdoptables()]);
    await loadAdoptions();
  } catch (e:any) {
    ui.error = 'Erreur de chargement : ' + (e?.message || e);
    console.error('[Adoption mounted]', e);
  }
});

watch(
  () => route.query.adoptionId,
  (value) => {
    const id = parseIdParam(value);
    if (id) void focusAdoption(id);
  },
  { immediate: true }
);

async function safeInvoke(channel: string, payload?: any) {
  try {
    return await (window as any).api.invoke(channel, payload);
  } catch (e:any) {
    ui.error = `IPC ${channel} a échoué : ` + (e?.message || e);
    console.error(`[IPC ${channel}]`, e);
    throw e;
  }
}

async function loadPeople() {
  const res = await safeInvoke('people:list');
  people.value = (res?.rows ?? []).map((p: any) => ({
    id_personne: p.id_personne, nom: p.nom, prenom: p.prenom, email: p.email
  }));
}
async function loadAdoptables() {
  const res = await safeInvoke('adoption:adoptables');
  adoptables.value = (res?.rows ?? []).map((row: any) => ({
    id_animal: Number(row.id_animal),
    nom_usuel: row.nom_usuel ?? null,
    espece_libelle: row.espece_libelle ?? '',
    sexe: row.sexe ?? 'Inconnu',
    comportement_ok_chiens: row.comportement_ok_chiens === null || row.comportement_ok_chiens === undefined
      ? null : Number(row.comportement_ok_chiens) as 0 | 1,
    comportement_ok_chats: row.comportement_ok_chats === null || row.comportement_ok_chats === undefined
      ? null : Number(row.comportement_ok_chats) as 0 | 1,
    comportement_ok_enfants: row.comportement_ok_enfants === null || row.comportement_ok_enfants === undefined
      ? null : Number(row.comportement_ok_enfants) as 0 | 1,
    comportement_score: row.comportement_score === null || row.comportement_score === undefined
      ? null : Number(row.comportement_score),
    comportement_commentaire: row.comportement_commentaire ?? null,
    comportement_date_note: toDateInput(row.comportement_date_note)
  })) as Animal[];
}
async function refresh() {
  const res = await safeInvoke('adoption:demandes:list');
  demandes.value = res?.rows ?? [];
}

async function loadReservations() {
  const res = await safeInvoke('adoption:reservations:list');
  reservations.value = (res?.rows ?? []).map((row: any) => ({
    ...row,
    date_debut: toDateInput(row.date_debut),
    date_fin: toDateInput(row.date_fin)
  }));
  editingReservationId.value = null;
  for (const key of Object.keys(reservationUpdates)) delete reservationUpdates[Number(key)];
  for (const r of reservations.value) {
    reservationUpdates[r.id_reservation] = {
      statut: r.statut,
      date_fin: toDateInput(r.date_fin),
      motif: r.motif || ''
    };
  }
}

async function loadAdoptions() {
  const res = await safeInvoke('adoption:records:list');
  const rows = res?.rows ?? [];

  const adoptionList: AdoptionRecord[] = [];
  const returnsMap: Record<number, AdoptionReturn | null> = {};

  for (const row of rows) {
    const id_adoption = Number(row.id_adoption);
    const retour: AdoptionReturn | null = row.retour_id ? {
      id_retour: Number(row.retour_id),
      id_adoption,
      date_retour: toDateInput(row.retour_date),
      motif: row.retour_motif ?? null,
      suite: (row.retour_suite ?? 'autre') as AdoptionReturn['suite'],
      commentaires: row.retour_commentaires ?? null
    } : null;

    adoptionList.push({
      id_adoption,
      numero_contrat: row.numero_contrat ?? '',
      id_animal: Number(row.id_animal),
      id_personne: Number(row.id_personne),
      date_contrat: toDateInput(row.date_contrat),
      frais_total: Number(row.frais_total ?? 0),
      statut: row.statut ?? 'brouillon',
      conditions_particulieres: row.conditions_particulieres ?? null,
      animal_nom: row.animal_nom ?? '',
      personne_nom: row.personne_nom ?? '',
      personne_prenom: row.personne_prenom ?? '',
      total_paye: Number(row.total_paye ?? 0),
      retour_id: retour?.id_retour ?? null,
      retour_date: retour?.date_retour ?? null,
      retour_suite: retour?.suite ?? null,
      retour_motif: retour?.motif ?? null,
      retour_commentaires: retour?.commentaires ?? null
    });

    returnsMap[id_adoption] = retour;
  }

  adoptions.value = adoptionList;
  returnsByAdoption.value = returnsMap;
  if (editingReturnId.value && !returnsMap[editingReturnId.value]) {
    resetReturnForm();
  }
  if (pendingAdoptionScroll.value) {
    const target = pendingAdoptionScroll.value;
    pendingAdoptionScroll.value = null;
    if (target) scrollToAdoption(target);
  }
}

async function createDemande() {
  ui.error = '';
  if (!createForm.id_personne) { alert('Choisis une personne'); return; }
  const payload = {
    id_personne: Number(createForm.id_personne),
    type_logement: createForm.type_logement || null,
    jardin: createForm.jardin === 1 ? 1 : 0,
    accord_proprio: createForm.accord_proprio === 1 ? 1 : 0,
    enfants: createForm.enfants === 1 ? 1 : 0,
    autres_animaux: createForm.autres_animaux || null,
    experience_animaux: createForm.experience_animaux || null,
    preferences: createForm.preferences || null,
    commentaire: createForm.commentaire || null
  };
  const res = await safeInvoke('adoption:demandes:create', payload);
  if (res?.id_demande) {
    Object.assign(createForm, {
      id_personne: null, type_logement: '', jardin: 0, accord_proprio: 0, enfants: 0,
      autres_animaux: '', experience_animaux: '', preferences: '', commentaire: ''
    });
    await refresh();
  }
}

function startEdit(d: Demande) {
  editingId.value = d.id_demande;
  Object.assign(edit, {
    id_demande: d.id_demande,
    statut: d.statut,
    type_logement: d.type_logement ?? '',
    jardin: d.jardin ?? 0,
    accord_proprio: d.accord_proprio ?? 0,
    enfants: d.enfants ?? 0,
    autres_animaux: d.autres_animaux ?? '',
    experience_animaux: d.experience_animaux ?? '',
    preferences: d.preferences ?? '',
    commentaire: d.commentaire ?? ''
  });
}
function cancelEdit() {
  editingId.value = null;
  for (const k of Object.keys(edit)) delete (edit as any)[k];
}

async function saveEdit() {
  if (!editingId.value) return;
  const payload = {
    id_demande: editingId.value,
    statut: edit.statut,
    type_logement: (edit.type_logement || '').toString() || null,
      jardin: (Number(edit.jardin) === 1) ? 1 : 0,
      accord_proprio: (Number(edit.accord_proprio) === 1) ? 1 : 0,
      enfants: (Number(edit.enfants) === 1) ? 1 : 0,
    autres_animaux: (edit.autres_animaux || '').toString() || null,
    experience_animaux: (edit.experience_animaux || '').toString() || null,
    preferences: (edit.preferences || '').toString() || null,
    commentaire: (edit.commentaire || '').toString() || null
  };
  const res = await safeInvoke('adoption:demandes:update', payload);
  if (res?.ok) { await refresh(); cancelEdit(); }
}

async function removeDemande(id: number) {
  if (!confirm('Supprimer cette demande ?')) return;
  const res = await safeInvoke('adoption:demandes:delete', id);
  if (res?.ok) { await refresh(); }
}

async function loadAnimalsForDemande(id_demande: number) {
  const res = await safeInvoke('adoption:demandes:animals', id_demande);
  const rows: Animal[] = (res?.rows ?? []).map((row: any) => ({
    id_animal: Number(row.id_animal),
    nom_usuel: row.nom_usuel ?? null,
    espece_libelle: row.espece_libelle ?? '',
    sexe: row.sexe ?? 'Inconnu',
    comportement_ok_chiens: row.comportement_ok_chiens === null || row.comportement_ok_chiens === undefined
      ? null : Number(row.comportement_ok_chiens) as 0 | 1,
    comportement_ok_chats: row.comportement_ok_chats === null || row.comportement_ok_chats === undefined
      ? null : Number(row.comportement_ok_chats) as 0 | 1,
    comportement_ok_enfants: row.comportement_ok_enfants === null || row.comportement_ok_enfants === undefined
      ? null : Number(row.comportement_ok_enfants) as 0 | 1,
    comportement_score: row.comportement_score === null || row.comportement_score === undefined
      ? null : Number(row.comportement_score),
    comportement_commentaire: row.comportement_commentaire ?? null,
    comportement_date_note: toDateInput(row.comportement_date_note)
  }));

  animalsByDemande.value = { ...animalsByDemande.value, [id_demande]: rows };

  // 🔁 met à jour le compteur local tout de suite (feedback instantané)
  const idx = demandes.value.findIndex(d => Number(d.id_demande) === Number(id_demande));
  if (idx !== -1) {
    demandes.value[idx] = { ...demandes.value[idx], nb_animaux: rows.length };
  }
}

async function addAnimal(id_demande: number, id_animal: number) {
  ui.error = '';
  try {
    const res = await safeInvoke('adoption:demandes:addAnimal', { id_demande, id_animal });
    // If success, update local lists immediately for instant UI feedback
    if (res?.ok) {
      // find the animal in adoptables
      const a = adoptables.value.find(x => Number(x.id_animal) === Number(id_animal));
      if (a) {
        const arr = animalsByDemande.value[id_demande] ?? [];
        // avoid duplicates
        if (!arr.find(x => x.id_animal === a.id_animal)) {
          arr.unshift(a);
          animalsByDemande.value = { ...animalsByDemande.value, [id_demande]: arr };
        }
      }
      // update demandes badge immediately
      const idx = demandes.value.findIndex(d => d.id_demande === id_demande);
      if (idx !== -1) demandes.value[idx].nb_animaux = (animalsByDemande.value[id_demande] || []).length;

      // open the details if present
      const el = detailRefs.value[id_demande];
      if (el) {
        el.open = true;
        requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      }
    }
    // refresh server state in background
    await Promise.all([loadAnimalsForDemande(id_demande), refresh()]);
  } catch (e:any) {
    ui.error = e?.message || String(e);
    console.error('[addAnimal] error', e);
  }
}

async function removeAnimal(id_demande: number, id_animal: number) {
  ui.error = '';
  try {
    const res = await safeInvoke('adoption:demandes:removeAnimal', { id_demande, id_animal });
    if (res?.ok) {
      const arr = (animalsByDemande.value[id_demande] || []).filter(x => x.id_animal !== id_animal);
      animalsByDemande.value = { ...animalsByDemande.value, [id_demande]: arr };
      const idx = demandes.value.findIndex(d => d.id_demande === id_demande);
      if (idx !== -1) demandes.value[idx].nb_animaux = arr.length;
    }
    await Promise.all([loadAnimalsForDemande(id_demande), refresh()]);
  } catch (e:any) {
    ui.error = e?.message || String(e);
    console.error('[removeAnimal] error', e);
  }
}

async function createReservation() {
  ui.error = '';
  if (!reservationForm.id_demande || !reservationForm.id_animal || !reservationForm.date_debut) {
    ui.error = 'Demande, animal et date de début requis';
    return;
  }
  const payload = {
    id_demande: Number(reservationForm.id_demande),
    id_animal: Number(reservationForm.id_animal),
    date_debut: reservationForm.date_debut,
    date_fin: reservationForm.date_fin || null,
    statut: reservationForm.statut,
    motif: reservationForm.motif || null,
  };
  const res = await safeInvoke('adoption:reservations:create', payload);
  if (res?.id_reservation) {
    Object.assign(reservationForm, {
      id_demande: null, id_animal: null, date_debut: '', date_fin: '',
      statut: 'active', motif: ''
    });
    await loadReservations();
  }
}

async function updateReservation(reservation: Reservation, updates: Partial<Reservation>) {
  const payload = {
    id_reservation: reservation.id_reservation,
    ...(updates.statut ? { statut: updates.statut } : {}),
    ...(updates.date_fin !== undefined ? { date_fin: updates.date_fin ? updates.date_fin : null } : {}),
    ...(updates.motif !== undefined ? { motif: updates.motif ? updates.motif : null } : {}),
  };
  const res = await safeInvoke('adoption:reservations:update', payload);
  if (res?.ok) {
    await Promise.all([loadReservations(), loadAdoptables()]);
    editingReservationId.value = null;
  }
}

function startReservationEdit(r: Reservation) {
  editingReservationId.value = r.id_reservation;
  if (!reservationUpdates[r.id_reservation]) {
    reservationUpdates[r.id_reservation] = {
      statut: r.statut,
      date_fin: toDateInput(r.date_fin),
      motif: r.motif || ''
    };
  }
}

function cancelReservationEdit(r: Reservation) {
  reservationUpdates[r.id_reservation] = {
    statut: r.statut,
    date_fin: toDateInput(r.date_fin),
    motif: r.motif || ''
  };
  editingReservationId.value = null;
}

async function createAdoptionRecord() {
  ui.error = '';
  if (!adoptionForm.id_animal || !adoptionForm.id_personne || !adoptionForm.date_contrat) {
    ui.error = 'Animal, personne et date de contrat requis';
    return;
  }
  const payload = {
    id_animal: Number(adoptionForm.id_animal),
    id_personne: Number(adoptionForm.id_personne),
    date_contrat: adoptionForm.date_contrat,
    numero_contrat: adoptionForm.numero_contrat || null,
    frais_total: Number.isFinite(Number(adoptionForm.frais_total)) ? Number(adoptionForm.frais_total) : 0,
    statut: adoptionForm.statut,
    conditions_particulieres: adoptionForm.conditions_particulieres || null,
  };
  ui.loading = true;
  try {
    const res = await safeInvoke('adoption:records:create', payload);
    if (res?.id_adoption) {
      ui.error = '';
      Object.assign(adoptionForm, {
        id_animal: null,
        id_personne: null,
        numero_contrat: '',
        date_contrat: '',
        frais_total: '',
        statut: 'brouillon',
        conditions_particulieres: ''
      });
      await Promise.all([loadAdoptions(), loadAdoptables(), loadReservations()]);
    } else if (res?.message) {
      ui.error = res.message;
    }
  } finally {
    ui.loading = false;
  }
}

async function updateAdoptionRecord(record: AdoptionRecord, updates: Partial<AdoptionRecord>) {
  const payload: any = { id_adoption: record.id_adoption };
  if (updates.numero_contrat !== undefined) payload.numero_contrat = (updates.numero_contrat || '').toString().trim() || null;
  if (updates.date_contrat !== undefined) payload.date_contrat = updates.date_contrat || null;
  if (updates.frais_total !== undefined) {
    const ft = Number(updates.frais_total);
    payload.frais_total = Number.isFinite(ft) ? ft : 0;
  }
  if (updates.statut !== undefined) payload.statut = updates.statut;
  if (updates.conditions_particulieres !== undefined) payload.conditions_particulieres = (updates.conditions_particulieres ?? '').toString() || null;
  const res = await safeInvoke('adoption:records:update', payload);
  if (res?.ok) {
    await Promise.all([loadAdoptions(), loadAdoptables()]);
  }
}

async function deleteAdoptionRecord(id_adoption: number) {
  if (!canDeleteAdoption.value) return;
  if (!confirm('Supprimer ce contrat d’adoption ?')) return;
  const res = await safeInvoke('adoption:records:delete', id_adoption);
  if (res?.ok) {
    const paymentsCopy = { ...paymentsByAdoption.value };
    delete paymentsCopy[id_adoption];
    paymentsByAdoption.value = paymentsCopy;
    const returnsCopy = { ...returnsByAdoption.value };
    delete returnsCopy[id_adoption];
    returnsByAdoption.value = returnsCopy;
    if (openAdoptionId.value === id_adoption) openAdoptionId.value = null;
    await Promise.all([loadAdoptions(), loadAdoptables()]);
  }
}

onBeforeUnmount(() => {
  if (adoptionHighlightTimer) clearTimeout(adoptionHighlightTimer);
});

async function openAdoptionDetails(id_adoption: number) {
  if (openAdoptionId.value === id_adoption) {
    openAdoptionId.value = null;
    editingReturnId.value = null;
    returnError.value = '';
    resetReturnForm();
    return;
  }
  openAdoptionId.value = id_adoption;
  pendingAdoptionScroll.value = id_adoption;
  scrollToAdoption(id_adoption);
  startAdoptionHighlight(id_adoption);
  paymentForm.montant = '';
  paymentForm.mode = 'especes';
  paymentForm.date_paiement = '';
  paymentForm.reference = '';
  resetReturnForm();
  returnError.value = '';
  editingReturnId.value = returnsByAdoption.value[id_adoption] ? null : id_adoption;
  await Promise.all([
    loadPaymentsForAdoption(id_adoption),
    loadReturnForAdoption(id_adoption)
  ]);
}

async function loadPaymentsForAdoption(id_adoption: number) {
  const res = await safeInvoke('adoption:payments:list', id_adoption);
  paymentsByAdoption.value = {
    ...paymentsByAdoption.value,
    [id_adoption]: (res?.rows ?? []).map((p: any) => ({
      id_paiement: Number(p.id_paiement),
      id_adoption: Number(p.id_adoption),
      date_paiement: toDateInput(p.date_paiement),
      montant: Number(p.montant ?? 0),
      mode: (p.mode ?? 'especes') as Payment['mode'],
      reference: p.reference ?? null
    }) as Payment)
  };
}

async function addPayment(id_adoption: number) {
  ui.error = '';
  const rawMontant = typeof paymentForm.montant === 'string'
    ? paymentForm.montant.replace(/\s+/g, '').replace(',', '.')
    : paymentForm.montant;
  const montant = Number(rawMontant);
  if (!Number.isFinite(montant) || montant <= 0) {
    ui.error = 'Montant de paiement invalide';
    return;
  }
  const payload = {
    id_adoption,
    montant,
    mode: paymentForm.mode,
    date_paiement: paymentForm.date_paiement || undefined,
    reference: paymentForm.reference || null
  };
  const res = await safeInvoke('adoption:payments:add', payload);
  if (res?.id_paiement) {
    paymentForm.montant = '';
    paymentForm.date_paiement = '';
    paymentForm.reference = '';
    await Promise.all([loadPaymentsForAdoption(id_adoption), loadAdoptions()]);
  }
}

async function loadReturnForAdoption(id_adoption: number) {
  const res = await safeInvoke('adoption:returns:get', id_adoption);
  const retour = res?.retour ? {
    id_retour: Number(res.retour.id_retour),
    id_adoption: Number(res.retour.id_adoption),
    date_retour: toDateInput(res.retour.date_retour),
    motif: res.retour.motif ?? null,
    suite: (res.retour.suite ?? 'autre') as AdoptionReturn['suite'],
    commentaires: res.retour.commentaires ?? null
  } as AdoptionReturn : null;

  returnsByAdoption.value = {
    ...returnsByAdoption.value,
    [id_adoption]: retour
  };

  if (!retour) {
    editingReturnId.value = id_adoption;
    resetReturnForm();
  } else {
    if (editingReturnId.value === id_adoption) {
      returnForm.date_retour = retour.date_retour;
      returnForm.motif = retour.motif ?? '';
      returnForm.suite = retour.suite;
      returnForm.commentaires = retour.commentaires ?? '';
    } else {
      editingReturnId.value = null;
      resetReturnForm();
    }
  }
}

async function recordReturn(id_adoption: number) {
  returnError.value = '';
  if (!returnForm.date_retour) {
    returnError.value = 'Date de retour requise';
    return;
  }
  const payload = {
    id_adoption,
    date_retour: returnForm.date_retour,
    motif: returnForm.motif || null,
    suite: returnForm.suite,
    commentaires: returnForm.commentaires || null
  };
  const res = await safeInvoke('adoption:returns:record', payload);
  if (res?.id_retour || res?.ok) {
    returnError.value = '';
    editingReturnId.value = null;
    await Promise.all([loadReturnForAdoption(id_adoption), loadAdoptions()]);
    resetReturnForm();
  }
}

function startReturnEdit(id_adoption: number) {
  returnError.value = '';
  editingReturnId.value = id_adoption;
  const retour = returnsByAdoption.value[id_adoption];
  if (retour) {
    returnForm.date_retour = retour.date_retour || '';
    returnForm.motif = retour.motif || '';
    returnForm.suite = (retour.suite ?? 'autre') as AdoptionReturn['suite'];
    returnForm.commentaires = retour.commentaires || '';
  } else {
    resetReturnForm();
  }
}

function cancelReturnEdit(id_adoption: number) {
  returnError.value = '';
  const retour = returnsByAdoption.value[id_adoption];
  if (retour) {
    editingReturnId.value = null;
    resetReturnForm();
  } else {
    editingReturnId.value = id_adoption;
  }
}

</script>

<template>
  <div class="page page-scroll">
    <div class="adoption-page">
    <div v-if="ui.error" class="banner error">{{ ui.error }}</div>

    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-label">Demandes</div>
        <div class="metric-value">{{ stats.totalDemandes }}</div>
        <div class="metric-meta">{{ stats.pendingDemandes }} en cours</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Animaux adoptables</div>
        <div class="metric-value">{{ stats.totalAdoptables }}</div>
        <div class="metric-meta">
          <template v-if="adoptableFilter">
            {{ filteredAdoptables.length }} correspondent
          </template>
          <template v-else>
            Liste complète
          </template>
        </div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Réservations</div>
        <div class="metric-value">{{ stats.totalReservations }}</div>
        <div class="metric-meta">{{ stats.activeReservations }} actives</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Adoptions</div>
        <div class="metric-value">{{ stats.totalAdoptions }}</div>
        <div class="metric-meta">{{ stats.returns }} retours enregistrés</div>
      </div>
    </div>

    <!-- Création demande -->
    <div class="card">
      <h2>Nouvelle demande d’adoption</h2>
      <div class="grid three adoption-grid">
        <div class="field">
          <label>Personne</label>
          <select v-model="createForm.id_personne">
            <option :value="null" disabled>— Choisir une personne —</option>
            <option v-for="p in people" :key="p.id_personne" :value="p.id_personne">
              {{ p.nom }} {{ p.prenom }} — {{ p.email }}
            </option>
          </select>
        </div>
        <div class="field"><label>Type logement</label><input v-model="createForm.type_logement" placeholder="Maison, appart..." /></div>
        <div class="field">
          <label>Jardin</label>
          <select v-model.number="createForm.jardin">
            <option :value="0">Non</option>
            <option :value="1">Oui</option>
          </select>
        </div>
        <div class="field"><label>Accord propriétaire</label><select v-model.number="createForm.accord_proprio"><option :value="0">Non</option><option :value="1">Oui</option></select></div>
        <div class="field"><label>Enfants</label><select v-model.number="createForm.enfants"><option :value="0">Non</option><option :value="1">Oui</option></select></div>
        <div class="field field-span"><label>Autres animaux</label><input v-model="createForm.autres_animaux" /></div>
        <div class="field field-span"><label>Expérience animaux</label><textarea v-model="createForm.experience_animaux"></textarea></div>
        <div class="field field-span"><label>Préférences</label><textarea v-model="createForm.preferences"></textarea></div>
        <div class="field field-span"><label>Commentaire</label><textarea v-model="createForm.commentaire"></textarea></div>
      </div>
      <div class="actions">
        <button class="btn" @click="createDemande">Créer la demande</button>
      </div>
    </div>

    <!-- Liste demandes -->
    <div class="card">
      <h2>Demandes</h2>
      <div v-if="demandes.length === 0" class="empty">Aucune demande.</div>
      <template v-else>
        <div class="card-toolbar">
          <input class="input" type="search" v-model="demandeFilter" placeholder="Rechercher une demande (nom, email, statut…)" aria-label="Rechercher une demande" />
          <select class="input select-filter" v-model="filters.statut">
            <option value="all">Statut (tous)</option>
            <option v-for="s in demandeStatusOptions" :key="'filter-statut-'+s" :value="s">{{ s }}</option>
          </select>
          <select class="input select-filter" v-model="filters.jardin">
            <option value="all">Jardin (tous)</option>
            <option value="1">Oui</option>
            <option value="0">Non</option>
          </select>
          <select class="input select-filter" v-model="filters.accord">
            <option value="all">Accord proprio (tous)</option>
            <option value="1">Oui</option>
            <option value="0">Non</option>
          </select>
          <select class="input select-filter" v-model="filters.enfants">
            <option value="all">Enfants (tous)</option>
            <option value="1">Oui</option>
            <option value="0">Non</option>
          </select>
          
          <button v-if="hasActiveFilters" class="btn ghost" type="button" @click="resetFilters">Réinitialiser</button>
          <span class="muted">{{ filteredDemandes.length }} / {{ demandes.length }} demandes visibles</span>
        </div>
        <div v-if="!filteredDemandes.length" class="empty">Aucune demande ne correspond à la recherche.</div>
        <div v-else class="table-wrapper">
          <table class="table">
            <thead>
              <tr>
                <th>#</th><th>Personne</th><th>Statut</th><th>Logement</th>
                <th>Jardin</th><th>Accord proprio</th><th>Enfants</th><th>Animaux</th>
                <th style="width:260px;">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="d in filteredDemandes" :key="d.id_demande">
                <template v-if="editingId === d.id_demande">
                  <td>{{ d.id_demande }}</td>
                  <td class="strong">{{ d.nom }} {{ d.prenom }}</td>
                  <td>
                    <select v-model="(edit as any).statut">
                      <option value="soumise">Soumise</option>
                      <option value="en_etude">En étude</option>
                      <option value="approuvee">Approuvée</option>
                      <option value="refusee">Refusée</option>
                      <option value="expiree">Expirée</option>
                      <option value="annulee">Annulée</option>
                    </select>
                  </td>
                  <td><input v-model="(edit as any).type_logement" /></td>
                  <td>
                    <select v-model.number="(edit as any).jardin">
                      <option :value="0">Non</option><option :value="1">Oui</option>
                    </select>
                  </td>
                  <td>
                    <select v-model.number="(edit as any).accord_proprio">
                      <option :value="0">Non</option><option :value="1">Oui</option>
                    </select>
                  </td>
                  <td>
                    <select v-model.number="(edit as any).enfants">
                      <option :value="1">Oui</option><option :value="0">Non</option>
                    </select>
                  </td>
                  <td>{{ d.nb_animaux }}</td>
                  <td class="actions-right">
                    <button class="btn" @click="saveEdit">Sauver</button>
                    <button class="btn ghost" @click="cancelEdit">Annuler</button>
                  </td>
                </template>

                <template v-else>
                  <td>{{ d.id_demande }}</td>
                  <td class="strong">
                    {{ d.nom }} {{ d.prenom }}
                    <div class="muted">{{ d.email }}</div>
                  </td>
                  <td><span class="tag neutral">{{ d.statut }}</span></td>
                  <td>{{ d.type_logement || '—' }}</td>
                  <td>{{ d.jardin ? 'Oui' : 'Non' }}</td>
                  <td>{{ d.accord_proprio ? 'Oui' : 'Non' }}</td>
                  <td>{{ d.enfants ? 'Oui' : 'Non' }}</td>
                  <td>
                    <button type="button" class="btn secondary" @click.stop.prevent="onVoir(d.id_demande)">Voir ({{ d.nb_animaux }})</button>
                  </td>
                  <td class="actions-right">
                    <button class="btn ghost" @click="startEdit(d)">Modifier</button>
                    <button class="btn danger" @click="removeDemande(d.id_demande)">Supprimer</button>
                  </td>
                </template>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>

    <!-- Lien animaux par demande -->
    <div class="card">
      <h2>Demandes</h2>
      <p class="muted">Choisis d’abord une demande via le bouton “Voir (n)”.</p>
      <div class="muted" v-if="filteredDemandes.length && adoptableFilter">
        {{ filteredAdoptables.length }} animaux adoptables correspondent au filtre.
      </div>

      <div v-if="!filteredDemandes.length" class="empty">Aucune demande disponible avec ce filtre.</div>

      <div v-for="d in filteredDemandes" :key="'link-'+d.id_demande" class="link-block">
        <details :ref="setDetailRef(d.id_demande)" @toggle="(e:any)=>{ if(e.target.open) loadAnimalsForDemande(d.id_demande) }">
          <summary>Demande #{{ d.id_demande }} — {{ d.nom }} {{ d.prenom }} ({{ d.nb_animaux }} animaux)</summary>

          <div class="link-grid">
            <div class="field">
              <label>Ajouter un animal</label>
              <select @change="(ev:any)=>{ const id=Number(ev.target.value); if(id) addAnimal(d.id_demande, id); ev.target.value=''; }">
                <option :value="''" selected>— Choisir un adoptable —</option>
                <option v-for="a in filteredAdoptables" :key="a.id_animal" :value="a.id_animal">
                  #{{ a.id_animal }} — {{ a.nom_usuel || 'Sans nom' }} ({{ a.espece_libelle }} / {{ a.sexe }})
                  · Chiens: {{ compatLabel(a.comportement_ok_chiens) }}
                  · Chats: {{ compatLabel(a.comportement_ok_chats) }}
                  · Enfants: {{ compatLabel(a.comportement_ok_enfants) }}
                </option>
              </select>
            </div>
          </div>

          <div class="table-wrapper small">
            <table class="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Nom</th>
                  <th>Espèce</th>
                  <th>Sexe</th>
                  <th>Profil</th>
                  <th style="width:140px;">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="a in (animalsByDemande[d.id_demande] || [])" :key="a.id_animal">
                  <td>{{ a.id_animal }}</td>
                  <td>{{ a.nom_usuel || '—' }}</td>
                  <td>{{ a.espece_libelle }}</td>
                  <td>{{ a.sexe }}</td>
                  <td>
                    <div class="compat-summary">
                      <span
                        v-for="entry in behaviourSummary(a)"
                        :key="entry.key"
                        class="chip-compat"
                        :class="compatClass(entry.value)"
                      >
                        {{ entry.key }} <strong>{{ compatLabel(entry.value) }}</strong>
                      </span>
                    </div>
                    <div v-if="a.comportement_commentaire" class="muted small">
                      {{ a.comportement_commentaire }}
                    </div>
                  </td>
                  <td class="actions-right">
                    <button class="btn danger" @click="removeAnimal(d.id_demande, a.id_animal)">Retirer</button>
                  </td>
                </tr>
                <tr v-if="!(animalsByDemande[d.id_demande] || []).length">
                  <td colspan="6" class="muted">Aucun animal associé</td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </div>

    <!-- Réservations -->
    <div class="card">
      <h2>Réservations</h2>
      <div class="form-grid reservations-grid">
        <div class="field request-field">
          <label>Demande</label>
          <select v-model="reservationForm.id_demande">
            <option :value="null" disabled>— Choisir une demande —</option>
            <option v-for="d in demandes" :key="'res-dem-'+d.id_demande" :value="d.id_demande">
              #{{ d.id_demande }} — {{ d.nom }} {{ d.prenom }}
            </option>
          </select>
        </div>
        <div class="field date-field">
          <label>Animal</label>
          <select v-model="reservationForm.id_animal">
            <option :value="null" disabled>— Choisir un animal —</option>
            <option v-for="a in filteredAdoptables" :key="'res-an-'+a.id_animal" :value="a.id_animal">
              #{{ a.id_animal }} — {{ a.nom_usuel || 'Sans nom' }} ({{ a.espece_libelle }})
              · Chiens: {{ compatLabel(a.comportement_ok_chiens) }}
              · Chats: {{ compatLabel(a.comportement_ok_chats) }}
              · Enfants: {{ compatLabel(a.comportement_ok_enfants) }}
            </option>
          </select>
        </div>
        <div class="field">
          <label>Date début</label>
          <input type="date" v-model="reservationForm.date_debut" />
        </div>
        <div class="field">
          <label>Date fin</label>
          <input type="date" v-model="reservationForm.date_fin" />
        </div>
        <div class="field">
          <label>Statut</label>
          <select v-model="reservationForm.statut">
            <option v-for="s in reservationStatuses" :key="'stat-'+s" :value="s">{{ s }}</option>
          </select>
        </div>
        <div class="field field-span">
          <label>Motif</label>
          <input v-model="reservationForm.motif" placeholder="Motif (facultatif)" />
        </div>
      </div>
      <div class="actions">
        <button class="btn" @click="createReservation">Créer la réservation</button>
      </div>

      <div class="table-wrapper" v-if="reservations.length">
        <table class="table">
          <thead>
            <tr>
              <th>#</th><th>Animal</th><th>Personne</th><th>Dates</th><th>Statut</th><th>Motif</th><th style="width:180px;">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in reservations" :key="r.id_reservation">
              <td>{{ r.id_reservation }}</td>
              <td>{{ r.animal_nom }}<div class="muted">#{{ r.id_animal }} ({{ r.animal_statut }})</div></td>
              <td>{{ r.personne_nom }} {{ r.personne_prenom }}<div class="muted">Demande #{{ r.id_demande }}</div></td>
              <td>
                <div class="date-inline">
                  <span>Début :</span>
                  <span>{{ formatDateDisplay(r.date_debut) }}</span>
                </div>
                <div class="date-inline">
                  <span>Fin :</span>
                  <template v-if="editingReservationId === r.id_reservation">
                    <input class="date-input" type="date" v-model="reservationUpdates[r.id_reservation].date_fin" />
                  </template>
                  <span v-else>{{ formatDateDisplay(r.date_fin) }}</span>
                </div>
              </td>
              <td>
                <template v-if="editingReservationId === r.id_reservation">
                  <select v-model="reservationUpdates[r.id_reservation].statut">
                    <option v-for="s in reservationStatuses" :key="'upd-'+r.id_reservation+'-'+s" :value="s">{{ s }}</option>
                  </select>
                </template>
                <span v-else class="tag">{{ r.statut }}</span>
              </td>
              <td>
                <template v-if="editingReservationId === r.id_reservation">
                  <input v-model="reservationUpdates[r.id_reservation].motif" placeholder="Motif" />
                </template>
                <span v-else>{{ r.motif || '—' }}</span>
              </td>
              <td class="actions-right">
                <template v-if="editingReservationId === r.id_reservation">
                  <button class="btn" @click="updateReservation(r, reservationUpdates[r.id_reservation])">Mettre à jour</button>
                  <button class="btn ghost" @click="cancelReservationEdit(r)">Annuler</button>
                </template>
                <template v-else>
                  <button class="btn ghost" @click="startReservationEdit(r)">Modifier</button>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="empty">Aucune réservation.</div>
    </div>

    <!-- Adoptions -->
    <div class="card">
      <h2>Adoptions</h2>
      <div class="form-grid adoption-grid">
        <div class="field animal-field">
          <label>Animal</label>
          <select v-model="adoptionForm.id_animal">
            <option value="" disabled>— Choisir un animal —</option>
            <option v-for="a in filteredAdoptables" :key="'adopt-an-'+a.id_animal" :value="a.id_animal">
              #{{ a.id_animal }} — {{ a.nom_usuel || 'Sans nom' }} ({{ a.espece_libelle }})
              · Chiens: {{ compatLabel(a.comportement_ok_chiens) }}
              · Chats: {{ compatLabel(a.comportement_ok_chats) }}
              · Enfants: {{ compatLabel(a.comportement_ok_enfants) }}
            </option>
          </select>
        </div>
        <div class="field adopter-field">
          <label>Adoptant</label>
          <select v-model="adoptionForm.id_personne">
            <option value="" disabled>— Choisir une personne —</option>
            <option v-for="p in people" :key="'adopt-per-'+p.id_personne" :value="p.id_personne">
              {{ p.nom }} {{ p.prenom }} — {{ p.email }}
            </option>
          </select>
        </div>
        <div class="field date-field">
          <label>Date du contrat</label>
          <input type="date" v-model="adoptionForm.date_contrat" />
        </div>
        <div class="field contract-field">
          <label>Numéro de contrat</label>
          <input v-model="adoptionForm.numero_contrat" placeholder="Auto si vide" />
        </div>
        <div class="field fees-field">
          <label>Frais totaux (€)</label>
          <input v-model="adoptionForm.frais_total" type="number" min="0" step="0.01" />
        </div>
        <div class="field status-field">
          <label>Statut</label>
          <select v-model="adoptionForm.statut">
            <option v-for="s in adoptionStatuses" :key="'status-'+s" :value="s">{{ s }}</option>
          </select>
        </div>
        <div class="field field-span">
          <label>Conditions particulières</label>
          <textarea v-model="adoptionForm.conditions_particulieres" placeholder="Notes..."></textarea>
        </div>
      </div>
      <div class="actions">
        <button class="btn" @click="createAdoptionRecord" :disabled="ui.loading || !canCreate">{{ ui.loading ? 'Création...' : 'Créer l’adoption' }}</button>
      </div>

      <div v-if="ui.error" class="banner error" style="margin-top:12px">{{ ui.error }}</div>

      <div v-if="!canCreate" class="banner warning" style="margin-top:8px">Vous devez être connecté en tant qu'administrateur ou agent pour créer une adoption.</div>

      <div class="adoption-list" v-if="adoptions.length">
        <details
          v-for="ad in adoptions"
          :key="ad.id_adoption"
          :open="openAdoptionId === ad.id_adoption"
          :class="['adoption-item', { highlight: highlightedAdoptionId === ad.id_adoption }]"
          :data-adoption-id="ad.id_adoption"
        >
          <summary @click.prevent="openAdoptionDetails(ad.id_adoption)">
            <div class="summary-main">
              <div>
                Contrat {{ ad.numero_contrat }} — {{ ad.animal_nom }} → {{ ad.personne_nom }} {{ ad.personne_prenom }}
              </div>
              <div class="summary-sub">
                Date : {{ formatDateDisplay(ad.date_contrat) }} · Statut : <span class="tag">{{ ad.statut }}</span> · Payé : {{ ad.total_paye.toFixed(2) }} € / {{ ad.frais_total.toFixed(2) }} €
                <template v-if="ad.retour_suite">
                  · Retour : {{ ad.retour_suite }} ({{ formatDateDisplay(ad.retour_date) }})
                </template>
              </div>
            </div>
          </summary>

          <div class="adoption-body">
            <div class="grid two">
              <div class="field">
                <label>Statut</label>
                <select :value="ad.statut" @change="(ev:any)=>updateAdoptionRecord(ad,{ statut: ev.target.value as AdoptionRecord['statut'] })">
                  <option v-for="s in adoptionStatuses" :key="'upd-status-'+ad.id_adoption+'-'+s" :value="s">{{ s }}</option>
                </select>
              </div>
              <div class="field">
                <label>Date contrat</label>
                <input type="date" :value="ad.date_contrat" @change="(ev:any)=>updateAdoptionRecord(ad,{ date_contrat: ev.target.value })" />
              </div>
              <div class="field">
                <label>Numéro contrat</label>
                <input :value="ad.numero_contrat" @change="(ev:any)=>updateAdoptionRecord(ad,{ numero_contrat: ev.target.value })" />
              </div>
              <div class="field">
                <label>Frais total (€)</label>
                <input type="number" step="0.01" min="0" :value="ad.frais_total" @change="(ev:any)=>updateAdoptionRecord(ad,{ frais_total: ev.target.value })" />
              </div>
              <div class="field field-span">
                <label>Conditions particulières</label>
                <textarea :value="ad.conditions_particulieres || ''" @change="(ev:any)=>updateAdoptionRecord(ad,{ conditions_particulieres: ev.target.value })"></textarea>
              </div>
            </div>

            <div class="subcard">
              <h3>Paiements</h3>
              <div class="grid two">
                <div class="field">
                  <label>Date</label>
                  <input type="date" v-model="paymentForm.date_paiement" />
                </div>
                <div class="field">
                  <label>Montant (€)</label>
                  <input type="number" min="0" step="0.01" v-model="paymentForm.montant" />
                </div>
                <div class="field">
                  <label>Mode</label>
                  <select v-model="paymentForm.mode">
                    <option v-for="m in paymentModes" :key="'mode-'+m" :value="m">{{ m }}</option>
                  </select>
                </div>
                <div class="field">
                  <label>Référence</label>
                  <input v-model="paymentForm.reference" placeholder="Référence (optionnel)" />
                </div>
              </div>
              <div class="actions">
                <button class="btn" @click="addPayment(ad.id_adoption)">Ajouter un paiement</button>
              </div>
              <div class="table-wrapper small">
                <table class="table">
                  <thead>
                    <tr><th>Date</th><th>Montant</th><th>Mode</th><th>Référence</th></tr>
                  </thead>
                  <tbody>
                    <tr v-for="p in (paymentsByAdoption[ad.id_adoption] || [])" :key="p.id_paiement">
                      <td>{{ formatDateDisplay(p.date_paiement) }}</td>
                      <td>{{ p.montant.toFixed(2) }} €</td>
                      <td>{{ p.mode }}</td>
                      <td>{{ p.reference || '—' }}</td>
                    </tr>
                    <tr v-if="!(paymentsByAdoption[ad.id_adoption] || []).length"><td colspan="4" class="muted">Aucun paiement</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div class="subcard">
              <h3>Retour post-adoption</h3>
              <template v-if="editingReturnId === ad.id_adoption || !returnsByAdoption[ad.id_adoption]">
                <div class="grid two">
                  <div class="field">
                    <label>Date retour</label>
                    <input type="date" v-model="returnForm.date_retour" />
                  </div>
                  <div class="field">
                    <label>Motif</label>
                    <input v-model="returnForm.motif" placeholder="Motif" />
                  </div>
                  <div class="field">
                    <label>Suite</label>
                    <select v-model="returnForm.suite">
                      <option value="repropose">Reproposé</option>
                      <option value="transfert">Transfert</option>
                      <option value="decede">Décédé</option>
                      <option value="autre">Autre</option>
                    </select>
                  </div>
                  <div class="field field-span">
                    <label>Commentaires</label>
                    <textarea v-model="returnForm.commentaires"></textarea>
                  </div>
                </div>
                <div class="actions">
                  <button class="btn" @click="recordReturn(ad.id_adoption)">Enregistrer</button>
                  <span v-if="returnError" class="form-error">{{ returnError }}</span>
                  <button v-if="returnsByAdoption[ad.id_adoption]" class="btn ghost" @click="cancelReturnEdit(ad.id_adoption)">Annuler</button>
                </div>
              </template>
              <template v-else>
                <div class="return-info">
                  <div><strong>Date retour :</strong> {{ formatDateDisplay(returnsByAdoption[ad.id_adoption]?.date_retour) }}</div>
                  <div><strong>Suite :</strong> {{ returnsByAdoption[ad.id_adoption]?.suite }}</div>
                  <div><strong>Motif :</strong> {{ returnsByAdoption[ad.id_adoption]?.motif || '—' }}</div>
                  <div><strong>Commentaires :</strong>
                    <div>{{ returnsByAdoption[ad.id_adoption]?.commentaires || '—' }}</div>
                  </div>
                </div>
                <div class="actions">
                  <button class="btn" @click="startReturnEdit(ad.id_adoption)">Modifier</button>
                </div>
              </template>
            </div>
            <div class="actions" v-if="canDeleteAdoption">
              <button class="btn danger" @click="deleteAdoptionRecord(ad.id_adoption)">Supprimer ce contrat</button>
            </div>
          </div>
        </details>
      </div>
      <div v-else class="empty">Aucune adoption.</div>
    </div>
    </div>
  </div>
</template>

<style scoped>
.adoption-page {
  display: grid;
  gap: 22px;
  padding: 24px;
  min-width: 1024px;
}
.metrics-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}
.metric-card {
  background: #fff;
  border: 1px solid #e0e6f3;
  border-radius: 18px;
  padding: 18px;
  box-shadow: 0 18px 32px -24px rgba(25, 39, 68, 0.45);
  display: grid;
  gap: 6px;
}
.metric-label {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #6b779b;
}
.metric-value {
  font-size: 30px;
  font-weight: 700;
  color: #1f2d4a;
}
.metric-meta {
  font-size: 13px;
  color: #727fa7;
}
.card {
  background: #ffffff;
  border: 1px solid #e3e8f3;
  border-radius: 20px;
  padding: 22px;
  box-shadow: 0 22px 36px -26px rgba(17, 28, 58, 0.55);
  display: grid;
  gap: 18px;
}
h2 {
  margin: 0;
  font-size: 22px;
  color: #1f2c4f;
}
.grid.two {
  display: grid;
  row-gap: 24px;
  column-gap: 48px;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}
.grid.three {
  display: grid;
  row-gap: 24px;
  column-gap: 56px;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
}
.field {
  display: grid;
  gap: 6px;
}
.field label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #65719b;
}
.field input,
.field select,
.field textarea,
.input {
  border: 1px solid #d2d9ec;
  border-radius: 12px;
  padding: 10px 12px;
  background: #fff;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.field textarea { min-height: 90px; resize: vertical; }
.field-span { grid-column: 1 / -1; }
.field input:focus,
.field select:focus,
.field textarea:focus,
.input:focus {
  border-color: #2f73ff;
  box-shadow: 0 0 0 3px rgba(47, 115, 255, 0.18);
  outline: none;
}
.checkbox label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #1f2f4f;
}
.form-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 24px 32px;
}
.form-grid .field {
  flex: 1 1 260px;
  max-width: 100%;
}
.form-grid .field.field-span {
  flex: 1 1 100%;
}
.form-grid .animal-field {
  flex: 0 1 340px;
}
.form-grid .adopter-field,
.form-grid .request-field {
  flex: 0 1 320px;
}
.form-grid .date-field {
  flex: 0 1 260px;
}
.form-grid .contract-field,
.form-grid .fees-field,
.form-grid .status-field {
  flex: 0 1 240px;
}
.actions,
.actions-right {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.btn {
  background: linear-gradient(135deg, #2f73ff, #5a8cff);
  color: #fff;
  border: none;
  padding: 10px 18px;
  border-radius: 13px;
  font-weight: 600;
  box-shadow: 0 16px 30px -22px rgba(47, 115, 255, 0.66);
  transition: transform 0.15s ease, box-shadow 0.2s ease;
}
.btn:hover { transform: translateY(-1px); }
.btn:active { transform: translateY(0); }
.btn.secondary {
  background: #eef3ff;
  color: #2f73ff;
  border: 1px solid #d0dcff;
  box-shadow: none;
}
.btn.ghost {
  background: transparent;
  color: #2f73ff;
  border: 1px solid #d0dcff;
}
.btn.danger {
  background: linear-gradient(135deg, #ff4b4b, #ff6a6a);
  box-shadow: 0 14px 28px -20px rgba(255, 75, 75, 0.64);
}
.table-wrapper {
  overflow: hidden;
  border: 1px solid #e5e9f6;
  border-radius: 16px;
}
.table-wrapper.small { margin-top: 12px; }
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
  color: #1f2f4f;
}
.table thead th {
  text-align: left;
  padding: 12px 14px;
  background: #f3f6ff;
  border-bottom: 1px solid #e2e8fb;
  font-weight: 600;
  color: #485578;
}
.table tbody td {
  padding: 12px 14px;
  border-bottom: 1px solid #eef1f9;
  vertical-align: top;
}
.table tbody tr:last-child td { border-bottom: none; }
.card-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
.card-toolbar .input {
  min-width: 220px;
}
.select-filter {
  min-width: 160px;
}
.link-block { margin-bottom: 12px; }
.link-grid { display: grid; gap: 12px; margin: 8px 0; }
.tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 999px;
  background: #eef3ff;
  border: 1px solid #d0dcff;
  color: #2f5ad9;
  font-size: 12px;
  font-weight: 600;
}
.tag.neutral {
  background: #f1f2f7;
  border-color: #d9deeb;
  color: #4c5675;
}
.muted { color: #7a83a5; font-size: 12px; }
.strong { font-weight: 600; color: #1a2643; }
.caps { text-transform: capitalize; }
.empty {
  padding: 16px;
  text-align: center;
  border-radius: 14px;
  background: #f5f7ff;
  border: 1px dashed #d1d9f0;
  color: #7983a6;
}
@media (max-width: 1100px) {
  .form-grid .animal-field,
  .form-grid .adopter-field,
  .form-grid .request-field {
    flex: 0 1 320px;
  }
}
@media (max-width: 720px) {
  .form-grid {
    gap: 18px;
  }
  .form-grid .field,
  .form-grid .field.field-span {
    flex: 1 1 100%;
  }
}
.banner.error {
  background: #ffe6e9;
  border: 1px solid #ffcbd4;
  color: #b42335;
  padding: 10px 14px;
  border-radius: 12px;
  font-weight: 600;
}
.form-error { align-self: center; color: #b42335; font-size: 12px; }
.return-info {
  display: grid;
  gap: 6px;
  padding: 12px;
  background: #eef2ff;
  border: 1px solid #d0dcff;
  border-radius: 12px;
}
.return-info strong { color: #1e3a8a; font-weight: 600; }
.date-inline { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #546088; }
.date-inline span:first-child { font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: #6b769f; }
.date-input { width: 140px; }
.adoption-list { display: grid; gap: 16px; margin-top: 16px; }
.adoption-item {
  border: 1px solid #e1e6f3;
  border-radius: 18px;
  background: #ffffff;
  overflow: hidden;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.adoption-item.highlight {
  border-color: #ffc776;
  box-shadow: 0 12px 28px -20px rgba(255, 183, 77, 0.8);
}
.adoption-item.pulse {
  animation: adoptionPulse 1.2s ease;
}
.adoption-item.highlight > summary {
  background: #fff7eb;
}
.adoption-item > summary {
  list-style: none;
  padding: 16px 18px;
  cursor: pointer;
  background: #f5f7ff;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.adoption-item[open] > summary {
  background: #fff;
  border-bottom: 1px solid #e1e6f3;
}
.adoption-item > summary::-webkit-details-marker { display: none; }
.summary-main { display: flex; flex-direction: column; gap: 4px; }
.summary-sub { font-size: 12px; color: #6d779d; }
.adoption-item[open] .summary-sub { color: #2b3456; }
.adoption-item.highlight .summary-sub { color: #2b3456; }
.adoption-item.highlight .summary-main div:first-child { font-weight: 600; }
@keyframes adoptionPulse {
  0% { box-shadow: 0 0 0 rgba(255, 193, 107, 0.6); }
  50% { box-shadow: 0 0 24px rgba(255, 193, 107, 0.9); }
  100% { box-shadow: 0 0 0 rgba(255, 193, 107, 0); }
}
.adoption-body { display: grid; gap: 16px; padding: 18px; }
.subcard {
  background: #f7f8ff;
  border: 1px solid #e0e6f6;
  border-radius: 14px;
  padding: 16px;
  display: grid;
  gap: 14px;
}
.subcard h3 { margin: 0; font-size: 16px; color: #1f2c4f; }
.compat-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.chip-compat {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 11px;
  text-transform: uppercase;
  border: 1px solid transparent;
  letter-spacing: 0.05em;
}
.chip-compat.ok {
  background: #e8f5e9;
  color: #256029;
  border-color: #b2d7b5;
}
.chip-compat.ko {
  background: #ffe7e7;
  color: #b71c1c;
  border-color: #f8bcbc;
}
.chip-compat.unknown {
  background: #f3f4fa;
  color: #5c6280;
  border-color: #d8ddef;
}
.muted.small {
  margin-top: 6px;
  font-size: 12px;
}
</style>
