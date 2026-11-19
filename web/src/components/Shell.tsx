"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Users, Building2, CalendarCheck, Plane, ListTodo, FolderOpen, Shield, UserCog,
  ScrollText, Menu, Moon, Sun, LogOut, KeyRound, Zap,
} from "lucide-react";
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
    ],
  },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout, can } = useAuth();
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  useEffect(() => setOpen(false), [path]);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {}
  };

  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  const sidebar = (
    <nav className="flex h-full flex-col bg-side text-side-ink">
      <div className="flex h-14 items-center gap-2 border-b border-white/10 px-4">
        <span className="flex size-8 items-center justify-center rounded-md bg-amber-400 text-slate-900"><Zap className="size-5" /></span>
        <div className="leading-tight">
          <div className="text-sm font-bold text-white">YASH POWER TECH</div>
          <div className="text-[11px] text-side-ink">Enterprise ERP</div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-3">
        {NAV.map((g) => {
          const items = g.items.filter((i) => !i.perm || can(i.perm));
          if (!items.length) return null;
          return (
            <div key={g.section} className="mb-3">
              {g.section && <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-side-ink/70">{g.section}</div>}
              {items.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={cx(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition",
                    isActive(href) ? "bg-side-active font-medium text-white" : "hover:bg-white/5 hover:text-white",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  {label}
                </Link>
              ))}
            </div>
          );
        })}
      </div>
      <div className="border-t border-white/10 px-4 py-3 text-[11px] text-side-ink/70">Phase 1 · Core ERP</div>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <aside className="absolute inset-y-0 left-0 w-64" onClick={(e) => e.stopPropagation()}>{sidebar}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur">
          <button className="rounded p-1.5 hover:bg-surface-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          <div className="flex-1" />
          <button onClick={toggleTheme} className="rounded p-2 text-muted hover:bg-surface-2" aria-label="Toggle dark mode" title="Toggle dark mode">
            {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </button>
          <Link href="/profile" className="flex items-center gap-2 rounded px-2 py-1 hover:bg-surface-2" title="My profile">
            <span className="flex size-8 items-center justify-center rounded-full bg-brand text-xs font-semibold text-brand-fg">
              {user?.full_name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
            </span>
            <span className="hidden text-left leading-tight sm:block">
              <span className="block text-sm font-medium">{user?.full_name}</span>
              <span className="block text-[11px] text-muted">{user?.role.name}</span>
            </span>
          </Link>
          <Link href="/profile" className="rounded p-2 text-muted hover:bg-surface-2 sm:hidden" aria-label="Change password"><KeyRound className="size-5" /></Link>
          <button
            onClick={async () => {
              await logout();
              router.replace("/login");
            }}
            className="rounded p-2 text-muted hover:bg-surface-2"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="size-5" />
          </button>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
