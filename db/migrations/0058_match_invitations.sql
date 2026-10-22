-- Wave 17 (C5): friendly matches between clubs of a federation. The inviting
-- club's match carries the invitation; once accepted, the invited club gets
-- its own match (and calendar event), both lines linked. The first club to
-- enter the score proposes it, the other confirms it.
ALTER TABLE match
  ADD COLUMN place_id uuid,
  ADD COLUMN opponent_team_id uuid REFERENCES team(id),
  ADD COLUMN linked_match_id uuid REFERENCES match(id),
  ADD COLUMN score_status text NOT NULL DEFAULT 'none' CHECK (score_status IN ('none', 'proposed', 'confirmed')),
  ADD COLUMN score_proposed_by uuid REFERENCES organization(id);
ALTER TABLE match ADD CONSTRAINT match_place FOREIGN KEY (place_id, organization_id) REFERENCES calendar_place(id, organization_id);
CREATE INDEX match_linked ON match(linked_match_id) WHERE linked_match_id IS NOT NULL;

CREATE TABLE match_invitation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL,
  organization_id uuid NOT NULL REFERENCES organization(id),
  invited_organization_id uuid NOT NULL REFERENCES organization(id),
  invited_team_id uuid NOT NULL REFERENCES team(id),
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'accepted', 'refused', 'cancelled')),
  message text NOT NULL DEFAULT '' CHECK (length(message) <= 500),
  answer text NOT NULL DEFAULT '' CHECK (length(answer) <= 500),
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  answered_by text REFERENCES "user"(id),
  answered_at timestamptz,
  FOREIGN KEY (match_id, organization_id) REFERENCES match(id, organization_id)
);
CREATE UNIQUE INDEX match_invitation_open ON match_invitation(match_id) WHERE status IN ('sent', 'accepted');
CREATE INDEX match_invitation_invited ON match_invitation(invited_organization_id, status);
