export type WorkLog = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  hourlyWage: number;
  taxRate: number;
  memo: string;
  breakMinutes: number;
  nightPremiumEnabled: boolean;
  nightPremiumRate: number;
  nightHours: number;
  nightPremiumPay: number;
  workHours: number;
  grossPay: number;
  netPay: number;
  settlementWeek: string;
  settlementMonth: string;
  notionPageId?: string;
  syncedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type MoneyTransaction = {
  id: string;
  type: "lend" | "borrow";
  person: string;
  amount: number;
  date: string;
  isRepaid: boolean;
  memo: string;
  notionPageId?: string;
  syncedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type Summary = {
  totalHours: number;
  totalGrossPay: number;
  totalNetPay: number;
  weeklyHolidayPay: number;
};

export type AppSettings = {
  settingsVersion?: number;
  breakMinutes: number;
  taxRate: number;
  hourlyWage: number;
  nightPremiumEnabled: boolean;
  nightPremiumRate: number;
  weeklyHolidayEnabled: boolean;
};

export type BackupData = {
  version: 1;
  exportedAt: string;
  workLogs: WorkLog[];
  moneyTransactions: MoneyTransaction[];
  settings: AppSettings;
};
