"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main>
      <h1>Something went wrong</h1>
      <p>Tripkopa could not complete this request.</p>
      <button type="button" onClick={() => reset()}>
        Try again
      </button>
    </main>
  );
}
