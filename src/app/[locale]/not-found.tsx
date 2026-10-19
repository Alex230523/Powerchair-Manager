import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main">
      <h1>Page introuvable / Pagina niet gevonden / Page not found</h1>
      <Link href="/fr/access">Mon espace / Mijn ruimte / My space</Link>
    </main>
  );
}
