"use client";
import Link from "next/link";
import { AlertTriangle, CalendarCheck, FileText, ListTodo, Plane, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAuth } from "@/lib/auth";
import { useData } from "@/lib/useData";
import type { AuditEntry, Task } from "@/lib/types";
import CheckInCard from "@/components/CheckInCard";
import { Badge, Card, PageHeader, StatCard, fmtDate, fmtDateTime } from "@/components/ui";

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
  const { data: d, reload } = useData<Dash>("/api/dashboard");
  const present = d?.attendance_today ? (d.attendance_today.present || 0) + (d.attendance_today.wfh || 0) + (d.attendance_today.half_day || 0) : null;
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <>
      <PageHeader title={`${greet}, ${user?.full_name.split(" ")[0]}`} subtitle={new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CheckInCard onChange={reload} />
        <StatCard label="My open tasks" value={d?.my_open_tasks ?? "—"} hint={d?.my_overdue_tasks ? `${d.my_overdue_tasks} overdue` : "None overdue"} icon={<ListTodo className="size-4" />} />
        {d?.employees_active !== undefined ? (
          <StatCard label="Active employees" value={d.employees_active} hint={`${d.employees_onboarding} onboarding`} icon={<Users className="size-4" />} />
        ) : (
          <StatCard label="Documents" value={d?.documents ?? "—"} icon={<FileText className="size-4" />} />
        )}
        {present !== null ? (
          <StatCard label="Present today" value={present} hint={`${d?.on_leave_today ?? 0} on leave · ${d?.leave_pending ?? 0} leave requests pending`} icon={<CalendarCheck className="size-4" />} />
        ) : d?.leave_pending !== undefined ? (
          <StatCard label="Leave pending" value={d.leave_pending} icon={<Plane className="size-4" />} />
        ) : (
          <StatCard label="Documents" value={d?.documents ?? "—"} icon={<FileText className="size-4" />} />
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="font-semibold">My tasks due this week</h2>
            <Link href="/tasks" className="text-sm text-accent hover:underline">All tasks</Link>
          </div>
          {d?.my_upcoming_tasks.length ? (
            <ul className="divide-y divide-line">
              {d.my_upcoming_tasks.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  {t.overdue && <AlertTriangle className="size-4 shrink-0 text-danger" aria-label="Overdue" />}
                  <span className="flex-1 truncate">{t.title}</span>
                  <Badge>{t.priority}</Badge>
                  <span className={t.overdue ? "text-danger" : "text-muted"}>{fmtDate(t.due_date)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-muted">No tasks due in the next 7 days.</p>
          )}
        </Card>

        {d?.tasks_by_status ? (
          <Card className="p-4">
            <h2 className="font-semibold">Company tasks</h2>
            <p className="text-xs text-muted">{d.tasks_overdue_all} overdue across all teams</p>
            <div className="mt-3 space-y-2">
              {["todo", "in_progress", "blocked", "done"].map((s) => (
                <div key={s} className="flex items-center justify-between text-sm">
                  <Badge>{s}</Badge>
                  <span className="tabular-nums">{d.tasks_by_status?.[s] ?? 0}</span>
                </div>
              ))}
            </div>
          </Card>
        ) : (
          <StatCard label="Documents in repository" value={d?.documents ?? "—"} icon={<FileText className="size-4" />} />
        )}
      </div>

      {(d?.attendance_trend || d?.headcount_by_department) && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {d.attendance_trend && (
            <Card className="p-4">
              <h2 className="font-semibold">Attendance, last 14 days</h2>
              <div className="mt-3 h-56">
                <ResponsiveContainer>
                  <LineChart data={d.attendance_trend} margin={{ left: -20, right: 8, top: 8 }}>
                    <CartesianGrid stroke="var(--line)" vertical={false} />
                    <XAxis dataKey="date" tick={axis} tickFormatter={(s) => s.slice(8)} stroke="var(--line)" />
                    <YAxis allowDecimals={false} tick={axis} stroke="var(--line)" />
                    <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 6, fontSize: 12 }} labelFormatter={(s) => fmtDate(String(s))} />
                    <Line type="monotone" dataKey="present" name="Present" stroke="var(--accent)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}
          {d.headcount_by_department && (
            <Card className="p-4">
              <h2 className="font-semibold">Headcount by department</h2>
              <div className="mt-3 h-56">
                <ResponsiveContainer>
                  <BarChart data={[...d.headcount_by_department].sort((a, b) => b.count - a.count)} layout="vertical" margin={{ left: 10, right: 16 }}>
                    <CartesianGrid stroke="var(--line)" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={axis} stroke="var(--line)" />
                    <YAxis type="category" dataKey="department" width={140} tick={axis} stroke="var(--line)" />
                    <Tooltip cursor={{ fill: "var(--surface-2)" }} contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 6, fontSize: 12 }} />
                    <Bar dataKey="count" name="Employees" fill="var(--brand)" radius={[0, 3, 3, 0]} barSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}
        </div>
      )}

      {d?.recent_activity && (
        <Card className="mt-4">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="font-semibold">Recent activity</h2>
            <Link href="/settings/audit" className="text-sm text-accent hover:underline">Audit log</Link>
          </div>
          <ul className="divide-y divide-line text-sm">
            {d.recent_activity.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
                <span className="font-medium">{a.user?.full_name ?? "System"}</span>
                <Badge tone="blue">{a.action}</Badge>
                <span className="flex-1 truncate text-muted">{a.summary || `${a.entity} #${a.entity_id}`}</span>
                <span className="text-xs text-muted">{fmtDateTime(a.created_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
