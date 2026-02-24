import { create } from 'zustand';
import type { ModelConfig } from '../types/ai';
import { saveModelConfig, loadModelConfig } from '../services/settingsStorage';

interface SettingsState {
  modelConfig: ModelConfig;
  isSettingsOpen: boolean;
  initialized: boolean;

  initSettings: () => Promise<void>;
  updateModelConfig: (updates: Partial<ModelConfig>) => void;
  toggleSettings: () => void;
  setSettingsOpen: (open: boolean) => void;
}

const DEFAULT_CONFIG: ModelConfig = {
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o',
  supportsVision: true,
};

export const useSettingsStore = create<SettingsState>((set) => ({
  modelConfig: DEFAULT_CONFIG,
  isSettingsOpen: false,
  initialized: false,

  initSettings: async () => {
    try {
      const saved = await loadModelConfig();
      if (saved) {
        set({ modelConfig: saved });
      }
      set({ initialized: true });
    } catch (error) {
      console.error('Failed to load settings:', error);
      set({ initialized: true });
    }
  },

  updateModelConfig: (updates) => {
    set((state) => {
      const modelConfig = { ...state.modelConfig, ...updates };
      saveModelConfig(modelConfig).catch(console.error);
      return { modelConfig };
    });
  },

  toggleSettings: () => set((state) => ({ isSettingsOpen: !state.isSettingsOpen })),

  setSettingsOpen: (open) => set({ isSettingsOpen: open }),
}));
