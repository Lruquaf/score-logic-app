import * as SQLite from 'expo-sqlite'
import * as SecureStore from 'expo-secure-store'
import * as Crypto from 'expo-crypto'
import { createSqliteStore, StorageError } from './core/sqlite'
import type { DraftStore, Vault, RandomSource } from './core/types'

export function environmentNamespace(origin: string) {
  let value = 2166136261
  for (const char of origin) value = Math.imul(value ^ char.charCodeAt(0), 16777619)
  return `scorelogic-${(value >>> 0).toString(16)}`
}

export function secureVault(namespace: string): Vault {
  const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY, keychainService: namespace }
  return {
    async get<T>(key: string) { const value = await SecureStore.getItemAsync(`${namespace}.${key}`, options); if (!value) return null; try { return JSON.parse(value) as T } catch { throw new StorageError('INVALID_LOCAL_DATA', 'Saved session data could not be read. Your data was kept. Retry or update the app before continuing.') } },
    async set(key, value) { await SecureStore.setItemAsync(`${namespace}.${key}`, JSON.stringify(value), options) },
    async remove(key) { await SecureStore.deleteItemAsync(`${namespace}.${key}`, options) }
  }
}

export const randomSource: RandomSource = {
  uuid: () => Crypto.randomUUID(),
  async secret() {
    const bytes = await Crypto.getRandomBytesAsync(32)
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
    let result = '', bits = 0, value = 0
    for (const byte of bytes) { value = (value << 8) | byte; bits += 8; while (bits >= 6) { bits -= 6; result += alphabet[(value >>> bits) & 63] } }
    if (bits) result += alphabet[(value << (6 - bits)) & 63]
    return result
  }
}

export async function openDraftStore(namespace: string): Promise<DraftStore> {
  const db = await SQLite.openDatabaseAsync(`${namespace}.db`)
  try { return await createSqliteStore(db) }
  catch (error) { await db.closeAsync(); throw error }
}
