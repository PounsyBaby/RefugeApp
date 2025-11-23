<script setup lang="ts">
import { onMounted, reactive, ref, computed } from 'vue';

type Vet = {
  id_vet: number;
  nom_cabinet: string;
  contact: string | null;
  adresse: string | null;
};

const ui = reactive({ loading: false, error: '' });
const vets = ref<Vet[]>([]);
const filter = ref('');

const form = reactive({
  nom_cabinet: '',
  contact: '',
  adresse: ''
});

const editingId = ref<number | null>(null);
const edit = reactive({
  nom_cabinet: '',
  contact: '',
  adresse: ''
});

function resetError() {
  ui.error = '';
}

async function safeInvoke<T = any>(channel: string, payload?: any): Promise<T> {
  try {
    return await window.api.invoke(channel, payload);
  } catch (err: any) {
    ui.error = `IPC ${channel} a échoué : ${err?.message || err}`;
    console.error('[vets]', channel, err);
    throw err;
  }
}

async function loadVets() {
  ui.loading = true;
  resetError();
  try {
    const res = await safeInvoke<{ rows: any[] }>('vets:list');
    vets.value = (res?.rows ?? []).map((row) => ({
      id_vet: Number(row.id_vet),
      nom_cabinet: row.nom_cabinet ?? '',
      contact: row.contact ?? null,
      adresse: row.adresse ?? null
    }));
  } finally {
    ui.loading = false;
  }
}

onMounted(() => {
  loadVets();
});

const filteredVets = computed(() => {
  const term = filter.value.trim().toLowerCase();
  if (!term) return vets.value;
  return vets.value.filter((vet) => {
    return [vet.nom_cabinet, vet.contact, vet.adresse]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(term));
  });
});

function resetForm() {
  form.nom_cabinet = '';
  form.contact = '';
  form.adresse = '';
}

async function createVet() {
  resetError();
  if (!form.nom_cabinet.trim()) {
    ui.error = 'Le nom du cabinet est requis';
    return;
  }
  const payload = {
    nom_cabinet: form.nom_cabinet.trim(),
    contact: form.contact.trim() || null,
    adresse: form.adresse.trim() || null
  };
  const res = await safeInvoke<{ id_vet: number }>('vets:create', payload);
  if (res?.id_vet) {
    resetForm();
    await loadVets();
  }
}

function startEdit(vet: Vet) {
  editingId.value = vet.id_vet;
  edit.nom_cabinet = vet.nom_cabinet;
  edit.contact = vet.contact ?? '';
  edit.adresse = vet.adresse ?? '';
}

function cancelEdit() {
  editingId.value = null;
  edit.nom_cabinet = '';
  edit.contact = '';
  edit.adresse = '';
}

async function saveEdit(vet: Vet) {
  if (!editingId.value) return;
  if (!edit.nom_cabinet.trim()) {
    ui.error = 'Le nom du cabinet est requis';
    return;
  }
  const payload = {
    id_vet: editingId.value,
    nom_cabinet: edit.nom_cabinet.trim(),
    contact: edit.contact.trim() || null,
    adresse: edit.adresse.trim() || null
  };
  const res = await safeInvoke<{ ok: boolean }>('vets:update', payload);
  if (res?.ok !== false) {
    await loadVets();
    cancelEdit();
  }
}

async function removeVet(vet: Vet) {
  if (!confirm(`Supprimer le cabinet « ${vet.nom_cabinet} » ?`)) return;
  const res = await safeInvoke<{ ok: boolean }>('vets:delete', vet.id_vet);
  if (res?.ok) await loadVets();
}
</script>

<template>
  <div class="page">
    <div v-if="ui.error" class="banner error">{{ ui.error }}</div>

    <div class="card">
      <h2>Nouveau vétérinaire</h2>
      <div class="grid three">
        <div class="field">
          <label>Nom du cabinet *</label>
          <input v-model="form.nom_cabinet" placeholder="Cabinet vétérinaire..." />
        </div>
        <div class="field">
          <label>Contact</label>
          <input v-model="form.contact" placeholder="Téléphone ou email" />
        </div>
        <div class="field">
          <label>Adresse</label>
          <input v-model="form.adresse" placeholder="Rue, code postal..." />
        </div>
      </div>
      <div class="actions">
        <button class="btn" @click="createVet">Enregistrer</button>
        <button class="btn ghost" type="button" @click="resetForm">Réinitialiser</button>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h2>Vétérinaires</h2>
        <input
          v-model="filter"
          type="search"
          placeholder="Rechercher un vétérinaire..."
          class="search"
        />
      </div>

      <div v-if="ui.loading" class="muted">Chargement...</div>
      <div v-else-if="filteredVets.length === 0" class="empty">Aucun vétérinaire enregistré.</div>
      <div v-else class="table-wrapper">
        <table class="table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Contact</th>
              <th>Adresse</th>
              <th style="width:200px;">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="vet in filteredVets" :key="vet.id_vet">
              <template v-if="editingId === vet.id_vet">
                <td><input v-model="edit.nom_cabinet" /></td>
                <td><input v-model="edit.contact" /></td>
                <td><input v-model="edit.adresse" /></td>
                <td class="actions-right">
                  <button class="btn" @click="saveEdit(vet)">Sauver</button>
                  <button class="btn ghost" @click="cancelEdit">Annuler</button>
                </td>
              </template>
              <template v-else>
                <td class="strong">{{ vet.nom_cabinet }}</td>
                <td>{{ vet.contact || '—' }}</td>
                <td>{{ vet.adresse || '—' }}</td>
                <td class="actions-right">
                  <button class="btn ghost" @click="startEdit(vet)">Modifier</button>
                  <button class="btn danger" @click="removeVet(vet)">Supprimer</button>
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
  background: linear-gradient(180deg, #f8fbff 0%, #f2f4f9 100%);
}
.card {
  background: #ffffff;
  border: 1px solid #e3e8f3;
  border-radius: 18px;
  padding: 20px;
  display: grid;
  gap: 16px;
  box-shadow: 0 20px 34px -26px rgba(25, 39, 68, 0.35);
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}
.search {
  border: 1px solid #ccd4eb;
  border-radius: 10px;
  padding: 8px 12px;
  min-width: 220px;
}
.grid.three {
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
  color: #63719c;
}
.field input {
  border: 1px solid #d2d9ec;
  border-radius: 12px;
  padding: 9px 12px;
  background: #fff;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.field input:focus {
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
  box-shadow: 0 14px 26px -18px rgba(47, 115, 255, 0.62);
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.2s ease;
}
.btn:hover {
  transform: translateY(-1px);
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
  min-width: 820px;
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
.table tbody tr:last-child td {
  border-bottom: none;
}
.strong { font-weight: 600; color: #1f2b47; }
.muted { color: #7c86a8; font-size: 13px; }
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
</style>
