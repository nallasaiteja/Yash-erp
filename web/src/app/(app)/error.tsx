"use client";
import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";
import { Button, Card } from "@/components/ui";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("App error boundary:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <Card className="w-full max-w-md p-6 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-red-50 text-danger ring-1 ring-red-200">
          <AlertTriangle className="size-6" />
        </div>
        <h2 className="mt-4 text-lg font-semibold">Something went wrong</h2>
        <p className="mt-1.5 text-sm text-muted">
          {error.message || "An unexpected error occurred while rendering this page."}
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Button onClick={reset}>
            <RefreshCw className="size-4" /> Try again
          </Button>
          <Link href="/">
            <Button variant="secondary" type="button">
              <Home className="size-4" /> Dashboard
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
