"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { post } from "@/lib/api";
import { useData } from "@/lib/useData";
import type { Attendance } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { Badge, Button, Card, Modal, fmtTime, useToast } from "./ui";

const REQUIRED_HOURS = 8;

function fmtDuration(hours: number): string {
  const totalMins = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export default function CheckInCard({ onChange }: { onChange?: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const { data, setData, loading } = useData<Attendance | null>(user?.employee_id ? "/api/attendance/today" : null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [confirmEarly, setConfirmEarly] = useState(false);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  const elapsedHours =
    data?.check_in && !data.check_out && now
      ? Math.max(0, (now.getTime() - new Date(data.check_in).getTime()) / 3600000)
      : null;

  const workedHours = data?.hours ?? elapsedHours;
  const remainingHours = elapsedHours != null ? Math.max(0, REQUIRED_HOURS - elapsedHours) : 0;
  const shiftPct = workedHours != null ? Math.min(100, Math.round((workedHours / REQUIRED_HOURS) * 100)) : 0;

  async function act(kind: "check-in" | "check-out") {
    setBusy(true);
    try {
      setData(await post<Attendance>(`/api/attendance/${kind}`));
      setConfirmEarly(false);
      toast(kind === "check-in" ? "Checked in" : "Checked out");
      onChange?.();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  function handleCheckOutClick() {
    if (elapsedHours != null && elapsedHours < REQUIRED_HOURS) {
      setConfirmEarly(true);
      return;
    }
    act("check-out");
  }

  const completedFullShift = data?.check_out != null && (data.hours ?? 0) >= REQUIRED_HOURS;

  return (
    <>
      <Card className="p-5 transition hover:border-line-strong hover:shadow-[var(--shadow-sm)]">
        <div className="flex items-start justify-between gap-3">
          <span className="text-xs font-medium text-muted">My attendance today</span>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <Clock className="size-4" />
          </span>
        </div>
        {!user?.employee_id ? (
          <p className="mt-3 text-xs leading-relaxed text-muted">Your login isn&apos;t linked to an employee profile yet. HR can link it from Employees.</p>
        ) : (
          <>
            <div className="mt-1 text-2xl font-bold tracking-tight text-ink tabular-nums">
              {now?.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) ?? "--:--"}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
              {data?.status && <Badge>{data.status}</Badge>}
              <span>In {fmtTime(data?.check_in)}</span>
              <span>· Out {fmtTime(data?.check_out)}</span>
              {workedHours != null && (
                <span className="font-semibold text-ink">· {fmtDuration(workedHours)}</span>
              )}
            </div>

            {data?.check_in && !data.check_out && (
              <div className="mt-3 space-y-1">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${shiftPct >= 100 ? "bg-ok" : "bg-brand"}`}
                    style={{ width: `${shiftPct}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-muted">
                  <span>{shiftPct}% of 8h shift</span>
                  {elapsedHours != null && elapsedHours < REQUIRED_HOURS && (
                    <span className="font-medium text-warn">{fmtDuration(remainingHours)} left</span>
                  )}
                </div>
              </div>
            )}

            <div className="mt-3.5">
              {!data?.check_in ? (
                <Button size="sm" loading={busy || loading} onClick={() => act("check-in")} className="w-full sm:w-auto">
                  Check in
                </Button>
              ) : !data.check_out ? (
                <Button size="sm" variant="secondary" loading={busy} onClick={handleCheckOutClick} className="w-full sm:w-auto">
                  Check out
                </Button>
              ) : completedFullShift ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ok">
                  <CheckCircle2 className="size-4" /> Day complete ({fmtDuration(data.hours ?? 0)})
                </span>
              ) : (
                <div className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
                  <AlertTriangle className="size-3.5 shrink-0 text-warn" />
                  Checked out early · {fmtDuration(data.hours ?? 0)} (&lt; 8h)
                </div>
              )}
            </div>
          </>
        )}
      </Card>

      <Modal open={confirmEarly} onClose={() => setConfirmEarly(false)} title="8-hour shift not completed">
        <div className="space-y-4">
          <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warn" />
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-amber-950">You have not completed 8 hours yet.</p>
              <p className="text-amber-900/90">
                Worked so far: <span className="font-semibold tabular-nums">{fmtDuration(elapsedHours ?? 0)}</span>
                {" · "}
                Remaining: <span className="font-semibold tabular-nums">{fmtDuration(remainingHours)}</span>
              </p>
              <p className="text-xs text-amber-900/80">
                Your actual worked hours will be recorded and visible to the administrator. Do you still want to check out now?
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setConfirmEarly(false)}>Keep working</Button>
            <Button type="button" variant="danger" loading={busy} onClick={() => act("check-out")}>Check out anyway</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
