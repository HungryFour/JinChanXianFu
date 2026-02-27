import { load } from '@tauri-apps/plugin-store';

const STORE_NAME = 'adapter-secrets.json';

let storeInstance: Awaited<ReturnType<typeof load>> | null = null;

async function getStore() {
  if (!storeInstance) {
    storeInstance = await load(STORE_NAME, { defaults: {}, autoSave: true });
  }
  return storeInstance;
}

export async function setSecret(key: string, value: string): Promise<void> {
  const store = await getStore();
  await store.set(key, value);
}

export async function getSecret(key: string): Promise<string | null> {
  const store = await getStore();
  const value = await store.get<string>(key);
  return value ?? null;
}

export async function deleteSecret(key: string): Promise<void> {
  const store = await getStore();
  await store.delete(key);
}

export async function listSecretKeys(): Promise<string[]> {
  const store = await getStore();
  return await store.keys();
}
