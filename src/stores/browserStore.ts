import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

interface BrowserState {
  isOpen: boolean;
  currentUrl: string;
  isLoading: boolean;

  openBrowser: (url: string, x: number, y: number, w: number, h: number) => Promise<void>;
  navigate: (url: string) => Promise<void>;
  closeBrowser: () => Promise<void>;
  updatePosition: (x: number, y: number, w: number, h: number) => Promise<void>;
  execJs: (js: string) => Promise<void>;
  screenshot: () => Promise<string>;
}

export const useBrowserStore = create<BrowserState>((set, get) => ({
  isOpen: false,
  currentUrl: '',
  isLoading: false,

  openBrowser: async (url, x, y, w, h) => {
    set({ isLoading: true });
    await invoke('cmd_browser_open', { url, x, y, w, h });
    set({ isOpen: true, currentUrl: url, isLoading: false });
  },

  navigate: async (url) => {
    set({ isLoading: true, currentUrl: url });
    await invoke('cmd_browser_navigate', { url });
    set({ isLoading: false });
  },

  closeBrowser: async () => {
    await invoke('cmd_browser_close');
    set({ isOpen: false, currentUrl: '', isLoading: false });
  },

  updatePosition: async (x, y, w, h) => {
    if (!get().isOpen) return;
    await invoke('cmd_browser_resize', { x, y, w, h });
  },

  execJs: async (js) => {
    await invoke('cmd_browser_exec_js', { js });
  },

  screenshot: async () => {
    return await invoke<string>('cmd_browser_screenshot');
  },
}));
