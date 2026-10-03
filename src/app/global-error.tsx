"use client";

// Last resort when the root layout itself fails. It cannot use the site styles or fonts, so it carries its own.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui, sans-serif",
          background: "#f7fafa",
          color: "#12292b",
        }}
      >
        <main
          style={{ maxWidth: 520, margin: "0 auto", padding: "4rem 1.25rem", textAlign: "center" }}
        >
          <h1 style={{ fontSize: "1.75rem" }}>ViniCure could not load</h1>
          <p style={{ fontSize: "1.125rem", lineHeight: 1.5 }}>
            Something went wrong on our side. Nothing you entered was lost. Try again in a moment.
          </p>
          {error.digest ? <p>Reference: {error.digest}</p> : null}
          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: 44,
              padding: "0 1.25rem",
              fontSize: "1rem",
              fontWeight: 600,
              color: "#fff",
              background: "#146C6C",
              border: 0,
              borderRadius: 8,
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
