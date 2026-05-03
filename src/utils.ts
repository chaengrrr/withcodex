import type { AppSettings, MoneyTransaction, Summary, WorkLog } from "./types";

export function uid(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function toDateTime(date: string, time: string) {
  return `${date}T${time}:00+09:00`;
}

export function calculateWorkHours(date: string, startTime: string, endTime: string) {
  const start = new Date(toDateTime(date, startTime)).getTime();
  const end = new Date(toDateTime(date, endTime)).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.round(((end - start) / 1000 / 60 / 60) * 100) / 100;
}

function minutesSinceMidnight(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function overlapMinutes(start: number, end: number, rangeStart: number, rangeEnd: number) {
  return Math.max(0, Math.min(end, rangeEnd) - Math.max(start, rangeStart));
}

export function calculateNightHours(startTime: string, endTime: string) {
  const start = minutesSinceMidnight(startTime);
  let end = minutesSinceMidnight(endTime);
  if (end <= start) end += 1440;

  const nightMinutes =
    overlapMinutes(start, end, 0, 360) +
    overlapMinutes(start, end, 1320, 1800);

  return Math.round((nightMinutes / 60) * 100) / 100;
}

export function calculatePay(params: {
  date: string;
  startTime: string;
  endTime: string;
  hourlyWage: number;
  taxRate: number;
  breakMinutes?: number;
  nightPremiumEnabled?: boolean;
  nightPremiumRate?: number;
}) {
  const rawHours = calculateWorkHours(params.date, params.startTime, params.endTime);
  const breakHours = Math.max(0, params.breakMinutes ?? 0) / 60;
  const workHours = Math.max(0, Math.round((rawHours - breakHours) * 100) / 100);
  const nightHours = params.nightPremiumEnabled
    ? Math.min(workHours, calculateNightHours(params.startTime, params.endTime))
    : 0;
  const nightPremiumPay = Math.floor(
    nightHours * params.hourlyWage * ((params.nightPremiumRate ?? 50) / 100),
  );
  const grossPay = Math.floor(workHours * params.hourlyWage + nightPremiumPay);
  const netPay = Math.floor(grossPay * (1 - params.taxRate / 100));
  return { workHours, grossPay, netPay, nightHours, nightPremiumPay };
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
      weeklyHolidayPay: summary.weeklyHolidayPay,
    }),
    { totalHours: 0, totalGrossPay: 0, totalNetPay: 0, weeklyHolidayPay: 0 },
  );
}

export function calculateWeeklyHolidayPay(workLogs: WorkLog[], settings: AppSettings) {
  if (!settings.weeklyHolidayEnabled) return 0;

  const totalHours = workLogs.reduce((sum, log) => sum + log.workHours, 0);
  if (totalHours < 15) return 0;

  const totalBasePay = workLogs.reduce(
    (sum, log) => sum + log.workHours * log.hourlyWage,
    0,
  );
  const averageWage = totalHours > 0 ? totalBasePay / totalHours : settings.hourlyWage;
  const allowanceHours = Math.min(8, (totalHours / 40) * 8);

  return Math.floor(allowanceHours * averageWage);
}

export function summarizeWorkLogsWithSettings(workLogs: WorkLog[], settings: AppSettings): Summary {
  const base = summarizeWorkLogs(workLogs);
  const weeklyHolidayPay = calculateWeeklyHolidayPay(workLogs, settings);
  const grossWithHoliday = base.totalGrossPay + weeklyHolidayPay;
  return {
    ...base,
    weeklyHolidayPay,
    totalGrossPay: grossWithHoliday,
    totalNetPay: Math.floor(grossWithHoliday * (1 - settings.taxRate / 100)),
  };
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
