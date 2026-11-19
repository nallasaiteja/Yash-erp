"use client";
import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { post } from "@/lib/api";
import { useData } from "@/lib/useData";
import type { Attendance } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { Badge, Button, Card, fmtTime, useToast } from "./ui";

export default function CheckInCard({ onChange }: { onChange?: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const { data, setData, loading } = useData<Attendance | null>(user?.employee_id ? "/api/attendance/today" : null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  async function act(kind: "check-in" | "check-out") {
    setBusy(true);
    try {
      setData(await post<Attendance>(`/api/attendance/${kind}`));
      toast(kind === "check-in" ? "Checked in" : "Checked out");
      onChange?.();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">My attendance today</span>
        <Clock className="size-4 text-brand dark:text-accent" />
      </div>
      {!user?.employee_id ? (
        <p className="mt-3 text-sm text-muted">Your login isn&apos;t linked to an employee profile yet. HR can link it from Employees.</p>
      ) : (
        <>
          <div className="mt-2 text-2xl font-semibold tabular-nums">
            {now?.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) ?? "--:--"}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
            {data?.status && <Badge>{data.status}</Badge>}
            <span>In {fmtTime(data?.check_in)}</span>
            <span>· Out {fmtTime(data?.check_out)}</span>
            {data?.hours != null && <span>· {data.hours} h</span>}
          </div>
          <div className="mt-3">
            {!data?.check_in ? (
              <Button size="sm" loading={busy || loading} onClick={() => act("check-in")}>Check in</Button>
            ) : !data.check_out ? (
              <Button size="sm" variant="secondary" loading={busy} onClick={() => act("check-out")}>Check out</Button>
            ) : (
              <span className="text-sm text-ok">Day complete</span>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
