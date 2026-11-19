"use client";
import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { patch, post, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useData } from "@/lib/useData";
import type { Page, Role, User } from "@/lib/types";
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Pager, Select, Table, Td, fmtDateTime, useToast } from "@/components/ui";

export default function UsersPage() {
  const { can, user: me } = useAuth();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const list = useData<Page<User>>(`/api/users${qs({ q, page, size: 25 })}`);
  const roles = useData<Role[]>("/api/roles");
  const [editing, setEditing] = useState<User | "new" | null>(null);
  const [form, setForm] = useState({ email: "", full_name: "", password: "", role_id: "", is_active: true });
  const [busy, setBusy] = useState(false);

  const open = (u: User | "new") => {
    setEditing(u);
    setForm(u === "new" ? { email: "", full_name: "", password: "", role_id: String(roles.data?.find((r) => r.name === "Employee")?.id ?? ""), is_active: true }
      : { email: u.email, full_name: u.full_name, password: "", role_id: String(u.role.id), is_active: u.is_active });
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (editing === "new") await post("/api/users", { ...form, role_id: Number(form.role_id) });
      else if (editing) {
        const body: Record<string, unknown> = { full_name: form.full_name, role_id: Number(form.role_id), is_active: form.is_active };
        if (form.password) body.password = form.password;
        await patch(`/api/users/${editing.id}`, body);
      }
      toast("User saved");
      setEditing(null);
      list.reload();
    } catch (err) {
      toast((err as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  const self = editing !== "new" && editing?.id === me?.id;

  return (
    <>
      <PageHeader title="Users" subtitle="Login accounts and their roles" actions={can("users:create") && <Button onClick={() => open("new")}><Plus className="size-4" /> Add user</Button>} />
      <Card>
        <div className="border-b border-line p-3">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input className="pl-9" placeholder="Search name or email" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </div>
        </div>
        <Table head={["Name", "Email", "Role", "Status", "Last login"]} loading={list.loading && !list.data} empty={list.data?.items.length === 0}>
          {list.data?.items.map((u) => (
            <tr key={u.id} className="cursor-pointer hover:bg-surface-2" onClick={() => open(u)}>
              <Td className="font-medium">{u.full_name}</Td>
              <Td className="text-muted">{u.email}</Td>
              <Td>{u.role.name}</Td>
              <Td><Badge tone={u.is_active ? "green" : "gray"}>{u.is_active ? "active" : "disabled"}</Badge></Td>
              <Td className="text-muted">{fmtDateTime(u.last_login_at)}</Td>
            </tr>
          ))}
        </Table>
        {list.data && <Pager page={page} size={25} total={list.data.total} onPage={setPage} />}
      </Card>
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "New user" : "Edit user"}>
        <form onSubmit={save}>
          <fieldset disabled={editing === "new" ? !can("users:create") : !can("users:edit")} className="space-y-4">
            <Field label="Full name *"><Input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
            <Field label="Email *"><Input type="email" required disabled={editing !== "new"} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label={editing === "new" ? "Password *" : "Reset password"} hint={editing === "new" ? "At least 8 characters" : "Leave blank to keep current. Resetting signs the user out everywhere."}>
              <Input type="password" autoComplete="new-password" minLength={8} required={editing === "new"} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
            <Field label="Role *">
              <Select required disabled={self} value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })}>
                <option value="">Select…</option>
                {roles.data?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" disabled={self} checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Account active
            </label>
          </fieldset>
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="submit" loading={busy}>Save</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
