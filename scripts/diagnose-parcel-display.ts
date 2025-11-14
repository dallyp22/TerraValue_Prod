/**
 * Diagnostic script to check why parcels aren't displaying
 * Run in browser console by pasting this code
 */

export function diagnoseParcels() {
  console.log('🔍 AGGREGATED PARCELS DIAGNOSTIC');
  console.log('='.repeat(70));
  console.log('');

  // @ts-ignore - accessing global map
  const map = window.map;
  
  if (!map) {
    console.error('❌ Map object not found on window!');
    console.log('   The map instance might not be exposed globally.');
    return;
  }

  console.log('✅ Map instance found\n');

  // Check 1: Vector tile source
  console.log('1️⃣  Checking Vector Tile Source...');
  const source = map.getSource('parcels-vector');
  if (source) {
    console.log('   ✅ Source "parcels-vector" exists');
    console.log('   Type:', source.type);
    // @ts-ignore
    console.log('   Tiles:', source.tiles);
  } else {
    console.error('   ❌ Source "parcels-vector" NOT FOUND!');
    console.log('   Available sources:', Object.keys(map.style.sourceCaches));
  }
  console.log('');

  // Check 2: Ownership layers
  console.log('2️⃣  Checking Ownership Layers...');
  const layers = ['ownership-fill', 'ownership-outline', 'ownership-labels'];
  
  layers.forEach(layerId => {
    const layer = map.getLayer(layerId);
    if (layer) {
      const visibility = map.getLayoutProperty(layerId, 'visibility');
      const sourceLayer = layer.sourceLayer;
      console.log(`   ✅ ${layerId}:`);
      console.log(`      Visibility: ${visibility}`);
      console.log(`      Source: ${layer.source}`);
      console.log(`      Source-layer: ${sourceLayer}`);
    } else {
      console.error(`   ❌ ${layerId} NOT FOUND!`);
    }
  });
  console.log('');

  // Check 3: Current map position
  console.log('3️⃣  Checking Map Position...');
  const center = map.getCenter();
  const zoom = map.getZoom();
  console.log(`   Center: ${center.lng.toFixed(4)}, ${center.lat.toFixed(4)}`);
  console.log(`   Zoom: ${zoom.toFixed(2)}`);
  
  // Harrison County bounds check
  const harrisonBounds = {
    west: -96.137,
    east: -95.498,
    south: 41.506,
    north: 41.866
  };
  
  const inHarrison = center.lng >= harrisonBounds.west && 
         center.lng <= harrisonBounds.east && 
         center.lat >= harrisonBounds.south && 
         center.lat <= harrisonBounds.north;
  
  if (inHarrison) {
    console.warn('   ⚠️  You are in HARRISON COUNTY - aggregated parcels are disabled here!');
    console.log('   Try panning to another county (e.g., POLK, LINN)');
  } else {
    console.log('   ✅ Not in Harrison County - parcels should be visible');
  }
  console.log('');

  // Check 4: Rendered features
  console.log('4️⃣  Checking Rendered Features...');
  const ownershipFeatures = map.queryRenderedFeatures({ layers: ['ownership-fill', 'ownership-outline'] });
  console.log(`   Ownership features visible: ${ownershipFeatures.length}`);
  
  if (ownershipFeatures.length > 0) {
    console.log('   ✅ Parcels are rendering!');
    const sample = ownershipFeatures[0].properties;
    console.log('   Sample parcel:');
    console.log(`      Owner: ${sample.owner}`);
    console.log(`      Parcels: ${sample.parcel_count}`);
    console.log(`      Acres: ${sample.acres}`);
  } else {
    console.warn('   ⚠️  No ownership features currently rendered');
    console.log('   This could mean:');
    console.log('      - Layers are hidden');
    console.log('      - No tiles loaded yet');
    console.log('      - Zoom level too low (<10)');
  }
  console.log('');

  // Check 5: Network requests
  console.log('5️⃣  Next Steps...');
  console.log('   1. Check Network tab for tile requests:');
  console.log('      Look for: /api/parcels/tiles/*/mvt');
  console.log('   2. If you see 200 OK but no parcels: Layer rendering issue');
  console.log('   3. If you see 204 No Content: No data in that tile area');
  console.log('   4. If you see 404/500: API endpoint issue');
  console.log('');
  console.log('='.repeat(70));
  console.log('');
  console.log('💡 Quick fixes to try:');
  console.log('   1. Pan to Des Moines area (POLK County)');
  console.log('   2. Set zoom to 11-13');
  console.log('   3. Toggle parcels OFF then ON');
  console.log('   4. Check that toggle is ON in left sidebar');
}

// For browser console usage
console.log('📋 Paste this in console to run diagnostics:');
console.log('diagnoseParcels()');

