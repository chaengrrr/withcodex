import type { AppSettings, BackupData, MoneyTransaction, WorkLog } from "./types";

const DB_NAME = "part-time-income-manager";
const DB_VERSION = 1;
const WORK_LOGS_STORE = "workLogs";
const TRANSACTIONS_STORE = "moneyTransactions";
const SETTINGS_STORE = "settings";
const SETTINGS_KEY = "app";

const LEGACY_WORK_LOGS_KEY = "part-time-income-manager.workLogs";
const LEGACY_TRANSACTIONS_KEY = "part-time-income-manager.moneyTransactions";

export const defaultSettings: AppSettings = {
  settingsVersion: 2,
  breakMinutes: 0,
  taxRate: 3.3,
  hourlyWage: 10320,
  nightPremiumEnabled: false,
  nightPremiumRate: 50,
  weeklyHolidayEnabled: false,
};

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(WORK_LOGS_STORE)) {
        db.createObjectStore(WORK_LOGS_STORE, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(TRANSACTIONS_STORE)) {
        db.createObjectStore(TRANSACTIONS_STORE, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T> | void,
) {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const request = run(store);
        let result: T;

        if (request) {
          request.onsuccess = () => {
            result = request.result;
          };
          request.onerror = () => reject(request.error);
        }

        tx.oncomplete = () => {
          db.close();
          resolve(result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      }),
  );
}

async function replaceAll<T extends { id: string }>(storeName: string, values: T[]) {
  const db = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    store.clear();
    values.forEach((value) => store.put(value));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  db.close();
}

function readLegacyJson<T>(key: string, fallback: T): T {
  const value = localStorage.getItem(key);
  if (!value) return fallback;

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function migrateLegacyData() {
  const migrated = localStorage.getItem("part-time-income-manager.indexedDbMigrated");
  if (migrated) return;

  const workLogs = readLegacyJson<WorkLog[]>(LEGACY_WORK_LOGS_KEY, []);
  const transactions = readLegacyJson<MoneyTransaction[]>(LEGACY_TRANSACTIONS_KEY, []);

  if (workLogs.length > 0) {
    await replaceAll(WORK_LOGS_STORE, workLogs.map(normalizeWorkLog));
  }

  if (transactions.length > 0) {
    await replaceAll(TRANSACTIONS_STORE, transactions);
  }

  localStorage.setItem("part-time-income-manager.indexedDbMigrated", "true");
}

export function normalizeWorkLog(log: WorkLog): WorkLog {
  return {
    ...log,
    breakMinutes: log.breakMinutes ?? 0,
    nightPremiumEnabled: log.nightPremiumEnabled ?? false,
    nightPremiumRate: log.nightPremiumRate ?? 50,
    nightHours: log.nightHours ?? 0,
    nightPremiumPay: log.nightPremiumPay ?? 0,
  };
}

export const repository = {
  async initialize() {
    await openDatabase();
    await migrateLegacyData();
  },
  async getWorkLogs() {
    await this.initialize();
    const workLogs = await transaction<WorkLog[]>(WORK_LOGS_STORE, "readonly", (store) =>
      store.getAll(),
    );
    return workLogs.map(normalizeWorkLog);
  },
  async saveWorkLogs(workLogs: WorkLog[]) {
    await replaceAll(WORK_LOGS_STORE, workLogs.map(normalizeWorkLog));
  },
  async getTransactions() {
    await this.initialize();
    return transaction<MoneyTransaction[]>(TRANSACTIONS_STORE, "readonly", (store) =>
      store.getAll(),
    );
  },
  async saveTransactions(transactions: MoneyTransaction[]) {
    await replaceAll(TRANSACTIONS_STORE, transactions);
  },
  async getSettings() {
    await this.initialize();
    const settings = await transaction<AppSettings | undefined>(SETTINGS_STORE, "readonly", (store) =>
      store.get(SETTINGS_KEY),
    );
    const merged = { ...defaultSettings, ...settings };

    if (!settings?.settingsVersion || settings.settingsVersion < 2) {
      return {
        ...merged,
        settingsVersion: 2,
        hourlyWage: settings?.hourlyWage === 10030 ? 10320 : merged.hourlyWage,
        nightPremiumEnabled: false,
        weeklyHolidayEnabled: false,
      };
    }

    return merged;
  },
  async saveSettings(settings: AppSettings) {
    await transaction(SETTINGS_STORE, "readwrite", (store) => store.put(settings, SETTINGS_KEY));
  },
  async exportBackup(): Promise<BackupData> {
    const [workLogs, moneyTransactions, settings] = await Promise.all([
      this.getWorkLogs(),
      this.getTransactions(),
      this.getSettings(),
    ]);

    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      workLogs,
      moneyTransactions,
      settings,
    };
  },
  async restoreBackup(backup: BackupData) {
    await Promise.all([
      this.saveWorkLogs(backup.workLogs.map(normalizeWorkLog)),
      this.saveTransactions(backup.moneyTransactions),
      this.saveSettings({ ...defaultSettings, ...backup.settings }),
    ]);
  },
};
