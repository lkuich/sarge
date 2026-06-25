UPDATE "Site"
SET "customDomain" = lower(
  concat(
    'events-',
    trim(both '-' from regexp_replace(slug, '[^a-zA-Z0-9]+', '-', 'g')),
    '-',
    right(regexp_replace(id, '[^a-zA-Z0-9]', '', 'g'), 8),
    '.placeholder.invalid'
  )
)
WHERE "customDomain" IS NULL;

ALTER TABLE "Site" ALTER COLUMN "customDomain" SET NOT NULL;
