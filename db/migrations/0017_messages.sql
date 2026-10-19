CREATE TABLE message_thread (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organization(id),
 subject text NOT NULL CHECK(length(subject) BETWEEN 2 AND 160), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,organization_id)
);
CREATE TABLE message_participant (
 thread_id uuid NOT NULL, organization_id uuid NOT NULL, user_id text NOT NULL,
 PRIMARY KEY(thread_id,user_id), FOREIGN KEY(thread_id,organization_id) REFERENCES message_thread(id,organization_id),
 FOREIGN KEY(organization_id,user_id) REFERENCES organization_membership(organization_id,user_id)
);
CREATE TABLE internal_message (
 id uuid PRIMARY KEY, thread_id uuid NOT NULL, organization_id uuid NOT NULL, sender_id text NOT NULL,
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 5000), created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(thread_id,organization_id) REFERENCES message_thread(id,organization_id),
 FOREIGN KEY(thread_id,sender_id) REFERENCES message_participant(thread_id,user_id)
);
CREATE INDEX internal_message_order ON internal_message(thread_id,created_at,id);
