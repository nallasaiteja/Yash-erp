"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Eye, EyeOff, Zap } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button, Field, Input } from "@/components/ui";

const PILLARS = [
  "Digital Marketing & Growth",
  "Technology & AI Automation",
  "Healthcare & Life Sciences",
];

function LoginForm() {
  const { login, user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) router.replace(next.startsWith("/") ? next : "/");
  }, [user, next, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-page">
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-side px-14 py-10 text-white lg:flex">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-brand text-white shadow-sm">
            <Zap className="size-5" />
          </span>
          <div className="leading-tight">
            <span className="block text-sm font-bold tracking-wider text-white">MERUGU GLOBAL</span>
            <span className="block text-xs text-blue-200/80">Enterprise ERP &amp; HRMS</span>
          </div>
        </div>

        <div className="my-auto max-w-md py-10">
          <span className="inline-flex items-center rounded-full border border-blue-300/25 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-100">
            Digitalize · Optimize · Grow
          </span>
          <h1 className="mt-5 text-3xl font-semibold tracking-tight leading-snug text-white xl:text-4xl">
            Unified workspace for teams &amp; operations.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-blue-100/80">
            HR, attendance, leave, tasks, documents, and company announcements in one secure platform.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {PILLARS.map((item) => (
              <span
                key={item}
                className="rounded-lg border border-white/15 bg-white/[0.07] px-3 py-1.5 text-xs font-medium text-blue-50"
              >
                {item}
              </span>
            ))}
          </div>
        </div>

        <p className="text-xs text-blue-200/60">
          Merugu Global · Authorized personnel only.
        </p>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center bg-page p-6 sm:p-10">
        <div className="mb-8 flex items-center gap-2.5 lg:hidden">
          <span className="flex size-9 items-center justify-center rounded-lg bg-brand text-white shadow-xs">
            <Zap className="size-5" />
          </span>
          <div className="leading-tight">
            <div className="text-sm font-bold tracking-wide text-ink">MERUGU GLOBAL</div>
            <div className="text-[11px] text-muted">Digitalize · Optimize · Grow</div>
          </div>
        </div>

        <div className="w-full max-w-[400px] rounded-2xl border border-line bg-surface p-7 shadow-[var(--shadow-md)] sm:p-8">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold tracking-tight text-ink">Sign in</h2>
            <p className="mt-1 text-sm text-muted">Use your Merugu Global account to continue.</p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <Field label="Work email">
              <Input
                type="email"
                autoComplete="username"
                required
                placeholder="name@meruguglobal.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
              />
            </Field>

            <Field label="Password">
              <div className="relative">
                <Input
                  type={showPwd ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((s) => !s)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted hover:bg-surface-2 hover:text-ink"
                  aria-label={showPwd ? "Hide password" : "Show password"}
                >
                  {showPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>

            {error && (
              <div
                className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800"
                role="alert"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" loading={busy} className="mt-2 h-10 w-full text-sm font-semibold">
              Sign in
            </Button>
          </form>
        </div>

        <p className="mt-5 text-center text-xs text-muted">
          Protected by role-based access control &amp; session auditing.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
