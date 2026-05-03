import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
// @ts-expect-error Vite query string busts an old development service-worker cache.
import { importWorkLogsFromNotion, syncWorkLogToNotion } from "./notion.ts?v=tabbed-20260503";
// @ts-expect-error Vite query string busts an old development service-worker cache.
import { defaultSettings, repository } from "./storage.ts?v=tabbed-20260503";
import type { AppSettings, BackupData, MoneyTransaction, WorkLog } from "./types";
import {
  calculatePay,
  formatWon,
  getSettlementMonth,
  getSettlementWeek,
  summarizeTransactions,
  summarizeWorkLogs,
  summarizeWorkLogsWithSettings,
  today,
  uid,
// @ts-expect-error Vite query string busts an old development service-worker cache.
} from "./utils.ts?v=tabbed-20260503";

const defaultDate = today();
const notionDatabaseUrl = "https://www.notion.so/4de3ac1660b74d6893af999c1ff5f2c9";
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

type AppTab = "work" | "money" | "notion";

function createInitialWorkForm(settings: AppSettings = defaultSettings) {
  return {
    date: defaultDate,
    startTime: "18:00",
    endTime: "22:00",
    hourlyWage: settings.hourlyWage,
    taxRate: settings.taxRate,
    breakMinutes: settings.breakMinutes,
    nightPremiumEnabled: settings.nightPremiumEnabled,
    nightPremiumRate: settings.nightPremiumRate,
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
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const [workLogs, setWorkLogs] = useState<WorkLog[]>([]);
  const [transactions, setTransactions] = useState<MoneyTransaction[]>([]);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [workForm, setWorkForm] = useState(() => createInitialWorkForm(defaultSettings));
  const [transactionForm, setTransactionForm] = useState(createInitialTransactionForm);
  const [selectedDate, setSelectedDate] = useState(defaultDate);
  const [periodMonth, setPeriodMonth] = useState(defaultDate.slice(0, 7));
  const [syncMessage, setSyncMessage] = useState("");
  const [activeTab, setActiveTab] = useState<AppTab>("work");
  const [showAdvancedPay, setShowAdvancedPay] = useState(false);
  const [showDefaults, setShowDefaults] = useState(false);

  const sortedLogs = useMemo(
    () => [...workLogs].sort((a, b) => `${b.date}${b.startTime}`.localeCompare(`${a.date}${a.startTime}`)),
    [workLogs],
  );

  const selectedDateLogs = sortedLogs.filter((log) => log.date === selectedDate);
  const monthlyLogs = workLogs.filter((log) => log.settlementMonth === periodMonth);
  const selectedWeek = getSettlementWeek(selectedDate);
  const weeklyLogs = workLogs.filter((log) => log.settlementWeek === selectedWeek);
  const allSummary = summarizeWorkLogs(workLogs);
  const weekSummary = summarizeWorkLogsWithSettings(weeklyLogs, settings);
  const monthSummary = summarizeWorkLogs(monthlyLogs);
  const moneySummary = summarizeTransactions(transactions);
  const previewPay = calculatePay(workForm);

  useEffect(() => {
    async function loadStoredData() {
      try {
        const [storedWorkLogs, storedTransactions, storedSettings] = await Promise.all([
          repository.getWorkLogs(),
          repository.getTransactions(),
          repository.getSettings(),
        ]);
        setWorkLogs(storedWorkLogs);
        setTransactions(storedTransactions);
        setSettings(storedSettings);
        setWorkForm((current) => ({
          ...current,
          hourlyWage: storedSettings.hourlyWage,
          taxRate: storedSettings.taxRate,
          breakMinutes: storedSettings.breakMinutes,
          nightPremiumEnabled: storedSettings.nightPremiumEnabled,
          nightPremiumRate: storedSettings.nightPremiumRate,
        }));
        setSyncMessage("");
      } catch (error) {
        setSyncMessage(error instanceof Error ? error.message : "로컬 저장소 로딩 실패");
      }
    }

    loadStoredData();
  }, []);

  function persistWorkLogs(nextLogs: WorkLog[]) {
    setWorkLogs(nextLogs);
    repository.saveWorkLogs(nextLogs).catch(() => setSyncMessage("근무 기록 저장 실패"));
  }

  function persistTransactions(nextTransactions: MoneyTransaction[]) {
    setTransactions(nextTransactions);
    repository
      .saveTransactions(nextTransactions)
      .catch(() => setSyncMessage("금전 거래 저장 실패"));
  }

  function persistSettings(nextSettings: AppSettings) {
    setSettings(nextSettings);
    repository.saveSettings(nextSettings).catch(() => setSyncMessage("설정 저장 실패"));
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
    setWorkForm({
      ...createInitialWorkForm(settings),
      date: workForm.date,
      hourlyWage: workForm.hourlyWage,
      taxRate: workForm.taxRate,
      breakMinutes: workForm.breakMinutes,
      nightPremiumEnabled: workForm.nightPremiumEnabled,
      nightPremiumRate: workForm.nightPremiumRate,
    });
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
      setSyncMessage(result.mode === "created" ? "Notion에 새로 저장됨" : "Notion 업데이트 완료");
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "Notion 동기화 실패");
    }
  }

  async function syncAllWorkLogs() {
    if (workLogs.length === 0) {
      setSyncMessage("동기화할 근무 기록이 없습니다");
      return;
    }

    setSyncMessage(`전체 동기화 중 0/${workLogs.length}`);
    const syncedLogs: WorkLog[] = [];

    try {
      for (const [index, log] of workLogs.entries()) {
        const result = await syncWorkLogToNotion(log);
        syncedLogs.push({
          ...log,
          notionPageId: result.notionPageId,
          syncedAt: new Date().toISOString(),
        });
        setSyncMessage(`전체 동기화 중 ${index + 1}/${workLogs.length}`);
      }

      persistWorkLogs(syncedLogs);
      setSyncMessage("전체 Notion 동기화 완료");
    } catch (error) {
      const remainingLogs = workLogs.filter((log) => !syncedLogs.some((synced) => synced.id === log.id));
      persistWorkLogs([...syncedLogs, ...remainingLogs]);
      setSyncMessage(error instanceof Error ? error.message : "전체 동기화 실패");
    }
  }

  async function importFromNotion() {
    setSyncMessage("Notion에서 가져오는 중");

    try {
      const result = await importWorkLogsFromNotion();
      const merged = new Map<string, WorkLog>();
      const notionPageIds = new Set(
        result.workLogs.map((log: WorkLog) => log.notionPageId).filter(Boolean),
      );

      for (const log of workLogs) {
        if (!log.notionPageId || notionPageIds.has(log.notionPageId)) {
          merged.set(log.id, log);
        }
      }

      for (const imported of result.workLogs) {
        const existingById = merged.get(imported.id);
        const existingByPage = [...merged.values()].find(
          (log) => log.notionPageId && log.notionPageId === imported.notionPageId,
        );
        const existing = existingById ?? existingByPage;

        if (existing) {
          merged.delete(existing.id);
          merged.set(existing.id, {
            ...existing,
            ...imported,
            id: existing.id,
            createdAt: existing.createdAt,
          });
        } else {
          merged.set(imported.id, imported);
        }
      }

      const nextLogs = [...merged.values()].sort((a, b) =>
        `${b.date}${b.startTime}`.localeCompare(`${a.date}${a.startTime}`),
      );
      persistWorkLogs(nextLogs);
      if (result.workLogs[0]) {
        setSelectedDate(result.workLogs[0].date);
        setPeriodMonth(result.workLogs[0].date.slice(0, 7));
      }
      const removedCount = workLogs.filter(
        (log) => log.notionPageId && !notionPageIds.has(log.notionPageId),
      ).length;
      setSyncMessage(
        removedCount > 0
          ? `Notion 기준으로 ${result.workLogs.length}개 확인, ${removedCount}개 제거`
          : `Notion에서 ${result.workLogs.length}개 확인 완료`,
      );
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "Notion 가져오기 실패");
    }
  }

  function updateSettings(nextSettings: AppSettings) {
    persistSettings(nextSettings);
    setWorkForm((current) => ({
      ...current,
      hourlyWage: nextSettings.hourlyWage,
      taxRate: nextSettings.taxRate,
      breakMinutes: nextSettings.breakMinutes,
      nightPremiumEnabled: nextSettings.nightPremiumEnabled,
      nightPremiumRate: nextSettings.nightPremiumRate,
    }));
  }

  async function exportBackup() {
    try {
      const backup = await repository.exportBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `work-income-backup-${today()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setSyncMessage("백업 파일 생성 완료");
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "백업 실패");
    }
  }

  async function restoreBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const backup = JSON.parse(await file.text()) as BackupData;
      if (backup.version !== 1 || !Array.isArray(backup.workLogs)) {
        throw new Error("지원하지 않는 백업 파일입니다");
      }

      await repository.restoreBackup(backup);
      setWorkLogs(backup.workLogs);
      setTransactions(backup.moneyTransactions);
      setSettings({ ...defaultSettings, ...backup.settings });
      setSyncMessage("백업 복원 완료");
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "복원 실패");
    } finally {
      event.target.value = "";
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
          <h1>아르바이트 정산</h1>
        </div>
        <div className="topbar-actions">
          <button className={`data-button ${activeTab === "notion" ? "active" : ""}`} type="button" onClick={() => setActiveTab("notion")}>
            데이터
          </button>
          {syncMessage && <div className="status">{syncMessage}</div>}
        </div>
      </section>

      <nav className="tabbar" aria-label="앱 영역">
        <button className={activeTab === "work" ? "active" : ""} type="button" onClick={() => setActiveTab("work")}>알바</button>
        <button className={activeTab === "money" ? "active" : ""} type="button" onClick={() => setActiveTab("money")}>빌린 돈</button>
      </nav>

      {activeTab === "work" && (
        <>
          <section className="summary-grid work-summary-grid">
            <SummaryCard label="전체 근무" value={`${allSummary.totalHours}시간`} detail={`${formatWon(allSummary.totalNetPay)} 수령`} />
            <SummaryCard label={`${selectedWeek} 주간`} value={formatWon(weekSummary.totalNetPay)} detail={`${weekSummary.totalHours}시간 / 세전 ${formatWon(weekSummary.totalGrossPay)}`} />
            <SummaryCard label={`${periodMonth} 월간`} value={formatWon(monthSummary.totalNetPay)} detail={`${monthSummary.totalHours}시간 / 세전 ${formatWon(monthSummary.totalGrossPay)}`} />
          </section>

          <section className="workspace-grid">
            <form className="panel input-panel" onSubmit={addWorkLog}>
              <PanelHeader title="빠른 근무 입력" action={`${previewPay.workHours}시간 · ${formatWon(previewPay.netPay)}`} />
              <button className="small-toggle" type="button" onClick={() => setShowDefaults(!showDefaults)}>
                {showDefaults ? "기본값 닫기" : "기본값"}
              </button>
              {showDefaults && (
                <div className="settings-inline">
                  <label>
                    기본 시급
                    <input type="number" min="0" value={settings.hourlyWage} onChange={(e) => updateSettings({ ...settings, hourlyWage: Number(e.target.value) })} />
                  </label>
                  <label>
                    기본 세율 %
                    <input type="number" min="0" step="0.1" value={settings.taxRate} onChange={(e) => updateSettings({ ...settings, taxRate: Number(e.target.value) })} />
                  </label>
                  <label className="checkbox-label">
                    <input type="checkbox" checked={settings.weeklyHolidayEnabled} onChange={(e) => updateSettings({ ...settings, weeklyHolidayEnabled: e.target.checked })} />
                    주휴수당 요약 포함
                  </label>
                </div>
              )}
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
              <button className="ghost-button" type="button" onClick={() => setShowAdvancedPay(!showAdvancedPay)}>
                {showAdvancedPay ? "고급 설정 닫기" : "고급 설정"}
              </button>
              {showAdvancedPay && (
                <div className="form-grid advanced-grid">
                  <label>
                    휴게 분
                    <input type="number" min="0" step="5" value={workForm.breakMinutes} onChange={(e) => setWorkForm({ ...workForm, breakMinutes: Number(e.target.value) })} />
                  </label>
                  <label>
                    야간 %
                    <input type="number" min="0" step="5" disabled={!workForm.nightPremiumEnabled} value={workForm.nightPremiumRate} onChange={(e) => setWorkForm({ ...workForm, nightPremiumRate: Number(e.target.value) })} />
                  </label>
                  <label className="checkbox-label">
                    <input type="checkbox" checked={workForm.nightPremiumEnabled} onChange={(e) => setWorkForm({ ...workForm, nightPremiumEnabled: e.target.checked })} />
                    야간수당
                  </label>
                </div>
              )}
              <button className="primary-button" type="submit">근무 기록 저장</button>
            </form>

            <section className="panel">
              <PanelHeader title="캘린더 조회" action="날짜 선택" />
              <div className="inline-actions">
                <button className="secondary-button compact" type="button" onClick={importFromNotion}>Notion 기준 새로고침</button>
                <button className="secondary-button compact" type="button" onClick={syncAllWorkLogs}>전체 동기화</button>
              </div>
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
                <SummaryLine label="주휴수당 예상" value={formatWon(weekSummary.weeklyHolidayPay)} />
                <SummaryLine label="주간 세전 총 급여" value={formatWon(weekSummary.totalGrossPay)} />
                <SummaryLine label="주간 세후 총 수령액" value={formatWon(weekSummary.totalNetPay)} />
                <SummaryLine label="월간 세전 총 급여" value={formatWon(monthSummary.totalGrossPay)} />
                <SummaryLine label="월간 세후 총 수령액" value={formatWon(monthSummary.totalNetPay)} />
              </div>
            </section>

          </section>
        </>
      )}

      {activeTab === "money" && (
        <section className="workspace-grid bottom-grid">
          <section className="panel">
            <PanelHeader title="빌리고 빌려준 돈" action="가볍게 기록" />
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
              {transactions.length === 0 ? (
                <p className="empty">금전 거래 기록이 없습니다.</p>
              ) : (
                transactions.map((tx) => (
                  <button className="transaction-row" key={tx.id} onClick={() => toggleRepaid(tx.id)}>
                    <span>{tx.type === "lend" ? "받을 돈" : "갚을 돈"} · {tx.person}</span>
                    <strong>{formatWon(tx.amount)}</strong>
                    <em>{tx.isRepaid ? "상환 완료" : "미상환"}</em>
                  </button>
                ))
              )}
            </div>
          </section>
          <section className="summary-grid money-summary">
            <SummaryCard label="받을 돈" value={formatWon(moneySummary.receivable)} detail="미상환 빌려줌 합계" />
            <SummaryCard label="갚을 돈" value={formatWon(moneySummary.payable)} detail="미상환 빌림 합계" />
          </section>
        </section>
      )}

      {activeTab === "notion" && (
        <>
          <section className="workspace-grid bottom-grid">
            <section className="panel">
              <PanelHeader title="Notion 동기화" action="연결 관리" />
              <div className="backup-actions">
                <a className="notion-link compact" href={notionDatabaseUrl} target="_blank" rel="noreferrer">Notion DB 열기</a>
                <button className="secondary-button compact" type="button" onClick={importFromNotion}>Notion 기준 새로고침</button>
                <button className="secondary-button compact" type="button" onClick={syncAllWorkLogs}>전체 동기화</button>
              </div>
            </section>
            <section className="panel">
              <PanelHeader title="백업 및 복원" action="JSON 파일" />
              <div className="backup-actions">
                <button className="primary-button compact" type="button" onClick={exportBackup}>백업 내보내기</button>
                <button className="secondary-button compact" type="button" onClick={() => restoreInputRef.current?.click()}>백업 복원</button>
                <input ref={restoreInputRef} className="hidden-file" type="file" accept="application/json" onChange={restoreBackup} />
              </div>
              <p className="backup-note">휴대폰에서 쓰기 전 백업 파일을 주기적으로 저장해두면 브라우저 데이터 삭제에 대비할 수 있습니다.</p>
            </section>
          </section>

        </>
      )}
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
