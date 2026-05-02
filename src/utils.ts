import type { MoneyTransaction, Summary, WorkLog } from "./types";

export function uid(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function toDateTime(date: string, time: string) {
  return `${date}T${time}:00`;
}

export function calculateWorkHours(date: string, startTime: string, endTime: string) {
  const start = new Date(toDateTime(date, startTime)).getTime();
  const end = new Date(toDateTime(date, endTime)).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.round(((end - start) / 1000 / 60 / 60) * 100) / 100;
}

export function calculatePay(params: {
  date: string;
  startTime: string;
  endTime: string;
  hourlyWage: number;
  taxRate: number;
}) {
  const workHours = calculateWorkHours(params.date, params.startTime, params.endTime);
  const grossPay = Math.floor(workHours * params.hourlyWage);
  const netPay = Math.floor(grossPay * (1 - params.taxRate / 100));
  return { workHours, grossPay, netPay };
}

export function getSettlementMonth(date: string) {
  return date.slice(0, 7);
}

export function getSettlementWeek(date: string) {
  const target = new Date(`${date}T00:00:00`);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const firstWeekStart = new Date(firstThursday);
  firstWeekStart.setDate(firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7));
  const targetWeekStart = new Date(target);
  targetWeekStart.setDate(target.getDate() - ((target.getDay() + 6) % 7));
  const week = Math.floor((targetWeekStart.getTime() - firstWeekStart.getTime()) / 604800000) + 1;
  return `${target.getFullYear()}-W${String(Math.max(1, week)).padStart(2, "0")}`;
}

export function formatWon(value: number) {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(value);
}

export function summarizeWorkLogs(workLogs: WorkLog[]): Summary {
  return workLogs.reduce(
    (summary, log) => ({
      totalHours: Math.round((summary.totalHours + log.workHours) * 100) / 100,
      totalGrossPay: summary.totalGrossPay + log.grossPay,
      totalNetPay: summary.totalNetPay + log.netPay,
    }),
    { totalHours: 0, totalGrossPay: 0, totalNetPay: 0 },
  );
}

export function summarizeTransactions(transactions: MoneyTransaction[]) {
  return transactions.reduce(
    (summary, tx) => {
      if (tx.isRepaid) return summary;
      if (tx.type === "lend") summary.receivable += tx.amount;
      if (tx.type === "borrow") summary.payable += tx.amount;
      return summary;
    },
    { receivable: 0, payable: 0 },
  );
}
