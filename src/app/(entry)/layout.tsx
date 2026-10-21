import { fontClass } from "../fonts";
import "../globals.css";
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={fontClass}>
      <body>{children}</body>
    </html>
  );
}
