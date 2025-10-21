<script setup lang="ts">
import { reactive, ref, onMounted, computed, watch, nextTick, onBeforeUnmount } from 'vue';
import { useRoute } from 'vue-router';

type Person = {
  id_personne: number;
  nom: string;
  prenom: string;
  email: string;
  tel: string | null;
  type_personne: 'prospect'|'adoptant'|'fa'|'donateur'|'multiple';
  date_naissance: string | null;
  rue: string | null;
  numero: string | null;
  code_postal: string | null;
  ville: string | null;
  pays: string | null;
  jardin: 0 | 1 | null;
};

const ui = reactive({ error: '' });
const people = ref<Person[]>([]);
const editingId = ref<number | null>(null);
const edit = reactive<Partial<Person>>({});
const searchTerm = ref('');
const route = useRoute();
const highlightedPersonId = ref<number | null>(null);
const pendingPersonScroll = ref<number | null>(null);
let highlightTimer: ReturnType<typeof setTimeout> | null = null;

const form = reactive({
  nom: '',
  prenom: '',
  email: '',
  type_personne: 'prospect' as Person['type_personne'],
  date_naissance: '',
  tel: '',
  rue: '',
  numero: '',
  code_postal: '',
  ville: '',
  pays: '',
  jardin: '0' as '0' | '1'
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
  } catch (e: any) {
    ui.error = `IPC ${channel} a échoué : ${e?.message || e}`;
    console.error(`[people:${channel}]`, e);
    throw e;
  }
}

function parseIdParam(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const raw = Array.isArray(value) ? value[0] : value;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

function focusPerson(id: number | null) {
  if (!id) return;
  highlightedPersonId.value = id;
  pendingPersonScroll.value = id;
  if (searchTerm.value) searchTerm.value = '';
  if (highlightTimer) clearTimeout(highlightTimer);
  highlightTimer = window.setTimeout(() => {
    highlightedPersonId.value = null;
    highlightTimer = null;
  }, 8000);
}

function scrollToPerson(id: number) {
  nextTick(() => {
    const el = document.querySelector<HTMLElement>(`[data-person-row="${id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('pulse');
      setTimeout(() => el.classList.remove('pulse'), 1200);
    }
  });
}

onMounted(async () => {
  resetError();
  await refresh();
});

watch(
  () => route.query.personId,
  (value) => {
    const id = parseIdParam(value);
    if (id) focusPerson(id);
  },
  { immediate: true }
);

async function refresh() {
  const res = await safeInvoke('people:list');
  people.value = res?.rows ?? [];
  editingId.value = null;
  for (const k of Object.keys(edit)) delete (edit as any)[k];
  if (pendingPersonScroll.value) {
    const target = pendingPersonScroll.value;
    pendingPersonScroll.value = null;
    if (target) scrollToPerson(target);
  }
}

const filteredPeople = computed(() => {
  const term = searchTerm.value.trim().toLowerCase();
  if (!term) return people.value;

  const normalize = (value: unknown) => (value ?? '').toString().toLowerCase();
  const normalizedDigits = term.replace(/\D+/g, '');

  return people.value.filter((p) => {
    const fields = [
      p.id_personne.toString(),
      p.nom,
      p.prenom,
      p.email,
      p.tel,
      p.rue,
      p.numero,
      p.code_postal,
      p.ville,
      p.pays,
      p.type_personne
    ];

    return fields.some((field) => {
      if (field === null || field === undefined) return false;

      const value = normalize(field);
      if (!value) return false;
      if (value.startsWith(term)) return true;

      if (field === p.tel) {
        const valueDigits = value.replace(/\D+/g, '');
        if (valueDigits && normalizedDigits && valueDigits.startsWith(normalizedDigits)) {
          return true;
        }
      }

      return false;
    });
  });
});

async function saveCreate() {
  resetError();
  const payload = {
    nom: (form.nom || '').trim(),
    prenom: (form.prenom || '').trim(),
    email: (form.email || '').trim(),
    type_personne: form.type_personne || 'prospect',
    date_naissance: form.date_naissance || null,
    tel: form.tel || null,
    rue: form.rue || null,
    numero: form.numero || null,
    code_postal: form.code_postal || null,
    ville: form.ville || null,
    pays: form.pays || null,
    jardin: form.jardin === '1' ? 1 : 0
  };
  if (!payload.nom || !payload.prenom || !payload.email) {
    ui.error = 'Nom, prénom et email sont obligatoires';
    return;
  }
  const res = await safeInvoke('people:create', payload);
  if (res?.id_personne) {
    Object.assign(form, {
      nom: '', prenom: '', email: '',
      type_personne: 'prospect', date_naissance: '',
      tel: '', rue: '', numero: '', code_postal: '', ville: '', pays: '', jardin: '0'
    });
    await refresh();
  }
}

function startEdit(p: Person) {
  editingId.value = p.id_personne;
  Object.assign(edit, {
    id_personne: p.id_personne,
    nom: p.nom, prenom: p.prenom, email: p.email,
    tel: p.tel ?? '',
    type_personne: p.type_personne,
    date_naissance: p.date_naissance ?? '',
    rue: p.rue ?? '', numero: p.numero ?? '',
    code_postal: p.code_postal ?? '', ville: p.ville ?? '', pays: p.pays ?? '',
    jardin: p.jardin ?? 0
  });
}
function cancelEdit() {
  editingId.value = null;
  for (const k of Object.keys(edit)) delete (edit as any)[k];
}
async function saveEdit() {
  resetError();
  if (!editingId.value) return;
  const payload = {
    id_personne: editingId.value,
    nom: (edit.nom || '').toString().trim(),
    prenom: (edit.prenom || '').toString().trim(),
    email: (edit.email || '').toString().trim(),
    tel: (edit.tel || '').toString().trim() || null,
    type_personne: (edit.type_personne || 'prospect') as Person['type_personne'],
    date_naissance: (edit.date_naissance || '') || null,
    rue: (edit.rue || '').toString().trim() || null,
    numero: (edit.numero || '').toString().trim() || null,
    code_postal: (edit.code_postal || '').toString().trim() || null,
    ville: (edit.ville || '').toString().trim() || null,
    pays: (edit.pays || '').toString().trim() || null,
    jardin: ((edit.jardin as any) === '1' || edit.jardin === 1 || edit.jardin === true) ? 1 : 0
  };
  const res = await safeInvoke('people:update', payload);
  if (res?.ok) {
    editingId.value = null;
    for (const k of Object.keys(edit)) delete (edit as any)[k];
    await refresh();
  }
}
async function removePerson(id: number) {
  resetError();
  if (!confirm('Supprimer cette personne ?')) return;
  const res = await safeInvoke('people:delete', id);
  if (res?.ok) await refresh();
}

onBeforeUnmount(() => {
  if (highlightTimer) clearTimeout(highlightTimer);
});
</script>

<template>
  <div class="page">
    <div v-if="ui.error" class="banner error">{{ ui.error }}</div>
    <!-- Création -->
    <div class="card">
      <h2>Nouvelle personne</h2>

      <div class="grid two">
        <div class="field"><label>Nom</label><input v-model="form.nom" placeholder="Dupont" /></div>
        <div class="field"><label>Prénom</label><input v-model="form.prenom" placeholder="Alice" /></div>
        <div class="field"><label>Email</label><input v-model="form.email" placeholder="alice@test.com" /></div>
        <div class="field">
          <label>Type</label>
          <select v-model="form.type_personne">
            <option value="prospect">Prospect</option>
            <option value="adoptant">Adoptant</option>
            <option value="fa">Famille d’accueil</option>
            <option value="donateur">Donateur</option>
            <option value="multiple">Multiple</option>
          </select>
        </div>
        <div class="field"><label>Date de naissance</label><input type="date" v-model="form.date_naissance" /></div>
        <div class="field"><label>Téléphone</label><input v-model="form.tel" placeholder="+32 ..." /></div>
        <div class="field"><label>Rue</label><input v-model="form.rue" placeholder="Rue de la Paix" /></div>
        <div class="field"><label>N°</label><input v-model="form.numero" placeholder="12B" /></div>
        <div class="field"><label>Code postal</label><input v-model="form.code_postal" placeholder="1000" /></div>
        <div class="field"><label>Ville</label><input v-model="form.ville" placeholder="Bruxelles" /></div>
        <div class="field"><label>Pays</label><input v-model="form.pays" placeholder="Belgique" /></div>
        <div class="field">
          <label>Jardin</label>
          <select v-model="form.jardin">
            <option value="0">Non</option>
            <option value="1">Oui</option>
          </select>
        </div>
      </div>

      <div class="actions">
        <button class="btn" @click="saveCreate">Enregistrer</button>
      </div>
    </div>

    <!-- Liste + Édition + Suppression -->
    <div class="card">
      <h2>Personnes</h2>
      <div class="list-controls" v-if="people.length">
        <div class="field search-field">
          <label>Rechercher</label>
          <input
            v-model="searchTerm"
            placeholder="Nom, prénom, téléphone, email, adresse..."
            type="search"
          />
        </div>
      </div>

      <div v-else class="empty">Aucune personne pour l’instant.</div>

      <div v-if="filteredPeople.length > 0" class="table-wrapper">
        <div class="table-scroll">
          <table class="table">
            <thead>
              <tr>
                <th>#</th><th>Nom</th><th>Email</th><th>Type</th><th>Naissance</th>
                <th>Téléphone</th><th>Adresse</th><th>Jardin</th><th style="width:200px;">Actions</th>
              </tr>
            </thead>
            <tbody>
            <tr
              v-for="p in filteredPeople"
              :key="p.id_personne"
              :class="['person-row', { highlight: highlightedPersonId === p.id_personne }]"
              :data-person-row="p.id_personne"
            >
              <template v-if="editingId === p.id_personne">
                <td>{{ p.id_personne }}</td>
                <td>
                  <div class="grid-two">
                    <input v-model="(edit as any).nom" placeholder="Nom" />
                    <input v-model="(edit as any).prenom" placeholder="Prénom" />
                  </div>
                </td>
                <td><input v-model="(edit as any).email" placeholder="Email" /></td>
                <td>
                  <select v-model="(edit as any).type_personne">
                    <option value="prospect">Prospect</option>
                    <option value="adoptant">Adoptant</option>
                    <option value="fa">Famille d’accueil</option>
                    <option value="donateur">Donateur</option>
                    <option value="multiple">Multiple</option>
                  </select>
                </td>
                <td><input type="date" v-model="(edit as any).date_naissance" /></td>
                <td><input v-model="(edit as any).tel" placeholder="Téléphone" /></td>
                <td>
                  <div class="grid-address">
                    <input v-model="(edit as any).rue" placeholder="Rue" />
                    <input v-model="(edit as any).numero" placeholder="N°" />
                    <input v-model="(edit as any).code_postal" placeholder="CP" />
                  </div>
                  <div class="grid-two">
                    <input v-model="(edit as any).ville" placeholder="Ville" />
                    <input v-model="(edit as any).pays" placeholder="Pays" />
                  </div>
                </td>
                <td>
                  <select v-model="(edit as any).jardin">
                    <option value="1">Oui</option>
                    <option value="0">Non</option>
                  </select>
                </td>
                <td class="actions-right">
                  <button class="btn" @click="saveEdit">Sauver</button>
                  <button class="btn ghost" @click="cancelEdit">Annuler</button>
                </td>
              </template>

              <template v-else>
                <td>{{ p.id_personne }}</td>
                <td class="strong">{{ p.nom }} {{ p.prenom }}</td>
                <td class="strong">{{ p.email }}</td>
                <td class="caps">{{ p.type_personne }}</td>
                <td>{{ p.date_naissance || '—' }}</td>
                <td>{{ p.tel || '—' }}</td>
                <td>
                  <div>{{ p.rue || '—' }} {{ p.numero || '' }}</div>
                  <div>{{ p.code_postal || '' }} {{ p.ville || '' }} {{ p.pays || '' }}</div>
                </td>
                <td>{{ p.jardin ? 'Oui' : 'Non' }}</td>
                <td class="actions-right">
                  <button class="btn ghost" @click="startEdit(p)">Modifier</button>
                  <button class="btn danger" @click="removePerson(p.id_personne)">Supprimer</button>
                </td>
              </template>
            </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div v-else-if="people.length > 0" class="empty">Aucun résultat ne correspond à la recherche.</div>
      <div class="actions" v-if="people.length">
        <button class="btn ghost" @click="refresh">Actualiser</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
h2 {
  margin: 0;
  font-size: 20px;
  color: #1f2a44;
}

.grid-two {
  display: grid;
  gap: 8px 14px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.grid-address {
  display: grid;
  gap: 8px 14px;
  grid-template-columns: 1fr 130px 130px;
}

.field.search-field {
  max-width: 340px;
}

.list-controls {
  display: flex;
  justify-content: flex-end;
}

.person-row.highlight {
  background: rgba(255, 233, 196, 0.5);
  transition: background 0.3s ease;
}

.person-row.highlight td {
  background: transparent;
}

.person-row.pulse {
  animation: pulseRow 1s ease;
}

@keyframes pulseRow {
  0% { box-shadow: 0 0 0 rgba(255, 193, 107, 0.7); }
  50% { box-shadow: 0 0 16px rgba(255, 193, 107, 0.9); }
  100% { box-shadow: 0 0 0 rgba(255, 193, 107, 0); }
}

.table-wrapper {
  border: 1px solid #e5eaf5;
  border-radius: 16px;
  box-shadow: inset 0 0 0 1px rgba(246, 248, 255, 0.6);
}

.table-scroll {
  max-height: 60vh;
  overflow: auto;
}

.table {
  min-width: 1100px;
  color: #1f2a44;
}

.table thead th {
  padding: 12px 14px;
  background: #f4f6ff;
  border-bottom: 1px solid #e2e8fb;
  color: #495678;
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
  color: #19203a;
}

.caps {
  text-transform: capitalize;
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

.banner.error {
  background: #ffe6e9;
  border: 1px solid #ffccd5;
  color: #b42335;
  padding: 10px 14px;
  border-radius: 12px;
  font-weight: 600;
}
</style>
