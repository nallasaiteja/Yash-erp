"use client";
import { useState } from "react";
import { AlertTriangle, Plus, Search } from "lucide-react";
import { del, patch, post, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useData } from "@/lib/useData";
import type { Page, Task, UserBrief } from "@/lib/types";
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Pager, Select, Table, Td, Textarea, fmtDate, useToast } from "@/components/ui";

const STATUSES = ["todo", "in_progress", "blocked", "done"];
const EMPTY = { title: "", description: "", assignee_id: "", priority: "medium", status: "todo", due_date: "" };

export default function TasksPage() {
  const { can, user } = useAuth();
  const toast = useToast();
  const [scope, setScope] = useState<"mine" | "created" | "all">("mine");
  const [status, setStatus] = useState("open");
  const [priority, setPriority] = useState("");
  const [overdue, setOverdue] = useState(false);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const list = useData<Page<Task>>(`/api/tasks${qs({ scope, status, priority, overdue: overdue || undefined, q, page, size: 50 })}`);
  const users = useData<UserBrief[]>("/api/users/lookup");
  const [editing, setEditing] = useState<Task | "new" | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  const open = (t: Task | "new") => {
    setEditing(t);
    setForm(t === "new" ? { ...EMPTY, assignee_id: String(user?.id ?? "") } : { title: t.title, description: t.description ?? "", assignee_id: t.assignee ? String(t.assignee.id) : "", priority: t.priority, status: t.status, due_date: t.due_date ?? "" });
  };

  const isCreatorOrMgr = (t: Task) => t.created_by.id === user?.id || can("tasks:edit");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const body = { ...form, description: form.description || null, assignee_id: form.assignee_id ? Number(form.assignee_id) : null, due_date: form.due_date || null };
    try {
      if (editing === "new") await post("/api/tasks", body);
      else if (editing) await patch(`/api/tasks/${editing.id}`, isCreatorOrMgr(editing) ? body : { status: form.status });
      toast("Task saved");
      setEditing(null);
      list.reload();
    } catch (err) {
      toast((err as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function quickStatus(t: Task, s: string) {
    try {
      await patch(`/api/tasks/${t.id}`, { status: s });
      list.reload();
    } catch (err) {
      toast((err as Error).message, "err");
    }
  }

  async function remove() {
    if (!editing || editing === "new" || !confirm("Delete this task?")) return;
    try {
      await del(`/api/tasks/${editing.id}`);
      toast("Task deleted");
      setEditing(null);
      list.reload();
    } catch (err) {
      toast((err as Error).message, "err");
    }
  }

  const limited = editing !== null && editing !== "new" && !isCreatorOrMgr(editing);

  return (
    <>
      <PageHeader title="Tasks" subtitle="Assign, track and close out office work" actions={can("tasks:create") && <Button onClick={() => open("new")}><Plus className="size-4" /> New task</Button>} />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <div className="flex rounded-md border border-line p-0.5 text-sm" role="tablist">
            {([["mine", "Assigned to me"], ["created", "Created by me"], ...(can("tasks:view") ? [["all", "All tasks"]] : [])] as [typeof scope, string][]).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={scope === k} onClick={() => { setScope(k); setPage(1); }} className={`rounded px-3 py-1.5 ${scope === k ? "bg-brand text-brand-fg" : "text-muted hover:text-ink"}`}>{label}</button>
            ))}
          </div>
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input className="pl-9" placeholder="Search tasks" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </div>
          <Select className="w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Status">
            <option value="open">Open</option>
            <option value="">Any status</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
          </Select>
          <Select className="w-auto" value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1); }} aria-label="Priority">
            <option value="">Any priority</option>
            {["urgent", "high", "medium", "low"].map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={overdue} onChange={(e) => { setOverdue(e.target.checked); setPage(1); }} /> Overdue only</label>
        </div>
        <Table head={["Task", "Assignee", "Priority", "Due", "Status", "Created by"]} loading={list.loading && !list.data} empty={list.data?.items.length === 0}>
          {list.data?.items.map((t) => (
            <tr key={t.id} className="hover:bg-surface-2">
              <Td>
                <button className="text-left font-medium hover:underline" onClick={() => open(t)}>{t.title}</button>
                {t.description && <div className="max-w-md truncate text-xs text-muted">{t.description}</div>}
              </Td>
              <Td>{t.assignee?.full_name ?? <span className="text-muted">Unassigned</span>}</Td>
              <Td><Badge>{t.priority}</Badge></Td>
              <Td className={t.overdue ? "font-medium text-danger" : ""}>
                <span className="inline-flex items-center gap-1">{t.overdue && <AlertTriangle className="size-3.5" aria-label="Overdue" />}{fmtDate(t.due_date)}</span>
              </Td>
              <Td>
                <Select className="h-8 w-36 text-xs" value={t.status} onChange={(e) => quickStatus(t, e.target.value)} aria-label="Change status">
                  {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                </Select>
              </Td>
              <Td className="text-muted">{t.created_by.full_name}</Td>
            </tr>
          ))}
        </Table>
        {list.data && <Pager page={page} size={50} total={list.data.total} onPage={setPage} />}
      </Card>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "New task" : "Task"}>
        <form onSubmit={save} className="space-y-4">
          <fieldset disabled={limited} className="space-y-4">
            <Field label="Title *"><Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <Field label="Description"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Assignee">
                <Select value={form.assignee_id} onChange={(e) => setForm({ ...form, assignee_id: e.target.value })}>
                  <option value="">Unassigned</option>
                  {users.data?.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </Select>
              </Field>
              <Field label="Due date"><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></Field>
              <Field label="Priority">
                <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  {["low", "medium", "high", "urgent"].map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </Field>
            </div>
          </fieldset>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </Select>
          </Field>
          {limited && <p className="text-xs text-muted">You&apos;re the assignee, so you can update the status. Ask the creator to change other details.</p>}
          <div className="flex justify-between">
            <div>{editing !== "new" && editing && (can("tasks:delete") || editing.created_by.id === user?.id) && <Button type="button" variant="danger" onClick={remove}>Delete</Button>}</div>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="submit" loading={busy}>Save</Button>
            </div>
          </div>
        </form>
      </Modal>
    </>
  );
}
