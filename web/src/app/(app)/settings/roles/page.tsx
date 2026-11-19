"use client";
import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { del, post, put } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useData } from "@/lib/useData";
import type { Permission, Role } from "@/lib/types";
import { Badge, Button, Card, Field, Input, Modal, PageHeader, cx, useToast } from "@/components/ui";

const ACTIONS = ["view", "create", "edit", "delete", "approve", "download", "export"];

export default function RolesPage() {
  const { can } = useAuth();
  const toast = useToast();
  const editable = can("roles:edit");
  const roles = useData<Role[]>("/api/roles");
  const perms = useData<Permission[]>("/api/permissions");
  const [sel, setSel] = useState<number | null>(null);
  const [grants, setGrants] = useState<Set<string>>(new Set());
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const role = roles.data?.find((r) => r.id === sel) ?? null;
  useEffect(() => {
    if (!sel && roles.data?.length) setSel(roles.data[0].id);
  }, [roles.data, sel]);
  useEffect(() => {
    if (role) {
      setGrants(new Set(role.permissions));
      setDesc(role.description ?? "");
    }
  }, [role]);

  const modules = useMemo(() => {
    const m = new Map<string, Set<string>>();
    perms.data?.forEach((p) => m.set(p.module, (m.get(p.module) ?? new Set()).add(p.action)));
    return [...m.entries()];
  }, [perms.data]);

  const dirty = role && (desc !== (role.description ?? "") || grants.size !== role.permissions.length || role.permissions.some((p) => !grants.has(p)));

  const toggle = (code: string) =>
    setGrants((g) => {
      const n = new Set(g);
      if (n.has(code)) n.delete(code);
      else n.add(code);
      return n;
    });
  const toggleRow = (mod: string, actions: Set<string>) => {
    const codes = [...actions].map((a) => `${mod}:${a}`);
    const all = codes.every((c) => grants.has(c));
    setGrants((g) => {
      const n = new Set(g);
      codes.forEach((c) => (all ? n.delete(c) : n.add(c)));
      return n;
    });
  };

  async function save() {
    if (!role) return;
    setBusy(true);
    try {
      await put(`/api/roles/${role.id}`, { name: role.name, description: desc || null, permissions: [...grants] });
      toast(`Saved ${role.name}`);
      roles.reload();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await post<Role>("/api/roles", { name: newName, permissions: ["dashboard:view"] });
      setCreating(false);
      setNewName("");
      roles.reload();
      setSel(r.id);
    } catch (err) {
      toast((err as Error).message, "err");
    }
  }

  async function remove() {
    if (!role || !confirm(`Delete role ${role.name}?`)) return;
    try {
      await del(`/api/roles/${role.id}`);
      setSel(null);
      roles.reload();
    } catch (err) {
      toast((err as Error).message, "err");
    }
  }

  return (
    <>
      <PageHeader title="Roles & Permissions" subtitle="Control what each role can view, create, edit, delete, approve, download and export" actions={editable && <Button onClick={() => setCreating(true)}><Plus className="size-4" /> New role</Button>} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <Card className="h-fit p-2">
          {roles.data?.map((r) => (
            <button key={r.id} onClick={() => setSel(r.id)} className={cx("flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm", sel === r.id ? "bg-brand-soft font-medium" : "hover:bg-surface-2")}>
              <span>{r.name}</span>
              <span className="text-xs text-muted">{r.user_count}</span>
            </button>
          ))}
        </Card>
        {role && (
          <Card className="min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-4">
              <div className="min-w-[240px] flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold">{role.name}</h2>
                  {role.is_system && <Badge>built-in</Badge>}
                  <span className="text-xs text-muted">{role.user_count} user{role.user_count === 1 ? "" : "s"}</span>
                </div>
                <div className="mt-2"><Field label="Description"><Input disabled={!editable} value={desc} onChange={(e) => setDesc(e.target.value)} /></Field></div>
              </div>
              {editable && (
                <div className="flex gap-2">
                  {!role.is_system && <Button variant="danger" onClick={remove}>Delete</Button>}
                  <Button disabled={!dirty} loading={busy} onClick={save}>Save changes</Button>
                </div>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-surface-2 text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-2 text-left">Module</th>
                    {ACTIONS.map((a) => <th key={a} className="px-2 py-2 text-center">{a}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {modules.map(([mod, actions]) => (
                    <tr key={mod}>
                      <td className="px-4 py-2 font-medium capitalize">
                        {editable ? <button onClick={() => toggleRow(mod, actions)} className="capitalize hover:underline" title="Toggle all">{mod}</button> : mod}
                      </td>
                      {ACTIONS.map((a) => {
                        const code = `${mod}:${a}`;
                        return (
                          <td key={a} className="px-2 py-2 text-center">
                            {actions.has(a) ? <input type="checkbox" aria-label={code} disabled={!editable} checked={grants.has(code)} onChange={() => toggle(code)} className="size-4 accent-[var(--brand)]" /> : <span className="text-line">·</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-line px-4 py-3 text-xs text-muted">Everyone can always see their own attendance, leave and tasks. Changes take effect on each user&apos;s next sign-in or token refresh (within 15 minutes).</p>
          </Card>
        )}
      </div>
      <Modal open={creating} onClose={() => setCreating(false)} title="New role">
        <form onSubmit={create} className="space-y-4">
          <Field label="Role name"><Input required minLength={2} value={newName} onChange={(e) => setNewName(e.target.value)} /></Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
            <Button type="submit">Create</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
