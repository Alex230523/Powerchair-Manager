-- Better Auth models JavaScript numeric timestamps as double precision.
ALTER TABLE "rateLimit" ALTER COLUMN "lastRequest" TYPE double precision USING "lastRequest"::double precision;
