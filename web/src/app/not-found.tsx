import Link from "next/link";
import { FileQuestion, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-page p-6">
      <div className="w-full max-w-md rounded-xl border border-line bg-surface p-8 text-center shadow-sm">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-surface-2 text-muted">
          <FileQuestion className="size-6" />
        </div>
        <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-muted">404 · Merugu Global</p>
        <h1 className="mt-1 text-xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-muted">
          The page you are looking for doesn&apos;t exist or may have been moved.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-medium text-brand-fg transition hover:bg-brand-hover"
        >
          <Home className="size-4" /> Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
