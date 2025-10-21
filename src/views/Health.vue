<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

type MedicalOverviewRow = {
  id_evt: number;
  id_animal: number;
  type: string;
  sous_type: string | null;
  date_evt: string;
  date_validite: string | null;
  notes: string | null;
  vet_nom: string | null;
  vet_contact: string | null;
  vet_adresse: string | null;
  animal_nom: string | null;
  espece_libelle: string;
  days_until_due: number | null;
  status: 'overdue' | 'due_soon' | 'upcoming' | 'unknown';
};

const router = useRouter();
const ui = reactive({ loading: false, error: '' });
const events = ref<MedicalOverviewRow[]>([]);
const filters = reactive({
  status: 'due_soon' as 'all' | 'overdue' | 'due_soon' | 'upcoming',
  type: 'all' as string,
  species: 'all' as string,
  horizon: 30
});

function resetError() {
  ui.error = '';
}

async function safeInvoke(channel: string, payload?: any) {
  try {
    return await window.api.invoke(channel, payload);
  } catch (e: any) {
    ui.error = `IPC ${channel} a échoué : ${e?.message || e}`;
    throw e;
  }
}

async function loadOverview() {
  resetError();
  ui.loading = true;
  try {
    const payload: any = { horizonDays: filters.horizon };
    if (filters.status !== 'all') payload.status = filters.status;
    if (filters.type !== 'all') payload.type = filters.type;
    if (filters.species !== 'all') payload.species = filters.species;
    const res = await safeInvoke('medical:events:overview', payload);
    events.value = (res?.rows ?? []).map((row: any) => ({
      id_evt: Number(row.id_evt),
      id_animal: Number(row.id_animal),
      type: row.type,
      sous_type: row.sous_type ?? null,
      date_evt: row.date_evt,
      date_validite: row.date_validite ?? null,
      notes: row.notes ?? null,
      vet_nom: row.vet_nom ?? null,
      vet_contact: row.vet_contact ?? null,
      vet_adresse: row.vet_adresse ?? null,
      animal_nom: row.animal_nom ?? null,
      espece_libelle: row.espece_libelle ?? '',
      days_until_due: row.days_until_due !== null ? Number(row.days_until_due) : null,
      status: (row.status ?? 'unknown') as MedicalOverviewRow['status']
    }));
  } finally {
    ui.loading = false;
  }
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(date);
}

const metrics = computed(() => {
  const total = events.value.length;
  const overdue = events.value.filter((row) => row.status === 'overdue').length;
  const dueSoon = events.value.filter((row) => row.status === 'due_soon').length;
  const upcoming = events.value.filter((row) => row.status === 'upcoming').length;
  return { total, overdue, dueSoon, upcoming };
});

const typeOptions = computed(() => {
  const set = new Set<string>();
  for (const row of events.value) set.add(row.type);
  return Array.from(set).sort();
});

const speciesOptions = computed(() => {
  const set = new Set<string>();
  for (const row of events.value) set.add(row.espece_libelle);
  return Array.from(set).sort();
});

const filteredEvents = computed(() => {
  return events.value;
});

function statusLabel(status: MedicalOverviewRow['status']) {
  switch (status) {
    case 'overdue':
      return 'En retard';
    case 'due_soon':
      return 'À planifier';
    case 'upcoming':
      return 'À venir';
    default:
      return '—';
  }
}

function statusClass(status: MedicalOverviewRow['status']) {
  return {
    overdue: 'status-overdue',
    due_soon: 'status-soon',
    upcoming: 'status-upcoming',
    unknown: 'status-unknown'
  }[status];
}

function exportCsv() {
  if (!filteredEvents.value.length) return;
  const header = ['Animal', 'Espèce', 'Type', 'Sous-type', 'Date', 'Validité', 'Statut', 'Vétérinaire', 'Notes'];
  const rows = filteredEvents.value.map((row) => [
    row.animal_nom || `#${row.id_animal}`,
    row.espece_libelle,
    row.type,
    row.sous_type || '',
    formatDate(row.date_evt),
    formatDate(row.date_validite),
    statusLabel(row.status),
    row.vet_nom || '',
    row.notes?.replace(/\r?\n/g, ' ') || ''
  ]);
  const csv = [header, ...rows].map((line) => line.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(';')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'suivi-sante.csv';
  link.click();
  URL.revokeObjectURL(url);
}

function goToAnimal(id: number) {
  router.push('/app/animals');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

onMounted(() => {
  loadOverview();
});
</script>

<template>
  <div class="page">
    <div v-if="ui.error" class="banner error">{{ ui.error }}</div>

    <div class="card filters">
      <div class="filter-group">
        <label>Statut</label>
        <select v-model="filters.status" @change="loadOverview">
          <option value="due_soon">À planifier (≤ {{ filters.horizon }} j)</option>
          <option value="overdue">En retard</option>
          <option value="upcoming">À venir &gt; {{ filters.horizon }} j</option>
          <option value="all">Tous</option>
        </select>
      </div>
      <div class="filter-group">
        <label>Type</label>
        <select v-model="filters.type" @change="loadOverview">
          <option value="all">Tous</option>
          <option v-for="type in typeOptions" :key="type" :value="type">{{ type }}</option>
        </select>
      </div>
      <div class="filter-group">
        <label>Espèce</label>
        <select v-model="filters.species" @change="loadOverview">
          <option value="all">Toutes</option>
          <option v-for="sp in speciesOptions" :key="sp" :value="sp">{{ sp }}</option>
        </select>
      </div>
      <div class="filter-group">
        <label>Horizon (jours)</label>
        <input type="number" min="1" max="180" v-model.number="filters.horizon" @change="loadOverview" />
      </div>
      <div class="actions">
        <button class="btn" @click="loadOverview" :disabled="ui.loading">Actualiser</button>
        <button class="btn ghost" @click="exportCsv" :disabled="!filteredEvents.length">Exporter CSV</button>
      </div>
    </div>

    <div class="card metrics-card">
      <div class="metric">
        <div class="metric-label">Total</div>
        <div class="metric-value">{{ metrics.total }}</div>
      </div>
      <div class="metric">
        <div class="metric-label">En retard</div>
        <div class="metric-value">{{ metrics.overdue }}</div>
      </div>
      <div class="metric">
        <div class="metric-label">À planifier</div>
        <div class="metric-value">{{ metrics.dueSoon }}</div>
      </div>
      <div class="metric">
        <div class="metric-label">À venir</div>
        <div class="metric-value">{{ metrics.upcoming }}</div>
      </div>
    </div>

    <div class="card">
      <h2>Planning santé</h2>
      <div v-if="ui.loading" class="muted">Chargement...</div>
      <div v-else-if="!filteredEvents.length" class="muted">Aucun évènement correspondant au filtre.</div>
      <div v-else class="table-wrapper">
        <table class="table">
          <thead>
            <tr>
              <th>Animal</th>
              <th>Espèce</th>
              <th>Type</th>
              <th>Dernier acte</th>
              <th>Validité</th>
              <th>Statut</th>
              <th>Vétérinaire</th>
              <th>Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in filteredEvents" :key="row.id_evt">
              <td>{{ row.animal_nom || ('#' + row.id_animal) }}</td>
              <td>{{ row.espece_libelle }}</td>
              <td>
                <div class="strong">{{ row.type }}</div>
                <div class="muted small">{{ row.sous_type || '—' }}</div>
              </td>
              <td>{{ formatDate(row.date_evt) }}</td>
              <td>{{ formatDate(row.date_validite) }}</td>
              <td><span :class="['status-badge', statusClass(row.status)]">{{ statusLabel(row.status) }}</span></td>
              <td>
                <div>{{ row.vet_nom || '—' }}</div>
                <div v-if="row.vet_contact" class="muted small">{{ row.vet_contact }}</div>
                <div v-if="row.vet_adresse" class="muted small">{{ row.vet_adresse }}</div>
              </td>
              <td>{{ row.notes || '—' }}</td>
              <td class="actions-right"><button class="btn ghost" @click="goToAnimal(row.id_animal)">Voir</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  display: grid;
  gap: 20px;
  padding: 24px;
  background: linear-gradient(180deg, #f8faff 0%, #f2f4fa 100%);
}
.card {
  background: #ffffff;
  border: 1px solid #e1e6f3;
  border-radius: 20px;
  padding: 20px;
  display: grid;
  gap: 16px;
  box-shadow: 0 20px 34px -26px rgba(17, 27, 60, 0.35);
}
.filters {
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  align-items: end;
}
.filter-group {
  display: grid;
  gap: 6px;
}
.filter-group label {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #637099;
}
.filter-group select,
.filter-group input {
  border: 1px solid #d4daeb;
  border-radius: 12px;
  padding: 9px 12px;
  background: #fff;
}
.actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  flex-wrap: wrap;
}
.btn {
  background: linear-gradient(135deg, #2f73ff, #5c8dff);
  color: #fff;
  border: none;
  padding: 9px 18px;
  border-radius: 12px;
  font-weight: 600;
}
.btn.ghost {
  background: #eef3ff;
  color: #2f73ff;
  border: 1px solid #d0dcff;
}
.metrics-card {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 16px;
}
.metric {
  border: 1px solid #dde3f7;
  border-radius: 16px;
  background: #f6f8ff;
  padding: 12px 14px;
}
.metric-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #5f6c9b;
}
.metric-value {
  font-size: 20px;
  font-weight: 600;
  color: #1f2d4d;
}
.table-wrapper {
  overflow-x: auto;
}
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
  min-width: 900px;
}
.table th,
.table td {
  padding: 10px 12px;
  border-bottom: 1px solid #eef1f9;
  vertical-align: top;
}
.table thead th {
  background: #f2f5ff;
  color: #55618a;
  font-weight: 600;
}
.table tbody tr:last-child td {
  border-bottom: none;
}
.actions-right {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.muted {
  color: #7b86a9;
  font-size: 13px;
}
.muted.small {
  font-size: 12px;
}
.strong {
  font-weight: 600;
  color: #1f2d4d;
}
.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.status-overdue {
  background: #ffe7e7;
  color: #b42335;
}
.status-soon {
  background: #fff3db;
  color: #a46011;
}
.status-upcoming {
  background: #e8f6ff;
  color: #2466a8;
}
.status-unknown {
  background: #f1f1f5;
  color: #5f667e;
}
.banner.error {
  background: #ffe6e9;
  border: 1px solid #ffcbd5;
  color: #b42335;
  padding: 10px 14px;
  border-radius: 12px;
  font-weight: 600;
}
</style>
