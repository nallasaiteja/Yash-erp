"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { del, post, put } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useData } from "@/lib/useData";
import type { Department, EmpBrief } from "@/lib/types";
import { Button, Card, Field, Input, Modal, PageHeader, Select, Table, Td, useToast } from "@/components/ui";

export default function DepartmentsPage() {
  const { can } = useAuth();
  const toast = useToast();
  const list = useData<Department[]>("/api/departments");
  const emps = useData<EmpBrief[]>("/api/employees/lookup");
  const [editing, setEditing] = useState<Department | "new" | null>(null);
  const [form, setForm] = useState({ name: "", code: "", description: "", head_employee_id: "" });
  const [busy, setBusy] = useState(false);
  const empName = (id: number | null) => emps.data?.find((e) => e.id === id)?.full_name ?? "—";

  const open = (d: Department | "new") => {
    setEditing(d);
    setForm(d === "new" ? { name: "", code: "", description: "", head_employee_id: "" } : { name: d.name, code: d.code, description: d.description ?? "", head_employee_id: d.head_employee_id ? String(d.head_employee_id) : "" });
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const body = { ...form, description: form.description || null, head_employee_id: form.head_employee_id ? Number(form.head_employee_id) : null };
    try {
      if (editing === "new") await post("/api/departments", body);
      else if (editing) await put(`/api/departments/${editing.id}`, body);
      toast("Department saved");
      setEditing(null);
      list.reload();
    } catch (err) {
      toast((err as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!editing || editing === "new" || !confirm(`Delete department ${editing.name}?`)) return;
    try {
      await del(`/api/departments/${editing.id}`);
      toast("Department deleted");
      setEditing(null);
      list.reload();
    } catch (err) {
      toast((err as Error).message, "err");
    }
  }

  const editable = editing === "new" ? can("departments:create") : can("departments:edit");

  return (
    <>
      <PageHeader title="Departments" subtitle="Organisation structure" actions={can("departments:create") && <Button onClick={() => open("new")}><Plus className="size-4" /> Add department</Button>} />
      <Card>
        <Table head={["Code", "Department", "Head", "Employees", "Description"]} loading={list.loading && !list.data} empty={list.data?.length === 0}>
          {list.data?.map((d) => (
            <tr key={d.id} className="cursor-pointer hover:bg-surface-2" onClick={() => open(d)}>
              <Td className="font-mono text-xs">{d.code}</Td>
              <Td className="font-medium">{d.name}</Td>
              <Td>{empName(d.head_employee_id)}</Td>
              <Td className="tabular-nums">{d.employee_count}</Td>
              <Td className="text-muted">{d.description || "—"}</Td>
            </tr>
          ))}
        </Table>
      </Card>
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "New department" : "Edit department"}>
        <form onSubmit={save}>
          <fieldset disabled={!editable} className="space-y-4">
            <Field label="Name *"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Code *" hint="Letters, numbers, - or _"><Input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
            <Field label="Head of department">
              <Select value={form.head_employee_id} onChange={(e) => setForm({ ...form, head_employee_id: e.target.value })}>
                <option value="">—</option>
                {emps.data?.map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}
              </Select>
            </Field>
            <Field label="Description"><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          </fieldset>
          <div className="mt-5 flex justify-between">
            <div>{editing !== "new" && can("departments:delete") && <Button type="button" variant="danger" onClick={remove}>Delete</Button>}</div>
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
