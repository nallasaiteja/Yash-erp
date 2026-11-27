"use client";
import Link from "next/link";
import { useState } from "react";
import { Bell, Check, CheckCheck, Pencil, Plus, Shield, Trash2, Users } from "lucide-react";
import { del, patch, post, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useData } from "@/lib/useData";
import type { NotificationItem, Page, UserBrief } from "@/lib/types";
import { Badge, Button, Card, ErrorBanner, Field, Input, Modal, PageHeader, Pager, Select, Textarea, fmtDate, useToast } from "@/components/ui";

type FormState = {
  title: string;
  message: string;
  priority: "normal" | "important" | "urgent";
  audience: "all" | "selected";
  recipient_ids: number[];
};

const EMPTY: FormState = {
  title: "",
  message: "",
  priority: "normal",
  audience: "all",
  recipient_ids: [],
};

function fmtDateTime(s: string) {
  const d = new Date(s);
  return `${fmtDate(s)} · ${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
}

export default function NotificationsPage() {
  const { can } = useAuth();
  const toast = useToast();
  const canCreate = can("notifications:create");
  const canEdit = can("notifications:edit");
  const canDelete = can("notifications:delete");
  const canManage = canCreate || canEdit || canDelete;

  const [tab, setTab] = useState<"inbox" | "manage">(canManage ? "manage" : "inbox");
  const [page, setPage] = useState(1);
  const list = useData<Page<NotificationItem>>(`/api/notifications${qs({ scope: tab, page, size: 25 })}`);
  const users = useData<UserBrief[]>(canCreate || canEdit ? "/api/users/lookup" : null);

  const [editing, setEditing] = useState<NotificationItem | null | "new">(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [userFilter, setUserFilter] = useState("");
  const [busy, setBusy] = useState(false);

  const openNew = () => {
    setEditing("new");
    setForm(EMPTY);
    setUserFilter("");
  };

  const openEdit = (n: NotificationItem) => {
    setEditing(n);
    setForm({
      title: n.title,
      message: n.message,
      priority: n.priority,
      audience: n.audience,
      recipient_ids: n.recipients.map((r) => r.id),
    });
    setUserFilter("");
  };

  const toggleRecipient = (uid: number) => {
    setForm((f) => ({
      ...f,
      recipient_ids: f.recipient_ids.includes(uid)
        ? f.recipient_ids.filter((id) => id !== uid)
        : [...f.recipient_ids, uid],
    }));
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (form.audience === "selected" && form.recipient_ids.length === 0) {
      return toast("Select at least one person to notify", "err");
    }
    setBusy(true);
    try {
      const payload = {
        title: form.title.trim(),
        message: form.message.trim(),
        priority: form.priority,
        audience: form.audience,
        recipient_ids: form.audience === "selected" ? form.recipient_ids : [],
      };
      if (editing === "new") {
        await post("/api/notifications", payload);
        toast("Notification sent");
      } else if (editing) {
        await patch(`/api/notifications/${editing.id}`, payload);
        toast("Notification updated");
      }
      setEditing(null);
      list.reload();
    } catch (err) {
      toast((err as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function remove(n: NotificationItem) {
    if (!confirm(`Delete notification "${n.title}"?`)) return;
    try {
      await del(`/api/notifications/${n.id}`);
      toast("Notification deleted");
      list.reload();
    } catch (err) {
      toast((err as Error).message, "err");
    }
  }

  async function markRead(n: NotificationItem) {
    try {
      await post(`/api/notifications/${n.id}/read`);
      list.reload();
    } catch (err) {
      toast((err as Error).message, "err");
    }
  }

  async function markAllRead() {
    try {
      await post("/api/notifications/read-all");
      toast("All notifications marked as read");
      list.reload();
    } catch (err) {
      toast((err as Error).message, "err");
    }
  }

  const filteredUsers = (users.data ?? []).filter((u) => {
    const q = userFilter.trim().toLowerCase();
    return !q || u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  const priorityTone = (p: string) =>
    p === "urgent" ? "bg-red-50 text-danger ring-red-600/20"
      : p === "important" ? "bg-amber-50 text-warn ring-amber-600/20"
        : "";

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle={canManage ? "Send announcements to everyone, a single person, or selected staff" : "Announcements and updates sent to you"}
        actions={
          <>
            {can("roles:edit") && (
              <Link href="/settings/roles">
                <Button variant="secondary" type="button">
                  <Shield className="size-4" /> Manage access
                </Button>
              </Link>
            )}
            {tab === "inbox" && (list.data?.items.some((n) => !n.is_read) ?? false) && (
              <Button variant="secondary" onClick={markAllRead}>
                <CheckCheck className="size-4" /> Mark all read
              </Button>
            )}
            {canCreate && (
              <Button onClick={openNew}>
                <Plus className="size-4" /> Send notification
              </Button>
            )}
          </>
        }
      />

      {canManage && (
        <div className="tab-strip mb-3 border-b border-line" role="tablist">
          {([
            ["manage", "All sent / Manage"],
            ["inbox", "My inbox"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => { setTab(key); setPage(1); }}
              className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${tab === key ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink"}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <Card className="overflow-hidden">
        {list.loading && !list.data ? (
          <div className="p-8 text-center text-sm text-muted">Loading notifications…</div>
        ) : list.error ? (
          <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div>
        ) : !list.data?.items.length ? (
          <div className="flex flex-col items-center justify-center gap-2 p-10 text-center text-muted">
            <Bell className="size-8 opacity-40" />
            <p className="text-sm">No notifications yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-line">
            {list.data.items.map((n) => (
              <div key={n.id} className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between ${!n.is_read && tab === "inbox" ? "bg-brand/5" : ""}`}>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    {!n.is_read && tab === "inbox" && <span className="size-2 rounded-full bg-brand" title="Unread" />}
                    <h3 className="font-semibold text-ink">{n.title}</h3>
                    <Badge className={priorityTone(n.priority)}>{n.priority}</Badge>
                    <span className="inline-flex items-center gap-1 rounded bg-surface-2 px-2 py-0.5 text-xs text-muted">
                      <Users className="size-3" />
                      {n.audience === "all" ? "Everyone" : `${n.recipient_count} ${n.recipient_count === 1 ? "person" : "people"}`}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-ink/90">{n.message}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <span>From {n.created_by.full_name}</span>
                    <span>· {fmtDateTime(n.created_at)}</span>
                    {tab === "manage" && n.audience === "selected" && n.recipients.length > 0 && (
                      <span>
                        · To: {n.recipients.slice(0, 5).map((r) => r.full_name).join(", ")}
                        {n.recipients.length > 5 ? ` +${n.recipients.length - 5} more` : ""}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {tab === "inbox" && !n.is_read && (
                    <Button size="sm" variant="secondary" onClick={() => markRead(n)}>
                      <Check className="size-3.5" /> Mark read
                    </Button>
                  )}
                  {canEdit && (
                    <Button size="sm" variant="ghost" onClick={() => openEdit(n)} aria-label="Edit notification" title="Edit">
                      <Pencil className="size-4" />
                    </Button>
                  )}
                  {canDelete && (
                    <Button size="sm" variant="ghost" onClick={() => remove(n)} aria-label="Delete notification" title="Delete">
                      <Trash2 className="size-4 text-danger" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {list.data && <Pager page={page} size={25} total={list.data.total} onPage={setPage} />}
      </Card>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Send notification" : "Edit notification"} wide>
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Field label="Title *">
                <Input required minLength={2} maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Office closed on Friday" />
              </Field>
            </div>
            <Field label="Priority">
              <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as FormState["priority"] })}>
                <option value="normal">Normal</option>
                <option value="important">Important</option>
                <option value="urgent">Urgent</option>
              </Select>
            </Field>
          </div>
          <Field label="Message *">
            <Textarea required rows={4} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Write your notification message…" />
          </Field>
          <Field label="Send to *">
            <div className="flex flex-wrap gap-4 pt-1 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="audience"
                  checked={form.audience === "all"}
                  onChange={() => setForm({ ...form, audience: "all" })}
                />
                Everyone (all active users)
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="audience"
                  checked={form.audience === "selected"}
                  onChange={() => setForm({ ...form, audience: "selected" })}
                />
                Single or selected people
              </label>
            </div>
          </Field>

          {form.audience === "selected" && (
            <div className="rounded-md border border-line bg-surface-2/40 p-3 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Recipients ({form.recipient_ids.length} selected)
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="text-xs font-medium text-brand hover:underline"
                    onClick={() => setForm((f) => ({ ...f, recipient_ids: (users.data ?? []).map((u) => u.id) }))}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    className="text-xs text-muted hover:underline"
                    onClick={() => setForm((f) => ({ ...f, recipient_ids: [] }))}
                  >
                    Clear
                  </button>
                </div>
              </div>
              <Input
                placeholder="Search by name or email…"
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
              />
              <div className="max-h-48 overflow-y-auto divide-y divide-line rounded border border-line bg-surface">
                {filteredUsers.map((u) => (
                  <label key={u.id} className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-surface-2">
                    <input
                      type="checkbox"
                      checked={form.recipient_ids.includes(u.id)}
                      onChange={() => toggleRecipient(u.id)}
                    />
                    <span className="font-medium">{u.full_name}</span>
                    <span className="text-xs text-muted">{u.email}</span>
                  </label>
                ))}
                {filteredUsers.length === 0 && (
                  <div className="p-3 text-center text-xs text-muted">No matching users</div>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="submit" loading={busy}>{editing === "new" ? "Send notification" : "Save changes"}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
