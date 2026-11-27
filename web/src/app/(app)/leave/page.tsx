"use client";
import { useState } from "react";
import { Check, CheckCircle2, Clock, Plus, UserCheck, X, XCircle } from "lucide-react";
import { post, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useData } from "@/lib/useData";
import type { EmpBrief, Leave, Page } from "@/lib/types";
import {
  Badge, Button, Card, Field, Input, Modal, PageHeader, Pager, Select, StatCard, Table, Td, Textarea,
  fmtDate, todayISO, useToast,
} from "@/components/ui";

type LeaveSummary = {
  pending_count: number;
  approved_count: number;
  approved_by_me_count: number;
  approved_by_me_days: number;
  rejected_by_me_count: number;
};

type ViewTab = "pending" | "approved_by_me" | "approved" | "all" | "mine";

export default function LeavePage() {
  const { can, user } = useAuth();
  const toast = useToast();
  const approver = can("leave:approve");
  const canViewAll = can("leave:view");

  const [tab, setTab] = useState<ViewTab>(approver ? "pending" : canViewAll ? "all" : "mine");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);

  const queryParams =
    tab === "pending" ? { mine: false, status: "pending", page, size: 50 }
      : tab === "approved_by_me" ? { decided_by_me: true, status: "approved", page, size: 50 }
        : tab === "approved" ? { mine: false, status: "approved", page, size: 50 }
          : tab === "mine" ? { mine: true, status: statusFilter, page, size: 50 }
            : { mine: false, status: statusFilter, page, size: 50 };

  const list = useData<Page<Leave>>(`/api/leave${qs(queryParams)}`);
  const summary = useData<LeaveSummary>(canViewAll ? "/api/leave/summary" : null);
  const emps = useData<EmpBrief[]>(approver ? "/api/employees/lookup" : null);
  const [form, setForm] = useState<null | { leave_type: string; start_date: string; end_date: string; reason: string; employee_id: string }>(null);
  const [decide, setDecide] = useState<null | { leave: Leave; decision: "approved" | "rejected"; note: string }>(null);
  const [busy, setBusy] = useState(false);

  const refreshAll = () => {
    list.reload();
    summary.reload();
  };

  async function apply(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    try {
      await post("/api/leave", { ...form, reason: form.reason || null, employee_id: form.employee_id ? Number(form.employee_id) : null });
      toast("Leave request submitted");
      setForm(null);
      refreshAll();
    } catch (err) {
      toast((err as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function submitDecision(e: React.FormEvent) {
    e.preventDefault();
    if (!decide) return;
    setBusy(true);
    try {
      await post(`/api/leave/${decide.leave.id}/decision`, { decision: decide.decision, note: decide.note || null });
      toast(`Leave ${decide.decision}`);
      setDecide(null);
      refreshAll();
    } catch (err) {
      toast((err as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function cancel(l: Leave) {
    if (!confirm("Cancel this leave request?")) return;
    try {
      await post(`/api/leave/${l.id}/cancel`);
      toast("Request cancelled");
      refreshAll();
    } catch (err) {
      toast((err as Error).message, "err");
    }
  }

  const canApply = !!user?.employee_id || approver;

  const tabs: { key: ViewTab; label: string }[] = approver
    ? [
        { key: "pending", label: `Pending (${summary.data?.pending_count ?? 0})` },
        { key: "approved_by_me", label: `Approved by me (${summary.data?.approved_by_me_count ?? 0})` },
        { key: "approved", label: `All approved (${summary.data?.approved_count ?? 0})` },
        { key: "all", label: "All requests" },
        { key: "mine", label: "My requests" },
      ]
    : canViewAll
      ? [
          { key: "all", label: "All employees" },
          { key: "approved", label: "Approved" },
          { key: "mine", label: "My requests" },
        ]
      : [];

  return (
    <>
      <PageHeader
        title="Leave"
        subtitle={approver ? "Requests, approvals, and history of leaves you approved" : "Your leave requests"}
        actions={canApply && <Button onClick={() => setForm({ leave_type: "casual", start_date: todayISO(), end_date: todayISO(), reason: "", employee_id: "" })}><Plus className="size-4" /> Apply for leave</Button>}
      />

      {approver && (
        <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Pending requests"
            value={summary.data?.pending_count ?? "—"}
            hint="Waiting for review"
            icon={<Clock className="size-4" />}
          />
          <StatCard
            label="Approved by me"
            value={summary.data?.approved_by_me_count ?? "—"}
            hint={summary.data ? `${summary.data.approved_by_me_days} total leave day${summary.data.approved_by_me_days === 1 ? "" : "s"}` : undefined}
            icon={<UserCheck className="size-4" />}
          />
          <StatCard
            label="All approved leaves"
            value={summary.data?.approved_count ?? "—"}
            hint="Across all employees"
            icon={<CheckCircle2 className="size-4" />}
          />
          <StatCard
            label="Rejected by me"
            value={summary.data?.rejected_by_me_count ?? "—"}
            hint="Declined requests"
            icon={<XCircle className="size-4" />}
          />
        </div>
      )}

      {!user?.employee_id && !approver && (
        <Card className="mb-4 p-4 text-sm text-muted">Your login isn&apos;t linked to an employee profile, so you can&apos;t apply for leave yet. Ask HR to link it.</Card>
      )}

      {tabs.length > 0 && (
        <div className="tab-strip mb-3 border-b border-line" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => { setTab(t.key); setPage(1); }}
              className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition ${tab === t.key ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <Card className="overflow-hidden">
        {(tab === "all" || tab === "mine") && (
          <div className="flex flex-wrap gap-2.5 border-b border-line bg-surface-2/50 p-3.5">
            <Select className="w-full sm:w-auto" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} aria-label="Status">
              <option value="">Any status</option>
              {["pending", "approved", "rejected", "cancelled"].map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </div>
        )}
        <Table
          head={["Employee", "Type", "From", "To", "Days", "Reason", "Status", "Decided by", ""]}
          loading={list.loading && !list.data}
          error={list.error}
          onRetry={list.reload}
          empty={list.data?.items.length === 0}
        >
          {list.data?.items.map((l) => (
            <tr key={l.id} className="hover:bg-surface-2/60">
              <Td>
                <div className="font-medium text-ink">{l.employee.full_name}</div>
                <div className="font-mono text-xs text-muted">{l.employee.employee_code}</div>
              </Td>
              <Td className="capitalize">{l.leave_type.replace("_", " ")}</Td>
              <Td className="whitespace-nowrap">{fmtDate(l.start_date)}</Td>
              <Td className="whitespace-nowrap">{fmtDate(l.end_date)}</Td>
              <Td className="font-medium tabular-nums">{l.days}</Td>
              <Td className="max-w-[220px] truncate text-muted">
                {l.reason || "—"}
                {l.decision_note && <div className="text-xs text-body">Note: {l.decision_note}</div>}
              </Td>
              <Td><Badge>{l.status}</Badge></Td>
              <Td className="text-xs text-muted whitespace-nowrap">
                {l.decided_by ? (
                  <div>
                    <div className="font-medium text-ink">{l.decided_by.full_name}</div>
                    <div>{fmtDate(l.decided_at)}</div>
                  </div>
                ) : "—"}
              </Td>
              <Td>
                {l.status === "pending" && (
                  <div className="flex justify-end gap-1">
                    {approver && l.employee_id !== user?.employee_id && (
                      <>
                        <Button size="sm" variant="secondary" onClick={() => setDecide({ leave: l, decision: "approved", note: "" })} aria-label="Approve"><Check className="size-4 text-ok" /></Button>
                        <Button size="sm" variant="secondary" onClick={() => setDecide({ leave: l, decision: "rejected", note: "" })} aria-label="Reject"><X className="size-4 text-danger" /></Button>
                      </>
                    )}
                    {(l.employee_id === user?.employee_id || approver) && <Button size="sm" variant="ghost" onClick={() => cancel(l)}>Cancel</Button>}
                  </div>
                )}
              </Td>
            </tr>
          ))}
        </Table>
        {list.data && <Pager page={page} size={50} total={list.data.total} onPage={setPage} />}
      </Card>

      <Modal open={!!form} onClose={() => setForm(null)} title="Apply for leave">
        {form && (
          <form onSubmit={apply} className="space-y-4">
            {approver && (
              <Field label="On behalf of" hint="Leave blank to apply for yourself">
                <Select value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
                  <option value="">Myself</option>
                  {emps.data?.map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}
                </Select>
              </Field>
            )}
            <Field label="Leave type">
              <Select value={form.leave_type} onChange={(e) => setForm({ ...form, leave_type: e.target.value })}>
                {["casual", "sick", "earned", "unpaid", "comp_off"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
              </Select>
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="From *"><Input type="date" required value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value, end_date: e.target.value > form.end_date ? e.target.value : form.end_date })} /></Field>
              <Field label="To *"><Input type="date" required min={form.start_date} value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></Field>
            </div>
            <Field label="Reason"><Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setForm(null)}>Cancel</Button>
              <Button type="submit" loading={busy}>Submit</Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!decide} onClose={() => setDecide(null)} title={decide?.decision === "approved" ? "Approve leave" : "Reject leave"}>
        {decide && (
          <form onSubmit={submitDecision} className="space-y-4">
            <p className="text-sm">
              <b>{decide.leave.employee.full_name}</b> · {decide.leave.leave_type.replace("_", " ")} · {fmtDate(decide.leave.start_date)} – {fmtDate(decide.leave.end_date)} ({decide.leave.days} day{decide.leave.days > 1 ? "s" : ""})
            </p>
            {decide.decision === "approved" && <p className="text-xs text-muted">Approving marks these days as &ldquo;leave&rdquo; in attendance.</p>}
            <Field label="Note (optional)"><Input value={decide.note} onChange={(e) => setDecide({ ...decide, note: e.target.value })} /></Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setDecide(null)}>Cancel</Button>
              <Button type="submit" variant={decide.decision === "approved" ? "primary" : "danger"} loading={busy}>{decide.decision === "approved" ? "Approve" : "Reject"}</Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
