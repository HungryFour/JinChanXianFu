import { load } from '@tauri-apps/plugin-store';
import type { ModelConfig } from '../types/ai';

const STORE_NAME = 'settings.json';
const MODEL_CONFIG_KEY = 'model_config';

let storeInstance: Awaited<ReturnType<typeof load>> | null = null;

async function getStore() {
  if (!storeInstance) {
    storeInstance = await load(STORE_NAME, { autoSave: true, defaults: {} });
  }
  return storeInstance;
}

export async function saveModelConfig(config: ModelConfig): Promise<void> {
  const store = await getStore();
  await store.set(MODEL_CONFIG_KEY, config);
}

export async function loadModelConfig(): Promise<ModelConfig | null> {
  const store = await getStore();
  return (await store.get<ModelConfig>(MODEL_CONFIG_KEY)) ?? null;
}
