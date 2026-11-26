"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-[#EDF2F7] p-6 text-[#0F2137]">
        <div className="w-full max-w-md rounded-xl border border-[#DCE4F0] bg-white p-6 text-center shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#1D4ED8]">Merugu Global</p>
          <h1 className="mt-2 text-xl font-semibold text-[#0F2137]">Unexpected application error</h1>
          <p className="mt-2 text-sm text-[#3B4D63]">
            {error.message || "Something went wrong. Please reload the page to continue."}
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-5 inline-flex h-10 items-center justify-center rounded-lg bg-[#1D4ED8] px-4 text-sm font-medium text-white hover:bg-[#1E40AF]"
          >
            Reload page
          </button>
        </div>
      </body>
    </html>
  );
}
