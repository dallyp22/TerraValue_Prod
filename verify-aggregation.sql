-- Check completed counties
SELECT county, COUNT(*) as clusters, SUM(parcel_count) as parcels
FROM parcel_aggregated
GROUP BY county
ORDER BY county
LIMIT 15;
