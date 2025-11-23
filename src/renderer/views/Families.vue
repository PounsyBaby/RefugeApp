<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';

type PersonOption = {
  id_personne: number;
  nom: string;
  prenom: string;
  email: string;
};

type FamilyRow = {
  id_fa: number;
  id_personne: number;
  date_agrement: string;
  statut: 'active' | 'suspendue' | 'terminee';
  notes: string | null;
  nom: string;
  prenom: string;
  email: string;
  tel: string | null;
  ville: string | null;
  pays: string | null;
  active_animals: number;
  total_placements: number;
};

type PlacementRow = {
  id_placement: number;
  id_animal: number;
  id_fa: number;
  date_debut: string;
  date_fin: string | null;
  notes: string | null;
  animal_nom: string | null;
  animal_statut: string;
  espece_libelle: string;
  fa_statut?: string;
  fa_nom?: string;
  fa_prenom?: string;
};

type AnimalOption = {
  id_animal: number;
  nom_usuel: string | null;
  statut: string;
  date_arrivee: string | null;
  espece_libelle: string;
};

type MatchResult = {
  id_fa: number;
  score: number;
  reasons: string[];
  available_at: string | null;
  active_animals: number;
  total_placements: number;
  nom: string;
  prenom: string;
  email: string;
  ville: string | null;
  pays: string | null;
  tel: string | null;
  active_species: string | null;
};

const ui = reactive({ error: '', loading: false });

const families = ref<FamilyRow[]>([]);
const placementsByFamily = reactive<Record<number, PlacementRow[]>>({});
const familyErrors = reactive<Record<number, string>>({});
const animalsAvailable = ref<AnimalOption[]>([]);
const peopleOptions = ref<PersonOption[]>([]);

const createFamily = reactive({
  id_personne: null as number | null,
  date_agrement: '',
  statut: 'active' as FamilyRow['statut'],
  notes: ''
});

const familyEditId = ref<number | null>(null);
const familyEdit = reactive({
  date_agrement: '',
  statut: 'active' as FamilyRow['statut'],
  notes: ''
});

const placementDraft = reactive<Record<number, {
  id_animal: number | null;
  date_debut: string;
  date_fin: string;
  notes: string;
}>>({});

const placementEditId = ref<number | null>(null);
const placementEdit = reactive({
  date_debut: '',
  date_fin: '',
  notes: ''
});

const allPlacements = ref<PlacementRow[]>([]);

const familyRefs = ref<Record<number, HTMLDetailsElement | null>>({});
const setFamilyRef = (id: number) => (el: Element | null) => {
  familyRefs.value[id] = el instanceof HTMLDetailsElement ? el : null;
};

const matcher = reactive({
  selectedAnimalId: null as number | null,
  loading: false,
  error: '',
  results: [] as MatchResult[],
  animal: null as any,
  behaviour: null as any
});

const filters = reactive({
  status: 'all' as 'all' | FamilyRow['statut'],
  term: '',
  species: 'all' as 'all' | string
});

function resetError() {
  ui.error = '';
}

async function safeInvoke(channel: string, payload?: any) {
  try {
    const res = await window.api.invoke(channel, payload);
    if (res?.ok === false && res?.message) {
      ui.error = res.message;
    }
    return res;
  } catch (err: any) {
    ui.error = `IPC ${channel} a échoué : ${err?.message || err}`;
    console.error(`[families:${channel}]`, err);
    throw err;
  }
}

async function loadFamilies() {
  const res = await safeInvoke('families:list');
  families.value = res?.rows ?? [];
  const ids = new Set(families.value.map((fa) => fa.id_fa));
  Object.keys(familyErrors).forEach((key) => {
    if (!ids.has(Number(key))) {
      delete familyErrors[Number(key)];
    }
  });
}

async function loadAnimalsAvailable() {
  const res = await safeInvoke('families:animals:available');
  animalsAvailable.value = res?.rows ?? [];
}

async function loadPeopleOptions() {
  const res = await safeInvoke('people:list');
  const rows = res?.rows ?? [];
  peopleOptions.value = rows.map((p: any) => ({
    id_personne: Number(p.id_personne),
    nom: p.nom ?? '',
    prenom: p.prenom ?? '',
    email: p.email ?? ''
  }));
}

async function loadPlacements(id_fa: number) {
  const res = await safeInvoke('families:placements:list', id_fa);
  placementsByFamily[id_fa] = (res?.rows ?? []).map((row: any) => ({
    ...row,
    date_debut: normalizeDate(row.date_debut),
    date_fin: normalizeDate(row.date_fin)
  }));
}

async function loadAllPlacements() {
  const res = await safeInvoke('families:placements:all');
  allPlacements.value = (res?.rows ?? []).map((row: any) => ({
    id_placement: Number(row.id_placement),
    id_fa: Number(row.id_fa),
    id_animal: Number(row.id_animal),
    date_debut: normalizeDate(row.date_debut),
    date_fin: normalizeDate(row.date_fin),
    notes: row.notes ?? null,
    animal_nom: row.animal_nom ?? null,
    animal_statut: row.animal_statut ?? '',
    espece_libelle: row.espece_libelle ?? '',
    fa_statut: row.fa_statut ?? '',
    fa_nom: row.fa_nom ?? '',
    fa_prenom: row.fa_prenom ?? ''
  })) as PlacementRow[];
}

function ensurePlacementDraft(id_fa: number) {
  if (!placementDraft[id_fa]) {
    placementDraft[id_fa] = {
      id_animal: null,
      date_debut: '',
      date_fin: '',
      notes: ''
    };
  }
  return placementDraft[id_fa];
}

function normalizeDate(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

async function onCreateFamily() {
  resetError();
  if (!createFamily.id_personne) {
    ui.error = 'Choisis une personne';
    return;
  }
  if (!createFamily.date_agrement) {
    ui.error = 'Date d’agrément requise';
    return;
  }
  const res = await safeInvoke('families:create', {
    id_personne: createFamily.id_personne,
    date_agrement: createFamily.date_agrement,
    statut: createFamily.statut,
    notes: createFamily.notes || null
  });
  if (res?.id_fa) {
    Object.assign(createFamily, { id_personne: null, date_agrement: '', statut: 'active', notes: '' });
    await loadFamilies();
  }
}

function startFamilyEdit(fa: FamilyRow) {
  familyEditId.value = fa.id_fa;
  Object.assign(familyEdit, {
    date_agrement: fa.date_agrement,
    statut: fa.statut,
    notes: fa.notes ?? ''
  });
}

function cancelFamilyEdit() {
  familyEditId.value = null;
  Object.assign(familyEdit, { date_agrement: '', statut: 'active', notes: '' });
}

async function saveFamilyEdit(id_fa: number) {
  resetError();
  const payload = {
    id_fa,
    date_agrement: familyEdit.date_agrement || null,
    statut: familyEdit.statut,
    notes: familyEdit.notes || null
  };
  const res = await safeInvoke('families:update', payload);
  if (res?.ok) {
    cancelFamilyEdit();
    await loadFamilies();
  }
}

async function deleteFamily(id_fa: number) {
  resetError();
  if (!confirm('Supprimer cette famille d’accueil ?')) return;
  try {
    familyErrors[id_fa] = '';
    const res = await safeInvoke('families:delete', id_fa);
    if (res?.ok) {
      delete placementsByFamily[id_fa];
      delete familyErrors[id_fa];
      await Promise.all([
        loadFamilies(),
        loadAnimalsAvailable(),
        loadAllPlacements(),
      ]);
      if (matcher.selectedAnimalId) {
        await runMatch();
      }
    } else if (res?.ok === false && res?.message) {
      familyErrors[id_fa] = res.message;
      ui.error = '';
    }
  } catch (err: any) {
    const msg = err?.message || 'Suppression impossible';
    familyErrors[id_fa] = msg;
    ui.error = '';
  }
}

async function createPlacement(id_fa: number) {
  resetError();
  ensurePlacementDraft(id_fa);
  const draft = placementDraft[id_fa];
  if (!draft.id_animal) {
    ui.error = 'Choisis un animal';
    return;
  }
  if (!draft.date_debut) {
    ui.error = 'Date de début requise';
    return;
  }
  const payload = {
    id_fa,
    id_animal: draft.id_animal,
    date_debut: draft.date_debut,
    date_fin: draft.date_fin || null,
    notes: draft.notes || null
  };
  const res = await safeInvoke('families:placements:create', payload);
  if (res?.id_placement) {
    placementDraft[id_fa] = { id_animal: null, date_debut: '', date_fin: '', notes: '' };
    await Promise.all([loadPlacements(id_fa), loadFamilies(), loadAnimalsAvailable(), loadAllPlacements()]);
    if (matcher.selectedAnimalId) {
      await runMatch();
    }
  }
}

function startPlacementEdit(placement: PlacementRow) {
  placementEditId.value = placement.id_placement;
  Object.assign(placementEdit, {
    date_debut: placement.date_debut,
    date_fin: placement.date_fin ?? '',
    notes: placement.notes ?? ''
  });
}

function cancelPlacementEdit() {
  placementEditId.value = null;
  Object.assign(placementEdit, { date_debut: '', date_fin: '', notes: '' });
}

async function savePlacementEdit(row: PlacementRow) {
  resetError();
  if (!placementEditId.value) return;
  const payload = {
    id_placement: placementEditId.value,
    date_debut: placementEdit.date_debut || null,
    date_fin: placementEdit.date_fin || null,
    notes: placementEdit.notes || null
  };
  const res = await safeInvoke('families:placements:update', payload);
  if (res?.ok) {
    const id_fa = row.id_fa;
    cancelPlacementEdit();
    await Promise.all([loadPlacements(id_fa), loadFamilies(), loadAnimalsAvailable(), loadAllPlacements()]);
  }
}

async function deletePlacement(row: PlacementRow) {
  resetError();
  if (!confirm('Supprimer ce placement ?')) return;
  const res = await safeInvoke('families:placements:delete', row.id_placement);
  if (res?.ok) {
    await Promise.all([
      loadPlacements(row.id_fa),
      loadFamilies(),
      loadAnimalsAvailable(),
      loadAllPlacements()
    ]);
    // nettoyage local pour éviter un item fantôme dans la liste détaillée
    const list = placementsByFamily[row.id_fa] || [];
    placementsByFamily[row.id_fa] = list.filter((pl) => pl.id_placement !== row.id_placement);
    if (matcher.selectedAnimalId) {
      await runMatch();
    }
  }
}

function formatDate(value: string | null | undefined) {
  const date = parseDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(date);
}

function parseSpecies(value: string | null | undefined): string[] {
  if (!value) return [];
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

const speciesOptions = computed(() => {
  const set = new Set<string>();
  for (const fa of families.value) {
    for (const sp of parseSpecies(fa.active_species)) {
      set.add(sp);
    }
  }
  for (const animal of animalsAvailable.value) {
    if (animal.espece_libelle) set.add(animal.espece_libelle);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
});

const filteredAnimals = computed(() => {
  if (filters.species === 'all') return animalsAvailable.value;
  const target = filters.species.toLowerCase();
  return animalsAvailable.value.filter(
    (a) => (a.espece_libelle ?? '').toLowerCase() === target
  );
});

const familiesMetrics = computed(() => {
  const total = families.value.length;
  const active = families.value.filter((fa) => fa.statut === 'active').length;
  const suspended = families.value.filter((fa) => fa.statut === 'suspendue').length;
  const terminated = families.value.filter((fa) => fa.statut === 'terminee').length;
  const animals = families.value.reduce((acc, fa) => acc + Number(fa.active_animals ?? 0), 0);
  return { total, active, suspended, terminated, animals };
});

const filteredFamilies = computed(() => {
  const term = filters.term.trim().toLowerCase();
  const speciesTarget = filters.species.toLowerCase();
  return families.value
    .filter((fa) => {
      if (filters.status !== 'all' && fa.statut !== filters.status) return false;
      if (filters.species !== 'all') {
        const species = parseSpecies(fa.active_species).map((s) => s.toLowerCase());
        if (!species.includes(speciesTarget)) return false;
      }
      if (!term) return true;
      const haystack = [
        fa.nom,
        fa.prenom,
        fa.email,
        fa.notes ?? '',
        fa.ville ?? '',
        fa.pays ?? ''
      ].join(' ').toLowerCase();
      return haystack.includes(term);
    })
    .map((fa) => ({
      ...fa,
      draft: ensurePlacementDraft(fa.id_fa)
    }));
});

function parseDate(value: string | null | undefined) {
  const iso = normalizeDate(value);
  if (!iso) return null;
  const date = new Date(iso + 'T00:00:00');
  return Number.isNaN(date.getTime()) ? null : date;
}

const activePlacements = computed(() => {
  const today = new Date().getTime();
  return allPlacements.value
    .filter((row) => {
      const start = parseDate(row.date_debut)?.getTime();
      const end = parseDate(row.date_fin)?.getTime();
      if (start === null) return false;
      const isActive = start <= today && (end === null || end >= today);
      if (!isActive) return false;
      if (filters.species !== 'all' &&
        (row.espece_libelle ?? '').toLowerCase() !== filters.species.toLowerCase()) {
        return false;
      }
      return true;
    })
    .sort((a, b) => a.date_fin?.localeCompare(b.date_fin || '') || 0);
});

const finishingSoonPlacements = computed(() => {
  const soon = new Date();
  soon.setDate(soon.getDate() + 7);
  const soonTs = soon.getTime();
  const today = new Date().getTime();
  return activePlacements.value.filter((row) => {
    const end = parseDate(row.date_fin)?.getTime();
    return end !== null && end >= today && end <= soonTs;
  });
});

const upcomingPlacements = computed(() => {
  const today = new Date().getTime();
  return allPlacements.value
    .filter((row) => {
      const start = parseDate(row.date_debut)?.getTime();
      if (start === null || start <= today) return false;
      if (filters.species !== 'all' &&
        (row.espece_libelle ?? '').toLowerCase() !== filters.species.toLowerCase()) {
        return false;
      }
      return true;
    })
    .sort((a, b) => a.date_debut.localeCompare(b.date_debut));
});

const availableFamilies = computed(() =>
  families.value.filter((fa) => fa.statut === 'active' && Number(fa.active_animals ?? 0) === 0)
);

async function runMatch() {
  if (!matcher.selectedAnimalId) {
    matcher.results = [];
    matcher.animal = null;
    matcher.behaviour = null;
    matcher.error = '';
    return;
  }
  matcher.loading = true;
  matcher.error = '';
  try {
    const res = await safeInvoke('families:match', matcher.selectedAnimalId);
    matcher.results = res?.matches ?? [];
    matcher.animal = res?.animal ?? null;
    matcher.behaviour = res?.behaviour ?? null;
  } catch (e: any) {
    matcher.error = e?.message || 'Calcul impossible';
  } finally {
    matcher.loading = false;
  }
}

function goToFamily(id_fa: number) {
  const el = familyRefs.value[id_fa];
  if (el) {
    el.open = true;
    requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
}

watch(() => matcher.selectedAnimalId, async (id) => {
  if (id) {
    await runMatch();
  } else {
    matcher.results = [];
    matcher.animal = null;
    matcher.behaviour = null;
  }
});

watch(() => animalsAvailable.value, (list) => {
  if (matcher.selectedAnimalId && !list.some((a) => a.id_animal === matcher.selectedAnimalId)) {
    matcher.selectedAnimalId = null;
    matcher.results = [];
    matcher.animal = null;
    matcher.behaviour = null;
  }
});

onMounted(async () => {
  ui.error = '';
  ui.loading = true;
  try {
    await Promise.all([loadFamilies(), loadAnimalsAvailable(), loadPeopleOptions(), loadAllPlacements()]);
  } finally {
    ui.loading = false;
  }
});
</script>

<template>
  <div class="page families-page">
    <div v-if="ui.error" class="banner error">{{ ui.error }}</div>

    <div class="card">
      <h2>Nouvelle famille d’accueil</h2>
      <div class="form-grid create-grid">
        <div class="field person-field">
          <label>Personne</label>
          <select v-model="createFamily.id_personne">
            <option :value="null" disabled>— Choisir une personne —</option>
            <option v-for="p in peopleOptions" :key="p.id_personne" :value="p.id_personne">
              {{ p.nom }} {{ p.prenom }} — {{ p.email }}
            </option>
          </select>
        </div>
        <div class="field agreement-field">
          <label>Date agrément</label>
          <input type="date" v-model="createFamily.date_agrement" />
        </div>
        <div class="field status-field">
          <label>Statut</label>
          <select v-model="createFamily.statut">
            <option value="active">Active</option>
            <option value="suspendue">Suspendue</option>
            <option value="terminee">Terminée</option>
          </select>
        </div>
        <div class="field field-span">
          <label>Notes</label>
          <textarea v-model="createFamily.notes" placeholder="Logistique, préférences d’animaux, capacité..."></textarea>
        </div>
      </div>
      <div class="actions">
        <button class="btn" @click="onCreateFamily" :disabled="ui.loading">Créer</button>
      </div>
    </div>

    <div class="card">
      <h2>Matching automatique</h2>
      <div class="match-grid">
        <div class="field">
          <label>Animal</label>
          <select v-model.number="matcher.selectedAnimalId">
            <option :value="null" disabled>— Choisir un animal —</option>
            <option v-for="animal in animalsAvailable" :key="animal.id_animal" :value="animal.id_animal">
              #{{ animal.id_animal }} — {{ animal.nom_usuel || 'Sans nom' }} ({{ animal.espece_libelle }})
            </option>
          </select>
        </div>
        <div class="actions">
          <button class="btn" @click="runMatch" :disabled="!matcher.selectedAnimalId || matcher.loading">
            {{ matcher.loading ? 'Analyse...' : 'Calculer' }}
          </button>
        </div>
      </div>
      <div v-if="matcher.error" class="banner error">{{ matcher.error }}</div>
      <div v-else-if="!matcher.selectedAnimalId" class="muted">Sélectionne un animal pour voir les meilleures familles.</div>
      <div v-else-if="matcher.results.length === 0 && !matcher.loading" class="muted">Aucune famille ne correspond aux critères actuels.</div>
      <div v-else class="match-results">
        <div class="muted small" v-if="matcher.animal">
          Suggestions pour {{ matcher.animal.nom_usuel || ('Animal #' + matcher.animal.id_animal) }} · {{ matcher.animal.espece_libelle }}
        </div>
        <div class="muted small" v-if="matcher.behaviour">
          Compatibilités : chiens {{ matcher.behaviour.ok_chiens ?? '—' }}, chats {{ matcher.behaviour.ok_chats ?? '—' }}, enfants {{ matcher.behaviour.ok_enfants ?? '—' }}
        </div>
        <ul class="match-list">
          <li v-for="res in matcher.results" :key="'match-'+res.id_fa">
            <div class="match-header">
              <div>
                <strong>{{ res.prenom }} {{ res.nom }}</strong>
                <span class="tag score">Score {{ res.score }}</span>
              </div>
              <button class="btn ghost" @click="goToFamily(res.id_fa)">Voir</button>
            </div>
            <div class="muted small">
              {{ res.email }} · {{ res.ville || '—' }} {{ res.pays || '' }}
            </div>
            <ul class="reason-list">
              <li v-for="reason in res.reasons" :key="reason">{{ reason }}</li>
            </ul>
          </li>
        </ul>
      </div>
    </div>

    <div class="card">
      <h2>Planning des placements</h2>
      <div class="planning-grid">
        <div class="planning-col">
          <h3>Placements en cours</h3>
          <ul class="planning-list">
            <li v-for="row in activePlacements" :key="'act-'+row.id_placement">
              <strong>{{ row.fa_nom }} {{ row.fa_prenom }}</strong>
              · {{ row.animal_nom || 'Sans nom' }} ({{ row.espece_libelle }})
              <div class="muted small">Début : {{ formatDate(row.date_debut) }} · Fin : {{ formatDate(row.date_fin) }}</div>
            </li>
            <li v-if="activePlacements.length === 0" class="muted small">Aucun placement en cours.</li>
          </ul>
        </div>
        <div class="planning-col">
          <h3>Fins < 7 jours</h3>
          <ul class="planning-list">
            <li v-for="row in finishingSoonPlacements" :key="'soon-'+row.id_placement">
              <strong>{{ row.fa_nom }} {{ row.fa_prenom }}</strong>
              · {{ row.animal_nom || 'Sans nom' }}
              <div class="muted small">Fin prévue : {{ formatDate(row.date_fin) }}</div>
            </li>
            <li v-if="finishingSoonPlacements.length === 0" class="muted small">Aucun départ imminent.</li>
          </ul>
        </div>
        <div class="planning-col">
          <h3>Placements à venir</h3>
          <ul class="planning-list">
            <li v-for="row in upcomingPlacements" :key="'up-'+row.id_placement">
              <strong>{{ row.fa_nom }} {{ row.fa_prenom }}</strong>
              · {{ row.animal_nom || 'Sans nom' }} ({{ row.espece_libelle }})
              <div class="muted small">Début : {{ formatDate(row.date_debut) }}</div>
            </li>
            <li v-if="upcomingPlacements.length === 0" class="muted small">Aucun placement programmé.</li>
          </ul>
        </div>
        <div class="planning-col">
          <h3>Familles disponibles</h3>
          <ul class="planning-list">
            <li v-for="fa in availableFamilies" :key="'avail-'+fa.id_fa">
              <strong>{{ fa.nom }} {{ fa.prenom }}</strong>
              <div class="muted small">{{ fa.ville || '—' }} {{ fa.pays || '' }}</div>
            </li>
            <li v-if="availableFamilies.length === 0" class="muted small">Aucune famille libre.</li>
          </ul>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>Familles d’accueil</h2>
      <div class="toolbar">
        <div class="metrics">
          <div class="metric">
            <div class="metric-label">Total</div>
            <div class="metric-value">{{ familiesMetrics.total }}</div>
          </div>
          <div class="metric">
            <div class="metric-label">Actives</div>
            <div class="metric-value">{{ familiesMetrics.active }}</div>
          </div>
          <div class="metric">
            <div class="metric-label">Susp.</div>
            <div class="metric-value">{{ familiesMetrics.suspended }}</div>
          </div>
          <div class="metric">
            <div class="metric-label">Animaux en FA</div>
            <div class="metric-value">{{ familiesMetrics.animals }}</div>
          </div>
        </div>
        <div class="filters">
          <input
            class="filter-input"
            v-model="filters.term"
            placeholder="Recherche (nom, email, ville...)"
            type="search"
          />
          <select v-model="filters.status" class="filter-select">
            <option value="all">Tous statuts</option>
            <option value="active">Actives</option>
            <option value="suspendue">Suspendues</option>
            <option value="terminee">Terminées</option>
          </select>
          <select v-model="filters.species" class="filter-select">
            <option value="all">Tous animaux</option>
            <option v-for="sp in speciesOptions" :key="sp" :value="sp">{{ sp }}</option>
          </select>
        </div>
      </div>

      <div v-if="filteredFamilies.length === 0" class="empty">Aucune famille correspondant au filtre.</div>
      <div v-else class="families-list">
        <details
          v-for="fa in filteredFamilies"
          :key="fa.id_fa"
          class="family-item"
          :ref="setFamilyRef(fa.id_fa)"
          @toggle="(ev:any) => { if (ev.target.open) loadPlacements(fa.id_fa) }"
        >
          <summary>
              <div class="summary-main">
                <div class="summary-title">
                  {{ fa.nom }} {{ fa.prenom }} — {{ fa.email }}
                  <span class="tag" :class="['status', fa.statut]">{{ fa.statut }}</span>
                  <span v-if="fa.active_animals > 0 && fa.statut !== 'active'" class="tag warning">⚠ animaux en cours</span>
                </div>
                <div class="summary-sub">
                  Agréée le {{ formatDate(fa.date_agrement) }} · Actifs : {{ fa.active_animals }} · Placements : {{ fa.total_placements }}
                </div>
              </div>
          </summary>

          <div class="family-body">
            <div class="flex-row">
              <div class="field">
                <label>Téléphone</label>
                <div>{{ fa.tel || '—' }}</div>
              </div>
              <div class="field">
                <label>Localisation</label>
                <div>{{ fa.ville || '—' }} {{ fa.pays || '' }}</div>
              </div>
            </div>

            <div class="field field-span">
              <label>Notes</label>
              <template v-if="familyEditId === fa.id_fa">
                <textarea v-model="familyEdit.notes" placeholder="Observations"></textarea>
              </template>
              <template v-else>
                <div class="notes">{{ fa.notes || 'Aucune note.' }}</div>
              </template>
            </div>

            <div class="family-actions">
              <template v-if="familyEditId === fa.id_fa">
                <div class="grid-inline">
                  <div class="field">
                    <label>Date agrément</label>
                    <input type="date" v-model="familyEdit.date_agrement" />
                  </div>
                  <div class="field">
                    <label>Statut</label>
                    <select v-model="familyEdit.statut">
                      <option value="active">Active</option>
                      <option value="suspendue">Suspendue</option>
                      <option value="terminee">Terminée</option>
                    </select>
                  </div>
                </div>
                <div class="actions">
                  <button class="btn" @click="saveFamilyEdit(fa.id_fa)">Sauver</button>
                  <button class="btn ghost" @click="cancelFamilyEdit">Annuler</button>
                </div>
              </template>
              <template v-else>
                <div class="actions">
                  <button class="btn ghost" @click="startFamilyEdit(fa)">Modifier</button>
                  <button class="btn danger" @click="deleteFamily(fa.id_fa)">Supprimer</button>
                </div>
                <div class="inline-error" v-if="familyErrors[fa.id_fa]">
                  {{ familyErrors[fa.id_fa] }}
                </div>
              </template>
            </div>

            <div class="subcard">
              <h3>Placements</h3>
              <div class="form-grid placement-form">
                <div class="field">
                  <label>Animal</label>
                  <select v-model="fa.draft.id_animal">
                    <option :value="null" disabled>— Choisir —</option>
                    <option v-for="an in filteredAnimals" :key="an.id_animal" :value="an.id_animal">
                      #{{ an.id_animal }} — {{ an.nom_usuel || 'Sans nom' }} ({{ an.espece_libelle }})
                    </option>
                  </select>
                </div>
                <div class="field">
                  <label>Date début</label>
                  <input type="date" v-model="fa.draft.date_debut" />
                </div>
                <div class="field">
                  <label>Date fin</label>
                  <input type="date" v-model="fa.draft.date_fin" />
                </div>
                <div class="field field-span">
                  <label>Notes</label>
                  <textarea v-model="fa.draft.notes" placeholder="Suivi, logistique..."></textarea>
                </div>
              </div>
              <div class="actions">
                <button class="btn" @click="createPlacement(fa.id_fa)">Ajouter</button>
              </div>

              <div class="table-wrapper">
                <div class="table-scroll">
                  <table class="table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Animal</th>
                        <th>Dates</th>
                        <th>Notes</th>
                        <th style="width:200px;">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="row in (placementsByFamily[fa.id_fa] || [])" :key="row.id_placement">
                        <template v-if="placementEditId === row.id_placement">
                          <td>{{ row.id_placement }}</td>
                          <td>
                            <div class="strong">{{ row.animal_nom || 'Sans nom' }}</div>
                            <div class="muted">{{ row.espece_libelle }} · {{ row.animal_statut }}</div>
                          </td>
                          <td>
                            <div class="grid-two">
                              <input type="date" v-model="placementEdit.date_debut" />
                              <input type="date" v-model="placementEdit.date_fin" />
                            </div>
                          </td>
                          <td><textarea v-model="placementEdit.notes"></textarea></td>
                          <td class="actions-right">
                            <button class="btn" @click="savePlacementEdit(row)">Sauver</button>
                            <button class="btn ghost" @click="cancelPlacementEdit">Annuler</button>
                          </td>
                        </template>
                        <template v-else>
                          <td>{{ row.id_placement }}</td>
                          <td>
                            <div class="strong">{{ row.animal_nom || 'Sans nom' }}</div>
                            <div class="muted">{{ row.espece_libelle }} · {{ row.animal_statut }}</div>
                          </td>
                          <td>
                            <div>Début : {{ formatDate(row.date_debut) }}</div>
                            <div>Fin : {{ formatDate(row.date_fin) }}</div>
                          </td>
                          <td>{{ row.notes || '—' }}</td>
                          <td class="actions-right">
                            <button class="btn ghost" @click="startPlacementEdit(row)">Modifier</button>
                            <button class="btn danger" @click="deletePlacement(row)">Supprimer</button>
                          </td>
                        </template>
                      </tr>
                      <tr v-if="!(placementsByFamily[fa.id_fa] || []).length">
                        <td colspan="5" class="muted">Aucun placement enregistré.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </details>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  display: grid;
  gap: 20px;
  padding: 24px;
  background: var(--page-bg);
  color: var(--text-primary);
}
.card {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 20px;
  padding: 22px;
  display: grid;
  gap: 18px;
  box-shadow: var(--card-shadow);
}
h2 {
  margin: 0;
  font-size: 22px;
  color: var(--text-primary);
}
.form-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 20px 28px;
}
.form-grid .field {
  min-width: 240px;
  flex: 1 1 260px;
  display: grid;
  gap: 6px;
}
.form-grid .field-span textarea {
  min-height: 80px;
}
.create-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 24px 32px;
}
.create-grid .field {
  flex: 1 1 260px;
  min-width: 240px;
}
.create-grid .person-field {
  flex: 1 1 340px;
  min-width: 300px;
}
.create-grid .agreement-field {
  flex: 0 1 220px;
  min-width: 200px;
}
.create-grid .status-field {
  flex: 0 1 200px;
  min-width: 180px;
}
.actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 8px 0;
}
.metrics {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
}
.metric {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 12px;
  padding: 10px 14px;
  min-width: 100px;
}
.metric-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
}
.metric-value {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}
.planning-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 18px;
}
.planning-col {
  border: 1px solid var(--card-border);
  border-radius: 16px;
  background: var(--card-bg);
  padding: 14px;
  display: grid;
  gap: 10px;
}
.planning-col h3 {
  margin: 0;
  font-size: 16px;
  color: var(--text-primary);
}
.planning-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.planning-list li {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 12px;
  padding: 10px 12px;
}
.planning-list .muted.small {
  margin: 0;
}
.match-grid {
  display: flex;
  gap: 18px;
  flex-wrap: wrap;
  align-items: flex-end;
}
.match-grid .field {
  min-width: 260px;
  flex: 1 1 320px;
}
.match-results {
  display: grid;
  gap: 12px;
}
.match-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 12px;
}
.match-list li {
  border: 1px solid var(--card-border);
  border-radius: 16px;
  background: var(--card-bg);
  padding: 12px 14px;
  display: grid;
  gap: 6px;
}
.match-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.reason-list {
  margin: 0;
  padding-left: 18px;
  color: var(--muted);
  font-size: 13px;
  display: grid;
  gap: 4px;
}
.tag.score {
  background: #213054;
  border-color: #5367a4;
  color: #d5dfff;
}
.filters {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  color: var(--text-primary);
}
.filter-input,
.filter-select {
  border: 1px solid var(--field-border);
  border-radius: 12px;
  padding: 8px 12px;
  font-size: 14px;
  min-width: 180px;
  background: var(--field-bg);
  color: var(--text-primary);
}
.filter-input:focus,
.filter-select:focus {
  border-color: #2f73ff;
  outline: none;
  box-shadow: 0 0 0 3px rgba(47,115,255,0.18);
}
.btn {
  background: linear-gradient(135deg, #2f73ff, #5b89ff);
  color: #fff;
  border: none;
  padding: 9px 18px;
  border-radius: 12px;
  font-weight: 600;
  box-shadow: 0 16px 28px -20px rgba(47, 115, 255, 0.6);
  transition: transform 0.15s ease, box-shadow 0.2s ease;
}
.btn:hover { transform: translateY(-1px); }
.btn:active { transform: translateY(0); }
.btn.ghost {
  background: #eef3ff;
  color: #2f73ff;
  border: 1px solid #d1dcff;
  box-shadow: none;
}
.btn.danger {
  background: linear-gradient(135deg, #ff4b4b, #ff7070);
  box-shadow: 0 14px 24px -18px rgba(255, 75, 75, 0.55);
}
.inline-error {
  margin-top: 8px;
  padding: 8px 12px;
  border-radius: 10px;
  background: #ffe6e9;
  border: 1px solid #ffcbd5;
  color: #b42335;
  font-size: 13px;
  font-weight: 500;
}
.banner.error {
  background: #ffe6e9;
  border: 1px solid #ffcbd5;
  color: #b42335;
  padding: 10px 14px;
  border-radius: 12px;
  font-weight: 600;
}
.field label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--muted);
  letter-spacing: 0.05em;
}
.field input,
.field select,
.field textarea {
  border: 1px solid var(--field-border);
  border-radius: 12px;
  padding: 10px 12px;
  background: var(--field-bg);
  color: var(--text-primary);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.field input:focus,
.field select:focus,
.field textarea:focus {
  border-color: #2f73ff;
  box-shadow: 0 0 0 3px rgba(47, 115, 255, 0.18);
  outline: none;
}
.families-list {
  display: grid;
  gap: 16px;
}
.family-item {
  border: 1px solid var(--card-border);
  border-radius: 18px;
  background: var(--card-bg);
  overflow: hidden;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.family-item[open] {
  box-shadow: 0 18px 26px -24px rgba(20, 30, 60, 0.35);
}
.family-item > summary {
  list-style: none;
  padding: 16px 18px;
  cursor: pointer;
  display: flex;
  gap: 12px;
  align-items: center;
}
.family-item > summary::-webkit-details-marker { display: none; }
.summary-main { display: flex; flex-direction: column; gap: 4px; width: 100%; }
.summary-title {
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.summary-sub {
  font-size: 12px;
  color: var(--muted);
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}
.family-body {
  padding: 18px;
  display: grid;
  gap: 16px;
}
.flex-row {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
}
.flex-row .field {
  min-width: 200px;
  flex: 1 1 240px;
}
.notes {
  min-height: 40px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--card-border);
  background: var(--card-bg);
}
.family-actions {
  display: grid;
  gap: 12px;
}
.grid-inline {
  display: flex;
  gap: 18px;
  flex-wrap: wrap;
}
.grid-inline .field {
  min-width: 200px;
  flex: 1 1 200px;
}
.subcard {
  border: 1px solid var(--card-border);
  border-radius: 16px;
  padding: 16px;
  background: var(--card-bg);
  display: grid;
  gap: 14px;
}
.subcard h3 {
  margin: 0;
  font-size: 18px;
  color: var(--text-primary);
}
.placement-form .field {
  flex: 1 1 220px;
}
.table-wrapper {
  border: 1px solid var(--table-border);
  border-radius: 14px;
  overflow: hidden;
}
.table-scroll {
  max-height: 300px;
  overflow: auto;
}
.table {
  width: 100%;
  min-width: 760px;
  border-collapse: collapse;
  font-size: 14px;
  color: var(--text-primary);
}
.table thead th {
  text-align: left;
  padding: 10px 12px;
  background: var(--table-header-bg);
  border-bottom: 1px solid var(--table-border);
  font-weight: 600;
  color: var(--muted);
}
.table tbody td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--table-border);
  vertical-align: top;
}
.table tbody tr:last-child td { border-bottom: none; }
.tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  border: 1px solid #5b74d0;
  background: #273862;
  color: #9fb9ff;
}
.tag.status.active { background: #143728; color: #7ee0a8; border-color: #388b64; }
.tag.status.suspendue { background: #41250d; color: #ffb775; border-color: #a05f23; }
.tag.status.terminee { background: #272a3b; color: #c6cce6; border-color: #555b7d; }
.tag.warning {
  background: #3d250e;
  color: #ffba72;
  border-color: #9a5f1f;
}
.muted { color: var(--muted); font-size: 12px; }
.strong { font-weight: 600; color: var(--text-primary); }
.empty {
  padding: 16px;
  text-align: center;
  border-radius: 14px;
  background: var(--card-bg);
  border: 1px dashed var(--card-border);
  color: var(--muted);
  font-size: 14px;
}
@media (max-width: 900px) {
  .form-grid {
    gap: 16px;
  }
  .match-grid {
    gap: 12px;
  }
  .filters {
    width: 100%;
    justify-content: flex-start;
  }
  .summary-sub {
    flex-direction: column;
    gap: 6px;
  }
}
</style>
