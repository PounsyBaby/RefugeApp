<script setup lang="ts">
import { onMounted, reactive, ref, computed, watch, nextTick, onBeforeUnmount } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import MultiSelect from '../components/MultiSelect.vue';

type Espece = { id_espece:number; libelle:string };
type Race = { id_race:number; id_espece:number; libelle:string; espece_libelle:string };

type AnimalRow = {
  id_animal:number;
  nom_usuel:string|null;
  id_espece:number;
  espece_libelle:string;
  sexe:'M'|'F'|'Inconnu';
  date_naissance:string|null;
  date_arrivee:string|null;
  poids_kg:number|null;
  sterilise:0|1;
  description:string|null;
  statut:string;
  comportement_ok_chiens: 0 | 1 | null;
  comportement_ok_chats: 0 | 1 | null;
  comportement_ok_enfants: 0 | 1 | null;
  comportement_score: number | null;
  comportement_commentaire: string | null;
  comportement_date_note: string | null;
};

type AnimalRaceRow = {
  id_race:number;
  pourcentage:number|null;
  race_libelle:string;
  id_espece:number;
  espece_libelle:string;
};

type Vet = {
  id_vet: number;
  nom_cabinet: string;
  contact: string | null;
  adresse: string | null;
};

type MedicalEvent = {
  id_evt: number;
  id_animal: number;
  type: string;
  sous_type: string | null;
  date_evt: string;
  date_validite: string | null;
  vet_id: number | null;
  vet_nom: string | null;
  vet_contact: string | null;
  vet_adresse: string | null;
  notes: string | null;
  days_until_due: number | null;
  is_expired: boolean;
};

type AdoptionRecord = {
  id_adoption: number;
  numero_contrat: string | null;
  id_animal: number;
  id_personne: number;
  date_contrat: string | null;
  frais_total: number | null;
  statut: string;
  conditions_particulieres: string | null;
  animal_nom: string | null;
  personne_nom: string | null;
  personne_prenom: string | null;
  personne_email: string | null;
  personne_tel: string | null;
  total_paye: number;
  retour_id: number | null;
  retour_date: string | null;
  retour_suite: string | null;
  retour_motif: string | null;
  retour_commentaires: string | null;
};

type AdoptedRow = {
  animal: AnimalRow;
  adoption: AdoptionRecord;
  adopterName: string;
  adoptionDate: string | null;
  amountDue: number | null;
  amountPaid: number;
  balance: number;
};

const ui = reactive({ loading:false, error:'' });

const animals = ref<AnimalRow[]>([]);
const species = ref<Espece[]>([]);
const races = ref<Race[]>([]);
const adoptionRecords = ref<AdoptionRecord[]>([]);

// ---- Création
const form = reactive({
  nom_usuel: '',
  id_espece: null as number | null,
  sexe: 'Inconnu' as 'M'|'F'|'Inconnu',
  date_naissance: '' as string | '',
  date_arrivee: '' as string | '',
  poids_kg: '' as any,
  sterilise: '0' as '0' | '1',
  description: '',
  statut: 'arrive'
});
const createSelectedRaceIds = ref<number[]>([]);
const createRacesOpen = ref(false);

// ---- Edition (un seul animal à la fois)
const editingId = ref<number|null>(null);
const edit = reactive<Partial<AnimalRow>>({});
const editSelectedRaceIds = ref<number[]>([]);
const editRacesOpen = ref(false);
const adoptionSearch = ref('');
const route = useRoute();
const highlightedAnimalId = ref<number | null>(null);
const pendingAnimalScroll = ref<number | null>(null);
let animalHighlightTimer: ReturnType<typeof setTimeout> | null = null;

const currencyFormatter = new Intl.NumberFormat('fr-BE', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function formatEuro(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return currencyFormatter.format(num);
}

const retourLabels: Record<string, string> = {
  repropose: 'Reproposé',
  transfert: 'Transféré',
  decede: 'Décédé',
  autre: 'Autre'
};

function formatRetourSuite(value: string | null): string {
  if (!value) return '';
  const key = value.toLowerCase();
  return retourLabels[key] ?? value;
}

function parseIdParam(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const raw = Array.isArray(value) ? value[0] : value;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

function focusAnimal(id: number | null) {
  if (!id) return;
  highlightedAnimalId.value = id;
  pendingAnimalScroll.value = id;
  adoptionSearch.value = '';
  if (animalHighlightTimer) clearTimeout(animalHighlightTimer);
  animalHighlightTimer = window.setTimeout(() => {
    highlightedAnimalId.value = null;
    animalHighlightTimer = null;
  }, 8000);
}

function scrollToAnimal(id: number) {
  nextTick(() => {
    const selectors = [`[data-animal-row="${id}"]`, `[data-adopted-row="${id}"]`];
    for (const selector of selectors) {
      const el = document.querySelector<HTMLElement>(selector);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('pulse');
        setTimeout(() => el.classList.remove('pulse'), 1200);
        break;
      }
    }
  });
}

// Races chargées par animal pour affichage dans la liste
const animalRaces = ref<Record<number, AnimalRaceRow[]>>({});
const vets = ref<Vet[]>([]);
const eventEdits = reactive<Record<number, { id_veterinaire: number | null; editing: boolean }>>({});
const savingEvents = reactive<Record<number, boolean>>({});

const medicalTypes = ['vaccin','vermifuge','test','chirurgie','consultation','traitement'];
const medical = reactive({
  selectedAnimal: null as AnimalRow | null,
  events: [] as MedicalEvent[],
  loading: false,
  form: {
    type: medicalTypes[0],
    sous_type: '',
    date_evt: '',
    date_validite: '',
    id_veterinaire: null as number | null,
    notes: ''
  }
});

type BehaviourNote = {
  id_note: number;
  id_animal: number;
  date_note: string;
  ok_chiens: 0 | 1 | null;
  ok_chats: 0 | 1 | null;
  ok_enfants: 0 | 1 | null;
  score: number | null;
  commentaire: string | null;
  auteur: string;
};

const behaviour = reactive({
  selectedAnimal: null as AnimalRow | null,
  notes: [] as BehaviourNote[],
  loading: false,
  form: {
    date_note: '',
    ok_chiens: '' as '' | '1' | '0',
    ok_chats: '' as '' | '1' | '0',
    ok_enfants: '' as '' | '1' | '0',
    score: '' as string | '',
    commentaire: ''
  },
  editingId: null as number | null
});

function toDateInput(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      const tzOffset = parsed.getTimezoneOffset();
      const adjusted = new Date(parsed.getTime() - tzOffset * 60_000);
      return adjusted.toISOString().slice(0, 10);
    }
    return '';
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const tzOffset = value.getTimezoneOffset();
    const adjusted = new Date(value.getTime() - tzOffset * 60_000);
    return adjusted.toISOString().slice(0, 10);
  }
  return '';
}

// Filtrage des races par espèce
const racesBySpecies = computed(() => {
  const m = new Map<number, Race[]>();
  for (const r of races.value) {
    if (!m.has(r.id_espece)) m.set(r.id_espece, []);
    m.get(r.id_espece)!.push(r);
  }
  // trier par libellé pour joli affichage
  for (const arr of m.values()) arr.sort((a,b)=>a.libelle.localeCompare(b.libelle));
  return m;
});

const adoptionRecordsSorted = computed(() => {
  return [...adoptionRecords.value].sort((a, b) => {
    const da = a.date_contrat ? new Date(a.date_contrat).getTime() : 0;
    const db = b.date_contrat ? new Date(b.date_contrat).getTime() : 0;
    if (db !== da) return db - da;
    return b.id_adoption - a.id_adoption;
  });
});

const vetById = computed(() => {
  const map = new Map<number, Vet>();
  for (const vet of vets.value) {
    map.set(vet.id_vet, vet);
  }
  return map;
});

function isActiveAdoption(record: AdoptionRecord) {
  if (!record) return false;
  const suite = (record.retour_suite || '').toLowerCase();
  const hasRetour = Boolean(record.retour_date);
  if (suite === 'repropose') return false;
  if (record.statut === 'retour') return false;
  if (hasRetour) return false;
  return record.statut === 'finalisee';
}

const activeAdoptionByAnimal = computed(() => {
  const map = new Map<number, AdoptionRecord>();
  for (const record of adoptionRecordsSorted.value) {
    if (!isActiveAdoption(record)) continue;
    if (!map.has(record.id_animal)) {
      map.set(record.id_animal, record);
    }
  }
  return map;
});

const returnedAnimalIds = computed(() => {
  const set = new Set<number>();
  for (const record of adoptionRecords.value) {
    const suite = (record.retour_suite || '').toLowerCase();
    if (suite === 'repropose' || record.statut === 'retour') {
      set.add(record.id_animal);
    }
  }
  return set;
});

const availableAnimals = computed(() => {
  return animals.value.filter((a) => {
    if (a.statut !== 'adopte') return true;
    if (returnedAnimalIds.value.has(a.id_animal)) return true;
    return !activeAdoptionByAnimal.value.has(a.id_animal);
  });
});

const adoptedRows = computed<AdoptedRow[]>(() => {
  const rows: AdoptedRow[] = [];
  for (const animal of animals.value) {
    if (animal.statut !== 'adopte') continue;
    if (returnedAnimalIds.value.has(animal.id_animal)) continue;
    const adoption = activeAdoptionByAnimal.value.get(animal.id_animal);
    if (!adoption) continue;
    const adopterName = [adoption.personne_prenom, adoption.personne_nom].filter(Boolean).join(' ') || '—';
    const totalDue = adoption.frais_total === null || adoption.frais_total === undefined
      ? null
      : Number(adoption.frais_total);
    const amountPaid = Number(adoption.total_paye ?? 0);
    rows.push({
      animal,
      adoption,
      adopterName,
      adoptionDate: adoption.date_contrat || null,
      amountDue: totalDue,
      amountPaid,
      balance: totalDue === null ? null : Math.max(totalDue - amountPaid, 0)
    });
  }
  rows.sort((a, b) => {
    const da = a.adoptionDate ? new Date(a.adoptionDate).getTime() : 0;
    const db = b.adoptionDate ? new Date(b.adoptionDate).getTime() : 0;
    if (db !== da) return db - da;
    return b.adoption.id_adoption - a.adoption.id_adoption;
  });
  return rows;
});

const filteredAdoptedRows = computed(() => {
  const term = adoptionSearch.value.trim().toLowerCase();
  if (!term) return adoptedRows.value;
  const digits = term.replace(/\D+/g, '');

  return adoptedRows.value.filter((row) => {
    const adoption = row.adoption;
    const fields = [
      row.animal.nom_usuel,
      row.animal.espece_libelle,
      row.animal.description,
      row.adopterName,
      adoption.personne_nom,
      adoption.personne_prenom,
      adoption.personne_email,
      adoption.personne_tel,
      adoption.animal_nom,
      adoption.numero_contrat,
      adoption.retour_suite,
      row.adoptionDate
    ];

    if (fields.some((field) => {
      if (!field) return false;
      return field.toString().toLowerCase().includes(term);
    })) {
      return true;
    }

    if (digits) {
      const phoneDigits = (adoption.personne_tel || '').replace(/\D+/g, '');
      if (phoneDigits.includes(digits)) return true;
      if (String(row.animal.id_animal).includes(digits)) return true;
    } else if (String(row.animal.id_animal).toLowerCase().startsWith(term)) {
      return true;
    }

    return false;
  });
});

watch(() => form.id_espece, () => {
  createSelectedRaceIds.value = [];
});

function resetMedicalForm() {
  const today = toDateInput(new Date());
  Object.assign(medical.form, {
    type: medicalTypes[0],
    sous_type: '',
    date_evt: today,
    date_validite: '',
    id_veterinaire: null,
    notes: ''
  });
}

function medicalStatusLabel(evt: MedicalEvent): string {
  if (!evt.date_validite) return 'Sans validité';
  if (evt.is_expired) return 'A renouveler';
  if (evt.days_until_due === null) return 'Validité en cours';
  if (evt.days_until_due < 0) return 'A renouveler';
  if (evt.days_until_due === 0) return 'Aujourd\'hui';
  if (evt.days_until_due === 1) return 'Dans 1 jour';
  return `Dans ${evt.days_until_due} j`;
}

function medicalRowClass(evt: MedicalEvent) {
  if (evt.is_expired) return 'medical-row overdue';
  if (evt.days_until_due !== null && evt.days_until_due <= 7) return 'medical-row soon';
  return 'medical-row';
}

function resetBehaviourForm() {
  const today = toDateInput(new Date());
  Object.assign(behaviour.form, {
    date_note: today,
    ok_chiens: '',
    ok_chats: '',
    ok_enfants: '',
    score: '',
    commentaire: ''
  });
}

function populateBehaviourForm(note: BehaviourNote) {
  Object.assign(behaviour.form, {
    date_note: note.date_note || '',
    ok_chiens: note.ok_chiens === null ? '' : String(note.ok_chiens) as '0' | '1',
    ok_chats: note.ok_chats === null ? '' : String(note.ok_chats) as '0' | '1',
    ok_enfants: note.ok_enfants === null ? '' : String(note.ok_enfants) as '0' | '1',
    score: note.score === null || note.score === undefined ? '' : String(note.score),
    commentaire: note.commentaire || ''
  });
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

function behaviourSummary(animal: AnimalRow) {
  return [
    { key: 'chiens', value: animal.comportement_ok_chiens },
    { key: 'chats', value: animal.comportement_ok_chats },
    { key: 'enfants', value: animal.comportement_ok_enfants },
  ] as const;
}

function resetError() { ui.error = ''; }

async function safeInvoke(channel:string, payload?:any) {
  try {
    const res = await (window as any).api.invoke(channel, payload);
    if (res?.ok === false && res?.message) {
      ui.error = res.message;
    }
    return res;
  } catch (e:any) {
    ui.error = `IPC ${channel} a échoué : ` + (e?.message || e);
    console.error(`[IPC ${channel}]`, e);
    throw e;
  }
}

async function loadMedicalEvents(id_animal: number) {
  medical.loading = true;
  try {
    const res = await safeInvoke('medical:events:list', { id_animal });
    medical.events = (res?.rows ?? []).map((row: any) => ({
      id_evt: Number(row.id_evt),
      id_animal: Number(row.id_animal),
      type: row.type,
      sous_type: row.sous_type ?? null,
      date_evt: toDateInput(row.date_evt),
      date_validite: toDateInput(row.date_validite),
      vet_id: row.vet_id === null || row.vet_id === undefined ? null : Number(row.vet_id),
      vet_nom: row.vet_nom ?? null,
      vet_contact: row.vet_contact ?? null,
      vet_adresse: row.vet_adresse ?? null,
      notes: row.notes ?? null,
      days_until_due: row.days_until_due !== null && row.days_until_due !== undefined
        ? Number(row.days_until_due) : null,
      is_expired: row.is_expired === 1 || row.is_expired === true
    })) as MedicalEvent[];

    const present = new Set<number>();
    for (const evt of medical.events) {
      present.add(evt.id_evt);
      if (!eventEdits[evt.id_evt]) {
        eventEdits[evt.id_evt] = {
          id_veterinaire: evt.vet_id ?? null,
          editing: false
        };
      } else {
        eventEdits[evt.id_evt].id_veterinaire = evt.vet_id ?? null;
      }
    }
    for (const key of Object.keys(eventEdits)) {
      const id = Number(key);
      if (!present.has(id)) delete eventEdits[id];
    }
    for (const key of Object.keys(savingEvents)) {
      const id = Number(key);
      if (!present.has(id)) delete savingEvents[id];
    }

    if (!medical.form.date_evt) {
      medical.form.date_evt = toDateInput(new Date());
    }
  } finally {
    medical.loading = false;
  }
}

function startEventEdit(evt: MedicalEvent) {
  const entry = eventEdits[evt.id_evt] ?? (eventEdits[evt.id_evt] = {
    id_veterinaire: evt.vet_id ?? null,
    editing: false
  });
  entry.id_veterinaire = evt.vet_id ?? null;
  entry.editing = true;
}

function cancelEventEdit(evt: MedicalEvent) {
  const entry = eventEdits[evt.id_evt];
  if (!entry) return;
  entry.id_veterinaire = evt.vet_id ?? null;
  entry.editing = false;
}

function onEventVetSelect(evt: MedicalEvent, value: string) {
  const entry = eventEdits[evt.id_evt];
  if (!entry) return;
  if (!value) {
    entry.id_veterinaire = null;
    return;
  }
  const vetId = Number(value);
  if (!Number.isFinite(vetId)) return;
  entry.id_veterinaire = vetId;
}

function hasEventChanges(evt: MedicalEvent): boolean {
  const entry = eventEdits[evt.id_evt];
  if (!entry) return false;
  return entry.editing && (evt.vet_id ?? null) !== (entry.id_veterinaire ?? null);
}

async function saveEventChanges(evt: MedicalEvent) {
  if (!medical.selectedAnimal) return;
  const entry = eventEdits[evt.id_evt];
  if (!entry) return;
  savingEvents[evt.id_evt] = true;
  try {
    await safeInvoke('medical:events:update', {
      id_evt: evt.id_evt,
      id_veterinaire: entry.id_veterinaire ?? null
    });
    await loadMedicalEvents(medical.selectedAnimal.id_animal);
  } finally {
    delete savingEvents[evt.id_evt];
    const updated = eventEdits[evt.id_evt];
    if (updated) updated.editing = false;
  }
}

async function openMedical(a: AnimalRow) {
  resetError();
  resetMedicalForm();
  medical.selectedAnimal = a;
  await loadVets();
  await loadMedicalEvents(a.id_animal);
  const el = document.querySelector('.medical-card');
  if (el instanceof HTMLElement) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function closeMedical() {
  medical.selectedAnimal = null;
  medical.events = [];
  resetMedicalForm();
}

async function createMedicalEvent() {
  resetError();
  if (!medical.selectedAnimal) {
    ui.error = 'Choisis un animal dans la liste';
    return;
  }
  if (!medical.form.date_evt) {
    ui.error = 'Date de l\'acte requise';
    return;
  }
  const payload = {
    id_animal: medical.selectedAnimal.id_animal,
    type: medical.form.type,
    sous_type: medical.form.sous_type || null,
    date_evt: medical.form.date_evt,
    date_validite: medical.form.date_validite || null,
    id_veterinaire: medical.form.id_veterinaire || null,
    notes: medical.form.notes || null
  };
  const res = await safeInvoke('medical:events:create', payload);
  if (res?.id_evt) {
    resetMedicalForm();
    medical.form.type = payload.type;
    medical.form.id_veterinaire = payload.id_veterinaire;
    await loadMedicalEvents(medical.selectedAnimal.id_animal);
  }
}

async function removeMedicalEvent(eventId: number) {
  resetError();
  if (!medical.selectedAnimal) return;
  if (!confirm('Supprimer cet enregistrement médical ?')) return;
  const res = await safeInvoke('medical:events:delete', eventId);
  if (res?.ok) {
    await loadMedicalEvents(medical.selectedAnimal.id_animal);
  }
}

async function loadBehaviourNotes(id_animal: number) {
  behaviour.loading = true;
  try {
    const res = await safeInvoke('animal:behaviour:list', id_animal);
    behaviour.notes = (res?.rows ?? []).map((row: any) => ({
      id_note: Number(row.id_note),
      id_animal: Number(row.id_animal),
      date_note: toDateInput(row.date_note),
      ok_chiens: row.ok_chiens === null || row.ok_chiens === undefined ? null : Number(row.ok_chiens) as 0 | 1,
      ok_chats: row.ok_chats === null || row.ok_chats === undefined ? null : Number(row.ok_chats) as 0 | 1,
      ok_enfants: row.ok_enfants === null || row.ok_enfants === undefined ? null : Number(row.ok_enfants) as 0 | 1,
      score: row.score === null || row.score === undefined ? null : Number(row.score),
      commentaire: row.commentaire ?? null,
      auteur: [row.prenom, row.nom].filter(Boolean).join(' ') || row.nom || '—'
    })) as BehaviourNote[];
    if (!behaviour.form.date_note) {
      behaviour.form.date_note = toDateInput(new Date());
    }
  } finally {
    behaviour.loading = false;
  }
}

async function openBehaviour(a: AnimalRow) {
  resetError();
  resetBehaviourForm();
  behaviour.editingId = null;
  behaviour.selectedAnimal = a;
  await loadBehaviourNotes(a.id_animal);
  const el = document.querySelector('.behaviour-card');
  if (el instanceof HTMLElement) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function closeBehaviour() {
  behaviour.selectedAnimal = null;
  behaviour.notes = [];
  behaviour.editingId = null;
  resetBehaviourForm();
}

function startBehaviourEdit(note: BehaviourNote) {
  behaviour.editingId = note.id_note;
  populateBehaviourForm(note);
}

function cancelBehaviourEdit() {
  behaviour.editingId = null;
  resetBehaviourForm();
}

async function submitBehaviourNote() {
  resetError();
  if (!behaviour.selectedAnimal) {
    ui.error = 'Choisis un animal dans la liste';
    return;
  }
  const basePayload = {
    date_note: behaviour.form.date_note || null,
    ok_chiens: behaviour.form.ok_chiens === '' ? null : Number(behaviour.form.ok_chiens),
    ok_chats: behaviour.form.ok_chats === '' ? null : Number(behaviour.form.ok_chats),
    ok_enfants: behaviour.form.ok_enfants === '' ? null : Number(behaviour.form.ok_enfants),
    score: behaviour.form.score === '' ? null : Number(behaviour.form.score),
    commentaire: behaviour.form.commentaire || null
  };

  if (behaviour.editingId) {
    const res = await safeInvoke('animal:behaviour:update', {
      id_note: behaviour.editingId,
      ...basePayload
    });
    if (res?.ok) {
      behaviour.editingId = null;
      resetBehaviourForm();
      await Promise.all([
        loadBehaviourNotes(behaviour.selectedAnimal.id_animal),
        refresh()
      ]);
    }
    return;
  }

  const res = await safeInvoke('animal:behaviour:add', {
    id_animal: behaviour.selectedAnimal.id_animal,
    ...basePayload
  });
  if (res?.id_note) {
    resetBehaviourForm();
    await Promise.all([
      loadBehaviourNotes(behaviour.selectedAnimal.id_animal),
      refresh()
    ]);
  }
}

async function deleteBehaviourNote(note: BehaviourNote) {
  resetError();
  if (!behaviour.selectedAnimal) return;
  if (!confirm('Supprimer cette note de comportement ?')) return;
  const res = await safeInvoke('animal:behaviour:delete', note.id_note);
  if (res?.ok) {
    if (behaviour.editingId === note.id_note) {
      behaviour.editingId = null;
      resetBehaviourForm();
    }
    await Promise.all([
      loadBehaviourNotes(behaviour.selectedAnimal.id_animal),
      refresh()
    ]);
  }
}

onMounted(async () => {
  resetError();
  resetMedicalForm();
  resetBehaviourForm();
  await Promise.all([loadSpecies(), loadRaces(), loadVets()]);
  await refresh();
});

watch(
  () => route.query.animalId,
  (value) => {
    const id = parseIdParam(value);
    if (id) focusAnimal(id);
  },
  { immediate: true }
);

async function loadSpecies() {
  const res = await safeInvoke('species:list');
  species.value = res?.rows ?? [];
}

async function loadRaces() {
  const res = await safeInvoke('races:list');
  races.value = res?.rows ?? [];
}

async function loadVets() {
  const res = await safeInvoke('vets:list');
  vets.value = (res?.rows ?? []).map((row: any) => ({
    id_vet: Number(row.id_vet),
    nom_cabinet: row.nom_cabinet,
    contact: row.contact ?? null,
    adresse: row.adresse ?? null
  })) as Vet[];
}

async function refresh() {
  const res = await safeInvoke('animals:list');
  animals.value = res?.rows ?? [];

  const adoptionRes = await safeInvoke('adoption:records:list');
  adoptionRecords.value = (adoptionRes?.rows ?? []).map((row: any) => {
    const dateContrat = toDateInput(row.date_contrat);
    const retourDate = toDateInput(row.retour_date);
    return {
    id_adoption: Number(row.id_adoption),
    numero_contrat: row.numero_contrat ?? null,
    id_animal: Number(row.id_animal),
    id_personne: Number(row.id_personne),
    date_contrat: dateContrat || null,
    frais_total: row.frais_total === null || row.frais_total === undefined ? null : Number(row.frais_total),
    statut: row.statut ?? 'brouillon',
    conditions_particulieres: row.conditions_particulieres ?? null,
    animal_nom: row.animal_nom ?? null,
    personne_nom: row.personne_nom ?? null,
    personne_prenom: row.personne_prenom ?? null,
    personne_email: row.personne_email ?? null,
    personne_tel: row.personne_tel ?? null,
    total_paye: row.total_paye === null || row.total_paye === undefined ? 0 : Number(row.total_paye),
    retour_id: row.retour_id === null || row.retour_id === undefined ? null : Number(row.retour_id),
    retour_date: retourDate || null,
    retour_suite: row.retour_suite ?? null,
    retour_motif: row.retour_motif ?? null,
    retour_commentaires: row.retour_commentaires ?? null
  };
  });

  await loadVets();

  if (pendingAnimalScroll.value) {
    const target = pendingAnimalScroll.value;
    pendingAnimalScroll.value = null;
    if (target) scrollToAnimal(target);
  }

  editingId.value = null;
  editSelectedRaceIds.value = [];
  for (const key of Object.keys(edit)) delete (edit as any)[key];

  // Charger les races pour chaque animal (pour affichage dans le tableau)
  const map: Record<number, AnimalRaceRow[]> = {};
  for (const a of animals.value) {
    const rr = await safeInvoke('animal:races:list', a.id_animal);
    map[a.id_animal] = rr?.rows ?? [];
  }
  animalRaces.value = map;
  if (medical.selectedAnimal) {
    await loadMedicalEvents(medical.selectedAnimal.id_animal);
  }
  if (behaviour.selectedAnimal) {
    await loadBehaviourNotes(behaviour.selectedAnimal.id_animal);
  }
}

// ===== Utils sync races =====
function idsOf(arr: AnimalRaceRow[]) { return arr.map(x => x.id_race); }

async function syncAnimalRaces(id_animal:number, selectedIds:number[]) {
  const current = (animalRaces.value[id_animal] ?? []);
  const currentIds = new Set(idsOf(current));
  const targetIds  = new Set(selectedIds);

  const toAdd: number[] = [];
  const toDel: number[] = [];

  // additions
  for (const id of targetIds) if (!currentIds.has(id)) toAdd.push(id);
  // suppressions
  for (const id of currentIds) if (!targetIds.has(id)) toDel.push(id);

  for (const id_race of toAdd) {
    await safeInvoke('animal:races:add', { id_animal, id_race });
  }
  for (const id_race of toDel) {
    await safeInvoke('animal:races:remove', { id_animal, id_race });
  }
  // recharger les races de cet animal
  const rr = await safeInvoke('animal:races:list', id_animal);
  animalRaces.value[id_animal] = rr?.rows ?? [];
}

// ===== CRUD animaux =====

async function createAnimal() {
  resetError();
  if (!form.id_espece) { alert('Choisis une espèce'); return; }
  if (!form.date_arrivee) { alert('La date d’arrivée est requise'); return; }

  const payload = {
    nom_usuel: (form.nom_usuel || '').trim() || null,
    id_espece: Number(form.id_espece),
    sexe: form.sexe,
    date_naissance: form.date_naissance || null,
    date_arrivee: form.date_arrivee,
    poids_kg: form.poids_kg === '' ? null : Number(form.poids_kg),
    sterilise: form.sterilise === '1' ? 1 : 0,
    description: (form.description || '').trim() || null,
    statut: form.statut
  };
  const res = await safeInvoke('animals:create', payload);
  if (res?.id_animal) {
    // lier les races sélectionnées
    if (createSelectedRaceIds.value.length) {
      await syncAnimalRaces(res.id_animal, createSelectedRaceIds.value.slice());
    }
    // reset
    Object.assign(form, {
      nom_usuel:'', id_espece:null, sexe:'Inconnu',
      date_naissance:'', date_arrivee:'', poids_kg:'',
      sterilise:'0', description:'', statut:'arrive'
    });
    createSelectedRaceIds.value = [];
    await refresh();
  } else if (!ui.error) {
    ui.error = 'Création impossible (voir console)';
  }
}

function startEdit(a: AnimalRow) {
  editingId.value = a.id_animal;
  Object.assign(edit, {
    id_animal: a.id_animal,
    nom_usuel: a.nom_usuel || '',
    id_espece: a.id_espece,
    sexe: a.sexe,
    date_naissance: toDateInput(a.date_naissance),
    date_arrivee: toDateInput(a.date_arrivee),
    poids_kg: a.poids_kg ?? '',
    sterilise: (a.sterilise === 1 ? '1' : '0') as '0' | '1',
    description: a.description || '',
    statut: a.statut
  });

  // charger races existantes pour pré-cocher
  const current = animalRaces.value[a.id_animal] ?? [];
  editSelectedRaceIds.value = idsOf(current);
}
function cancelEdit() {
  editingId.value = null;
  for (const k of Object.keys(edit)) delete (edit as any)[k];
  editSelectedRaceIds.value = [];
}

async function saveEdit() {
  resetError();
  if (!editingId.value) return;
  const payload = {
    id_animal: editingId.value,
    nom_usuel: (edit.nom_usuel || '').toString().trim() || null,
    id_espece: Number(edit.id_espece),
    sexe: (edit.sexe || 'Inconnu').toString(),
    date_naissance: (edit.date_naissance as string) || null,
    date_arrivee: (edit.date_arrivee as string) || null,
    poids_kg: (edit.poids_kg === '' || edit.poids_kg === null || edit.poids_kg === undefined)
      ? null : Number(edit.poids_kg),
    sterilise: (edit.sterilise === '1' || edit.sterilise === true || edit.sterilise === 1) ? 1 : 0,
    description: (edit.description || '').toString() || null,
    statut: (edit.statut || 'arrive').toString()
  };
  const res = await safeInvoke('animals:update', payload);
  if (res?.ok) {
    // sync races
    await syncAnimalRaces(editingId.value, editSelectedRaceIds.value.slice());
    await refresh();
    cancelEdit();
  } else if (!ui.error) {
    ui.error = 'Mise à jour impossible';
  }
}

async function removeAnimal(id:number) {
  resetError();
  if (!confirm('Supprimer cet animal ?')) return;
  const res = await safeInvoke('animals:delete', id);
  if (res?.ok) {
    await refresh();
  } else if (res?.message) {
    ui.error = res.message;
  } else if (!ui.error) {
    ui.error = 'Suppression impossible';
  }
}

onBeforeUnmount(() => {
  if (animalHighlightTimer) clearTimeout(animalHighlightTimer);
});
</script>

<template>
  <div class="page">
    <div v-if="ui.error" class="banner error">{{ ui.error }}</div>

    <!-- Formulaire unique : création d'un animal (avec races) -->
    <div class="card">
      <h2>Nouvel animal</h2>
      <div class="grid three">
        <div class="field">
          <label>Nom usuel</label>
          <input v-model="form.nom_usuel" placeholder="Ex.: Rex..." />
        </div>

        <div class="field">
          <label>Espèce</label>
          <select v-model.number="form.id_espece">
            <option :value="null" disabled>— Choisir une espèce —</option>
            <option v-for="s in species" :key="s.id_espece" :value="s.id_espece">{{ s.libelle }}</option>
          </select>
        </div>

        <div class="field">
          <label>Sexe</label>
          <select v-model="form.sexe">
            <option value="Inconnu">Inconnu</option>
            <option value="M">M</option>
            <option value="F">F</option>
          </select>
        </div>

        <div class="field"><label>Date naissance</label><input type="date" v-model="form.date_naissance" /></div>
        <div class="field"><label>Date arrivée *</label><input type="date" v-model="form.date_arrivee" /></div>
        <div class="field"><label>Poids (kg)</label><input type="number" step="0.01" v-model="form.poids_kg" /></div>
        <div class="field"><label>Stérilisé</label><select v-model="form.sterilise"><option value="1">Oui</option><option value="0">Non</option></select></div>

        <div class="field field-span">
          <label>Description</label>
          <textarea v-model="form.description"></textarea>
        </div>

        <!-- Races (dropdown multi-sélection simple) -->
        <div class="field field-span" v-if="form.id_espece">
          <label>Races</label>
          <MultiSelect
            v-model="createSelectedRaceIds"
            :options="racesBySpecies.get(form.id_espece) || []"
            value-key="id_race"
            label-key="libelle"
            placeholder="Choisir des races"
            :disabled="!form.id_espece || !(racesBySpecies.get(form.id_espece) || []).length"
          />
          <small class="muted">Tu peux cocher plusieurs éléments.</small>
        </div>
      </div>

      <div class="actions">
        <button class="btn" @click="createAnimal">Créer</button>
      </div>
    </div>

    <!-- Liste animaux (avec races affichées) -->
    <div class="card">
      <h2>Animaux</h2>
      <div v-if="availableAnimals.length === 0" class="empty">Aucun animal disponible pour le moment.</div>

      <div v-else class="table-wrapper">
        <table class="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Nom</th>
              <th>Espèce</th>
              <th>Sexe</th>
              <th>Poids</th>
              <th>Stérilisé</th>
              <th>Profil</th>
              <th>Races</th>
              <th style="width:320px;">Actions</th>
            </tr>
          </thead>
        <tbody>
          <tr
            v-for="a in availableAnimals"
            :key="a.id_animal"
            :class="['animal-row', { highlight: highlightedAnimalId === a.id_animal }]"
            :data-animal-row="a.id_animal"
          >
            <!-- Ligne édition -->
            <template v-if="editingId === a.id_animal">
              <td>{{ a.id_animal }}</td>
              <td><input v-model="(edit as any).nom_usuel" /></td>
              <td>
                <select v-model.number="(edit as any).id_espece">
                  <option v-for="s in species" :key="s.id_espece" :value="s.id_espece">{{ s.libelle }}</option>
                </select>
              </td>
              <td>
                <select v-model="(edit as any).sexe">
                  <option value="Inconnu">Inconnu</option>
                  <option value="M">M</option>
                  <option value="F">F</option>
                </select>
              </td>
              <td><input type="number" step="0.01" v-model="(edit as any).poids_kg" /></td>
              <td>
                <label>Stérilisé</label>
                <select v-model="(edit as any).sterilise">
                  <option value="1">Oui</option>
                  <option value="0">Non</option>
                </select>
              </td>
              <td>
                <div class="compat-summary">
                  <span
                    v-for="entry in behaviourSummary(a)"
                    :key="entry.key"
                    class="chip-compat"
                    :class="compatClass(entry.value)"
                  >
                    {{ entry.key }}
                    <strong>{{ compatLabel(entry.value) }}</strong>
                  </span>
                </div>
              </td>
              <td>
                <!-- Races (dropdown multi-sélection) pendant l'édition -->
                <label>Races</label>
                <MultiSelect
                  v-model="editSelectedRaceIds"
                  :options="racesBySpecies.get(Number((edit as any).id_espece)) || []"
                  value-key="id_race"
                  label-key="libelle"
                  placeholder="Choisir des races"
                  :disabled="!Number((edit as any).id_espece) || !(racesBySpecies.get(Number((edit as any).id_espece)) || []).length"
                />
                <small class="muted">Tu peux cocher plusieurs éléments.</small>
              </td>
              <td class="actions-right">
                <button class="btn" @click="saveEdit">Sauver</button>
                <button class="btn ghost" @click="cancelEdit">Annuler</button>
              </td>
            </template>

            <!-- Ligne lecture -->
            <template v-else>
              <td>{{ a.id_animal }}</td>
              <td class="strong">
                {{ a.nom_usuel || '—' }}
                <div class="muted">{{ a.description || '' }}</div>
              </td>
              <td>{{ a.espece_libelle }}</td>
              <td>{{ a.sexe }}</td>
              <td>{{ a.poids_kg ?? '—' }}</td>
              <td>
                <span :class="['badge', a.sterilise ? 'badge-success' : 'badge-muted']">
                  {{ a.sterilise ? 'Oui' : 'Non' }}
                </span>
              </td>
              <td>
                <div class="compat-summary">
                  <span
                    v-for="entry in behaviourSummary(a)"
                    :key="entry.key"
                    class="chip-compat"
                    :class="compatClass(entry.value)"
                  >
                    {{ entry.key }}
                    <strong>{{ compatLabel(entry.value) }}</strong>
                  </span>
                  <span v-if="behaviourSummary(a).every(entry => entry.value === null)" class="muted">
                    Profil inconnu
                  </span>
                </div>
                <div v-if="a.comportement_commentaire" class="muted small">
                  {{ a.comportement_commentaire }}
                </div>
              </td>
              <td>
                <div class="chiplist">
                  <span v-for="r in (animalRaces[a.id_animal] || [])" :key="'lr-'+r.id_race" class="tag">
                    {{ r.race_libelle }}
                  </span>
                  <span v-if="!(animalRaces[a.id_animal] || []).length" class="muted">—</span>
                </div>
              </td>
              <td class="actions-right">
                <button class="btn info" @click="openMedical(a)">Santé</button>
                <button class="btn info" @click="openBehaviour(a)">Comportement</button>
                <button class="btn ghost" @click="startEdit(a)">Modifier</button>
                <button class="btn danger" @click="removeAnimal(a.id_animal)">Supprimer</button>
              </td>
            </template>
          </tr>
        </tbody>
        </table>
      </div>
    </div>
    <div class="card adopted-card">
      <h2>Animaux adoptés</h2>
      <div v-if="adoptedRows.length === 0" class="empty">Aucun animal adopté enregistré.</div>
      <template v-else>
        <div class="list-controls">
          <div class="field search-field">
            <label>Rechercher</label>
            <input
              v-model="adoptionSearch"
              type="search"
              placeholder="Animal, adoptant, contrat, téléphone..."
            />
          </div>
        </div>

        <div v-if="filteredAdoptedRows.length > 0" class="table-wrapper">
          <table class="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Animal</th>
                <th>Adopté par</th>
                <th>Contact</th>
                <th>Date adoption</th>
                <th>Contrat</th>
                <th>Montant</th>
                <th>Payé / Solde</th>
                <th>Retour</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in filteredAdoptedRows"
                :key="'adopted-' + row.animal.id_animal"
                :class="['adopted-row', { highlight: highlightedAnimalId === row.animal.id_animal }]"
                :data-adopted-row="row.animal.id_animal"
              >
                <td>{{ row.animal.id_animal }}</td>
                <td class="strong">
                  {{ row.animal.nom_usuel || '—' }}
                  <div class="muted">{{ row.animal.espece_libelle }}</div>
                </td>
                <td>
                  {{ row.adopterName }}
                  <div class="muted" v-if="row.adoption.conditions_particulieres">
                    {{ row.adoption.conditions_particulieres }}
                  </div>
                </td>
                <td>
                  <div>{{ row.adoption.personne_email || '—' }}</div>
                  <div>{{ row.adoption.personne_tel || '—' }}</div>
                </td>
                <td>{{ row.adoptionDate || '—' }}</td>
                <td>
                  <div>{{ row.adoption.numero_contrat || '—' }}</div>
                  <div class="muted small">Dossier #{{ row.adoption.id_adoption }}</div>
                </td>
                <td>{{ formatEuro(row.amountDue) }}</td>
                <td>
                  <div>{{ formatEuro(row.amountPaid) }}</div>
                  <div v-if="row.balance !== null" class="muted small">Solde {{ formatEuro(row.balance) }}</div>
                </td>
                <td>
                  <span v-if="row.adoption.retour_suite" class="badge badge-warning">
                    {{ formatRetourSuite(row.adoption.retour_suite) }}
                  </span>
                  <span v-else>—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="empty">Aucun résultat ne correspond à la recherche.</div>
      </template>
    </div>
    <div v-if="medical.selectedAnimal" class="card medical-card">
      <div class="medical-header">
        <div>
          <h2>Suivi santé</h2>
          <div class="muted">
            {{ medical.selectedAnimal.nom_usuel || ('Animal #' + medical.selectedAnimal.id_animal) }}
            · {{ medical.selectedAnimal.espece_libelle }}
          </div>
        </div>
        <button class="btn ghost" @click="closeMedical">Fermer</button>
      </div>

      <div>
        <h3 class="section-title">Historique</h3>
        <div v-if="medical.loading" class="muted">Chargement...</div>
        <div v-else-if="medical.events.length === 0" class="empty">Aucun évènement médical enregistré.</div>
        <div v-else class="table-wrapper slim">
          <table class="table medical-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Détail</th>
                <th>Vétérinaire</th>
                <th>Validité</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="evt in medical.events" :key="evt.id_evt" :class="medicalRowClass(evt)">
                <td>{{ evt.date_evt || '—' }}</td>
                <td><span class="tag">{{ evt.type }}</span></td>
               <td>{{ evt.sous_type || '—' }}</td>
               <td class="vet-cell">
                  <template v-if="eventEdits[evt.id_evt]?.editing">
                    <select
                      :value="eventEdits[evt.id_evt]?.id_veterinaire ?? ''"
                      @change="onEventVetSelect(evt, ($event.target as HTMLSelectElement).value)"
                      :disabled="savingEvents[evt.id_evt]"
                    >
                      <option value="">— Aucun —</option>
                      <option v-for="vet in vets" :key="'evt-vet-'+vet.id_vet" :value="vet.id_vet">
                        {{ vet.nom_cabinet }}
                      </option>
                    </select>
                    <div v-if="eventEdits[evt.id_evt]?.id_veterinaire && vetById.get(eventEdits[evt.id_evt].id_veterinaire!)" class="muted small">
                      <div>{{ vetById.get(eventEdits[evt.id_evt].id_veterinaire!)?.contact || 'Contact inconnu' }}</div>
                      <div v-if="vetById.get(eventEdits[evt.id_evt].id_veterinaire!)?.adresse">
                        {{ vetById.get(eventEdits[evt.id_evt].id_veterinaire!)?.adresse }}
                      </div>
                    </div>
                  </template>
                  <template v-else>
                    <div>{{ evt.vet_nom || '—' }}</div>
                    <div v-if="evt.vet_contact" class="muted small">{{ evt.vet_contact }}</div>
                    <div v-if="evt.vet_adresse" class="muted small">{{ evt.vet_adresse }}</div>
                  </template>
               </td>
                <td>
                  <div class="status-cell">
                    <span>{{ evt.date_validite || '—' }}</span>
                    <span v-if="evt.date_validite" class="status-pill" :class="{
                      overdue: evt.is_expired,
                      soon: !evt.is_expired && evt.days_until_due !== null && evt.days_until_due <= 7
                    }">
                      {{ medicalStatusLabel(evt) }}
                    </span>
                  </div>
                </td>
                <td class="notes-cell">{{ evt.notes || '—' }}</td>
                <td class="actions-right">
                  <template v-if="eventEdits[evt.id_evt]?.editing">
                    <button
                      class="btn"
                      @click="saveEventChanges(evt)"
                      :disabled="savingEvents[evt.id_evt] || !hasEventChanges(evt)"
                    >
                      Sauvegarder
                    </button>
                    <button class="btn ghost" @click="cancelEventEdit(evt)" :disabled="savingEvents[evt.id_evt]">
                      Annuler
                    </button>
                  </template>
                  <template v-else>
                    <button class="btn ghost" @click="startEventEdit(evt)">Modifier</button>
                  </template>
                  <button class="btn danger" @click="removeMedicalEvent(evt.id_evt)">Supprimer</button>
               </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 class="section-title">Nouvel acte</h3>
        <div class="grid three">
          <div class="field">
            <label>Type *</label>
            <select v-model="medical.form.type">
              <option v-for="type in medicalTypes" :key="type" :value="type">{{ type }}</option>
            </select>
          </div>
          <div class="field">
            <label>Vétérinaire</label>
            <select v-model="medical.form.id_veterinaire">
              <option :value="null">— Aucun —</option>
              <option v-for="vet in vets" :key="vet.id_vet" :value="vet.id_vet">
                {{ vet.nom_cabinet }}
              </option>
            </select>
            <RouterLink class="inline-link" to="/app/veterinaires">Gérer</RouterLink>
          </div>
          <div class="field">
            <label>Sous-type</label>
            <input v-model="medical.form.sous_type" placeholder="Ex.: Rage, Vermifuge interne" />
          </div>
          <div class="field">
            <label>Date acte *</label>
            <input type="date" v-model="medical.form.date_evt" />
          </div>
          <div class="field">
            <label>Date validité</label>
            <input type="date" v-model="medical.form.date_validite" />
          </div>
          <div class="field field-span">
            <label>Notes</label>
            <textarea v-model="medical.form.notes" placeholder="Commentaire vétérinaire, dosage..."></textarea>
          </div>
        </div>
        <div class="actions">
          <button class="btn" @click="createMedicalEvent">Enregistrer l'acte</button>
        </div>
      </div>
    </div>
    <div v-if="behaviour.selectedAnimal" class="card behaviour-card">
      <div class="medical-header">
        <div>
          <h2>Notes comportement</h2>
          <div class="muted">
            {{ behaviour.selectedAnimal.nom_usuel || ('Animal #' + behaviour.selectedAnimal.id_animal) }}
            · {{ behaviour.selectedAnimal.espece_libelle }}
          </div>
        </div>
        <button class="btn ghost" @click="closeBehaviour">Fermer</button>
      </div>

      <div>
        <h3 class="section-title">Historique</h3>
        <div v-if="behaviour.loading" class="muted">Chargement...</div>
        <div v-else-if="behaviour.notes.length === 0" class="empty">Aucune observation enregistrée.</div>
        <div v-else class="table-wrapper slim">
          <table class="table medical-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Chiens</th>
                <th>Chats</th>
                <th>Enfants</th>
                <th>Score</th>
                <th>Commentaire</th>
                <th>Auteur</th>
                <th style="width:140px;">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="note in behaviour.notes" :key="note.id_note">
                <td>{{ note.date_note || '—' }}</td>
                <td><span :class="['chip-compat', compatClass(note.ok_chiens)]">{{ compatLabel(note.ok_chiens) }}</span></td>
                <td><span :class="['chip-compat', compatClass(note.ok_chats)]">{{ compatLabel(note.ok_chats) }}</span></td>
                <td><span :class="['chip-compat', compatClass(note.ok_enfants)]">{{ compatLabel(note.ok_enfants) }}</span></td>
                <td>{{ note.score ?? '—' }}</td>
                <td class="notes-cell">{{ note.commentaire || '—' }}</td>
                <td>{{ note.auteur }}</td>
                <td class="actions-right">
                  <template v-if="behaviour.editingId === note.id_note">
                    <span class="muted small">En édition…</span>
                  </template>
                  <template v-else>
                    <button class="btn ghost" @click="startBehaviourEdit(note)">Modifier</button>
                    <button class="btn danger" @click="deleteBehaviourNote(note)">Supprimer</button>
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 class="section-title">Nouvelle note</h3>
        <div class="grid three">
          <div class="field">
            <label>Date</label>
            <input type="date" v-model="behaviour.form.date_note" />
          </div>
          <div class="field">
            <label>Chiens</label>
            <select v-model="behaviour.form.ok_chiens">
              <option value="">Inconnu</option>
              <option value="1">OK</option>
              <option value="0">Non</option>
            </select>
          </div>
          <div class="field">
            <label>Chats</label>
            <select v-model="behaviour.form.ok_chats">
              <option value="">Inconnu</option>
              <option value="1">OK</option>
              <option value="0">Non</option>
            </select>
          </div>
          <div class="field">
            <label>Enfants</label>
            <select v-model="behaviour.form.ok_enfants">
              <option value="">Inconnu</option>
              <option value="1">OK</option>
              <option value="0">Non</option>
            </select>
          </div>
          <div class="field">
            <label>Score</label>
            <input type="number" min="0" max="10" step="1" v-model="behaviour.form.score" />
          </div>
          <div class="field field-span">
            <label>Commentaire</label>
            <textarea v-model="behaviour.form.commentaire" placeholder="Observations, recommandations..."></textarea>
          </div>
        </div>
        <div class="actions">
          <button class="btn" @click="submitBehaviourNote">
            {{ behaviour.editingId ? 'Mettre à jour la note' : 'Enregistrer la note' }}
          </button>
          <button v-if="behaviour.editingId" class="btn ghost" @click="cancelBehaviourEdit">Annuler</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
h2 {
  margin: 0;
  font-size: 20px;
  color: #1e2b4a;
}
.inline-link {
  display: inline-block;
  margin-top: 6px;
  font-size: 12px;
  color: #2f73ff;
  text-decoration: underline;
}
.empty {
  padding: 16px;
  text-align: center;
  border-radius: 14px;
  background: #f5f7ff;
  border: 1px dashed #d2daf3;
  color: #7f8aa9;
  font-size: 14px;
}
.list-controls {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
  gap: 16px;
  align-items: flex-end;
}
.field.search-field {
  max-width: 340px;
}
.adopted-card {
  border-left: 4px solid #8bc34a;
}
.medical-card {
  border-left: 4px solid #3a7bff;
}
.behaviour-card {
  border-left: 4px solid #4caf50;
}
.medical-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.medical-table th,
.medical-table td {
  font-size: 13px;
}
.section-title {
  margin: 0 0 4px;
  font-size: 16px;
  color: #23335e;
}
.status-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #e8f5e9;
  color: #256029;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.status-pill.soon {
  background: #fff4e5;
  color: #b05a00;
}
.status-pill.overdue {
  background: #ffe7e7;
  color: #b71c1c;
}
.medical-row.overdue td {
  background: rgba(255, 231, 231, 0.6);
}
.medical-row.soon td {
  background: rgba(255, 244, 229, 0.6);
}
.notes-cell {
  max-width: 240px;
  white-space: pre-wrap;
}
.vet-cell select {
  width: 100%;
  border: 1px solid #d5dbea;
  border-radius: 10px;
  padding: 6px 10px;
  background: #fff;
}
.vet-cell .muted.small {
  margin-top: 4px;
  line-height: 1.3;
}
.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.badge-success {
  background: #e8f5e9;
  color: #256029;
}
.badge-muted {
  background: #f0f0f5;
  color: #6f7285;
}
.animal-row.highlight,
.adopted-row.highlight {
  background: rgba(255, 233, 196, 0.45);
  transition: background 0.3s ease;
}
.animal-row.highlight td,
.adopted-row.highlight td {
  background: transparent;
}
.animal-row.pulse,
.adopted-row.pulse {
  animation: pulseRow 1s ease;
}
@keyframes pulseRow {
  0% { box-shadow: 0 0 0 rgba(255, 193, 107, 0.7); }
  50% { box-shadow: 0 0 18px rgba(255, 193, 107, 0.9); }
  100% { box-shadow: 0 0 0 rgba(255, 193, 107, 0); }
}
.badge-warning {
  background: #fff4e5;
  color: #b05a00;
  border: 1px solid #f8d7a6;
}
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
