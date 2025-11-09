-- Test if we can generate a tile for Iowa
SELECT ST_AsMVT(tile, 'parcels', 4096, 'geom')
FROM (
  SELECT 
    deed_holder as owner,
    parcel_number,
    county_name as county,
    ST_AsMVTGeom(geom, ST_TileEnvelope(10, 263, 384), 4096, 256, true) as geom
  FROM parcels
  WHERE geom && ST_TileEnvelope(10, 263, 384)
  LIMIT 100
) as tile
WHERE geom IS NOT NULL;
