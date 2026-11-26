"use client";
import Link from "next/link";
import { AlertTriangle, ArrowUpRight, CalendarCheck, FileText, ListTodo, Plane, Users } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAuth } from "@/lib/auth";
import { useData } from "@/lib/useData";
import type { AuditEntry, Task } from "@/lib/types";
import CheckInCard from "@/components/CheckInCard";
import { Badge, Card, ErrorBanner, PageHeader, StatCard, fmtDate, fmtDateTime } from "@/components/ui";

type Dash = {
  my_open_tasks: number;
  my_overdue_tasks: number;
  my_upcoming_tasks: Task[];
  documents: number | null;
  employees_active?: number;
  employees_onboarding?: number;
  headcount_by_department?: { department: string; count: number }[];
  attendance_today?: Record<string, number>;
  attendance_trend?: { date: string; present: number }[];
  leave_pending?: number;
  on_leave_today?: number;
  tasks_overdue_all?: number;
  tasks_by_status?: Record<string, number>;
  recent_activity?: AuditEntry[];
};

const axis = { fontSize: 11, fill: "var(--muted)" };

export default function Dashboard() {
  const { user } = useAuth();
  const { data: d, error, reload } = useData<Dash>("/api/dashboard");
  const present = d?.attendance_today ? (d.attendance_today.present || 0) + (d.attendance_today.wfh || 0) + (d.attendance_today.half_day || 0) : null;
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const totalCompanyTasks = d?.tasks_by_status ? Object.values(d.tasks_by_status).reduce((a, b) => a + b, 0) : 0;

  return (
    <>
      <PageHeader
        title={`${greet}, ${user?.full_name.split(" ")[0]}`}
        subtitle={new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
      />
      {error && <ErrorBanner message={error} onRetry={reload} className="mb-5" />}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CheckInCard onChange={reload} />
        <StatCard
          label="My open tasks"
          value={d?.my_open_tasks ?? "—"}
          hint={d?.my_overdue_tasks ? `${d.my_overdue_tasks} overdue` : "All on track"}
          icon={<ListTodo className="size-4" />}
        />
        {d?.employees_active !== undefined ? (
          <StatCard
            label="Active employees"
            value={d.employees_active}
            hint={`${d.employees_onboarding} onboarding`}
            icon={<Users className="size-4" />}
          />
        ) : (
          <StatCard label="Documents" value={d?.documents ?? "—"} icon={<FileText className="size-4" />} />
        )}
        {present !== null ? (
          <StatCard
            label="Present today"
            value={present}
            hint={`${d?.on_leave_today ?? 0} on leave · ${d?.leave_pending ?? 0} pending requests`}
            icon={<CalendarCheck className="size-4" />}
          />
        ) : d?.leave_pending !== undefined ? (
          <StatCard label="Leave pending" value={d.leave_pending} icon={<Plane className="size-4" />} />
        ) : (
          <StatCard label="Documents" value={d?.documents ?? "—"} icon={<FileText className="size-4" />} />
        )}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-ink">My tasks due this week</h2>
              <p className="text-xs text-muted">Upcoming priorities over the next 7 days</p>
            </div>
            <Link href="/tasks" className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
              All tasks <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
          {d?.my_upcoming_tasks.length ? (
            <ul className="divide-y divide-line">
              {d.my_upcoming_tasks.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-5 py-3 text-sm transition hover:bg-surface-2/60">
                  {t.overdue && <AlertTriangle className="size-4 shrink-0 text-danger" aria-label="Overdue" />}
                  <span className="flex-1 truncate font-medium text-ink">{t.title}</span>
                  <Badge>{t.priority}</Badge>
                  <span className={`text-xs tabular-nums ${t.overdue ? "font-semibold text-danger" : "text-muted"}`}>
                    {fmtDate(t.due_date)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-5 py-10 text-center text-sm text-muted">No tasks due in the next 7 days.</div>
          )}
        </Card>

        {d?.tasks_by_status ? (
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-ink">Company tasks</h2>
            <p className="mt-0.5 text-xs text-muted">
              {totalCompanyTasks} total · {d.tasks_overdue_all} overdue across teams
            </p>
            <div className="mt-4 space-y-3.5">
              {(["todo", "in_progress", "blocked", "done"] as const).map((s) => {
                const count = d.tasks_by_status?.[s] ?? 0;
                const pct = totalCompanyTasks ? Math.round((count / totalCompanyTasks) * 100) : 0;
                const barColor =
                  s === "done" ? "bg-emerald-500"
                    : s === "blocked" ? "bg-red-500"
                      : s === "in_progress" ? "bg-accent"
                        : "bg-slate-400";
                return (
                  <div key={s} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <Badge>{s}</Badge>
                      <span className="font-semibold text-ink tabular-nums">{count}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        ) : (
          <StatCard label="Documents in repository" value={d?.documents ?? "—"} icon={<FileText className="size-4" />} />
        )}
      </div>

      {(d?.attendance_trend || d?.headcount_by_department) && (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          {d.attendance_trend && (
            <Card className="p-5">
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-ink">Attendance trend</h2>
                <p className="text-xs text-muted">Daily present employees over the last 14 days</p>
              </div>
              <div className="h-60">
                <ResponsiveContainer>
                  <AreaChart data={d.attendance_trend} margin={{ left: -20, right: 8, top: 8 }}>
                    <defs>
                      <linearGradient id="attGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={axis} tickFormatter={(s) => s.slice(8)} stroke="var(--line)" tickLine={false} />
                    <YAxis allowDecimals={false} tick={axis} stroke="var(--line)" tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 12, boxShadow: "var(--shadow-md)" }}
                      labelFormatter={(s) => fmtDate(String(s))}
                    />
                    <Area type="monotone" dataKey="present" name="Present" stroke="var(--accent)" strokeWidth={2} fill="url(#attGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}
          {d.headcount_by_department && (
            <Card className="p-5">
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-ink">Headcount by department</h2>
                <p className="text-xs text-muted">Active team distribution across departments</p>
              </div>
              <div className="h-60">
                <ResponsiveContainer>
                  <BarChart data={[...d.headcount_by_department].sort((a, b) => b.count - a.count)} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={axis} stroke="var(--line)" tickLine={false} />
                    <YAxis type="category" dataKey="department" width={140} tick={axis} stroke="var(--line)" tickLine={false} axisLine={false} />
                    <Tooltip
                      cursor={{ fill: "var(--surface-2)" }}
                      contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 12, boxShadow: "var(--shadow-md)" }}
                    />
                    <Bar dataKey="count" name="Employees" fill="var(--brand)" radius={[0, 6, 6, 0]} barSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}
        </div>
      )}

      {d?.recent_activity && (
        <Card className="mt-5 overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-ink">Recent activity</h2>
              <p className="text-xs text-muted">Latest audited actions across the organization</p>
            </div>
            <Link href="/settings/audit" className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
              Audit log <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
          <ul className="divide-y divide-line text-sm">
            {d.recent_activity.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-3 transition hover:bg-surface-2/60">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-semibold text-ink">
                  {(a.user?.full_name ?? "SY").split(" ").map((p) => p[0]).slice(0, 2).join("")}
                </span>
                <span className="font-medium text-ink">{a.user?.full_name ?? "System"}</span>
                <Badge tone="blue">{a.action}</Badge>
                <span className="min-w-0 flex-1 truncate text-muted">{a.summary || `${a.entity} #${a.entity_id}`}</span>
                <span className="text-xs text-muted tabular-nums">{fmtDateTime(a.created_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
