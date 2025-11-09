-- Verify the 3 auctions we just geocoded
SELECT id, title, latitude, longitude, county
FROM auctions
WHERE title IN (
  '290.35 Acres in Osceola County, IA',
  'D-Double-U Land Auction',
  '80 Acres m/l in O''Brien County, IA'
);

-- Current coverage
SELECT 
  COUNT(*) as total_active,
  COUNT(CASE WHEN latitude IS NOT NULL THEN 1 END) as with_coords
FROM auctions
WHERE (status IS NULL OR status != 'excluded');
