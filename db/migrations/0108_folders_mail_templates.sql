-- 10: documents in folders (a folder is a view, never a right) and the
-- club's library of email templates, used everywhere (Communication,
-- events, reminders, automations).

-- Free folders for the club's own documents (statutes, minutes, contracts,
-- templates), nested; each has a visibility that can only narrow what the
-- document rules already allow, and lets the club's non personal, non
-- sensitive documents it holds be read by that circle.
CREATE TABLE IF NOT EXISTS document_folder (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organization(id),
 parent_id uuid,
 name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
 visibility text NOT NULL DEFAULT 'presidency' CHECK (visibility IN ('presidency', 'staff', 'members')),
 created_by text NOT NULL REFERENCES "user"(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 version integer NOT NULL DEFAULT 1,
 UNIQUE (id, organization_id),
 FOREIGN KEY (parent_id, organization_id) REFERENCES document_folder(id, organization_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS document_folder_name ON document_folder(organization_id, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
ALTER TABLE club_document ADD COLUMN IF NOT EXISTS folder_id uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'club_document_folder_fk') THEN
    ALTER TABLE club_document ADD CONSTRAINT club_document_folder_fk FOREIGN KEY (folder_id, organization_id) REFERENCES document_folder(id, organization_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS club_document_folder ON club_document(folder_id) WHERE folder_id IS NOT NULL;

-- The templates: subject and body in the three languages, variables between
-- braces ({prénom}, {équipe}, {événement}, {date}, {lieu}, {montant},
-- {échéance}, {lien}, {club}). builtin_key marks the ones offered to every
-- club (created on first use, then the club's own to change).
CREATE TABLE IF NOT EXISTS mail_template (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organization(id),
 usage text NOT NULL CHECK (usage IN ('dues_reminder', 'event_invitation', 'document_reminder', 'new_season', 'welcome', 'match_invitation', 'sponsor_thanks', 'free')),
 name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 120),
 texts jsonb NOT NULL CHECK (octet_length(texts::text) <= 60000),
 builtin_key text,
 archived boolean NOT NULL DEFAULT false,
 version integer NOT NULL DEFAULT 1,
 created_by text REFERENCES "user"(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (id, organization_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS mail_template_builtin ON mail_template(organization_id, builtin_key) WHERE builtin_key IS NOT NULL;
-- Which template a reminder or an automation uses (none: its own text).
CREATE TABLE IF NOT EXISTS mail_template_binding (
 organization_id uuid NOT NULL REFERENCES organization(id),
 target text NOT NULL CHECK (target ~ '^(dues_reminder|documents_reminder|automation:[a-zA-Z]+)$'),
 template_id uuid NOT NULL,
 updated_by text REFERENCES "user"(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (organization_id, target),
 FOREIGN KEY (template_id, organization_id) REFERENCES mail_template(id, organization_id) ON DELETE CASCADE
);
-- The history of the sendings, by template.
CREATE TABLE IF NOT EXISTS mail_template_send (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organization(id),
 template_id uuid NOT NULL,
 kind text NOT NULL CHECK (kind IN ('groups', 'event', 'test', 'reminder', 'automation')),
 event_id uuid,
 recipients integer NOT NULL DEFAULT 0,
 sent_by text REFERENCES "user"(id),
 sent_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (template_id, organization_id) REFERENCES mail_template(id, organization_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS mail_template_send_template ON mail_template_send(template_id, sent_at DESC);
-- One line per address for the messages one may stop (« Se désinscrire »).
CREATE TABLE IF NOT EXISTS mail_template_delivery (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 send_id uuid NOT NULL REFERENCES mail_template_send(id) ON DELETE CASCADE,
 organization_id uuid NOT NULL REFERENCES organization(id),
 email_hash text NOT NULL,
 user_id text REFERENCES "user"(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
