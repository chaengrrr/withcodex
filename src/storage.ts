import type { MoneyTransaction, WorkLog } from "./types";

const WORK_LOGS_KEY = "part-time-income-manager.workLogs";
const TRANSACTIONS_KEY = "part-time-income-manager.moneyTransactions";

function readJson<T>(key: string, fallback: T): T {
  const value = localStorage.getItem(key);
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

export const repository = {
  getWorkLogs() {
    return readJson<WorkLog[]>(WORK_LOGS_KEY, []);
  },
  saveWorkLogs(workLogs: WorkLog[]) {
    writeJson(WORK_LOGS_KEY, workLogs);
  },
  getTransactions() {
    return readJson<MoneyTransaction[]>(TRANSACTIONS_KEY, []);
  },
  saveTransactions(transactions: MoneyTransaction[]) {
    writeJson(TRANSACTIONS_KEY, transactions);
  },
};
