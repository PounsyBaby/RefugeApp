<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';

type Espece = { id_espece: number; libelle: string };
type Race = { id_race: number; id_espece: number; libelle: string; espece_libelle: string };
type AdoptableAnimal = { id_animal: number; id_espece: number; espece_libelle: string; nom_usuel: string | null };

const ui = reactive({ error: '' });

// Espèces
const species = ref<Espece[]>([]);
const newSpecies = reactive({ libelle: '' });
const editSpeciesId = ref<number|null>(null);
const editSpeciesLib = ref('');

// Races
const races = ref<Race[]>([]);
const newRace = reactive({ id_espece: null as number|null, libelle: '' });
const editRaceId = ref<number|null>(null);
const editRace = reactive<{ id_espece: number|null; libelle: string }>({ id_espece: null, libelle: '' });
const searchTerm = ref('');
const adoptableLoading = ref(false);
const adoptableAnimals = ref<AdoptableAnimal[]>([]);
const adoptableAnimalRaces = ref<Record<number, number[]>>({});

function resetErrors() { ui.error = ''; }

async function safeInvoke(channel: string, payload?: any) {
  try {
    return await (window as any).api.invoke(channel, payload);
  } catch (e:any) {
    ui.error = `IPC ${channel} a échoué : ` + (e?.message || e);
    console.error(`[IPC ${channel}]`, e);
    throw e;
  }
}

async function loadSpecies() {
  const res = await safeInvoke('species:list');
  species.value = res?.rows ?? [];
}
async function loadRaces() {
  const res = await safeInvoke('races:list');
  races.value = res?.rows ?? [];
}

async function loadAdoptableAnimals() {
  adoptableLoading.value = true;
  try {
    const res = await safeInvoke('adoption:adoptables');
    const rows = res?.rows ?? [];
    adoptableAnimals.value = rows.map((row: any) => ({
      id_animal: Number(row.id_animal),
      id_espece: Number(row.id_espece),
      espece_libelle: row.espece_libelle ?? '',
      nom_usuel: row.nom_usuel ?? null
    })) as AdoptableAnimal[];

    if (adoptableAnimals.value.length === 0) {
      adoptableAnimalRaces.value = {};
      return;
    }

    const entries = await Promise.all(
      adoptableAnimals.value.map(async (animal) => {
        const rRes = await safeInvoke('animal:races:list', animal.id_animal);
        const ids = (rRes?.rows ?? []).map((rr: any) => Number(rr.id_race)).filter((id: number) => Number.isFinite(id));
        return [animal.id_animal, ids] as const;
      })
    );
    const map: Record<number, number[]> = {};
    for (const [id, list] of entries) {
      map[id] = list;
    }
    adoptableAnimalRaces.value = map;
  } finally {
    adoptableLoading.value = false;
  }
}

const speciesById = computed(() => {
  const map = new Map<number, Espece>();
  for (const s of species.value) map.set(s.id_espece, s);
  return map;
});

const adoptableSpeciesCounts = computed(() => {
  const map = new Map<number, number>();
  for (const a of adoptableAnimals.value) {
    const current = map.get(a.id_espece) ?? 0;
    map.set(a.id_espece, current + 1);
  }
  return map;
});

const adoptableRaceCounts = computed(() => {
  const map = new Map<number, number>();
  for (const [animalId, raceIds] of Object.entries(adoptableAnimalRaces.value)) {
    const ids = raceIds ?? [];
    // Si aucun lien de race, ignorer
    if (!ids.length) continue;
    for (const id of ids) {
      const current = map.get(id) ?? 0;
      map.set(id, current + 1);
    }
  }
  return map;
});

type SearchResult = {
  kind: 'species' | 'race';
  species: Espece;
  race?: Race;
  adoptableCount: number;
};

const searchResults = computed<SearchResult[]>(() => {
  const term = searchTerm.value.trim().toLowerCase();
  if (!term) return [];

  const results: SearchResult[] = [];
  for (const s of species.value) {
    if (s.libelle.toLowerCase().includes(term)) {
      const adoptableCount = adoptableSpeciesCounts.value.get(s.id_espece) ?? 0;
      results.push({ kind: 'species', species: s, adoptableCount });
    }
  }

  for (const r of races.value) {
    const speciesRef = speciesById.value.get(r.id_espece);
    const haystack = [
      r.libelle,
      speciesRef?.libelle ?? ''
    ];
    if (haystack.some((value) => value.toLowerCase().includes(term))) {
      const adoptableCount = adoptableRaceCounts.value.get(r.id_race) ?? 0;
      if (speciesRef) {
        results.push({ kind: 'race', species: speciesRef, race: r, adoptableCount });
      } else {
        results.push({
          kind: 'race',
          species: { id_espece: r.id_espece, libelle: `Espèce #${r.id_espece}` },
          race: r,
          adoptableCount
        });
      }
    }
  }

  results.sort((a, b) => {
    if (b.adoptableCount !== a.adoptableCount) return b.adoptableCount - a.adoptableCount;
    if (a.kind !== b.kind) return a.kind === 'species' ? -1 : 1;
    const nameA = (a.race?.libelle || a.species.libelle).toLowerCase();
    const nameB = (b.race?.libelle || b.species.libelle).toLowerCase();
    return nameA.localeCompare(nameB);
  });

  return results;
});

function formatAdoptableCount(count: number): string {
  if (!count) return 'Aucun animal adoptable actuellement';
  return count === 1 ? '1 animal adoptable' : `${count} animaux adoptables`;
}

onMounted(async () => {
  resetErrors();
  await Promise.all([loadSpecies(), loadRaces()]);
  await loadAdoptableAnimals();
});

/* ===== Espèces (CRUD) ===== */

async function createSpecies() {
  resetErrors();
  const name = newSpecies.libelle.trim();
  if (!name) { alert('Libellé requis'); return; }
  const res = await safeInvoke('species:create', name);
  if (res?.id_espece || res?.ok !== false) {
    newSpecies.libelle = '';
    await loadSpecies();
  } else if (res?.ok === false && res?.message) {
    ui.error = res.message;
  }
}

function startEditSpecies(s: Espece) {
  editSpeciesId.value = s.id_espece;
  editSpeciesLib.value = s.libelle;
}
function cancelEditSpecies() {
  editSpeciesId.value = null;
  editSpeciesLib.value = '';
}
async function saveSpecies() {
  if (!editSpeciesId.value) return;
  const name = editSpeciesLib.value.trim();
  if (!name) { alert('Libellé requis'); return; }
  const res = await safeInvoke('species:update', { id_espece: editSpeciesId.value, libelle: name });
  if (res?.ok || res?.updated >= 0) {
    await loadSpecies();
    cancelEditSpecies();
    // Recharge races (les libellés d'espèce sont affichés dans races)
    await loadRaces();
  } else if (res?.ok === false && res?.message) {
    ui.error = res.message;
  }
}
async function deleteSpecies(id: number) {
  if (!confirm('Supprimer cette espèce ?')) return;
  const res = await safeInvoke('species:delete', id);
  if (res?.ok) {
    await Promise.all([loadSpecies(), loadRaces()]);
  } else if (res?.message) {
    ui.error = res.message;
  }
}

/* ===== Races (CRUD) ===== */

async function createRace() {
  resetErrors();
  const id_espece = Number(newRace.id_espece);
  const name = newRace.libelle.trim();
  if (!id_espece || !name) { alert('Espèce et libellé requis'); return; }
  const res = await safeInvoke('races:create', { id_espece, libelle: name });
  if (res?.id_race || res?.ok !== false) {
    newRace.id_espece = null;
    newRace.libelle = '';
    await loadRaces();
  } else if (res?.ok === false && res?.message) {
    ui.error = res.message;
  }
}

function startEditRace(r: Race) {
  editRaceId.value = r.id_race;
  editRace.id_espece = r.id_espece;
  editRace.libelle = r.libelle;
}
function cancelEditRace() {
  editRaceId.value = null;
  editRace.id_espece = null;
  editRace.libelle = '';
}
async function saveRace() {
  if (!editRaceId.value) return;
  const id_espece = Number(editRace.id_espece);
  const name = editRace.libelle.trim();
  if (!id_espece || !name) { alert('Espèce et libellé requis'); return; }
  const res = await safeInvoke('races:update', { id_race: editRaceId.value, id_espece, libelle: name });
  if (res?.ok || res?.updated >= 0) {
    await loadRaces();
    cancelEditRace();
  } else if (res?.ok === false && res?.message) {
    ui.error = res.message;
  }
}
async function deleteRace(id: number) {
  if (!confirm('Supprimer cette race ?')) return;
  const res = await safeInvoke('races:delete', id);
  if (res?.ok) {
    await loadRaces();
  } else if (res?.message) {
    ui.error = res.message;
  }
}
</script>

<template>
  <div class="page">
    <div v-if="ui.error" class="banner error">{{ ui.error }}</div>

    <div class="card search-card">
      <h2>Rechercher une espèce ou une race</h2>
      <div class="search-grid">
        <div class="field search-field">
          <label>Recherche</label>
          <input
            v-model="searchTerm"
            type="search"
            placeholder="Ex.: chien, labrador, chat européen..."
          />
        </div>
        <div class="search-status" v-if="adoptableLoading">
          <span class="muted">Récupération des animaux adoptables…</span>
        </div>
        <div class="search-status" v-else>
          <span class="muted">
            {{ adoptableAnimals.length ? adoptableAnimals.length + ' animaux analysés' : 'Aucun animal adoptable pour le moment' }}
          </span>
        </div>
        <div class="search-actions">
          <button class="btn ghost" :disabled="adoptableLoading" @click="loadAdoptableAnimals">
            {{ adoptableLoading ? '...' : 'Actualiser les données' }}
          </button>
        </div>
      </div>

      <div v-if="searchTerm.trim().length === 0" class="muted">
        Tape un nom d’espèce ou de race pour voir s’il y a des animaux adoptables correspondants.
      </div>
      <div v-else-if="searchResults.length === 0" class="empty">
        Aucun résultat ne correspond à « {{ searchTerm }} ».
      </div>
      <ul v-else class="results-list">
        <li
          v-for="res in searchResults"
          :key="res.kind + '-' + (res.kind === 'race' ? res.race?.id_race : res.species.id_espece)"
          :class="['result-item', res.adoptableCount ? 'has-animals' : 'no-animals']"
        >
          <div class="result-main">
            <span class="badge" :class="res.kind === 'species' ? 'badge-species' : 'badge-race'">
              {{ res.kind === 'species' ? 'Espèce' : 'Race' }}
            </span>
            <div class="result-names">
              <strong>{{ res.kind === 'species' ? res.species.libelle : res.race?.libelle }}</strong>
              <span v-if="res.kind === 'race'" class="muted">Espèce : {{ res.species.libelle }}</span>
            </div>
          </div>
          <div class="result-status">
            {{ formatAdoptableCount(res.adoptableCount) }}
          </div>
        </li>
      </ul>
    </div>

    <!-- ================== Espèces ================== -->
    <div class="card">
      <h2>Espèces</h2>

      <div class="grid two">
        <div class="field">
          <label>Nouvelle espèce</label>
          <input v-model="newSpecies.libelle" placeholder="Ex.: Chien, Chat" />
        </div>
        <div class="actions">
          <button class="btn" @click="createSpecies">Ajouter</button>
        </div>
      </div>

      <div class="table-wrapper">
        <table class="table">
          <thead>
            <tr><th style="width:80px;">#</th><th>Libellé</th><th style="width:220px;">Actions</th></tr>
          </thead>
          <tbody>
            <tr v-for="s in species" :key="s.id_espece">
              <template v-if="editSpeciesId === s.id_espece">
                <td>{{ s.id_espece }}</td>
                <td><input v-model="editSpeciesLib" /></td>
                <td class="actions-right">
                  <button class="btn" @click="saveSpecies">Sauver</button>
                  <button class="btn ghost" @click="cancelEditSpecies">Annuler</button>
                </td>
              </template>
              <template v-else>
                <td>{{ s.id_espece }}</td>
                <td class="strong">{{ s.libelle }}</td>
                <td class="actions-right">
                  <button class="btn ghost" @click="startEditSpecies(s)">Modifier</button>
                  <button class="btn danger" @click="deleteSpecies(s.id_espece)">Supprimer</button>
                </td>
              </template>
            </tr>
            <tr v-if="species.length === 0">
              <td colspan="3" class="muted">Aucune espèce.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ================== Races ================== -->
    <div class="card">
      <h2>Races</h2>

      <div class="grid three">
        <div class="field">
          <label>Espèce</label>
          <select v-model="newRace.id_espece">
            <option :value="null" disabled>— Choisir une espèce —</option>
            <option v-for="s in species" :key="s.id_espece" :value="s.id_espece">{{ s.libelle }}</option>
          </select>
        </div>
        <div class="field">
          <label>Libellé</label>
          <input v-model="newRace.libelle" placeholder="Ex.: Labrador, Siamois..." />
        </div>
        <div class="actions">
          <button class="btn" @click="createRace">Ajouter</button>
        </div>
      </div>

      <div class="table-wrapper">
        <table class="table">
          <thead>
            <tr><th style="width:80px;">#</th><th>Race</th><th>Espèce</th><th style="width:260px;">Actions</th></tr>
          </thead>
          <tbody>
            <tr v-for="r in races" :key="r.id_race">
              <template v-if="editRaceId === r.id_race">
                <td>{{ r.id_race }}</td>
                <td><input v-model="editRace.libelle" /></td>
                <td>
                  <select v-model="editRace.id_espece">
                    <option v-for="s in species" :key="s.id_espece" :value="s.id_espece">{{ s.libelle }}</option>
                  </select>
                </td>
                <td class="actions-right">
                  <button class="btn" @click="saveRace">Sauver</button>
                  <button class="btn ghost" @click="cancelEditRace">Annuler</button>
                </td>
              </template>
              <template v-else>
                <td>{{ r.id_race }}</td>
                <td class="strong">{{ r.libelle }}</td>
                <td>{{ r.espece_libelle }}</td>
                <td class="actions-right">
                  <button class="btn ghost" @click="startEditRace(r)">Modifier</button>
                  <button class="btn danger" @click="deleteRace(r.id_race)">Supprimer</button>
                </td>
              </template>
            </tr>
            <tr v-if="races.length === 0">
              <td colspan="4" class="muted">Aucune race.</td>
            </tr>
          </tbody>
        </table>
      </div>
  </div>

</div>
</template>

<style scoped>
h2 {
  margin: 0;
  font-size: 20px;
  color: #1f2c4f;
}
.table-wrapper {
  overflow: hidden;
  border: 1px solid #e5e9f6;
  border-radius: 16px;
}
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
  color: #1f2e4d;
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
}
.table tbody tr:last-child td { border-bottom: none; }
.strong { font-weight: 600; color: #19243c; }
.search-card {
  border-left: 4px solid #4a7dff;
}
.search-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-end;
}
.search-field {
  flex: 1 1 260px;
}
.search-status {
  min-height: 38px;
  display: flex;
  align-items: center;
}
.search-actions {
  display: flex;
  align-items: center;
}
.search-actions .btn {
  white-space: nowrap;
}
.search-actions .btn:disabled {
  opacity: 0.6;
  cursor: wait;
}
.results-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 12px;
}
.result-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-radius: 14px;
  border: 1px solid #dfe5f8;
  background: #f8faff;
  gap: 16px;
}
.result-item.has-animals {
  border-color: #b8d4ff;
  background: #f2f8ff;
}
.result-item.no-animals {
  opacity: 0.8;
}
.result-main {
  display: flex;
  align-items: center;
  gap: 12px;
}
.result-names strong {
  font-size: 16px;
  color: #1c2743;
}
.result-status {
  font-weight: 600;
  color: #1f3b73;
}
.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border: 1px solid transparent;
}
.badge-species {
  background: #eef3ff;
  border-color: #cbd8ff;
  color: #2f59d9;
}
.badge-race {
  background: #eaf8f0;
  border-color: #c6e6d1;
  color: #2a7c4e;
}
</style>
