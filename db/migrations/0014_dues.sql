-- Amounts are integer EUR cents. Payment recording and reconciliation belong to lot 09.
CREATE TABLE dues_plan (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organization(id), season_id uuid NOT NULL,
 category text NOT NULL CHECK(length(trim(category)) BETWEEN 2 AND 80), amount_cents integer NOT NULL CHECK(amount_cents BETWEEN 0 AND 100000000),
 max_installments integer NOT NULL CHECK(max_installments BETWEEN 1 AND 12), first_due date NOT NULL, archived boolean NOT NULL DEFAULT false,
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(season_id,organization_id) REFERENCES season(id,organization_id), UNIQUE(id,organization_id)
);
CREATE UNIQUE INDEX dues_plan_category ON dues_plan(organization_id,season_id,lower(trim(category))) WHERE NOT archived;
CREATE TABLE dues_receivable (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organization(id), profile_id uuid NOT NULL, season_id uuid NOT NULL,
 plan_id uuid NOT NULL, category text NOT NULL, plan_snapshot jsonb NOT NULL,
 gross_cents integer NOT NULL CHECK(gross_cents BETWEEN 0 AND 100000000), discount_cents integer NOT NULL CHECK(discount_cents>=0),
 net_cents integer GENERATED ALWAYS AS (gross_cents-discount_cents) STORED, reason text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','cancelled')), version integer NOT NULL DEFAULT 1,
 created_by text NOT NULL REFERENCES "user"(id), created_at timestamptz NOT NULL DEFAULT now(), cancelled_at timestamptz,
 CHECK(discount_cents<=gross_cents), CHECK(discount_cents=0 OR length(trim(reason))>=5),
 FOREIGN KEY(profile_id,organization_id) REFERENCES club_person(id,organization_id),
 FOREIGN KEY(season_id,organization_id) REFERENCES season(id,organization_id),
 FOREIGN KEY(plan_id,organization_id) REFERENCES dues_plan(id,organization_id), UNIQUE(id,organization_id)
);
CREATE UNIQUE INDEX dues_one_active_category ON dues_receivable(organization_id,profile_id,season_id,lower(trim(category))) WHERE status='open';
CREATE TABLE dues_installment (
 receivable_id uuid NOT NULL REFERENCES dues_receivable(id), ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 12),
 due_on date NOT NULL, amount_cents integer NOT NULL CHECK(amount_cents>=0), PRIMARY KEY(receivable_id,ordinal)
);
CREATE TABLE dues_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organization(id), receivable_id uuid REFERENCES dues_receivable(id),
 plan_id uuid REFERENCES dues_plan(id), actor_id text NOT NULL REFERENCES "user"(id), action text NOT NULL,
 before_data jsonb, after_data jsonb NOT NULL, reason text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE role_assignment DROP CONSTRAINT role_assignment_grants_check;
ALTER TABLE invitation DROP CONSTRAINT invitation_grants_check;
ALTER TABLE role_assignment ADD CONSTRAINT role_assignment_grants_check CHECK(grants <@ ARRAY['members.read','invitations.create','audit.read','people.read','people.manage','teams.manage','people.export','notifications.manage','registrations.manage','documents.read','documents.manage','documents.sensitive','calendar.manage','calendar.read','attendance.manage','dues.manage']::text[]);
ALTER TABLE invitation ADD CONSTRAINT invitation_grants_check CHECK(grants <@ ARRAY['members.read','invitations.create','audit.read','people.read','people.manage','teams.manage','people.export','notifications.manage','registrations.manage','documents.read','documents.manage','documents.sensitive','calendar.manage','calendar.read','attendance.manage','dues.manage']::text[]);
