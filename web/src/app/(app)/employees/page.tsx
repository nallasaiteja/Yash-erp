"use client";
import { useState } from "react";
import { Download, Plus, Search } from "lucide-react";
import { download, post, put, del, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useData } from "@/lib/useData";
import type { Department, EmpBrief, Employee, Page, UserBrief } from "@/lib/types";
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Pager, Select, Table, Td, Textarea, fmtDate, useToast } from "@/components/ui";

const EMPTY = {
  employee_code: "", full_name: "", email: "", phone: "", designation: "", department_id: "", manager_id: "",
  user_id: "", employment_type: "full_time", status: "active", date_of_joining: "", date_of_exit: "",
  address: "", emergency_contact: "",
};
type Form = typeof EMPTY;

export default function EmployeesPage() {
  const { can } = useAuth();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const list = useData<Page<Employee>>(`/api/employees${qs({ q, department_id: dept, status, page, size: 25 })}`);
  const depts = useData<Department[]>("/api/departments");
  const emps = useData<EmpBrief[]>("/api/employees/lookup");
  const users = useData<UserBrief[]>("/api/users/lookup");
  const [editing, setEditing] = useState<Employee | null | "new">(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);

  const open = (e: Employee | "new") => {
    setEditing(e);
    setForm(
      e === "new"
        ? EMPTY
        : (Object.fromEntries(Object.keys(EMPTY).map((k) => [k, (e as unknown as Record<string, unknown>)[k] ?? ""])) as Form),
    );
  };
  const set = (k: keyof Form) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: ev.target.value }));

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true);
    const body = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, v === "" ? null : ["department_id", "manager_id", "user_id"].includes(k) ? Number(v) : v]),
    );
    try {
      if (editing === "new") await post("/api/employees", body);
      else if (editing) await put(`/api/employees/${editing.id}`, body);
      toast("Employee saved");
      setEditing(null);
      list.reload();
      emps.reload();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!editing || editing === "new") return;
    if (!confirm(`Permanently delete ${editing.full_name}? Prefer setting status to "exited" to keep history.`)) return;
    try {
      await del(`/api/employees/${editing.id}`);
      toast("Employee deleted");
      setEditing(null);
      list.reload();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }

  const editable = editing === "new" ? can("employees:create") : can("employees:edit");

  return (
    <>
      <PageHeader
        title="Employees"
        subtitle="Profiles, departments, onboarding and exits"
        actions={
          <>
            {can("employees:export") && (
              <Button variant="secondary" onClick={() => download(`/api/employees/export${qs({ q, department_id: dept, status })}`, "employees.csv").catch((e) => toast(e.message, "err"))}>
                <Download className="size-4" /> Export CSV
              </Button>
            )}
            {can("employees:create") && <Button onClick={() => open("new")}><Plus className="size-4" /> Add employee</Button>}
          </>
        }
      />
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-line p-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input className="pl-9" placeholder="Search name, code, email, designation" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </div>
          <Select className="w-auto" value={dept} onChange={(e) => { setDept(e.target.value); setPage(1); }} aria-label="Department">
            <option value="">All departments</option>
            {depts.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          <Select className="w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Status">
            <option value="">Any status</option>
            {["onboarding", "active", "on_notice", "exited"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
          </Select>
        </div>
        <Table head={["Code", "Name", "Designation", "Department", "Phone", "Joined", "Status"]} loading={list.loading && !list.data} empty={list.data?.items.length === 0}>
          {list.data?.items.map((e) => (
            <tr key={e.id} className="cursor-pointer hover:bg-surface-2" onClick={() => open(e)}>
              <Td className="font-mono text-xs">{e.employee_code}</Td>
              <Td><div className="font-medium">{e.full_name}</div><div className="text-xs text-muted">{e.email}</div></Td>
              <Td>{e.designation || "—"}</Td>
              <Td>{e.department?.name || "—"}</Td>
              <Td>{e.phone || "—"}</Td>
              <Td>{fmtDate(e.date_of_joining)}</Td>
              <Td><Badge>{e.status}</Badge></Td>
            </tr>
          ))}
        </Table>
        {list.data && <Pager page={page} size={25} total={list.data.total} onPage={setPage} />}
      </Card>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "New employee" : `Employee · ${form.full_name}`} wide>
        <form onSubmit={save}>
          <fieldset disabled={!editable} className="grid gap-4 sm:grid-cols-2">
            <Field label="Employee code *"><Input required value={form.employee_code} onChange={set("employee_code")} placeholder="YPT-001" /></Field>
            <Field label="Full name *"><Input required value={form.full_name} onChange={set("full_name")} /></Field>
            <Field label="Email"><Input type="email" value={form.email} onChange={set("email")} /></Field>
            <Field label="Phone"><Input value={form.phone} onChange={set("phone")} placeholder="+91 98xxxxxxxx" /></Field>
            <Field label="Designation"><Input value={form.designation} onChange={set("designation")} placeholder="Site Engineer" /></Field>
            <Field label="Department">
              <Select value={form.department_id} onChange={set("department_id")}>
                <option value="">—</option>
                {depts.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            </Field>
            <Field label="Reporting manager">
              <Select value={form.manager_id} onChange={set("manager_id")}>
                <option value="">—</option>
                {emps.data?.filter((x) => editing === "new" || x.id !== (editing as Employee)?.id).map((x) => <option key={x.id} value={x.id}>{x.full_name} ({x.employee_code})</option>)}
              </Select>
            </Field>
            <Field label="Linked login" hint="Lets this person check in and apply for leave">
              <Select value={form.user_id} onChange={set("user_id")}>
                <option value="">— not linked —</option>
                {users.data?.map((u) => <option key={u.id} value={u.id}>{u.full_name} · {u.email}</option>)}
              </Select>
            </Field>
            <Field label="Employment type">
              <Select value={form.employment_type} onChange={set("employment_type")}>
                {["full_time", "part_time", "contract", "intern"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
              </Select>
            </Field>
            <Field label="Status">
              <Select value={form.status} onChange={set("status")}>
                {["onboarding", "active", "on_notice", "exited"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
              </Select>
            </Field>
            <Field label="Date of joining"><Input type="date" value={form.date_of_joining} onChange={set("date_of_joining")} /></Field>
            <Field label={`Date of exit${form.status === "exited" ? " *" : ""}`}><Input type="date" value={form.date_of_exit} onChange={set("date_of_exit")} required={form.status === "exited"} /></Field>
            <Field label="Emergency contact"><Input value={form.emergency_contact} onChange={set("emergency_contact")} /></Field>
            <div className="sm:col-span-2"><Field label="Address"><Textarea value={form.address} onChange={set("address")} /></Field></div>
          </fieldset>
          <div className="mt-5 flex justify-between gap-2">
            <div>{editing !== "new" && can("employees:delete") && <Button type="button" variant="danger" onClick={remove}>Delete</Button>}</div>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Close</Button>
              {editable && <Button type="submit" loading={busy}>Save</Button>}
            </div>
          </div>
        </form>
      </Modal>
    </>
  );
}
