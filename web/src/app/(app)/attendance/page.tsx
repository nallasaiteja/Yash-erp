"use client";
import { useState } from "react";
import { Download, Pencil } from "lucide-react";
import { download, put, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useData } from "@/lib/useData";
import type { Attendance, Department, EmpBrief, Page } from "@/lib/types";
import CheckInCard from "@/components/CheckInCard";
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Pager, Select, Table, Td, fmtDate, fmtTime, todayISO, useToast } from "@/components/ui";

type ReportRow = {
  employee_id: number; employee_code: string; full_name: string; department: string | null;
  present: number; wfh: number; half_day: number; leave: number; absent: number; holiday: number;
  effective_days: number; working_days: number; attendance_pct: number;
};

const monthAgo = () => {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
};

export default function AttendancePage() {
  const { can } = useAuth();
  const toast = useToast();
  const isHR = can("attendance:view");
  const [tab, setTab] = useState<"log" | "report">("log");
  const [start, setStart] = useState(monthAgo());
  const [end, setEnd] = useState(todayISO());
  const [emp, setEmp] = useState("");
  const [dept, setDept] = useState("");
  const [page, setPage] = useState(1);
  const now = new Date();
  const [ym, setYm] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [y, m] = ym.split("-").map(Number);

  const log = useData<Page<Attendance>>(tab === "log" ? `/api/attendance${qs({ start, end, employee_id: emp, department_id: dept, page, size: 50 })}` : null);
  const report = useData<{ working_days: number; rows: ReportRow[] }>(tab === "report" && isHR ? `/api/attendance/report${qs({ year: y, month: m, department_id: dept })}` : null);
  const emps = useData<EmpBrief[]>(isHR ? "/api/employees/lookup" : null);
  const depts = useData<Department[]>(isHR ? "/api/departments" : null);

  const [manual, setManual] = useState<null | { employee_id: string; work_date: string; status: string; check_in: string; check_out: string; notes: string }>(null);
  const [busy, setBusy] = useState(false);

  const toLocalInput = (s: string | null) => (s ? new Date(new Date(s).getTime() - new Date(s).getTimezoneOffset() * 60000).toISOString().slice(11, 16) : "");
  const openManual = (a?: Attendance) =>
    setManual(a ? { employee_id: String(a.employee_id), work_date: a.work_date, status: a.status, check_in: toLocalInput(a.check_in), check_out: toLocalInput(a.check_out), notes: a.notes ?? "" }
      : { employee_id: "", work_date: todayISO(), status: "present", check_in: "", check_out: "", notes: "" });

  async function saveManual(e: React.FormEvent) {
    e.preventDefault();
    if (!manual) return;
    setBusy(true);
    const iso = (t: string) => (t ? new Date(`${manual.work_date}T${t}:00`).toISOString() : null);
    try {
      await put("/api/attendance", { employee_id: Number(manual.employee_id), work_date: manual.work_date, status: manual.status, check_in: iso(manual.check_in), check_out: iso(manual.check_out), notes: manual.notes || null });
      toast("Attendance saved");
      setManual(null);
      log.reload();
    } catch (err) {
      toast((err as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Attendance"
        subtitle={isHR ? "Daily log, corrections and monthly reports" : "Your attendance history"}
        actions={can("attendance:edit") && <Button variant="secondary" onClick={() => openManual()}><Pencil className="size-4" /> Manual entry</Button>}
      />
      <div className="mb-4 grid gap-4 md:grid-cols-3"><CheckInCard onChange={log.reload} /></div>

      {isHR && (
        <div className="mb-3 flex gap-1 border-b border-line" role="tablist">
          {(["log", "report"] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === t ? "border-brand text-ink dark:border-accent" : "border-transparent text-muted hover:text-ink"}`}>
              {t === "log" ? "Daily log" : "Monthly report"}
            </button>
          ))}
        </div>
      )}

      {tab === "log" ? (
        <Card>
          <div className="flex flex-wrap items-end gap-2 border-b border-line p-3">
            <Field label="From"><Input type="date" value={start} onChange={(e) => { setStart(e.target.value); setPage(1); }} /></Field>
            <Field label="To"><Input type="date" value={end} onChange={(e) => { setEnd(e.target.value); setPage(1); }} /></Field>
            {isHR && (
              <>
                <Field label="Employee">
                  <Select value={emp} onChange={(e) => { setEmp(e.target.value); setPage(1); }}>
                    <option value="">Everyone</option>
                    {emps.data?.map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}
                  </Select>
                </Field>
                <Field label="Department">
                  <Select value={dept} onChange={(e) => { setDept(e.target.value); setPage(1); }}>
                    <option value="">All</option>
                    {depts.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </Select>
                </Field>
              </>
            )}
          </div>
          <Table head={["Date", "Employee", "Status", "In", "Out", "Hours", "Source", "Notes", ""]} loading={log.loading && !log.data} empty={log.data?.items.length === 0}>
            {log.data?.items.map((a) => (
              <tr key={a.id}>
                <Td>{fmtDate(a.work_date)}</Td>
                <Td>{a.employee.full_name}</Td>
                <Td><Badge>{a.status}</Badge></Td>
                <Td className="tabular-nums">{fmtTime(a.check_in)}</Td>
                <Td className="tabular-nums">{fmtTime(a.check_out)}</Td>
                <Td className="tabular-nums">{a.hours ?? "—"}</Td>
                <Td className="text-muted">{a.source}</Td>
                <Td className="max-w-[200px] truncate text-muted">{a.notes}</Td>
                <Td>{can("attendance:edit") && <Button size="sm" variant="ghost" onClick={() => openManual(a)} aria-label="Edit"><Pencil className="size-4" /></Button>}</Td>
              </tr>
            ))}
          </Table>
          {log.data && <Pager page={page} size={50} total={log.data.total} onPage={setPage} />}
        </Card>
      ) : (
        <Card>
          <div className="flex flex-wrap items-end gap-2 border-b border-line p-3">
            <Field label="Month"><Input type="month" value={ym} onChange={(e) => setYm(e.target.value)} /></Field>
            <Field label="Department">
              <Select value={dept} onChange={(e) => setDept(e.target.value)}>
                <option value="">All</option>
                {depts.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            </Field>
            <div className="flex-1" />
            {can("attendance:export") && (
              <Button variant="secondary" onClick={() => download(`/api/attendance/report${qs({ year: y, month: m, department_id: dept, format: "csv" })}`).catch((e) => toast(e.message, "err"))}>
                <Download className="size-4" /> Export CSV
              </Button>
            )}
          </div>
          <p className="px-4 pt-3 text-xs text-muted">{report.data?.working_days ?? "…"} working days (Mon–Sat). Effective days = present + WFH + ½ × half days.</p>
          <Table head={["Code", "Employee", "Department", "Present", "WFH", "Half", "Leave", "Absent", "Effective", "%"]} loading={report.loading} empty={report.data?.rows.length === 0}>
            {report.data?.rows.map((r) => (
              <tr key={r.employee_id}>
                <Td className="font-mono text-xs">{r.employee_code}</Td>
                <Td>{r.full_name}</Td>
                <Td className="text-muted">{r.department ?? "—"}</Td>
                {[r.present, r.wfh, r.half_day, r.leave, r.absent, r.effective_days].map((v, i) => <Td key={i} className="tabular-nums">{v}</Td>)}
                <Td className={`tabular-nums font-medium ${r.attendance_pct < 75 ? "text-danger" : ""}`}>{r.attendance_pct}%</Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Modal open={!!manual} onClose={() => setManual(null)} title="Manual attendance entry">
        {manual && (
          <form onSubmit={saveManual} className="space-y-4">
            <Field label="Employee *">
              <Select required value={manual.employee_id} onChange={(e) => setManual({ ...manual, employee_id: e.target.value })}>
                <option value="">Select…</option>
                {emps.data?.map((x) => <option key={x.id} value={x.id}>{x.full_name} ({x.employee_code})</option>)}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Date *"><Input type="date" required value={manual.work_date} onChange={(e) => setManual({ ...manual, work_date: e.target.value })} /></Field>
              <Field label="Status *">
                <Select value={manual.status} onChange={(e) => setManual({ ...manual, status: e.target.value })}>
                  {["present", "absent", "half_day", "leave", "holiday", "wfh"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                </Select>
              </Field>
              <Field label="Check in"><Input type="time" value={manual.check_in} onChange={(e) => setManual({ ...manual, check_in: e.target.value })} /></Field>
              <Field label="Check out"><Input type="time" value={manual.check_out} onChange={(e) => setManual({ ...manual, check_out: e.target.value })} /></Field>
            </div>
            <Field label="Reason / notes"><Input value={manual.notes} onChange={(e) => setManual({ ...manual, notes: e.target.value })} placeholder="e.g. Forgot to check in; on site at Hitech City" /></Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setManual(null)}>Cancel</Button>
              <Button type="submit" loading={busy}>Save</Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
