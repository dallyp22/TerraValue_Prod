// Find tile coordinates that cover Iowa
// Iowa center: approximately 42°N, 93.5°W

function lon2tile(lon, zoom) {
  return Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
}

function lat2tile(lat, zoom) {
  return Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
}

// Des Moines, IA coordinates
const lat = 41.6;
const lon = -93.6;

console.log("Tiles that cover Des Moines, Iowa:");
console.log("===================================");

for (let zoom of [10, 12, 14, 16]) {
  const x = lon2tile(lon, zoom);
  const y = lat2tile(lat, zoom);
  console.log(`Zoom ${zoom}: /${zoom}/${x}/${y}`);
}

