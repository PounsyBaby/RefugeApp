<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';

type AnyOpt = Record<string, any>;

const props = defineProps<{
  modelValue: (string | number)[];
  options: AnyOpt[];
  valueKey?: string;
  labelKey?: string;
  placeholder?: string;
  disabled?: boolean;
  maxHeight?: number; // px
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: (string | number)[]): void;
  (e: 'open'): void;
  (e: 'close'): void;
}>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);
const search = ref('');

const vk = computed(() => props.valueKey ?? 'value');
const lk = computed(() => props.labelKey ?? 'label');
const ph = computed(() => props.placeholder ?? 'Sélectionner...');
const maxH = computed(() => (props.maxHeight ?? 240) + 'px');

const normalized = computed(() =>
  (props.options ?? []).map(o => ({
    value: o[vk.value],
    label: o[lk.value],
    raw: o
  }))
);

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return normalized.value;
  return normalized.value.filter(x => x.label?.toLowerCase().includes(q));
});

const selectedSet = computed(() => new Set(props.modelValue ?? []));
const selectedLabels = computed(() => {
  const set = selectedSet.value;
  const lbls = normalized.value.filter(x => set.has(x.value)).map(x => x.label);
  if (lbls.length === 0) return ph.value;
  if (lbls.length <= 2) return lbls.join(', ');
  return `${lbls.length} sélectionnée(s)`;
});

function toggle() {
  if (props.disabled) return;
  open.value = !open.value;
  if (open.value) emit('open'); else emit('close');
}
function close() {
  if (!open.value) return;
  open.value = false;
  emit('close');
}

function onGlobalClick(e: MouseEvent) {
  if (!root.value) return;
  if (!root.value.contains(e.target as Node)) close();
}

onMounted(() => {
  document.addEventListener('click', onGlobalClick);
});
onBeforeUnmount(() => {
  document.removeEventListener('click', onGlobalClick);
});

function isChecked(v: string|number) {
  return selectedSet.value.has(v);
}
function toggleValue(v: string|number) {
  const current = new Set(props.modelValue ?? []);
  if (current.has(v)) current.delete(v); else current.add(v);
  emit('update:modelValue', Array.from(current));
}
function clearAll() {
  emit('update:modelValue', []);
}
function selectAll() {
  emit('update:modelValue', filtered.value.map(x => x.value));
}
</script>

<template>
  <div class="ms-root" ref="root">
    <button
      class="ms-toggle"
      type="button"
      :aria-expanded="open ? 'true' : 'false'"
      :disabled="disabled"
      @click="toggle"
    >
      <span class="ms-label">{{ selectedLabels }}</span>
      <span class="ms-caret" :class="{ open }">▾</span>
    </button>

    <div v-if="open" class="ms-panel" :style="{ maxHeight: maxH }">
      <div class="ms-head">
        <input
          class="ms-search"
          type="text"
          v-model="search"
          placeholder="Rechercher…"
        />
        <div class="ms-actions">
          <button class="link" type="button" @click="selectAll">Tout</button>
          <button class="link" type="button" @click="clearAll">Aucun</button>
        </div>
      </div>

      <ul class="ms-list">
        <li
          v-for="opt in filtered"
          :key="String(opt.value)"
          class="ms-item"
        >
          <label class="ms-option">
            <input
              type="checkbox"
              :checked="isChecked(opt.value)"
              @change="toggleValue(opt.value)"
            />
            <span>{{ opt.label }}</span>
          </label>
        </li>
        <li v-if="filtered.length === 0" class="ms-empty">Aucun résultat</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.ms-root { position: relative; width: 100%; }
.ms-toggle {
  width: 100%;
  display: flex; align-items: center; justify-content: space-between;
  border: 1px solid #cfcfcf; border-radius: 8px;
  background: #fafafa; color: #222;
  padding: 8px 10px; font-size: 14px; cursor: pointer;
}
.ms-toggle:disabled { opacity: .6; cursor: not-allowed; }
.ms-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ms-caret { transition: transform .15s ease; }
.ms-caret.open { transform: rotate(180deg); }

.ms-panel {
  position: absolute; z-index: 30; left: 0; right: 0; margin-top: 6px;
  border: 1px solid #e2e2e2; background: #fff; border-radius: 8px;
  box-shadow: 0 4px 18px rgba(0,0,0,.06);
  padding: 8px; overflow: auto;
}

.ms-head { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: center; padding-bottom: 6px; }
.ms-search {
  width: 100%; border: 1px solid #d7d7d7; border-radius: 6px;
  padding: 6px 8px; font-size: 14px; background: #fafafa; color: #222;
}
.ms-actions { display: flex; gap: 10px; }
.link { background: transparent; border: none; color: #2f73ff; cursor: pointer; font-size: 12px; padding: 0; }

.ms-list { list-style: none; margin: 0; padding: 0; }
.ms-item { padding: 4px 2px; }
.ms-option { display: flex; gap: 8px; align-items: center; padding: 6px 6px; border-radius: 6px; }
.ms-option:hover { background: #f7faff; }
.ms-empty { color: #888; font-size: 12px; padding: 8px; text-align: center; }
</style>