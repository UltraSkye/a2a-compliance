import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="mb-2 text-3xl font-bold">404</h1>
      <p className="mb-6 text-zinc-400">That route isn't part of the a2a-compliance dashboard.</p>
      <Link
        href="/"
        className="rounded-md bg-zinc-100 px-5 py-2 font-medium text-zinc-950 transition hover:bg-white"
      >
        Back to the form
      </Link>
    </main>
  );
}
