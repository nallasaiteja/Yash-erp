"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { patch, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Me } from "@/lib/types";
import { Badge, Button, Card, Field, Input, PageHeader, useToast } from "@/components/ui";

export default function ProfilePage() {
  const { user, logout, updateUser } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [profile, setProfile] = useState({ full_name: user?.full_name ?? "", email: user?.email ?? "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [f, setF] = useState({ current: "", next: "", confirm: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) setProfile({ full_name: user.full_name, email: user.email });
  }, [user]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const updated = await patch<Me>("/api/auth/me", { full_name: profile.full_name.trim(), email: profile.email.trim() });
      updateUser(updated);
      toast("Profile updated");
    } catch (err) {
      toast((err as Error).message, "err");
    } finally {
      setSavingProfile(false);
    }
  }

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
      <PageHeader title="My profile" subtitle="Manage your account details and password" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-semibold">Account profile</h2>
          <form onSubmit={saveProfile} className="mt-3 space-y-4">
            <Field label="Full name">
              <Input required minLength={2} value={profile.full_name} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} />
            </Field>
            <Field label="Email">
              <Input type="email" required value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
            </Field>
            <dl className="space-y-2 border-t border-line pt-3 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Role</dt><dd>{user?.role.name}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Employee profile</dt><dd>{user?.employee_id ? "Linked" : "Not linked"}</dd></div>
            </dl>
            <Button type="submit" loading={savingProfile}>Save profile</Button>
          </form>
          <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted">Permissions</h3>
          <div className="mt-2 flex flex-wrap gap-1">{user?.permissions.map((p) => <Badge key={p}>{p}</Badge>)}</div>
        </Card>
        <Card className={`p-5 ${user?.must_change_password ? "ring-2 ring-amber-400/80" : ""}`}>
          <h2 className="font-semibold">Change password</h2>
          {user?.must_change_password && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
              First-time login: please replace your default password with a personal password (at least 8 characters).
            </div>
          )}
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
