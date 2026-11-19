"use client";
import { useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { post, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useData } from "@/lib/useData";
import type { EmpBrief, Leave, Page } from "@/lib/types";
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Pager, Select, Table, Td, Textarea, fmtDate, todayISO, useToast } from "@/components/ui";

export default function LeavePage() {
  const { can, user } = useAuth();
  const toast = useToast();
  const approver = can("leave:approve");
  const [scope, setScope] = useState<"mine" | "all">(can("leave:view") ? "all" : "mine");
  const [status, setStatus] = useState(approver ? "pending" : "");
  const [page, setPage] = useState(1);
  const list = useData<Page<Leave>>(`/api/leave${qs({ mine: scope === "mine", status, page, size: 50 })}`);
  const emps = useData<EmpBrief[]>(approver ? "/api/employees/lookup" : null);
  const [form, setForm] = useState<null | { leave_type: string; start_date: string; end_date: string; reason: string; employee_id: string }>(null);
  const [decide, setDecide] = useState<null | { leave: Leave; decision: "approved" | "rejected"; note: string }>(null);
  const [busy, setBusy] = useState(false);

  async function apply(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    try {
      await post("/api/leave", { ...form, reason: form.reason || null, employee_id: form.employee_id ? Number(form.employee_id) : null });
      toast("Leave request submitted");
      setForm(null);
      list.reload();
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
      list.reload();
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
      list.reload();
    } catch (err) {
      toast((err as Error).message, "err");
    }
  }

  const canApply = !!user?.employee_id || approver;

  return (
    <>
      <PageHeader
        title="Leave"
        subtitle={approver ? "Requests and approvals" : "Your leave requests"}
        actions={canApply && <Button onClick={() => setForm({ leave_type: "casual", start_date: todayISO(), end_date: todayISO(), reason: "", employee_id: "" })}><Plus className="size-4" /> Apply for leave</Button>}
      />
      {!user?.employee_id && !approver && (
        <Card className="mb-4 p-4 text-sm text-muted">Your login isn&apos;t linked to an employee profile, so you can&apos;t apply for leave yet. Ask HR to link it.</Card>
      )}
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-line p-3">
          {can("leave:view") && (
            <Select className="w-auto" value={scope} onChange={(e) => { setScope(e.target.value as "mine" | "all"); setPage(1); }} aria-label="Scope">
              <option value="all">All employees</option>
              <option value="mine">My requests</option>
            </Select>
          )}
          <Select className="w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Status">
            <option value="">Any status</option>
            {["pending", "approved", "rejected", "cancelled"].map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </div>
        <Table head={["Employee", "Type", "From", "To", "Days", "Reason", "Status", ""]} loading={list.loading && !list.data} empty={list.data?.items.length === 0}>
          {list.data?.items.map((l) => (
            <tr key={l.id}>
              <Td className="font-medium">{l.employee.full_name}</Td>
              <Td className="capitalize">{l.leave_type.replace("_", " ")}</Td>
              <Td>{fmtDate(l.start_date)}</Td>
              <Td>{fmtDate(l.end_date)}</Td>
              <Td className="tabular-nums">{l.days}</Td>
              <Td className="max-w-[240px] truncate text-muted" >{l.reason || "—"}{l.decision_note && <div className="text-xs">Note: {l.decision_note}</div>}</Td>
              <Td><Badge>{l.status}</Badge></Td>
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
            <div className="grid grid-cols-2 gap-4">
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
