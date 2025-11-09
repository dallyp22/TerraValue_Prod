-- Check how many auctions lack coordinates
SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN latitude IS NOT NULL THEN 1 ELSE 0 END) as with_coords,
  SUM(CASE WHEN latitude IS NULL THEN 1 ELSE 0 END) as without_coords
FROM auctions;

-- Check what data we have for auctions without coords
SELECT 
  id, title, address, county, state, source_website,
  CASE 
    WHEN address IS NOT NULL THEN 'Has Address'
    WHEN county IS NOT NULL THEN 'Has County Only'
    ELSE 'No Location Data'
  END as location_data_available
FROM auctions
WHERE latitude IS NULL
LIMIT 10;
