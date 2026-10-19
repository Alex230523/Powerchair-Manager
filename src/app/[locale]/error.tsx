"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main">
      <h1>Erreur / Fout / Error</h1>
      <p>Veuillez réessayer. Probeer opnieuw. Please try again.</p>
      <button className="button" onClick={reset}>
        Réessayer / Opnieuw / Retry
      </button>
    </main>
  );
}
