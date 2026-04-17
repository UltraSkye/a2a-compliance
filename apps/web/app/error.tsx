'use client';

import { useEffect } from 'react';

/**
 * Last-chance error boundary. Client-side runtime errors land here
 * rather than the generic Next.js error page. We deliberately do NOT
 * render error.message — that string may include URLs / agent output
 * the operator would prefer not to see echoed on-screen. The operator
 * can pull the detail from the browser console / server logs.
 */
export default function ErrorBoundary({ reset }: { error: unknown; reset: () => void }) {
  useEffect(() => {
    // Log to the browser console so ops has something actionable.
    // Intentionally no alert / toast — keeps the UI calm.
    console.error('a2a-compliance dashboard error');
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="mb-2 text-3xl font-bold">Something went wrong.</h1>
      <p className="mb-6 text-zinc-400">
        The dashboard hit an unexpected error. Check the browser console for details.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-zinc-100 px-5 py-2 font-medium text-zinc-950 transition hover:bg-white"
      >
        Try again
      </button>
    </main>
  );
}
