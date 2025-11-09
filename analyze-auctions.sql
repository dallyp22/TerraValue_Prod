-- Total auctions
SELECT COUNT(*) as total_auctions FROM auctions;

-- Auctions without coordinates
SELECT COUNT(*) as missing_coords 
FROM auctions 
WHERE latitude IS NULL OR longitude IS NULL;

-- Auctions with coordinates
SELECT COUNT(*) as with_coords 
FROM auctions 
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Sample auctions without coordinates
SELECT id, title, address, county, state, description
FROM auctions
WHERE (latitude IS NULL OR longitude IS NULL)
LIMIT 5;
