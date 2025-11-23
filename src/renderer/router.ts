import { createRouter, createWebHashHistory } from 'vue-router';
import { useSession } from './composables/session';

const Login    = () => import('./views/Login.vue');
const Shell    = () => import('./views/Shell.vue');
const Dashboard = () => import('./views/Dashboard.vue');
const People   = () => import('./views/People.vue');
const Animals  = () => import('./views/Animals.vue');
const Adoption = () => import('./views/Adoption.vue');
const Health   = () => import('./views/Health.vue');
const Families = () => import('./views/Families.vue');
const Species  = () => import('./views/Species.vue');
const Users    = () => import('./views/Users.vue');
const Entries  = () => import('./views/Entries.vue');
const Veterinarians = () => import('./views/Veterinarians.vue');

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/login' },
    { path: '/login', component: Login },
    {
      path: '/app',
      component: Shell,
      children: [
        { path: '', redirect: '/app/dashboard' },
        { path: 'dashboard', component: Dashboard },
        { path: 'people',   component: People },
        { path: 'animals',  component: Animals },
        { path: 'entries',  component: Entries },
        { path: 'health',   component: Health },
        { path: 'veterinaires', component: Veterinarians },
        { path: 'families', component: Families },
        { path: 'adoption', component: Adoption },
        { path: 'species',  component: Species },
        { path: 'users',    component: Users, meta: { roles: ['admin', 'agent'] } },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/login' },
  ],
});

const session = useSession();

router.beforeEach(async (to) => {
  await session.init();
  const user = session.state.user;
  const isApp = to.path.startsWith('/app');
  if (isApp && !user) return '/login';
  if (to.path === '/login' && user) return '/app';
  const requiredRoles = to.matched
    .flatMap((record) => (record.meta?.roles as string[] | undefined) ?? []);
  if (requiredRoles.length > 0 && (!user || !requiredRoles.includes(user.role))) {
    return '/app';
  }
  return true;
});

export default router;
