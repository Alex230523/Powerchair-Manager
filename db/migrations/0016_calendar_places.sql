-- Public venue directory shared by clubs and federation; private club places remain private.
CREATE TABLE shared_venue (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL CHECK(length(name) BETWEEN 2 AND 120),
 address text NOT NULL CHECK(length(address) BETWEEN 2 AND 500),
 created_by text NOT NULL REFERENCES "user"(id), organization_id uuid NOT NULL REFERENCES organization(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX shared_venue_unique ON shared_venue(lower(trim(name)),lower(trim(address)));
ALTER TABLE calendar_event ADD COLUMN shared_venue_id uuid REFERENCES shared_venue(id), ADD COLUMN free_location text NOT NULL DEFAULT '' CHECK(length(free_location)<=500);
ALTER TABLE calendar_event ADD CONSTRAINT one_location CHECK(num_nonnulls(place_id,shared_venue_id)+CASE WHEN free_location='' THEN 0 ELSE 1 END<=1);
