import type { Pool, PoolClient } from "pg";
import { mfaSatisfied } from "../../lib/security-policy";
import { isLocale, type Locale } from "../../lib/locale";
import { AccessError, account, active, audit, type Principal } from "../access/service";
import { isAdmin, permissions } from "../access/policy";
import { publish } from "../notifications/queue";
import { drafts } from "./drafts";
import { chapterContent, guideCommand, inLocale, readerAudiences, type ChapterContent, type GuideCommand } from "./schema";
import type { z } from "zod";

/**
 * Guide du powerchair football. A federation writes its chapters (a saved
 * text is a new version, a draft until published); the members of its
 * clubs and its referees read the published version; a club adds its note
 * « Chez nous » under a chapter, seen by its own members only. Reading a
 * chapter ticks a welcome journey's « À lire » step that points to it.
 */
type Ctx = { c: PoolClient; org: string; kind: string; role: string; userId: string; fed: string | null; manage: boolean; note: boolean };
async function scope<T>(db: Pool, p: Principal, write: boolean, fn: (x: Ctx) => Promise<T>, expected?: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const a = await active(c, p);
    if (expected && expected !== a.organization_id) throw new AccessError("CONTEXT_CHANGED", 409);
    await c.query(`SELECT id FROM organization WHERE id=$1 FOR ${write ? "UPDATE" : "SHARE"}`, [a.organization_id]);
    const mfa = mfaSatisfied(!!(await account(c, p)).twoFactorEnabled);
    const rights = permissions(a.role, a.grants);
    const federation = a.kind === "federation";
    const fed = federation ? a.organization_id : (((await c.query("SELECT federation_id FROM organization WHERE id=$1", [a.organization_id])).rows[0]?.federation_id as string | null) ?? null);
    // The federation writes: its presidency, or its staff in charge of communication.
    const manage = federation && mfa && (isAdmin(a.role) || (a.role === "federation_worker" && rights.includes("notifications.manage")));
    const note = !federation && mfa && (a.role === "club_president" || rights.includes("mandates.manage"));
    const out = await fn({ c, org: a.organization_id, kind: a.kind, role: a.role, userId: p.userId, fed, manage, note });
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    if ((e as { code?: string }).code === "23505") throw new AccessError("DUPLICATE", 409);
    throw e;
  } finally {
    c.release();
  }
}

type ChapterRow = {
  id: string;
  slug: string;
  position: number;
  audiences: string[];
  status: "draft" | "published";
  public: boolean;
  current_version: number;
  published_version: number | null;
  updated_on: string | null;
  content: ChapterContent;
  sources: string;
  version: number;
};
/** The chapters of a federation, each with the version a reader sees (the published one) or the manager edits (the last one). */
async function chapters(c: PoolClient, fed: string, edit: boolean, slug?: string) {
  return (
    await c.query(
      `SELECT g.id,g.slug,g.position,g.audiences,g.status,g.public,g.current_version,g.published_version,g.updated_on::text AS updated_on,v.content,v.sources,v.version
         FROM guide_chapter g JOIN guide_version v ON v.chapter_id=g.id AND v.version=${edit ? "g.current_version" : "g.published_version"}
        WHERE g.federation_id=$1 ${edit ? "" : "AND g.status='published'"} ${slug ? "AND g.slug=$2" : ""} ORDER BY g.position,g.slug`,
      slug ? [fed, slug] : [fed],
    )
  ).rows as ChapterRow[];
}

/** The guide's table of contents: the chapters for the reader's role first (« Tout voir » shows the others). */
export async function guideIndex(db: Pool, p: Principal, locale: Locale) {
  return scope(db, p, false, async (x) => {
    const mine = readerAudiences(x.role, x.kind);
    const base = { organization_id: x.org, can: { manage: x.manage, note: x.note }, audiences: mine };
    if (!x.fed) return { ...base, federation: null, chapters: [], drafts: 0 };
    const federation = (await x.c.query("SELECT id,name FROM organization WHERE id=$1", [x.fed])).rows[0] as { id: string; name: string };
    const rows = await chapters(x.c, x.fed, x.manage);
    const read = new Set((await x.c.query("SELECT chapter_id FROM guide_read WHERE user_id=$1", [x.userId])).rows.map((r) => r.chapter_id as string));
    return {
      ...base,
      federation,
      drafts: rows.filter((r) => r.status === "draft" || r.current_version !== r.published_version).length,
      chapters: rows.map((r) => {
        const t = inLocale(r.content, locale);
        return {
          id: r.id,
          slug: r.slug,
          title: t.title,
          summary: t.summary,
          audiences: r.audiences,
          forMe: r.audiences.some((a) => (mine as string[]).includes(a)),
          status: r.status,
          public: r.public,
          changed: r.status === "published" && r.current_version !== r.published_version,
          updated_on: r.updated_on,
          read: read.has(r.id),
        };
      }),
    };
  });
}

/** One chapter: the published text (or, for the federation, the one being written), its versions and the club's note. */
export async function guideChapter(db: Pool, p: Principal, slug: string, draft: boolean) {
  return scope(db, p, false, async (x) => {
    if (!x.fed) throw new AccessError("NOT_FOUND", 404);
    const edit = draft && x.manage;
    const r = (await chapters(x.c, x.fed, edit, slug))[0];
    if (!r) throw new AccessError("NOT_FOUND", 404);
    const note = x.kind === "club" ? ((await x.c.query("SELECT body,updated_at FROM guide_club_note WHERE chapter_id=$1 AND organization_id=$2", [r.id, x.org])).rows[0] as { body: string; updated_at: string } | undefined) : undefined;
    const versions = x.manage
      ? ((
          await x.c.query('SELECT v.version,v.created_at,u.name AS author FROM guide_version v JOIN "user" u ON u.id=v.author WHERE v.chapter_id=$1 ORDER BY v.version DESC LIMIT 50', [r.id])
        ).rows as { version: number; created_at: string; author: string }[])
      : [];
    return {
      organization_id: x.org,
      can: { manage: x.manage, note: x.note },
      chapter: { ...r, draft: edit },
      note: note?.body ?? "",
      versions,
    };
  });
}

/** The public page of a chapter the federation opened (no account): its published text only. */
export async function guidePublic(db: Pool, federationId: string, slug: string) {
  const r = (
    await db.query(
      `SELECT g.id,g.slug,g.updated_on::text AS updated_on,v.content,v.sources,o.name AS federation FROM guide_chapter g JOIN guide_version v ON v.chapter_id=g.id AND v.version=g.published_version
         JOIN organization o ON o.id=g.federation_id AND o.kind='federation' WHERE g.federation_id=$1 AND g.slug=$2 AND g.status='published' AND g.public`,
      [federationId, slug],
    )
  ).rows[0] as { id: string; slug: string; updated_on: string | null; content: ChapterContent; sources: string; federation: string } | undefined;
  if (!r) throw new AccessError("NOT_FOUND", 404);
  return r;
}

/** 6: a published chapter changed: the coaches of the clubs and the referees are told. */
async function tellUpdate(c: PoolClient, fed: string, chapterId: string, version: number, content: ChapterContent) {
  const people = (
    await c.query(
      `SELECT DISTINCT u.id,u.email,u.name,COALESCE(pe.locale,'fr') AS locale FROM role_assignment r JOIN organization o ON o.id=r.organization_id
          JOIN "user" u ON u.id=r.user_id LEFT JOIN person pe ON pe.user_id=u.id
        WHERE r.revoked_at IS NULL AND (r.valid_until IS NULL OR r.valid_until>now()) AND u.active
          AND ((r.role='coach' AND o.federation_id=$1) OR (r.role='referee' AND o.id=$1))`,
      [fed],
    )
  ).rows as { id: string; email: string; name: string; locale: string }[];
  const name = (await c.query("SELECT name FROM organization WHERE id=$1", [fed])).rows[0]?.name as string;
  const slug = (await c.query("SELECT slug FROM guide_chapter WHERE id=$1", [chapterId])).rows[0]?.slug as string;
  const words = { fr: ["Guide mis à jour : {title}", "La fédération a mis à jour ce chapitre du guide."], nl: ["Gids bijgewerkt: {title}", "De federatie heeft dit hoofdstuk van de gids bijgewerkt."], en: ["Guide updated: {title}", "The federation has updated this chapter of the guide."] };
  for (const u of people) {
    const locale: Locale = isLocale(u.locale) ? u.locale : "fr";
    const title = inLocale(content, locale).title;
    await publish(c, {
      organizationId: fed,
      userId: u.id,
      email: u.email,
      kind: "automation",
      category: "sport",
      resourceType: "automation",
      resourceId: `guide:${chapterId}`,
      eventKey: `guide:${chapterId}:v${version}:${u.id}`,
      locale,
      variables: { name: u.name, title: words[locale][0].replace("{title}", title), message: words[locale][1], organization: name, url: `${process.env.BETTER_AUTH_URL ?? ""}/${locale}/guide/${slug}` },
    });
  }
  return people.length;
}

export async function guideExecute(db: Pool, p: Principal, raw: z.input<typeof guideCommand>, expected: string) {
  const cmd: GuideCommand = guideCommand.parse(raw);
  return scope(
    db,
    p,
    true,
    async (x) => {
      const need = () => {
        if (!x.manage) throw new AccessError("FORBIDDEN");
      };
      const own = async (id: string) => {
        const r = (await x.c.query("SELECT id,status,current_version,published_version FROM guide_chapter WHERE id=$1 AND federation_id=$2 FOR UPDATE", [id, x.fed])).rows[0] as
          | { id: string; status: string; current_version: number; published_version: number | null }
          | undefined;
        if (!r || !x.fed) throw new AccessError("NOT_FOUND", 404);
        return r;
      };
      switch (cmd.action) {
        case "adopt": {
          need();
          let added = 0;
          for (const d of drafts) {
            const id = (
              await x.c.query("INSERT INTO guide_chapter(federation_id,slug,position,audiences,created_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT (federation_id,slug) DO NOTHING RETURNING id", [
                x.org,
                d.slug,
                d.position,
                d.audiences,
                x.userId,
              ])
            ).rows[0]?.id as string | undefined;
            if (!id) continue;
            await x.c.query("INSERT INTO guide_version(chapter_id,version,content,sources,author) VALUES($1,1,$2,$3,$4)", [id, JSON.stringify(chapterContent.parse(d.content)), d.sources, x.userId]);
            added++;
          }
          await audit(x.c, x.org, x.userId, "guide.adopted", x.org, { added });
          return { id: x.org, added };
        }
        case "save": {
          need();
          let id = cmd.id;
          if (id) {
            const r = await own(id);
            const version = r.current_version + 1;
            await x.c.query("UPDATE guide_chapter SET slug=$2,audiences=$3,current_version=$4 WHERE id=$1", [id, cmd.slug, cmd.audiences, version]);
            await x.c.query("INSERT INTO guide_version(chapter_id,version,content,sources,author) VALUES($1,$2,$3,$4,$5)", [id, version, JSON.stringify(cmd.content), cmd.sources, x.userId]);
          } else {
            const position = Number((await x.c.query("SELECT COALESCE(max(position),0)+1 AS n FROM guide_chapter WHERE federation_id=$1", [x.org])).rows[0].n);
            id = (await x.c.query("INSERT INTO guide_chapter(federation_id,slug,position,audiences,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id", [x.org, cmd.slug, position, cmd.audiences, x.userId])).rows[0].id as string;
            await x.c.query("INSERT INTO guide_version(chapter_id,version,content,sources,author) VALUES($1,1,$2,$3,$4)", [id, JSON.stringify(cmd.content), cmd.sources, x.userId]);
          }
          await audit(x.c, x.org, x.userId, "guide.saved", id);
          return { id };
        }
        case "publish": {
          need();
          const r = await own(cmd.id);
          const update = r.published_version !== null && r.published_version !== r.current_version;
          await x.c.query("UPDATE guide_chapter SET status='published',published_version=current_version,updated_on=CURRENT_DATE WHERE id=$1", [r.id]);
          let told = 0;
          if (update) {
            const content = (await x.c.query("SELECT content FROM guide_version WHERE chapter_id=$1 AND version=$2", [r.id, r.current_version])).rows[0].content as ChapterContent;
            told = await tellUpdate(x.c, x.org, r.id, r.current_version, content);
          }
          await audit(x.c, x.org, x.userId, "guide.published", r.id, { version: r.current_version });
          return { id: r.id, told };
        }
        case "unpublish": {
          need();
          const r = await own(cmd.id);
          await x.c.query("UPDATE guide_chapter SET status='draft',public=false WHERE id=$1", [r.id]);
          return { id: r.id };
        }
        case "public": {
          need();
          const r = await own(cmd.id);
          if (cmd.public && r.status !== "published") throw new AccessError("NOT_PUBLISHED", 409);
          await x.c.query("UPDATE guide_chapter SET public=$2 WHERE id=$1", [r.id, cmd.public]);
          return { id: r.id };
        }
        case "note": {
          if (!x.note || !x.fed) throw new AccessError("FORBIDDEN");
          if (!(await x.c.query("SELECT 1 FROM guide_chapter WHERE id=$1 AND federation_id=$2 AND status='published'", [cmd.id, x.fed])).rowCount) throw new AccessError("NOT_FOUND", 404);
          if (cmd.body)
            await x.c.query(
              "INSERT INTO guide_club_note(chapter_id,organization_id,body,updated_by) VALUES($1,$2,$3,$4) ON CONFLICT (chapter_id,organization_id) DO UPDATE SET body=EXCLUDED.body,updated_by=EXCLUDED.updated_by,updated_at=now()",
              [cmd.id, x.org, cmd.body, x.userId],
            );
          else await x.c.query("DELETE FROM guide_club_note WHERE chapter_id=$1 AND organization_id=$2", [cmd.id, x.org]);
          return { id: cmd.id };
        }
        case "read": {
          const r = (await x.c.query("SELECT published_version FROM guide_chapter WHERE id=$1 AND federation_id=$2 AND status='published'", [cmd.id, x.fed])).rows[0] as { published_version: number } | undefined;
          if (!r) throw new AccessError("NOT_FOUND", 404);
          await x.c.query(
            "INSERT INTO guide_read(chapter_id,user_id,version) VALUES($1,$2,$3) ON CONFLICT (chapter_id,user_id) DO UPDATE SET version=EXCLUDED.version,read_at=now()",
            [cmd.id, x.userId, r.published_version],
          );
          return { id: cmd.id };
        }
      }
    },
    expected,
  );
}

/** For the welcome journeys: has this person read the chapter « guide:<slug> » of the federation his organization belongs to? */
export async function guideReadBy(c: PoolClient, organizationId: string, userId: string, slug: string) {
  return !!(
    await c.query(
      `SELECT 1 FROM guide_read r JOIN guide_chapter g ON g.id=r.chapter_id JOIN organization o ON o.id=$1
        WHERE r.user_id=$2 AND g.slug=$3 AND g.federation_id=COALESCE(o.federation_id,CASE WHEN o.kind='federation' THEN o.id END)`,
      [organizationId, userId, slug],
    )
  ).rowCount;
}

