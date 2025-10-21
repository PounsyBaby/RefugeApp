<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch, nextTick, onBeforeUnmount } from 'vue';
import { useRoute } from 'vue-router';
import { useSession } from '../composables/session';

type UserRow = {
  id_user: number;
  nom: string;
  prenom: string;
  email: string;
  role: 'admin' | 'agent' | 'benevole' | 'veto_ext';
  actif: 0 | 1;
};

const session = useSession();
const ui = reactive({ error: '', loading: false });
const users = ref<UserRow[]>([]);
const route = useRoute();
const highlightedUserId = ref<number | null>(null);
const pendingUserScroll = ref<number | null>(null);
let userHighlightTimer: ReturnType<typeof setTimeout> | null = null;

const form = reactive({
  nom: '',
  prenom: '',
  email: '',
  password: '',
  role: 'benevole' as UserRow['role'],
});

const canCreateRoles = computed<UserRow['role'][]>(() => {
  const role = session.state.user?.role;
  if (role === 'admin') return ['admin', 'agent', 'benevole', 'veto_ext'];
  if (role === 'agent') return ['benevole'];
  return [];
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
    console.error(`[users:${channel}]`, err);
    throw err;
  }
}

function parseIdParam(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const raw = Array.isArray(value) ? value[0] : value;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

function focusUser(id: number | null) {
  if (!id) return;
  highlightedUserId.value = id;
  pendingUserScroll.value = id;
  if (userHighlightTimer) clearTimeout(userHighlightTimer);
  userHighlightTimer = window.setTimeout(() => {
    highlightedUserId.value = null;
    userHighlightTimer = null;
  }, 8000);
}

function scrollToUser(id: number) {
  nextTick(() => {
    const el = document.querySelector<HTMLElement>(`[data-user-row="${id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('pulse');
      setTimeout(() => el.classList.remove('pulse'), 1200);
    }
  });
}

async function refresh() {
  ui.loading = true;
  resetError();
  try {
    const res = await safeInvoke('users:list');
    users.value = res?.rows ?? [];
    if (pendingUserScroll.value) {
      const target = pendingUserScroll.value;
      pendingUserScroll.value = null;
      if (target) scrollToUser(target);
    }
  } finally {
    ui.loading = false;
  }
}

async function createUser() {
  resetError();
  const payload = {
    nom: form.nom.trim(),
    prenom: form.prenom.trim(),
    email: form.email.trim(),
    password: form.password,
    role: form.role,
  };
  if (!payload.nom || !payload.prenom || !payload.email || !payload.password) {
    ui.error = 'Nom, prénom, email et mot de passe sont requis';
    return;
  }
  if (!canCreateRoles.value.includes(payload.role)) {
    ui.error = 'Rôle non autorisé avec votre profil';
    return;
  }
  const res = await safeInvoke('users:create', payload);
  if (res?.id_user) {
    Object.assign(form, { nom: '', prenom: '', email: '', password: '', role: canCreateRoles.value[0] ?? 'benevole' });
    await refresh();
  }
}

onMounted(async () => {
  await session.init();
  if (canCreateRoles.value.length === 0) {
    ui.error = 'Accès refusé';
    return;
  }
  form.role = canCreateRoles.value[0] ?? form.role;
  await refresh();
});

watch(
  () => route.query.userId,
  (value) => {
    const id = parseIdParam(value);
    if (id) focusUser(id);
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  if (userHighlightTimer) clearTimeout(userHighlightTimer);
});
</script>

<template>
  <div class="page">
    <div v-if="ui.error" class="banner error">{{ ui.error }}</div>

    <div class="card">
      <h2>Créer un utilisateur</h2>
      <div class="grid three">
        <div class="field">
          <label>Nom</label>
          <input v-model="form.nom" placeholder="Nom" />
        </div>
        <div class="field">
          <label>Prénom</label>
          <input v-model="form.prenom" placeholder="Prénom" />
        </div>
        <div class="field">
          <label>Email</label>
          <input v-model="form.email" placeholder="utilisateur@example.com" type="email" />
        </div>
        <div class="field">
          <label>Mot de passe</label>
          <input v-model="form.password" type="password" placeholder="********" />
        </div>
        <div class="field">
          <label>Rôle</label>
          <select v-model="form.role" :disabled="canCreateRoles.length <= 1">
            <option v-for="role in canCreateRoles" :key="role" :value="role">
              {{ role }}
            </option>
          </select>
        </div>
      </div>
      <div class="actions">
        <button class="btn" @click="createUser" :disabled="ui.loading">Créer</button>
      </div>
    </div>

    <div class="card">
      <h2>Utilisateurs existants</h2>
      <div v-if="ui.loading" class="muted">Chargement...</div>
      <div v-else-if="users.length === 0" class="empty">Aucun utilisateur.</div>
      <div v-else class="table-wrapper">
        <table class="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Nom</th>
              <th>Email</th>
              <th>Rôle</th>
              <th>Actif</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="user in users"
              :key="user.id_user"
              :class="['user-row', { highlight: highlightedUserId === user.id_user }]"
              :data-user-row="user.id_user"
            >
              <td>{{ user.id_user }}</td>
              <td>{{ user.nom }} {{ user.prenom }}</td>
              <td>{{ user.email }}</td>
              <td><span class="tag">{{ user.role }}</span></td>
              <td>
                <span :class="['badge', user.actif ? 'badge-success' : 'badge-muted']">
                  {{ user.actif ? 'Oui' : 'Non' }}
                </span>
              </td>
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
  gap: 24px;
  padding: 24px;
  background: linear-gradient(180deg, #f8fbff 0%, #f2f4fa 100%);
}
.card {
  background: #fff;
  border: 1px solid #e3e8f2;
  border-radius: 18px;
  padding: 22px;
  box-shadow: 0 20px 30px -24px rgba(25, 39, 68, 0.45);
  display: grid;
  gap: 18px;
}
h2 {
  margin: 0;
  font-size: 20px;
  color: #1f2c4f;
}
.grid.three {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
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
.field select {
  border: 1px solid #d2d9ec;
  border-radius: 12px;
  padding: 10px 12px;
  background: #fff;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.field input:focus,
.field select:focus {
  border-color: #2f73ff;
  box-shadow: 0 0 0 3px rgba(47, 115, 255, 0.18);
  outline: none;
}
.actions {
  display: flex;
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
  transition: transform 0.15s ease, box-shadow 0.2s ease;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn:hover:enabled {
  transform: translateY(-1px);
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
  color: #1f2f4a;
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
.user-row.highlight {
  background: rgba(255, 233, 196, 0.45);
  transition: background 0.3s ease;
}
.user-row.highlight td {
  background: transparent;
}
.user-row.pulse {
  animation: pulseRow 1s ease;
}
@keyframes pulseRow {
  0% { box-shadow: 0 0 0 rgba(255, 193, 107, 0.7); }
  50% { box-shadow: 0 0 18px rgba(255, 193, 107, 0.9); }
  100% { box-shadow: 0 0 0 rgba(255, 193, 107, 0); }
}
.table tbody tr:last-child td {
  border-bottom: none;
}
.tag {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: 999px;
  background: #eef3ff;
  border: 1px solid #d0dcff;
  color: #2f59d9;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}
.badge-success { background: #dcfce7; color: #166534; }
.badge-muted { background: #e5e7eb; color: #4b5563; }
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
  border: 1px dashed #d5dbef;
  background: #f6f8ff;
  color: #7c86a8;
}
</style>
