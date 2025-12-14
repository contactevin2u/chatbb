/**
 * PostgreSQL-based Auth State Store for Baileys
 *
 * CRITICAL: DO NOT use useMultiFileAuthState in production!
 * This implementation stores all auth state in PostgreSQL with encryption.
 */

import {
  AuthenticationCreds,
  AuthenticationState,
  SignalDataTypeMap,
  initAuthCreds,
  BufferJSON,
  proto
} from '@whiskeysockets/baileys';
import { prisma } from '../../../core/database/prisma';
import { encrypt, decrypt } from '../../../shared/utils/encryption';

// IMPORTANT: Never downgrade Baileys - we migrated to v7 with LID system
// Baileys v7 requires additional keys for LID system
const KEY_MAP: { [T in keyof SignalDataTypeMap]: string } = {
  'pre-key': 'pre-key',
  'session': 'session',
  'sender-key': 'sender-key',
  'sender-key-memory': 'sender-key-memory',
  'app-state-sync-key': 'app-state-sync-key',
  'app-state-sync-version': 'app-state-sync-version',
  // Baileys v7 LID system keys - DO NOT REMOVE
  'lid-mapping': 'lid-mapping',
  'device-list': 'device-list',
  'tctoken': 'tctoken',
};

interface StoredAuthState {
  creds: AuthenticationCreds;
}

/**
 * Creates a PostgreSQL-based auth state for a WhatsApp channel
 *
 * OPTIMIZED: Keys are loaded lazily on-demand, not all at once.
 * This dramatically improves startup time for channels with many sync keys.
 */
export async function usePostgresAuthState(channelId: string): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
  deleteState: () => Promise<void>;
}> {
  // Load credentials only (NOT sync keys - they're loaded lazily)
  const existingAuth = await prisma.whatsAppAuthState.findUnique({
    where: { channelId },
    // DO NOT include syncKeys here - causes slow startup with thousands of keys
    // Keys are loaded on-demand in keys.get()
  });

  let creds: AuthenticationCreds;

  if (existingAuth) {
    // Decrypt and parse existing credentials
    const decryptedCreds = decrypt(existingAuth.creds);
    const parsed: StoredAuthState = JSON.parse(decryptedCreds, BufferJSON.reviver);
    creds = parsed.creds;
  } else {
    // Initialize new credentials
    creds = initAuthCreds();
  }

  // In-memory cache for loaded keys (lazy loaded from database)
  const keys: { [key: string]: SignalDataTypeMap[keyof SignalDataTypeMap] } = {};

  // REMOVED: Pre-loading all sync keys - this was causing slow startup
  // Keys are now loaded on-demand in keys.get() method below

  const saveCreds = async () => {
    const credsData: StoredAuthState = { creds };
    const serialized = JSON.stringify(credsData, BufferJSON.replacer);
    const encryptedCreds = encrypt(serialized);

    await prisma.whatsAppAuthState.upsert({
      where: { channelId },
      create: {
        channelId,
        creds: encryptedCreds,
      },
      update: {
        creds: encryptedCreds,
      },
    });
  };

  const deleteState = async () => {
    await prisma.whatsAppAuthState.delete({
      where: { channelId },
    }).catch(() => {
      // Ignore if doesn't exist
    });
  };

  return {
    state: {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(
          type: T,
          ids: string[]
        ): Promise<{ [id: string]: SignalDataTypeMap[T] | undefined }> => {
          const result: { [id: string]: SignalDataTypeMap[T] | undefined } = {};

          // Load from memory cache first
          for (const id of ids) {
            const fullKey = `${KEY_MAP[type]}-${id}`;
            if (keys[fullKey]) {
              result[id] = keys[fullKey] as SignalDataTypeMap[T];
            }
          }

          // Load missing keys from database
          const missingIds = ids.filter(id => !result[id]);
          if (missingIds.length > 0 && existingAuth) {
            const dbKeys = await prisma.whatsAppSyncKey.findMany({
              where: {
                authStateId: existingAuth.id,
                keyId: { in: missingIds.map(id => `${KEY_MAP[type]}-${id}`) },
              },
            });

            for (const dbKey of dbKeys) {
              const id = dbKey.keyId.replace(`${KEY_MAP[type]}-`, '');
              const decrypted = decrypt(dbKey.keyData);
              const parsed = JSON.parse(decrypted, BufferJSON.reviver);
              result[id] = parsed as SignalDataTypeMap[T];
              keys[dbKey.keyId] = parsed;
            }
          }

          return result;
        },

        set: async (data: Partial<{ [T in keyof SignalDataTypeMap]: { [id: string]: SignalDataTypeMap[T] | null } }>) => {
          // Ensure auth state exists
          let authState = await prisma.whatsAppAuthState.findUnique({
            where: { channelId },
          });

          if (!authState) {
            // Create auth state if it doesn't exist
            const credsData: StoredAuthState = { creds };
            const serialized = JSON.stringify(credsData, BufferJSON.replacer);
            const encryptedCreds = encrypt(serialized);

            authState = await prisma.whatsAppAuthState.create({
              data: {
                channelId,
                creds: encryptedCreds,
              },
            });
          }

          // Process each type
          for (const type of Object.keys(data) as (keyof SignalDataTypeMap)[]) {
            const typeData = data[type];
            if (!typeData) continue;

            for (const [id, value] of Object.entries(typeData)) {
              const fullKey = `${KEY_MAP[type]}-${id}`;

              if (value === null) {
                // Delete key
                delete keys[fullKey];
                await prisma.whatsAppSyncKey.deleteMany({
                  where: {
                    authStateId: authState.id,
                    keyId: fullKey,
                  },
                });
              } else {
                // Upsert key
                const serialized = JSON.stringify(value, BufferJSON.replacer);
                const encryptedKey = encrypt(serialized);
                keys[fullKey] = value;

                await prisma.whatsAppSyncKey.upsert({
                  where: {
                    authStateId_keyId: {
                      authStateId: authState.id,
                      keyId: fullKey,
                    },
                  },
                  create: {
                    authStateId: authState.id,
                    keyId: fullKey,
                    keyData: encryptedKey,
                  },
                  update: {
                    keyData: encryptedKey,
                  },
                });
              }
            }
          }
        },
      },
    },
    saveCreds,
    deleteState,
  };
}

/**
 * Check if a channel has existing auth state
 */
export async function hasAuthState(channelId: string): Promise<boolean> {
  const authState = await prisma.whatsAppAuthState.findUnique({
    where: { channelId },
  });
  return !!authState;
}

/**
 * Delete auth state for a channel (direct DB operation)
 * Use this when you need to clear corrupted session data
 */
export async function deleteAuthState(channelId: string): Promise<void> {
  // First find the auth state to get its ID for deleting sync keys
  const authState = await prisma.whatsAppAuthState.findUnique({
    where: { channelId },
  });

  if (authState) {
    // Delete sync keys first (foreign key constraint)
    await prisma.whatsAppSyncKey.deleteMany({
      where: { authStateId: authState.id },
    });

    // Then delete the auth state
    await prisma.whatsAppAuthState.delete({
      where: { channelId },
    });
  }
}

/**
 * Get auth state metadata without full credentials
 */
export async function getAuthStateInfo(channelId: string): Promise<{
  exists: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  keyCount?: number;
}> {
  const authState = await prisma.whatsAppAuthState.findUnique({
    where: { channelId },
    include: {
      _count: {
        select: { syncKeys: true },
      },
    },
  });

  if (!authState) {
    return { exists: false };
  }

  return {
    exists: true,
    createdAt: authState.createdAt,
    updatedAt: authState.updatedAt,
    keyCount: authState._count.syncKeys,
  };
}
