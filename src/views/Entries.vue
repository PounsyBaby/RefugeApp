<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

type EntryRow = {
  id_entree: number;
  id_animal: number;
  animal_nom: string | null;
  date_entree: string;
  type: 'abandon' | 'trouve' | 'saisie' | 'transfert' | 'autre';
  source_personne: number | null;
  source_nom: string | null;
  source_prenom: string | null;
  source_email: string | null;
  details: string | null;
};

type AnimalOption = { id_animal: number; label: string };
type PersonOption = { id_personne: number; label: string };

const router = useRouter();
const ui = reactive({ loading: false, error: '' });
const entries = ref<EntryRow[]>([]);
const animals = ref<AnimalOption[]>([]);
const people = ref<PersonOption[]>([]);
const filterTerm = ref('');

const createForm = reactive({
  id_animal: null as number | null,
  date_entree: '',
  type: 'abandon' as EntryRow['type'],
  source_personne: null as number | null,
  details: ''
});

const editingId = ref<number | null>(null);
const editEntry = reactive({
  id_animal: null as number | null,
  date_entree: '',
  type: 'abandon' as EntryRow['type'],
  source_personne: null as number | null,
  details: ''
});

function resetError() {
  ui.error = '';
}

async function safeInvoke<T = any>(channel: string, payload?: any): Promise<T> {
  try {
    return await window.api.invoke(channel, payload);
  } catch (err: any) {
    ui.error = `IPC ${channel} a échoué : ${err?.message || err}`;
    console.error(`[entries:${channel}]`, err);
    throw err;
  }
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function loadAnimals() {
  const res = await safeInvoke<{ rows: any[] }>('animals:list');
  animals.value = (res?.rows ?? []).map((row) => ({
    id_animal: Number(row.id_animal),
    label: row.nom_usuel ? `${row.nom_usuel} (#${row.id_animal})` : `Animal #${row.id_animal} (${row.espece_libelle})`
  }));
}

async function loadPeople() {
  const res = await safeInvoke<{ rows: any[] }>('people:list');
  people.value = (res?.rows ?? []).map((row) => ({
    id_personne: Number(row.id_personne),
    label: `${row.nom} ${row.prenom} (${row.email})`
  }));
}

function toDateInput(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    return '';
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return '';
}

async function loadEntries() {
  const res = await safeInvoke<{ rows: any[] }>('entries:list');
  entries.value = (res?.rows ?? []).map((row) => ({
    id_entree: Number(row.id_entree),
    id_animal: Number(row.id_animal),
    animal_nom: row.animal_nom ?? null,
    date_entree: toDateInput(row.date_entree),
    type: row.type,
    source_personne: row.source_personne === null || row.source_personne === undefined
      ? null
      : Number(row.source_personne),
    source_nom: row.source_nom ?? null,
    source_prenom: row.source_prenom ?? null,
    source_email: row.source_email ?? null,
    details: row.details ?? null
  })) as EntryRow[];
}

onMounted(async () => {
  resetError();
  ui.loading = true;
  try {
    await Promise.all([loadAnimals(), loadPeople()]);
    await loadEntries();
    if (!createForm.date_entree) {
      createForm.date_entree = today();
    }
  } finally {
    ui.loading = false;
  }
});

const filteredEntries = computed(() => {
  const term = filterTerm.value.trim().toLowerCase();
  if (!term) return entries.value;
  return entries.value.filter((entry) => {
    const haystack = [
      entry.animal_nom || '',
      `#${entry.id_animal}`,
      entry.type,
      entry.source_nom || '',
      entry.source_prenom || '',
      entry.source_email || '',
      entry.details || ''
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(term);
  });
});

function resetCreateForm() {
  createForm.id_animal = null;
  createForm.date_entree = today();
  createForm.type = 'abandon';
  createForm.source_personne = null;
  createForm.details = '';
}

async function createEntry() {
  resetError();
  if (!createForm.id_animal || !createForm.date_entree) {
    ui.error = 'Animal et date sont requis';
    return;
  }
  const payload = {
    id_animal: createForm.id_animal,
    date_entree: createForm.date_entree,
    type: createForm.type,
    source_personne: createForm.source_personne,
    details: createForm.details?.trim() || null
  };
  const res = await safeInvoke<{ id_entree: number }>('entries:create', payload);
  if (res?.id_entree) {
    resetCreateForm();
    await loadEntries();
  }
}

function startEdit(entry: EntryRow) {
  editingId.value = entry.id_entree;
  editEntry.id_animal = entry.id_animal;
  editEntry.date_entree = toDateInput(entry.date_entree);
  editEntry.type = entry.type;
  editEntry.source_personne = entry.source_personne;
  editEntry.details = entry.details || '';
}

function cancelEdit() {
  editingId.value = null;
  editEntry.id_animal = null;
  editEntry.date_entree = '';
  editEntry.type = 'abandon';
  editEntry.source_personne = null;
  editEntry.details = '';
}

async function saveEdit(entry: EntryRow) {
  if (!editingId.value) return;
  if (!editEntry.id_animal || !editEntry.date_entree) {
    ui.error = 'Animal et date sont requis';
    return;
  }
  const payload = {
    id_entree: editingId.value,
    id_animal: editEntry.id_animal,
    date_entree: editEntry.date_entree,
    type: editEntry.type,
    source_personne: editEntry.source_personne,
    details: editEntry.details?.trim() || null
  };
  const res = await safeInvoke<{ ok: boolean }>('entries:update', payload);
  if (res?.ok !== false) {
    await loadEntries();
    cancelEdit();
  }
}

async function removeEntry(entry: EntryRow) {
  if (!confirm('Supprimer cette entrée ?')) return;
  const res = await safeInvoke<{ ok: boolean }>('entries:delete', entry.id_entree);
  if (res?.ok) await loadEntries();
}

function goToAnimal(id: number) {
  router.push({ path: '/app/animals', query: { animalId: String(id) } });
}

function goToPerson(id: number | null) {
  if (!id) return;
  router.push({ path: '/app/people', query: { personId: String(id) } });
}

const entryTypes: EntryRow['type'][] = ['abandon', 'trouve', 'saisie', 'transfert', 'autre'];
</script>

<template>
  <div class="page">
    <div v-if="ui.error" class="banner error">{{ ui.error }}</div>

    <div class="card">
      <h2>Nouvelle entrée</h2>
      <div class="grid four">
        <div class="field">
          <label>Animal *</label>
          <select v-model.number="createForm.id_animal">
            <option :value="null" disabled>— Choisir un animal —</option>
            <option v-for="a in animals" :key="a.id_animal" :value="a.id_animal">{{ a.label }}</option>
          </select>
        </div>
        <div class="field">
          <label>Date *</label>
          <input type="date" v-model="createForm.date_entree" />
        </div>
        <div class="field">
          <label>Type *</label>
          <select v-model="createForm.type">
            <option v-for="t in entryTypes" :key="t" :value="t">{{ t }}</option>
          </select>
        </div>
        <div class="field">
          <label>Source</label>
          <select v-model.number="createForm.source_personne">
            <option :value="null">— Inconnue —</option>
            <option v-for="p in people" :key="p.id_personne" :value="p.id_personne">{{ p.label }}</option>
          </select>
        </div>
        <div class="field field-span">
          <label>Détails</label>
          <textarea v-model="createForm.details" rows="2" placeholder="Contexte, coordonnées supplémentaires…"></textarea>
        </div>
      </div>
      <div class="actions">
        <button class="btn" @click="createEntry" :disabled="ui.loading">Enregistrer</button>
        <button class="btn ghost" type="button" @click="resetCreateForm">Réinitialiser</button>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h2>Historique des entrées</h2>
        <div class="search">
          <input v-model="filterTerm" type="search" placeholder="Filtrer (animal, type, source…)" />
        </div>
      </div>
      <div v-if="filteredEntries.length === 0" class="empty">Aucune entrée pour le moment.</div>
      <div v-else class="table-wrapper">
        <table class="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Animal</th>
              <th>Type</th>
              <th>Source</th>
              <th>Détails</th>
              <th style="width:200px;">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in filteredEntries" :key="entry.id_entree">
              <template v-if="editingId === entry.id_entree">
                <td><input type="date" v-model="editEntry.date_entree" /></td>
                <td>
                  <select v-model.number="editEntry.id_animal">
                    <option v-for="a in animals" :key="'edit-an-'+a.id_animal" :value="a.id_animal">{{ a.label }}</option>
                  </select>
                </td>
                <td>
                  <select v-model="editEntry.type">
                    <option v-for="t in entryTypes" :key="'edit-type-'+t" :value="t">{{ t }}</option>
                  </select>
                </td>
                <td>
                  <select v-model.number="editEntry.source_personne">
                    <option :value="null">— Inconnue —</option>
                    <option v-for="p in people" :key="'edit-src-'+p.id_personne" :value="p.id_personne">{{ p.label }}</option>
                  </select>
                </td>
                <td><textarea v-model="editEntry.details" rows="2"></textarea></td>
                <td class="actions-right">
                  <button class="btn" @click="saveEdit(entry)">Sauver</button>
                  <button class="btn ghost" @click="cancelEdit">Annuler</button>
                </td>
              </template>
              <template v-else>
                <td>{{ entry.date_entree || '—' }}</td>
                <td>
                  <div class="strong">{{ entry.animal_nom || ('Animal #' + entry.id_animal) }}</div>
                  <button class="link" type="button" @click="goToAnimal(entry.id_animal)">Voir animal</button>
                </td>
                <td><span class="tag">{{ entry.type }}</span></td>
                <td>
                  <div v-if="entry.source_personne">
                    {{ entry.source_nom }} {{ entry.source_prenom }}
                    <div class="muted">{{ entry.source_email || '—' }}</div>
                    <button class="link" type="button" @click="goToPerson(entry.source_personne)">Voir personne</button>
                  </div>
                  <div v-else class="muted">Inconnue</div>
                </td>
                <td class="wrap">{{ entry.details || '—' }}</td>
                <td class="actions-right">
                  <button class="btn ghost" @click="startEdit(entry)">Modifier</button>
                  <button class="btn danger" @click="removeEntry(entry)">Supprimer</button>
                </td>
              </template>
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
  background: linear-gradient(180deg, #f9fbff 0%, #f2f4f9 100%);
}
.card {
  background: #ffffff;
  border: 1px solid #e3e8f3;
  border-radius: 18px;
  padding: 20px;
  box-shadow: 0 18px 28px -22px rgba(25, 39, 68, 0.4);
  display: grid;
  gap: 16px;
}
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.search input {
  border-radius: 10px;
  border: 1px solid #d2d9ec;
  padding: 8px 12px;
  min-width: 240px;
}
.grid.four {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}
.field {
  display: grid;
  gap: 6px;
}
.field label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #64719a;
}
.field input,
.field select,
.field textarea {
  border: 1px solid #d2d9ec;
  border-radius: 12px;
  padding: 9px 12px;
  background: #fff;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.field textarea {
  resize: vertical;
}
.field-span {
  grid-column: 1 / -1;
}
.field input:focus,
.field select:focus,
.field textarea:focus {
  border-color: #2f73ff;
  box-shadow: 0 0 0 3px rgba(47, 115, 255, 0.18);
  outline: none;
}
.actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}
.actions-right {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}
.btn {
  background: linear-gradient(135deg, #2f73ff, #5a8cff);
  color: #fff;
  border: none;
  padding: 9px 18px;
  border-radius: 12px;
  font-weight: 600;
  box-shadow: 0 14px 26px -18px rgba(47, 115, 255, 0.65);
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.2s ease;
}
.btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 16px 30px -20px rgba(47, 115, 255, 0.7);
}
.btn.ghost {
  background: #eef3ff;
  color: #2f73ff;
  border: 1px solid #d0dcff;
  box-shadow: none;
}
.btn.danger {
  background: linear-gradient(135deg, #ff4b4b, #ff6a6a);
  box-shadow: 0 12px 24px -18px rgba(255, 75, 75, 0.6);
}
.table-wrapper {
  overflow-x: auto;
  border: 1px solid #e5e9f6;
  border-radius: 16px;
}
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
  color: #1f2f4a;
  min-width: 960px;
}
.table thead th {
  text-align: left;
  padding: 12px 14px;
  background: #f4f7ff;
  border-bottom: 1px solid #e2e8fb;
  font-weight: 600;
  color: #475577;
}
.table tbody td {
  padding: 12px 14px;
  border-bottom: 1px solid #eef1f9;
  vertical-align: top;
}
.table tbody tr:last-child td {
  border-bottom: none;
}
.strong {
  font-weight: 600;
  color: #19243c;
}
.tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 999px;
  background: #eef3ff;
  border: 1px solid #d3ddff;
  color: #2f59d9;
  font-size: 12px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.muted {
  color: #7f8aa9;
  font-size: 12px;
}
.wrap {
  white-space: pre-wrap;
  word-break: break-word;
}
.banner.error {
  background: #ffe6e9;
  border: 1px solid #ffccd5;
  color: #b42335;
  padding: 10px 14px;
  border-radius: 12px;
  font-weight: 600;
}
.empty {
  padding: 16px;
  text-align: center;
  border-radius: 14px;
  background: #f5f7ff;
  border: 1px dashed #ccd6f6;
  color: #7a85a9;
  font-size: 14px;
}
.link {
  margin-top: 4px;
  border: none;
  background: none;
  text-decoration: underline;
  color: #2f73ff;
  cursor: pointer;
  font-size: 12px;
  padding: 0;
}
</style>
