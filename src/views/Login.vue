<script setup lang="ts">
import { onMounted, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { useSession } from '../composables/session';

const router = useRouter();
const session = useSession();
const ui = reactive({ loading:false, error:'' });
const form = reactive({ email: 'admin@test.com', password: '123456' }); // pour tester

async function login() {
  ui.error = '';
  ui.loading = true;
  try {
    const res = await (window as any).api.invoke('auth:login', {
      email: form.email, password: form.password,
    });
    if (!res?.ok) {
      ui.error = res?.message || 'Erreur inconnue';
      return;
    }
    session.setUser(res.user);
    router.push('/app');
  } catch (e:any) {
    ui.error = e?.message || 'Erreur IPC';
  } finally {
    ui.loading = false;
  }
}

onMounted(async () => {
  await session.init();
  if (session.state.user) {
    router.replace('/app');
  }
});
</script>

<template>
  <div class="login-wrap">
    <div class="card">
      <h1>Connexion</h1>
      <div v-if="ui.error" class="banner error">{{ ui.error }}</div>

      <label>Email</label>
      <input v-model="form.email" type="email" placeholder="vous@exemple.com" />

      <label>Mot de passe</label>
      <input v-model="form.password" type="password" placeholder="••••••" />

      <button class="btn" :disabled="ui.loading" @click="login">
        {{ ui.loading ? 'Connexion…' : 'Se connecter' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.login-wrap { min-height: 100vh; display:flex; align-items:center; justify-content:center; background:#f6f7fb; }
.card { width: 360px; background:#fff; border:1px solid #e7e7e7; border-radius:12px; padding:20px; box-shadow:0 2px 8px rgba(10,10,10,.05); display:grid; gap:10px; }
h1 { margin:0 0 6px; font-size:20px; }
label { font-size:12px; color:#555; }
input { border:1px solid #cfcfcf; border-radius:8px; padding:10px; font-size:14px; background:#fafafa; }
.btn { background:#2f73ff; color:#fff; border:none; padding:10px 12px; border-radius:8px; cursor:pointer; font-size:14px; margin-top:6px; }
.btn:disabled { opacity:.6; cursor:not-allowed; }
.banner.error { background:#ffe8e8; color:#a90f0f; border:1px solid #ffc8c8; padding:8px 10px; border-radius:8px; }
</style>
