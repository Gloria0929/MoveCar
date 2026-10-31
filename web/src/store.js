import { reactive } from 'vue';

export const store = reactive({
  toast: null,
});

let toastTimer = null;

export function toast(message, type = 'info') {
  store.toast = { message, type, key: Math.random() };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    store.toast = null;
  }, 2600);
}
