-- Enable pg_trgm extension for fuzzy text matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create index on deed_holder_normalized for similarity searches
CREATE INDEX IF NOT EXISTS parcels_deed_holder_normalized_trgm_idx 
  ON parcels USING gin (deed_holder_normalized gin_trgm_ops);

-- Test the similarity function
-- SELECT similarity('KING, EDNA M.', 'Edna King Estate');

