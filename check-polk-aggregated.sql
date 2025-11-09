-- Check if Polk County data exists in parcel_aggregated
SELECT COUNT(*) as aggregated_clusters
FROM parcel_aggregated 
WHERE county = 'POLK';

-- Sample some aggregated parcels
SELECT normalized_owner, parcel_count, total_acres
FROM parcel_aggregated
WHERE county = 'POLK'
ORDER BY parcel_count DESC
LIMIT 10;

-- Check if geometries exist
SELECT COUNT(*) as clusters_with_geometry
FROM parcel_aggregated
WHERE county = 'POLK' AND geom IS NOT NULL;
