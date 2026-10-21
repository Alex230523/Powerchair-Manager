import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { People } from "@/components/people";
import { ClubIdentity } from "@/components/club-identity";
export const metadata = {
  title: "Gestion du club · Powerchair Football Manager",
};
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <People locale={locale} management>
      <ClubIdentity locale={locale} only="teams" />
    </People>
  );
}
