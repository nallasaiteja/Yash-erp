"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Users, Building2, CalendarCheck, Plane, ListTodo, FolderOpen, Shield, UserCog,
  ScrollText, Menu, LogOut, KeyRound, Zap, Bell, AlertTriangle, X, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { get } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cx } from "./ui";

type NavItem = { href: string; label: string; icon: React.ElementType; perm?: string };
const NAV: { section: string; items: NavItem[] }[] = [
  { section: "", items: [{ href: "/", label: "Dashboard", icon: LayoutDashboard, perm: "dashboard:view" }] },
  {
    section: "Office Management",
    items: [
      { href: "/tasks", label: "Tasks", icon: ListTodo },
      { href: "/documents", label: "Documents", icon: FolderOpen, perm: "documents:view" },
      { href: "/notifications", label: "Notifications", icon: Bell, perm: "notifications:view" },
    ],
  },
  {
    section: "Employees & HR",
    items: [
      { href: "/employees", label: "Employees", icon: Users, perm: "employees:view" },
      { href: "/departments", label: "Departments", icon: Building2, perm: "departments:view" },
      { href: "/attendance", label: "Attendance", icon: CalendarCheck },
      { href: "/leave", label: "Leave", icon: Plane },
    ],
  },
  {
    section: "Settings",
    items: [
      { href: "/settings/users", label: "Users", icon: UserCog, perm: "users:view" },
      { href: "/settings/roles", label: "Roles & Permissions", icon: Shield, perm: "roles:view" },
      { href: "/settings/audit", label: "Audit Log", icon: ScrollText, perm: "audit:view" },
      { href: "/profile", label: "My Profile", icon: KeyRound },
    ],
  },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout, can } = useAuth();
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [unread, setUnread] = useState(0);
  const [dismissPwdWarn, setDismissPwdWarn] = useState(false);

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!user || (!can("notifications:view") && !can("notifications:create"))) return;
    let alive = true;
    const load = () => get<{ count: number }>("/api/notifications/unread-count").then((r) => alive && setUnread(r.count)).catch(() => {});
    load();
    const id = setInterval(load, 30000);
    return () => { alive = false; clearInterval(id); };
  }, [user, path, can]);

  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const currentItem = NAV.flatMap((g) => g.items).find((i) => isActive(i.href));

  const renderSidebar = (isCompact: boolean) => (
    <nav className="flex h-full flex-col bg-side text-white">
      <div className={cx("flex h-15 items-center border-b border-white/10", isCompact ? "justify-center px-2" : "gap-2.5 px-4")}>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand text-white shadow-xs">
          <Zap className="size-4.5" />
        </span>
        {!isCompact && (
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-bold tracking-wide text-white">MERUGU GLOBAL</div>
            <div className="truncate text-[11px] text-side-ink">Digitalize · Optimize · Grow</div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2.5 py-4">
        {NAV.map((g, idx) => {
          const items = g.items.filter((i) => !i.perm || can(i.perm));
          if (!items.length) return null;
          return (
            <div key={g.section || `section-${idx}`} className="mb-4">
              {g.section && !isCompact && (
                <div className="px-3 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-200/65">
                  {g.section}
                </div>
              )}
              {g.section && isCompact && <div className="mx-2 my-2 border-t border-white/10" />}
              <div className="space-y-0.5">
                {items.map(({ href, label, icon: Icon }) => {
                  const active = isActive(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      title={isCompact ? label : undefined}
                      className={cx(
                        "group relative flex items-center rounded-lg text-sm transition-colors duration-150",
                        isCompact ? "justify-center p-2.5" : "gap-3 px-3 py-2",
                        active
                          ? "bg-side-active font-semibold text-white"
                          : "text-blue-100/85 hover:bg-side-hover hover:text-white",
                      )}
                    >
                      {active && (
                        <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r bg-blue-400" />
                      )}
                      <Icon className={cx("size-4 shrink-0 transition-colors", active ? "text-blue-300" : "text-blue-200/75 group-hover:text-white")} />
                      {!isCompact && <span className="truncate">{label}</span>}
                      {!isCompact && href === "/notifications" && unread > 0 && (
                        <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[10px] font-semibold text-white">
                          {unread > 99 ? "99+" : unread}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className={cx("flex items-center border-t border-white/10 py-3", isCompact ? "justify-center px-2" : "justify-between px-4")}>
        {!isCompact && <span className="text-[11px] font-medium text-blue-200/60">Merugu ERP · v1</span>}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="hidden rounded-lg p-1.5 text-blue-200/80 transition hover:bg-side-hover hover:text-white lg:inline-flex"
          aria-label={isCompact ? "Expand sidebar" : "Collapse sidebar"}
          title={isCompact ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCompact ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-page">
      <aside className={cx("fixed inset-y-0 left-0 z-30 hidden transition-all duration-200 lg:block", collapsed ? "w-[72px]" : "w-64")}>
        {renderSidebar(collapsed)}
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-[#142D4E]/45 backdrop-blur-[2px]" />
          <aside className="absolute inset-y-0 left-0 w-64 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {renderSidebar(false)}
          </aside>
        </div>
      )}

      <div className={cx("flex min-w-0 flex-1 flex-col transition-all duration-200", collapsed ? "lg:pl-[72px]" : "lg:pl-64")}>
        <header className="sticky top-0 z-20 flex h-15 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur-md sm:px-6">
          <button
            className="rounded-lg p-2 text-muted transition hover:bg-surface-2 hover:text-ink lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>

          <div className="hidden items-center gap-2 text-sm sm:flex">
            <span className="font-medium text-muted">Workspace</span>
            <span className="text-line-strong">/</span>
            <span className="font-semibold text-ink">{currentItem?.label ?? "Merugu Global"}</span>
          </div>

          <div className="flex-1" />

          {(can("notifications:view") || can("notifications:create")) && (
            <Link
              href="/notifications"
              className="relative rounded-lg p-2 text-muted transition hover:bg-surface-2 hover:text-ink"
              aria-label="Notifications"
              title="Notifications"
            >
              <Bell className="size-[18px]" />
              {unread > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white ring-2 ring-surface">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
          )}

          <div className="h-5 w-px bg-line" />

          <Link
            href="/profile"
            className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-surface-2"
            title="My profile"
          >
            <span className="flex size-8 items-center justify-center rounded-full bg-brand text-xs font-semibold text-brand-fg shadow-xs">
              {user?.full_name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
            </span>
            <span className="hidden text-left leading-tight sm:block">
              <span className="block text-sm font-semibold text-ink">{user?.full_name}</span>
              <span className="block text-[11px] text-muted">{user?.role.name}</span>
            </span>
          </Link>

          <button
            onClick={async () => {
              await logout();
              router.replace("/login");
            }}
            className="rounded-lg p-2 text-muted transition hover:bg-red-50 hover:text-danger"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="size-[18px]" />
          </button>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 lg:p-8">
          {user?.must_change_password && !dismissPwdWarn && path !== "/profile" && (
            <div
              role="alert"
              className="mb-6 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-[var(--shadow-xs)] sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-warn">
                  <AlertTriangle className="size-5" />
                </span>
                <div className="space-y-0.5 text-sm">
                  <p className="font-semibold text-amber-950">
                    Please change your default password
                  </p>
                  <p className="text-xs text-amber-900/80">
                    You signed in with an initial password set by your administrator. Update it now to keep your account secure.
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
                <Link
                  href="/profile"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-warn px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-amber-700"
                >
                  <KeyRound className="size-3.5" /> Change password
                </Link>
                <button
                  type="button"
                  onClick={() => setDismissPwdWarn(true)}
                  className="rounded-lg p-1.5 text-amber-800/70 hover:bg-amber-200/50 hover:text-amber-950"
                  aria-label="Dismiss warning"
                  title="Remind me later"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
