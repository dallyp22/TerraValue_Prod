-- Check updated auctions
SELECT id, title, latitude, longitude, county, status
FROM auctions
WHERE (latitude IS NOT NULL AND longitude IS NOT NULL)
  AND id IN (SELECT DISTINCT id FROM (
    SELECT id FROM auctions 
    ORDER BY updated_at DESC 
    LIMIT 50
  ) recent)
ORDER BY updated_at DESC
LIMIT 10;

-- Count by status
SELECT status, COUNT(*) as count
FROM auctions
GROUP BY status;

-- Overall coordinate coverage
SELECT 
  COUNT(*) as total,
  COUNT(CASE WHEN latitude IS NOT NULL THEN 1 END) as with_coords,
  COUNT(CASE WHEN status = 'excluded' THEN 1 END) as excluded
FROM auctions;
