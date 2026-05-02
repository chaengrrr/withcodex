import { FormEvent, useMemo, useState } from "react";
import { notionDatabaseDesign, syncWorkLogToNotion } from "./notion";
import { repository } from "./storage";
import type { MoneyTransaction, WorkLog } from "./types";
import {
  calculatePay,
  formatWon,
  getSettlementMonth,
  getSettlementWeek,
  summarizeTransactions,
  summarizeWorkLogs,
  today,
  uid,
} from "./utils";

const defaultDate = today();
const hours = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const fiveMinuteSteps = Array.from({ length: 12 }, (_, index) =>
  String(index * 5).padStart(2, "0"),
);

type TransactionForm = {
  type: "lend" | "borrow";
  person: string;
  amount: number;
  date: string;
  isRepaid: boolean;
  memo: string;
};

function createInitialWorkForm() {
  return {
    date: defaultDate,
    startTime: "18:00",
    endTime: "22:00",
    hourlyWage: 10030,
    taxRate: 3.3,
    memo: "",
  };
}

function createInitialTransactionForm(): TransactionForm {
  return {
    type: "lend",
    person: "",
    amount: 0,
    date: defaultDate,
    isRepaid: false,
    memo: "",
  };
}

export default function App() {
  const [workLogs, setWorkLogs] = useState<WorkLog[]>(() => repository.getWorkLogs());
  const [transactions, setTransactions] = useState<MoneyTransaction[]>(() =>
    repository.getTransactions(),
  );
  const [workForm, setWorkForm] = useState(createInitialWorkForm);
  const [transactionForm, setTransactionForm] = useState(createInitialTransactionForm);
  const [selectedDate, setSelectedDate] = useState(defaultDate);
  const [periodMonth, setPeriodMonth] = useState(defaultDate.slice(0, 7));
  const [syncMessage, setSyncMessage] = useState("로컬 저장 중");

  const sortedLogs = useMemo(
    () => [...workLogs].sort((a, b) => `${b.date}${b.startTime}`.localeCompare(`${a.date}${a.startTime}`)),
    [workLogs],
  );

  const selectedDateLogs = sortedLogs.filter((log) => log.date === selectedDate);
  const monthlyLogs = workLogs.filter((log) => log.settlementMonth === periodMonth);
  const selectedWeek = getSettlementWeek(selectedDate);
  const weeklyLogs = workLogs.filter((log) => log.settlementWeek === selectedWeek);
  const allSummary = summarizeWorkLogs(workLogs);
  const weekSummary = summarizeWorkLogs(weeklyLogs);
  const monthSummary = summarizeWorkLogs(monthlyLogs);
  const moneySummary = summarizeTransactions(transactions);
  const previewPay = calculatePay(workForm);

  function persistWorkLogs(nextLogs: WorkLog[]) {
    setWorkLogs(nextLogs);
    repository.saveWorkLogs(nextLogs);
  }

  function persistTransactions(nextTransactions: MoneyTransaction[]) {
    setTransactions(nextTransactions);
    repository.saveTransactions(nextTransactions);
  }

  function addWorkLog(event: FormEvent) {
    event.preventDefault();
    const calculated = calculatePay(workForm);
    if (calculated.workHours <= 0) {
      setSyncMessage("근무 시간을 확인하세요");
      return;
    }

    const now = new Date().toISOString();
    const log: WorkLog = {
      id: uid("work"),
      ...workForm,
      ...calculated,
      settlementWeek: getSettlementWeek(workForm.date),
      settlementMonth: getSettlementMonth(workForm.date),
      createdAt: now,
      updatedAt: now,
    };

    persistWorkLogs([log, ...workLogs]);
    setSelectedDate(workForm.date);
    setPeriodMonth(workForm.date.slice(0, 7));
    setWorkForm({ ...createInitialWorkForm(), date: workForm.date, hourlyWage: workForm.hourlyWage, taxRate: workForm.taxRate });
    setSyncMessage("근무 기록 저장 완료");
  }

  function deleteWorkLog(id: string) {
    persistWorkLogs(workLogs.filter((log) => log.id !== id));
  }

  async function syncOne(log: WorkLog) {
    setSyncMessage("Notion 동기화 중");
    try {
      const result = await syncWorkLogToNotion(log);
      const nextLogs = workLogs.map((item) =>
        item.id === log.id
          ? { ...item, notionPageId: result.notionPageId, syncedAt: new Date().toISOString() }
          : item,
      );
      persistWorkLogs(nextLogs);
      setSyncMessage("Notion 동기화 완료");
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "Notion 동기화 실패");
    }
  }

  function addTransaction(event: FormEvent) {
    event.preventDefault();
    if (!transactionForm.person.trim() || transactionForm.amount <= 0) return;
    const now = new Date().toISOString();
    const transaction: MoneyTransaction = {
      id: uid("money"),
      ...transactionForm,
      createdAt: now,
      updatedAt: now,
    };
    persistTransactions([transaction, ...transactions]);
    setTransactionForm(createInitialTransactionForm());
  }

  function toggleRepaid(id: string) {
    persistTransactions(
      transactions.map((tx) =>
        tx.id === id
          ? {
              ...tx,
              isRepaid: !tx.isRepaid,
              updatedAt: new Date().toISOString(),
            }
          : tx,
      ),
    );
  }

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">개인용 근무 수입 관리</p>
          <h1>아르바이트 정산</h1>
        </div>
        <div className="status">{syncMessage}</div>
      </section>

      <section className="summary-grid">
        <SummaryCard label="전체 근무" value={`${allSummary.totalHours}시간`} detail={`${formatWon(allSummary.totalNetPay)} 수령`} />
        <SummaryCard label={`${selectedWeek} 주간`} value={formatWon(weekSummary.totalNetPay)} detail={`${weekSummary.totalHours}시간 / 세전 ${formatWon(weekSummary.totalGrossPay)}`} />
        <SummaryCard label={`${periodMonth} 월간`} value={formatWon(monthSummary.totalNetPay)} detail={`${monthSummary.totalHours}시간 / 세전 ${formatWon(monthSummary.totalGrossPay)}`} />
        <SummaryCard label="미상환 거래" value={formatWon(moneySummary.receivable - moneySummary.payable)} detail={`받을 돈 ${formatWon(moneySummary.receivable)} / 갚을 돈 ${formatWon(moneySummary.payable)}`} />
      </section>

      <section className="workspace-grid">
        <form className="panel input-panel" onSubmit={addWorkLog}>
          <PanelHeader title="빠른 근무 입력" action={`${previewPay.workHours}시간 · ${formatWon(previewPay.netPay)}`} />
          <div className="form-grid">
            <label>
              날짜
              <input type="date" value={workForm.date} onChange={(e) => setWorkForm({ ...workForm, date: e.target.value })} />
            </label>
            <label>
              시작
              <TimeSelect value={workForm.startTime} onChange={(startTime) => setWorkForm({ ...workForm, startTime })} />
            </label>
            <label>
              종료
              <TimeSelect value={workForm.endTime} onChange={(endTime) => setWorkForm({ ...workForm, endTime })} />
            </label>
            <label>
              시급
              <input type="number" min="0" value={workForm.hourlyWage} onChange={(e) => setWorkForm({ ...workForm, hourlyWage: Number(e.target.value) })} />
            </label>
            <label>
              세율 %
              <input type="number" min="0" step="0.1" value={workForm.taxRate} onChange={(e) => setWorkForm({ ...workForm, taxRate: Number(e.target.value) })} />
            </label>
            <label className="wide">
              메모
              <input value={workForm.memo} onChange={(e) => setWorkForm({ ...workForm, memo: e.target.value })} placeholder="근무지, 특이사항" />
            </label>
          </div>
          <button className="primary-button" type="submit">근무 기록 저장</button>
        </form>

        <section className="panel">
          <PanelHeader title="캘린더 조회" action="날짜 선택" />
          <input className="large-date" type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
          <div className="day-list">
            {selectedDateLogs.length === 0 ? (
              <p className="empty">선택한 날짜의 근무 기록이 없습니다.</p>
            ) : (
              selectedDateLogs.map((log) => <WorkLogRow key={log.id} log={log} onDelete={deleteWorkLog} onSync={syncOne} />)
            )}
          </div>
        </section>
      </section>

      <section className="workspace-grid bottom-grid">
        <section className="panel">
          <PanelHeader title="기간 정산" action="주/월 자동 계산" />
          <label className="month-filter">
            정산 월
            <input type="month" value={periodMonth} onChange={(e) => setPeriodMonth(e.target.value)} />
          </label>
          <div className="settlement-table">
            <SummaryLine label="주간 총 근무 시간" value={`${weekSummary.totalHours}시간`} />
            <SummaryLine label="주간 세전 총 급여" value={formatWon(weekSummary.totalGrossPay)} />
            <SummaryLine label="주간 세후 총 수령액" value={formatWon(weekSummary.totalNetPay)} />
            <SummaryLine label="월간 세전 총 급여" value={formatWon(monthSummary.totalGrossPay)} />
            <SummaryLine label="월간 세후 총 수령액" value={formatWon(monthSummary.totalNetPay)} />
          </div>
        </section>

        <section className="panel">
          <PanelHeader title="금전 거래 확장" action="채권/채무" />
          <form className="transaction-form" onSubmit={addTransaction}>
            <select value={transactionForm.type} onChange={(e) => setTransactionForm({ ...transactionForm, type: e.target.value as "lend" | "borrow" })}>
              <option value="lend">빌려줌</option>
              <option value="borrow">빌림</option>
            </select>
            <input placeholder="상대방" value={transactionForm.person} onChange={(e) => setTransactionForm({ ...transactionForm, person: e.target.value })} />
            <input type="number" min="0" placeholder="금액" value={transactionForm.amount || ""} onChange={(e) => setTransactionForm({ ...transactionForm, amount: Number(e.target.value) })} />
            <input type="date" value={transactionForm.date} onChange={(e) => setTransactionForm({ ...transactionForm, date: e.target.value })} />
            <button type="submit">추가</button>
          </form>
          <div className="transaction-list">
            {transactions.slice(0, 6).map((tx) => (
              <button className="transaction-row" key={tx.id} onClick={() => toggleRepaid(tx.id)}>
                <span>{tx.type === "lend" ? "받을 돈" : "갚을 돈"} · {tx.person}</span>
                <strong>{formatWon(tx.amount)}</strong>
                <em>{tx.isRepaid ? "상환 완료" : "미상환"}</em>
              </button>
            ))}
          </div>
        </section>
      </section>

      <section className="panel schema-panel">
        <PanelHeader title="Notion Database 설계" action="방식 A 추천: 로컬 원본 + Notion 동기화" />
        <div className="schema-grid">
          {notionDatabaseDesign.map(([name, type, description]) => (
            <div className="schema-row" key={name}>
              <strong>{name}</strong>
              <span>{type}</span>
              <p>{description}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function PanelHeader({ title, action }: { title: string; action: string }) {
  return (
    <header className="panel-header">
      <h2>{title}</h2>
      <span>{action}</span>
    </header>
  );
}

function TimeSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [hour = "00", minute = "00"] = value.split(":");
  const safeMinute = fiveMinuteSteps.includes(minute) ? minute : "00";

  function update(nextHour: string, nextMinute: string) {
    onChange(`${nextHour}:${nextMinute}`);
  }

  return (
    <div className="time-select">
      <select aria-label="시" value={hour} onChange={(e) => update(e.target.value, safeMinute)}>
        {hours.map((item) => (
          <option key={item} value={item}>
            {item}시
          </option>
        ))}
      </select>
      <select aria-label="분" value={safeMinute} onChange={(e) => update(hour, e.target.value)}>
        {fiveMinuteSteps.map((item) => (
          <option key={item} value={item}>
            {item}분
          </option>
        ))}
      </select>
    </div>
  );
}

function WorkLogRow({ log, onDelete, onSync }: { log: WorkLog; onDelete: (id: string) => void; onSync: (log: WorkLog) => void }) {
  return (
    <article className="work-row">
      <div>
        <strong>{log.startTime} - {log.endTime}</strong>
        <p>{log.workHours}시간 · 세전 {formatWon(log.grossPay)} · 세후 {formatWon(log.netPay)}</p>
        {log.memo && <small>{log.memo}</small>}
      </div>
      <div className="row-actions">
        <button type="button" onClick={() => onSync(log)}>{log.notionPageId ? "재동기화" : "Notion"}</button>
        <button type="button" onClick={() => onDelete(log.id)}>삭제</button>
      </div>
    </article>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary-line">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
