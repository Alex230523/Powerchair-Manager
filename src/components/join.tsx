import Link from "next/link";
import type { Locale } from "@/lib/locale";
import { Card, PageHeader } from "./ui";
import { joinCopy } from "./join-copy";

/** « Créer un compte » (wave 16, I1): who invites whom, no sign-up form. */
export function Join({ locale, contact }: { locale: Locale; contact: string | null }) {
  const t = joinCopy[locale];
  return (
    <main id="main" className="access join">
      <PageHeader title={t.title} subtitle={t.subtitle} />
      <div className="join-grid">
        <Card title={t.playerTitle} icon="players">
          <p>{t.playerText}</p>
          <p className="muted">{t.newPlayer}</p>
        </Card>
        <Card title={t.presidentTitle} icon="whistle">
          <p>{t.presidentText}</p>
        </Card>
        <Card title={t.independentTitle} icon="home">
          <p>{t.independentText}</p>
          <p>
            <Link className="button" href={`/${locale}/join/club`}>
              {t.independentAction}
            </Link>
          </p>
        </Card>
        <Card title={t.federationTitle} icon="landmark">
          {contact ? (
            <p>
              {t.federationText} <a href={`mailto:${contact}`}>{contact}</a>
            </p>
          ) : (
            <p>{t.federationNoAddress}</p>
          )}
        </Card>
        <Card title={t.invitedTitle} icon="inbox">
          <p>{t.invitedText}</p>
        </Card>
      </div>
      <p>
        <Link className="button secondary" href={`/${locale}/access`}>{t.back}</Link>
      </p>
    </main>
  );
}
