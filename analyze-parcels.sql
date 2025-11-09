-- Analyze parcel adjacency patterns
SELECT 
  COUNT(*) as owners_with_multiple_parcels,
  SUM(parcel_count) as total_parcels_owned_by_multi_owners,
  AVG(parcel_count) as avg_parcels_per_owner,
  MAX(parcel_count) as max_parcels_one_owner
FROM parcel_ownership_groups;

-- Sample owners with many parcels to understand adjacency potential
SELECT normalized_owner, parcel_count, total_acres
FROM parcel_ownership_groups
WHERE parcel_count BETWEEN 5 AND 20
ORDER BY parcel_count DESC
LIMIT 10;

-- Check if parcels table has spatial index
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'parcels' AND indexname LIKE '%geom%';
