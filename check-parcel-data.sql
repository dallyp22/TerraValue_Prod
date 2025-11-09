-- Check if parcels table has data
SELECT 'Parcels Table' as check_name, COUNT(*) as count FROM parcels;

-- Check if ownership groups table has data
SELECT 'Ownership Groups' as check_name, COUNT(*) as count FROM parcel_ownership_groups;

-- Check if parcels have geometries
SELECT 'Parcels with Geometry' as check_name, COUNT(*) as count 
FROM parcels WHERE geom IS NOT NULL;

-- Check if ownership groups have geometries
SELECT 'Ownership Groups with Geometry' as check_name, COUNT(*) as count 
FROM parcel_ownership_groups WHERE combined_geom IS NOT NULL;

-- Sample a parcel to see its data
SELECT id, county_name, parcel_number, deed_holder, 
       ST_AsText(ST_Envelope(geom)) as bbox
FROM parcels 
WHERE geom IS NOT NULL 
LIMIT 1;
