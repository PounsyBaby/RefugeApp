<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useSession } from '../composables/session';

type AnimalSummary = {
  id_animal: number;
  nom_usuel: string | null;
  statut: string;
  date_arrivee: string | null;
  espece_libelle: string;
};

type DemandeSummary = {
  id_demande: number;
  nom: string;
  prenom: string;
  statut: string;
  date_depot: string;
  nb_animaux: number;
};

type DashboardSummary = {
  animals: {
    total: number;
    adoptablesTotal: number;
    byStatus: { statut: string | null; total: number }[];
    adoptablesRecent: AnimalSummary[];
  };
  demandes: {
    total: number;
    openTotal: number;
    recent: DemandeSummary[];
  };
  medical: {
    upcoming: MedicalReminder[];
  };
};

type MedicalReminder = {
  id_evt: number;
  id_animal: number;
  type: string;
  sous_type: string | null;
  date_evt: string | null;
  date_validite: string | null;
  days_until_due: number | null;
  is_expired: boolean;
  animal_nom: string | null;
  espece_libelle: string | null;
};

const session = useSession();
const router = useRouter();
const ui = reactive({ error: '', loading: false });
const summary = reactive<DashboardSummary>({
  animals: {
    total: 0,
    adoptablesTotal: 0,
    byStatus: [],
    adoptablesRecent: [],
  },
  demandes: {
    total: 0,
    openTotal: 0,
    recent: [],
  },
  medical: {
    upcoming: [],
  },
});

function resetError() {
  ui.error = '';
}

async function safeInvoke(channel: string, payload?: any) {
  try {
    const res = await window.api.invoke(channel, payload);
    if (res?.ok === false && res?.message) ui.error = res.message;
    return res;
  } catch (err: any) {
    ui.error = `IPC ${channel} a échoué : ${err?.message || err}`;
    console.error(`[dashboard:${channel}]`, err);
    throw err;
  }
}

const animalsByStatus = computed(() =>
  summary.animals.byStatus.map((row) => ({
    statut: row.statut ?? 'inconnu',
    total: row.total,
  }))
);

const recentAdoptables = computed(() => summary.animals.adoptablesRecent);

const demandesOuvertes = computed(() =>
  summary.demandes.recent
    .filter((d) => ['soumise', 'en_etude', 'approuvee'].includes(d.statut))
    .slice(0, 6)
);

const medicalUpcoming = computed(() => summary.medical.upcoming);

const totalAnimals = computed(() => summary.animals.total);
const totalAdoptables = computed(() => summary.animals.adoptablesTotal);
const totalDemandes = computed(() => summary.demandes.total);
const totalDemandesOuvertes = computed(() => summary.demandes.openTotal);

type GlobalSearchResult = {
  type: 'animal' | 'person' | 'user' | 'adoption';
  id: number;
  title: string;
  subtitle: string;
  route: string;
  query: Record<string, string>;
  score: number;
};

const searchState = reactive({
  term: '',
  results: [] as GlobalSearchResult[],
  loading: false,
  error: ''
});
let searchDebounce: ReturnType<typeof setTimeout> | null = null;
let lastSearchToken: symbol | null = null;

const hasSearchTerm = computed(() => searchState.term.trim().length > 0);
const showSearchResults = computed(
  () => hasSearchTerm.value && (searchState.loading || searchState.results.length > 0 || !!searchState.error)
);

const searchLabels: Record<GlobalSearchResult['type'], string> = {
  animal: 'Animal',
  person: 'Personne',
  user: 'Utilisateur',
  adoption: 'Contrat'
};

watch(
  () => searchState.term,
  (value) => {
    if (searchDebounce) clearTimeout(searchDebounce);
    const trimmed = value.trim();
    if (!trimmed) {
      searchState.results = [];
      searchState.loading = false;
      searchState.error = '';
      lastSearchToken = null;
      return;
    }
    searchDebounce = setTimeout(() => runGlobalSearch(trimmed), 220);
  }
);

async function runGlobalSearch(term: string) {
  if (!term.trim()) return;
  const token = Symbol('search');
  lastSearchToken = token;
  searchState.loading = true;
  searchState.error = '';

  try {
    const res = await window.api.invoke('global:search', { term });
    if (lastSearchToken !== token) return;
    searchState.results = Array.isArray(res?.rows) ? res.rows : [];
  } catch (err: any) {
    if (lastSearchToken !== token) return;
    searchState.results = [];
    searchState.error = err?.message || String(err);
  } finally {
    if (lastSearchToken === token) {
      searchState.loading = false;
    }
  }
}

function clearSearch() {
  searchState.term = '';
  searchState.results = [];
  searchState.error = '';
  searchState.loading = false;
  lastSearchToken = null;
}

function openSearchResult(item: GlobalSearchResult) {
  router.push({ path: item.route, query: item.query });
  nextTick(() => clearSearch());
}

function onSearchEnter() {
  if (searchState.results.length > 0) {
    openSearchResult(searchState.results[0]);
  }
}

onUnmounted(() => {
  if (searchDebounce) clearTimeout(searchDebounce);
});

onMounted(async () => {
  resetError();
  ui.loading = true;
  try {
    await session.init();
    const res = await safeInvoke('dashboard:summary');
    if (res) {
      summary.animals.total = res.animals?.total ?? 0;
      summary.animals.adoptablesTotal = res.animals?.adoptablesTotal ?? 0;
      summary.animals.byStatus = Array.isArray(res.animals?.byStatus) ? res.animals.byStatus : [];
      summary.animals.adoptablesRecent = Array.isArray(res.animals?.adoptablesRecent)
        ? res.animals.adoptablesRecent
        : [];

      summary.demandes.total = res.demandes?.total ?? 0;
      summary.demandes.openTotal = res.demandes?.openTotal ?? 0;
      summary.demandes.recent = Array.isArray(res.demandes?.recent) ? res.demandes.recent : [];

      summary.medical.upcoming = Array.isArray(res.medical?.upcoming)
        ? res.medical.upcoming.map((row: any) => ({
            id_evt: Number(row.id_evt),
            id_animal: Number(row.id_animal),
            type: row.type,
            sous_type: row.sous_type ?? null,
            date_evt: row.date_evt ?? null,
            date_validite: row.date_validite ?? null,
            days_until_due:
              row.days_until_due === null || row.days_until_due === undefined
                ? null
                : Number(row.days_until_due),
            is_expired: row.is_expired === true || row.is_expired === 1,
            animal_nom: row.animal_nom ?? null,
            espece_libelle: row.espece_libelle ?? null,
          }))
        : [];
    }
  } finally {
    ui.loading = false;
  }
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
  if (!v) return '—';
  return v.split('-').reverse().join('/');
}

function medicalStatusLabel(item: MedicalReminder): string {
  if (!item.date_validite) return 'Sans validité';
  if (item.is_expired) return 'A renouveler';
  const days = item.days_until_due ?? null;
  if (days === null) return 'Validité en cours';
  if (days < 0) return 'A renouveler';
  if (days === 0) return 'Aujourd\'hui';
  if (days === 1) return 'Dans 1 jour';
  return `Dans ${days} j`;
}

</script>

<template>
  <div class="page dashboard">
    <div v-if="ui.error" class="banner error">{{ ui.error }}</div>

    <div class="search-card">
      <div class="search-header">
        <div class="search-input">
          <input
            v-model="searchState.term"
            type="search"
            placeholder="Rechercher un animal, une personne, un contrat, un utilisateur…"
            @keydown.enter.prevent="onSearchEnter"
            aria-label="Recherche globale"
          />
          <button
            v-if="searchState.term"
            class="search-clear"
            type="button"
            @click="clearSearch"
            aria-label="Effacer la recherche"
          >
            ×
          </button>
        </div>
        <div class="search-status">
          <span v-if="searchState.loading" class="muted">Recherche…</span>
          <span v-else-if="searchState.error" class="search-error">{{ searchState.error }}</span>
          <span v-else-if="searchState.results.length" class="muted">
            {{ searchState.results.length }} résultat{{ searchState.results.length > 1 ? 's' : '' }}
          </span>
          <span v-else class="muted">Tape pour lancer la recherche globale</span>
        </div>
      </div>

      <ul v-if="showSearchResults" class="search-results">
        <li
          v-for="res in searchState.results"
          :key="res.type + '-' + res.id"
          class="search-result"
        >
          <button type="button" class="search-result-btn" @click="openSearchResult(res)">
            <span class="search-badge" :class="'badge-' + res.type">{{ searchLabels[res.type] || res.type }}</span>
            <span class="search-main">
              <span class="title">{{ res.title }}</span>
              <span class="subtitle">{{ res.subtitle }}</span>
            </span>
          </button>
        </li>
      </ul>
    </div>

    <div class="grid metrics">
      <div class="metric-card">
        <div class="metric-label">Animaux suivis</div>
        <div class="metric-value">{{ totalAnimals }}</div>
        <div class="metric-sub">Dont adoptables : {{ totalAdoptables }}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Demandes actives</div>
        <div class="metric-value">{{ totalDemandes }}</div>
        <div class="metric-sub">En étude : {{ totalDemandesOuvertes }}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Statuts animaux</div>
        <ul class="metric-list">
          <li v-for="item in animalsByStatus" :key="item.statut">
            <span class="tag">{{ item.statut }}</span>
            <span>{{ item.total }}</span>
          </li>
          <li v-if="animalsByStatus.length === 0" class="muted">Aucun animal.</li>
        </ul>
      </div>
    </div>

    <div class="grid panels">
      <div class="panel">
        <header>
          <h3>Adoptables récents</h3>
        </header>
        <table class="table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Espèce</th>
              <th>Statut</th>
              <th>Date arrivée</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="animal in recentAdoptables" :key="animal.id_animal">
              <td>{{ animal.nom_usuel || '—' }}</td>
              <td>{{ animal.espece_libelle }}</td>
              <td><span class="tag">{{ animal.statut }}</span></td>
              <td>{{ animal.date_arrivee || '—' }}</td>
            </tr>
            <tr v-if="recentAdoptables.length === 0">
              <td colspan="4" class="muted">Aucun animal adoptable pour le moment.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="panel">
        <header>
          <h3>Demandes à traiter</h3>
        </header>
        <table class="table">
          <thead>
            <tr>
              <th>Demande</th>
              <th>Date dépôt</th>
              <th>Statut</th>
              <th>Animaux</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="demande in demandesOuvertes" :key="demande.id_demande">
              <td>{{ demande.nom }} {{ demande.prenom }}</td>
              <td>{{ demande.date_depot }}</td>
              <td><span class="tag">{{ demande.statut }}</span></td>
              <td>{{ demande.nb_animaux }}</td>
            </tr>
            <tr v-if="demandesOuvertes.length === 0">
              <td colspan="4" class="muted">Aucune demande en file.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="panel">
        <header>
          <h3>Suivi santé</h3>
        </header>
        <table class="table">
          <thead>
            <tr>
              <th>Acte</th>
              <th>Animal</th>
              <th>Validité</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in medicalUpcoming" :key="item.id_evt">
              <td>
                <div class="strong">{{ item.type }}</div>
                <div class="muted">{{ item.sous_type || '—' }}</div>
              </td>
              <td>
                <div>{{ item.animal_nom || ('Animal #' + item.id_animal) }}</div>
                <div class="muted">{{ item.espece_libelle || '' }}</div>
              </td>
              <td>{{ formatDateDisplay(item.date_validite) }}</td>
              <td>
                <span class="status-chip" :class="{
                  overdue: item.is_expired,
                  soon: !item.is_expired && (item.days_until_due ?? 999) <= 7
                }">
                  {{ medicalStatusLabel(item) }}
                </span>
              </td>
            </tr>
            <tr v-if="medicalUpcoming.length === 0">
              <td colspan="4" class="muted">Aucun rappel dans les 30 prochains jours.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard{display:grid;gap:24px;padding-bottom:30px}
.search-card{background:#fff;border:1px solid #e7eaf3;border-radius:14px;padding:18px;box-shadow:0 2px 6px rgba(14,32,68,0.05);display:grid;gap:12px}
.search-header{display:flex;flex-wrap:wrap;gap:12px;align-items:center}
.search-input{position:relative;flex:1 1 320px}
.search-input input{width:100%;padding:10px 36px 10px 14px;border:1px solid #d6dcef;border-radius:10px;font-size:14px;background:#fdfdff;transition:border-color .2s ease,box-shadow .2s ease}
.search-input input:focus{border-color:#2f73ff;box-shadow:0 0 0 3px rgba(47,115,255,.18);outline:none}
.search-clear{position:absolute;top:50%;right:10px;transform:translateY(-50%);border:none;background:transparent;font-size:18px;line-height:1;color:#5b6c94;cursor:pointer}
.search-status{min-width:160px;font-size:13px;color:#5b6c94}
.search-card .muted{padding:0;text-align:left}
.search-error{color:#b00020;font-size:13px}
.search-results{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.search-result{margin:0}
.search-result-btn{width:100%;display:flex;align-items:flex-start;gap:14px;border:1px solid #e4e9f7;border-radius:12px;padding:10px 14px;background:#f9fbff;font-size:13px;text-align:left;cursor:pointer;transition:transform .15s ease,box-shadow .15s ease,border-color .2s ease}
.search-result-btn:hover{transform:translateY(-1px);box-shadow:0 8px 18px -14px rgba(47,115,255,.6);border-color:#cdd8ff}
.search-badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;font-weight:600}
.search-badge.badge-animal{background:#eef6ff;color:#2457c6;border:1px solid #c6dcff}
.search-badge.badge-person{background:#f3f4ff;color:#5137c5;border:1px solid #d8d8ff}
.search-badge.badge-user{background:#f1fbf3;color:#2c7a4b;border:1px solid #c4e6cf}
.search-badge.badge-adoption{background:#fff7eb;color:#a6631b;border:1px solid #f3d3a4}
.search-main{display:flex;flex-direction:column;gap:4px}
.search-main .title{font-weight:600;color:#1d2a4d;font-size:14px}
.search-main .subtitle{color:#5b6c94;font-size:12px}
.metrics{display:grid;grid-template-columns: repeat(auto-fit, minmax(220px,1fr));gap:16px}
.metric-card{background:#fff;border:1px solid #e7eaf3;border-radius:14px;padding:18px;box-shadow:0 2px 6px rgba(14,32,68,0.05);display:flex;flex-direction:column;gap:8px}
.metric-label{font-size:13px;color:#5b6c94;text-transform:uppercase;letter-spacing:.08em}
.metric-value{font-size:30px;font-weight:700;color:#1d2a4d}
.metric-sub{font-size:13px;color:#6b7b9b}
.metric-list{list-style:none;margin:0;padding:0;display:grid;gap:6px;font-size:13px;color:#33415c}
.metric-list li{display:flex;align-items:center;justify-content:space-between}
.tag{display:inline-block;padding:2px 8px;border-radius:999px;background:#edf2ff;color:#3351a6;font-size:12px;text-transform:uppercase;letter-spacing:.05em}
.muted{color:#8a94ad;font-size:13px;text-align:center;padding:14px 0}
.panels{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:20px}
.panel{background:#fff;border:1px solid #e7eaf3;border-radius:14px;box-shadow:0 2px 6px rgba(14,32,68,0.05);overflow:hidden;display:flex;flex-direction:column}
.panel header{padding:16px 18px;border-bottom:1px solid #eef1f8}
.panel h3{margin:0;font-size:18px;color:#1d2a4d}
.table{width:100%;border-collapse:collapse;font-size:13px}
.table th,.table td{padding:10px 14px;border-bottom:1px solid #eef1f8;text-align:left}
.table tbody tr:last-child td{border-bottom:none}
.banner.error{background:#ffe8e8;color:#a90f0f;border:1px solid #ffc8c8;padding:10px 14px;border-radius:10px}
.status-chip{display:inline-flex;align-items:center;gap:6px;padding:2px 10px;border-radius:999px;background:#e8f5e9;color:#256029;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
.status-chip.soon{background:#fff4e5;color:#b05a00}
.status-chip.overdue{background:#ffe7e7;color:#b71c1c}
</style>
