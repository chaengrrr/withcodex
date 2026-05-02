export type WorkLog = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  hourlyWage: number;
  taxRate: number;
  memo: string;
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
};
