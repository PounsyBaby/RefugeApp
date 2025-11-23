<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import { useSession } from '../composables/session';
import { useTheme } from '../composables/theme';

const route = useRoute();
const router = useRouter();
const session = useSession();
const theme = useTheme();

const baseItems: Array<{ to: string; label: string; icon: string; roles?: string[] }> = [
  { to: '/app/dashboard', label: 'Tableau de bord', icon: '📊' },
  { to: '/app/people',   label: 'Personnes',       icon: '👤' },
  { to: '/app/animals',  label: 'Animaux',         icon: '🐾' },
  { to: '/app/entries',  label: 'Entrées',         icon: '📥' },
  { to: '/app/health',   label: 'Santé',           icon: '💉' },
  { to: '/app/veterinaires', label: 'Vétérinaires', icon: '🏥' },
  { to: '/app/families', label: 'Familles FA',     icon: '🏠' },
  { to: '/app/adoption', label: 'Demandes',        icon: '📄' },
  { to: '/app/species',  label: 'Espèces & Races', icon: '🧬' },
  { to: '/app/users',    label: 'Utilisateurs',    icon: '🛡️', roles: ['admin', 'agent'] },
];
const activePath = computed(() => route.path);
const isActive = (p: string) => activePath.value.startsWith(p);

const user = computed(() => session.state.user);
const navItems = computed(() => {
  const role = user.value?.role;
  return baseItems.filter((item) => !item.roles || (role && item.roles.includes(role)));
});
const userDisplay = computed(() => {
  const u = user.value;
  if (!u) return '';
  if (u.prenom || u.nom) return `${u.prenom ?? ''} ${u.nom ?? ''}`.trim();
  return u.email;
});

const isDark = computed(() => theme.state.theme === 'dark');

onMounted(async () => {
  await session.init({ force: true });
  theme.init();
});

async function logout() {
  await session.logout();
  router.replace('/login');
}

function toggleTheme() {
  theme.toggleTheme();
}
</script>

<template>
  <div class="layout">
    <aside class="sidebar">
      <div class="brand">
        <div class="logo">🐶</div>
        <div class="title">Refuge</div>
      </div>
      <div v-if="user" class="user">
        <div class="user-name">{{ userDisplay }}</div>
        <div class="user-role">{{ user.role }}</div>
      </div>
      <nav class="menu">
        <RouterLink v-for="it in navItems" :key="it.to" :to="it.to"
          class="menu-item" :class="{ active: isActive(it.to) }">
          <span class="icon">{{ it.icon }}</span>
          <span>{{ it.label }}</span>
        </RouterLink>
      </nav>
      <div class="sidebar-footer">
        <button class="menu-item ghost" @click="toggleTheme">
          <span class="icon">{{ isDark ? '🌙' : '☀️' }}</span>
          <span>{{ isDark ? 'Mode sombre' : 'Mode clair' }}</span>
        </button>
        <button class="menu-item ghost" @click="logout">
          <span class="icon">🚪</span><span>Déconnexion</span>
        </button>
      </div>
    </aside>
    <main class="content">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.layout{display:grid;grid-template-columns:220px 1fr;height:100vh;background:var(--layout-bg)}
.sidebar{background:var(--sidebar-bg);border-right:1px solid var(--sidebar-border);display:flex;flex-direction:column;gap:8px;padding:14px;color:var(--sidebar-text)}
.brand{display:flex;align-items:center;gap:10px;padding:8px;border-radius:10px}
.logo{font-size:22px}.title{font-weight:700;color:var(--sidebar-heading)}
.user{padding:8px 8px 4px;border-radius:10px;background:var(--user-card-bg);border:1px solid var(--user-card-border);display:flex;flex-direction:column;gap:2px}
.user-name{font-weight:600;color:var(--user-name)}
.user-role{text-transform:uppercase;font-size:11px;letter-spacing:0.08em;color:var(--user-role)}
.menu{display:grid;gap:6px;margin-top:6px}
.menu-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;color:var(--sidebar-text);text-decoration:none;font-weight:500;border:1px solid transparent;background:transparent}
.menu-item:hover{background:var(--sidebar-hover)}
.menu-item.active{background:var(--sidebar-active-bg);color:var(--sidebar-active-color);border:1px solid var(--sidebar-active-border)}
.menu-item.ghost{width:100%;text-align:left;background:transparent;border:1px solid var(--sidebar-ghost-border);cursor:pointer}
.icon{width:22px;text-align:center}
.content{height:100vh;overflow:auto;background:var(--layout-bg)}
.sidebar-footer{display:grid;gap:8px;margin-top:auto}
</style>
