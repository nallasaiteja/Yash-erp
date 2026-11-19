"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Badge, Button, Card, Field, Input, PageHeader, useToast } from "@/components/ui";

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [f, setF] = useState({ current: "", next: "", confirm: "" });
  const [busy, setBusy] = useState(false);

  async function change(e: React.FormEvent) {
    e.preventDefault();
    if (f.next !== f.confirm) return toast("New passwords don't match", "err");
    setBusy(true);
    try {
      await post("/api/auth/change-password", { current_password: f.current, new_password: f.next });
      toast("Password changed. Please sign in again.");
      await logout();
      router.replace("/login");
    } catch (err) {
      toast((err as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="My profile" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-semibold">Account</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Name</dt><dd>{user?.full_name}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Email</dt><dd>{user?.email}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Role</dt><dd>{user?.role.name}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Employee profile</dt><dd>{user?.employee_id ? "Linked" : "Not linked"}</dd></div>
          </dl>
          <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted">Permissions</h3>
          <div className="mt-2 flex flex-wrap gap-1">{user?.permissions.map((p) => <Badge key={p}>{p}</Badge>)}</div>
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold">Change password</h2>
          <form onSubmit={change} className="mt-3 space-y-4">
            <Field label="Current password"><Input type="password" autoComplete="current-password" required value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} /></Field>
            <Field label="New password" hint="At least 8 characters"><Input type="password" autoComplete="new-password" minLength={8} required value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} /></Field>
            <Field label="Confirm new password"><Input type="password" autoComplete="new-password" minLength={8} required value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} /></Field>
            <Button type="submit" loading={busy}>Change password</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
