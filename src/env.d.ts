/// <reference types="vite/client" />

import type { DefineComponent } from 'vue';
import type { RendererApi } from '../electron/preload';

declare module '*.vue' {
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

declare global {
  interface Window {
    api: RendererApi;
  }
}

export {};
