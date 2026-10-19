CREATE TABLE "user" (id text PRIMARY KEY,name text NOT NULL,email text NOT NULL UNIQUE,"emailVerified" boolean NOT NULL DEFAULT false,image text,"createdAt" timestamptz NOT NULL DEFAULT now(),"updatedAt" timestamptz NOT NULL DEFAULT now(),"twoFactorEnabled" boolean DEFAULT false,active boolean NOT NULL DEFAULT true);
CREATE UNIQUE INDEX user_email_casefold ON "user"(lower(email));
CREATE TABLE session (id text PRIMARY KEY,"expiresAt" timestamptz NOT NULL,token text NOT NULL UNIQUE,"createdAt" timestamptz NOT NULL DEFAULT now(),"updatedAt" timestamptz NOT NULL DEFAULT now(),"ipAddress" text,"userAgent" text,"userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE);
CREATE INDEX session_user_idx ON session("userId");
CREATE TABLE account (id text PRIMARY KEY,"accountId" text NOT NULL,"providerId" text NOT NULL,"userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,"accessToken" text,"refreshToken" text,"idToken" text,"accessTokenExpiresAt" timestamptz,"refreshTokenExpiresAt" timestamptz,scope text,password text,"createdAt" timestamptz NOT NULL DEFAULT now(),"updatedAt" timestamptz NOT NULL DEFAULT now(),UNIQUE("providerId","accountId"));
CREATE TABLE verification (id text PRIMARY KEY,identifier text NOT NULL,value text NOT NULL,"expiresAt" timestamptz NOT NULL,"createdAt" timestamptz NOT NULL DEFAULT now(),"updatedAt" timestamptz NOT NULL DEFAULT now());
CREATE INDEX verification_identifier ON verification(identifier);
CREATE TABLE "twoFactor" (id text PRIMARY KEY,secret text NOT NULL,"backupCodes" text NOT NULL,"userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,verified boolean DEFAULT false,"failedVerificationCount" integer DEFAULT 0,"lockedUntil" timestamptz);
CREATE INDEX two_factor_user ON "twoFactor"("userId");
CREATE TABLE "rateLimit" (id text PRIMARY KEY,key text NOT NULL UNIQUE,count integer NOT NULL,"lastRequest" bigint NOT NULL);
CREATE TABLE person (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id text NOT NULL UNIQUE REFERENCES "user"(id),locale text NOT NULL DEFAULT 'fr' CHECK(locale IN ('fr','nl')),notifications_enabled boolean NOT NULL DEFAULT true);
CREATE TABLE organization (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 120),kind text NOT NULL CHECK(kind IN ('club','federation')),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE organization_membership (organization_id uuid NOT NULL REFERENCES organization(id),user_id text NOT NULL REFERENCES "user"(id),active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(organization_id,user_id));
CREATE TABLE role_assignment (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,user_id text NOT NULL,role text NOT NULL CHECK(role IN ('club_president','federation_president','federation_worker','coach','referee','player','guardian')),grants text[] NOT NULL DEFAULT '{}' CHECK(grants <@ ARRAY['members.read','invitations.create','audit.read']::text[]),valid_from timestamptz NOT NULL DEFAULT now(),valid_until timestamptz,revoked_at timestamptz,created_by text REFERENCES "user"(id),created_at timestamptz NOT NULL DEFAULT now(),CHECK(valid_until IS NULL OR valid_until>valid_from),FOREIGN KEY(organization_id,user_id) REFERENCES organization_membership(organization_id,user_id),UNIQUE(id,organization_id,user_id));
CREATE INDEX mandate_lookup ON role_assignment(user_id,organization_id) WHERE revoked_at IS NULL;
CREATE FUNCTION check_role_kind() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE kind text;
BEGIN
 SELECT o.kind INTO kind FROM organization o WHERE o.id=NEW.organization_id;
 IF (kind='club' AND NEW.role IN ('federation_president','federation_worker','referee')) OR (kind='federation' AND NEW.role NOT IN ('federation_president','federation_worker','referee')) THEN RAISE EXCEPTION 'role incompatible with organization'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER role_kind BEFORE INSERT OR UPDATE ON role_assignment FOR EACH ROW EXECUTE FUNCTION check_role_kind();
CREATE TABLE active_context (session_id text PRIMARY KEY REFERENCES session(id) ON DELETE CASCADE,user_id text NOT NULL REFERENCES "user"(id),organization_id uuid NOT NULL,mandate_id uuid NOT NULL,FOREIGN KEY(mandate_id,organization_id,user_id) REFERENCES role_assignment(id,organization_id,user_id));
CREATE TABLE invitation (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organization(id),email text NOT NULL,role text NOT NULL CHECK(role IN ('club_president','federation_president','federation_worker','coach','referee','player','guardian')),grants text[] NOT NULL DEFAULT '{}' CHECK(grants <@ ARRAY['members.read','invitations.create','audit.read']::text[]),token_hash text NOT NULL UNIQUE,expires_at timestamptz NOT NULL,valid_until timestamptz,created_by text NOT NULL REFERENCES "user"(id),accepted_at timestamptz,revoked_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE audit_log (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organization(id),actor_id text NOT NULL REFERENCES "user"(id),action text NOT NULL,target_id text,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX audit_org_time ON audit_log(organization_id,created_at DESC);
