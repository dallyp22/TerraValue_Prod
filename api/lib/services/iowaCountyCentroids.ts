/**
 * Iowa County Centroids
 * Center coordinates for all 99 Iowa counties
 * Used as fallback when specific addresses can't be geocoded
 */

export interface CountyCentroid {
  county: string;
  latitude: number;
  longitude: number;
}

export const iowaCountyCentroids: Record<string, CountyCentroid> = {
  'Adair': { county: 'Adair', latitude: 41.3308, longitude: -94.4708 },
  'Adams': { county: 'Adams', latitude: 41.0294, longitude: -94.6989 },
  'Allamakee': { county: 'Allamakee', latitude: 43.2841, longitude: -91.3780 },
  'Appanoose': { county: 'Appanoose', latitude: 40.7428, longitude: -92.8683 },
  'Audubon': { county: 'Audubon', latitude: 41.6844, longitude: -94.9056 },
  'Benton': { county: 'Benton', latitude: 42.0797, longitude: -92.0653 },
  'Black Hawk': { county: 'Black Hawk', latitude: 42.4697, longitude: -92.3096 },
  'Boone': { county: 'Boone', latitude: 42.0364, longitude: -93.9300 },
  'Bremer': { county: 'Bremer', latitude: 42.7747, longitude: -92.3177 },
  'Buchanan': { county: 'Buchanan', latitude: 42.4703, longitude: -91.8378 },
  'Buena Vista': { county: 'Buena Vista', latitude: 42.7319, longitude: -95.1517 },
  'Butler': { county: 'Butler', latitude: 42.7244, longitude: -92.7944 },
  'Calhoun': { county: 'Calhoun', latitude: 42.3797, longitude: -94.6331 },
  'Carroll': { county: 'Carroll', latitude: 42.0464, longitude: -94.8561 },
  'Cass': { county: 'Cass', latitude: 41.3108, longitude: -94.9444 },
  'Cedar': { county: 'Cedar', latitude: 41.7653, longitude: -91.1289 },
  'Cerro Gordo': { county: 'Cerro Gordo', latitude: 43.0778, longitude: -93.2556 },
  'Cherokee': { county: 'Cherokee', latitude: 42.7447, longitude: -95.6378 },
  'Chickasaw': { county: 'Chickasaw', latitude: 43.0650, longitude: -92.3189 },
  'Clarke': { county: 'Clarke', latitude: 40.9939, longitude: -93.7806 },
  'Clay': { county: 'Clay', latitude: 43.0844, longitude: -95.1511 },
  'Clayton': { county: 'Clayton', latitude: 42.8453, longitude: -91.3117 },
  'Clinton': { county: 'Clinton', latitude: 41.9311, longitude: -90.5331 },
  'Crawford': { county: 'Crawford', latitude: 42.0300, longitude: -95.3800 },
  'Dallas': { county: 'Dallas', latitude: 41.6847, longitude: -94.0500 },
  'Davis': { county: 'Davis', latitude: 40.7411, longitude: -92.4067 },
  'Decatur': { county: 'Decatur', latitude: 40.7389, longitude: -93.7856 },
  'Delaware': { county: 'Delaware', latitude: 42.4711, longitude: -91.3639 },
  'Des Moines': { county: 'Des Moines', latitude: 40.8206, longitude: -91.1050 },
  'Dickinson': { county: 'Dickinson', latitude: 43.3881, longitude: -95.1492 },
  'Dubuque': { county: 'Dubuque', latitude: 42.4511, longitude: -90.9350 },
  'Emmet': { county: 'Emmet', latitude: 43.3997, longitude: -94.6739 },
  'Fayette': { county: 'Fayette', latitude: 42.8408, longitude: -91.8022 },
  'Floyd': { county: 'Floyd', latitude: 43.0664, longitude: -92.7928 },
  'Franklin': { county: 'Franklin', latitude: 42.7267, longitude: -93.2617 },
  'Fremont': { county: 'Fremont', latitude: 40.7356, longitude: -95.6619 },
  'Greene': { county: 'Greene', latitude: 42.0358, longitude: -94.3881 },
  'Grundy': { county: 'Grundy', latitude: 42.4000, longitude: -92.7928 },
  'Guthrie': { county: 'Guthrie', latitude: 41.6800, longitude: -94.5025 },
  'Hamilton': { county: 'Hamilton', latitude: 42.3958, longitude: -93.7378 },
  'Hancock': { county: 'Hancock', latitude: 43.0775, longitude: -93.7336 },
  'Hardin': { county: 'Hardin', latitude: 42.3206, longitude: -93.2550 },
  'Harrison': { county: 'Harrison', latitude: 41.6864, longitude: -95.8178 },
  'Henry': { county: 'Henry', latitude: 41.0158, longitude: -91.5656 },
  'Howard': { county: 'Howard', latitude: 43.3561, longitude: -92.3133 },
  'Humboldt': { county: 'Humboldt', latitude: 42.7328, longitude: -94.1728 },
  'Ida': { county: 'Ida', latitude: 42.3444, longitude: -95.6344 },
  'Iowa': { county: 'Iowa', latitude: 41.6731, longitude: -92.0611 },
  'Jackson': { county: 'Jackson', latitude: 42.1428, longitude: -90.5833 },
  'Jasper': { county: 'Jasper', latitude: 41.6792, longitude: -93.0272 },
  'Jefferson': { county: 'Jefferson', latitude: 41.0306, longitude: -91.9550 },
  'Johnson': { county: 'Johnson', latitude: 41.6611, longitude: -91.5986 },
  'Jones': { county: 'Jones', latitude: 42.1411, longitude: -91.1200 },
  'Keokuk': { county: 'Keokuk', latitude: 41.3119, longitude: -92.1828 },
  'Kossuth': { county: 'Kossuth', latitude: 43.2069, longitude: -94.2133 },
  'Lee': { county: 'Lee', latitude: 40.6236, longitude: -91.5489 },
  'Linn': { county: 'Linn', latitude: 42.0783, longitude: -91.5989 },
  'Louisa': { county: 'Louisa', latitude: 41.2247, longitude: -91.2656 },
  'Lucas': { county: 'Lucas', latitude: 41.0294, longitude: -93.3072 },
  'Lyon': { county: 'Lyon', latitude: 43.3875, longitude: -96.2106 },
  'Madison': { county: 'Madison', latitude: 41.3281, longitude: -94.0139 },
  'Mahaska': { county: 'Mahaska', latitude: 41.3294, longitude: -92.6444 },
  'Marion': { county: 'Marion', latitude: 41.3144, longitude: -93.1133 },
  'Marshall': { county: 'Marshall', latitude: 42.0397, longitude: -92.9133 },
  'Mills': { county: 'Mills', latitude: 41.0258, longitude: -95.6344 },
  'Mitchell': { county: 'Mitchell', latitude: 43.3464, longitude: -92.7933 },
  'Monona': { county: 'Monona', latitude: 42.0297, longitude: -96.0294 },
  'Monroe': { county: 'Monroe', latitude: 41.0208, longitude: -92.8683 },
  'Montgomery': { county: 'Montgomery', latitude: 41.0281, longitude: -95.1517 },
  'Muscatine': { county: 'Muscatine', latitude: 41.4942, longitude: -91.1033 },
  "O'Brien": { county: "O'Brien", latitude: 43.0883, longitude: -95.6289 },
  'Osceola': { county: 'Osceola', latitude: 43.3894, longitude: -95.6306 },
  'Page': { county: 'Page', latitude: 40.7353, longitude: -95.1708 },
  'Palo Alto': { county: 'Palo Alto', latitude: 43.0758, longitude: -94.6753 },
  'Plymouth': { county: 'Plymouth', latitude: 42.7317, longitude: -96.1914 },
  'Pocahontas': { county: 'Pocahontas', latitude: 42.7342, longitude: -94.6711 },
  'Polk': { county: 'Polk', latitude: 41.6736, longitude: -93.5656 },
  'Pottawattamie': { county: 'Pottawattamie', latitude: 41.3136, longitude: -95.6378 },
  'Poweshiek': { county: 'Poweshiek', latitude: 41.6842, longitude: -92.5333 },
  'Ringgold': { county: 'Ringgold', latitude: 40.7347, longitude: -94.2528 },
  'Sac': { county: 'Sac', latitude: 42.3781, longitude: -95.1478 },
  'Scott': { county: 'Scott', latitude: 41.6106, longitude: -90.6856 },
  'Shelby': { county: 'Shelby', latitude: 41.5139, longitude: -95.3800 },
  'Sioux': { county: 'Sioux', latitude: 43.0900, longitude: -96.1722 },
  'Story': { county: 'Story', latitude: 42.0378, longitude: -93.4667 },
  'Tama': { county: 'Tama', latitude: 42.0756, longitude: -92.5767 },
  'Taylor': { county: 'Taylor', latitude: 40.7350, longitude: -94.7056 },
  'Union': { county: 'Union', latitude: 41.0275, longitude: -94.2444 },
  'Van Buren': { county: 'Van Buren', latitude: 40.7453, longitude: -92.0306 },
  'Wapello': { county: 'Wapello', latitude: 41.0153, longitude: -92.4022 },
  'Warren': { county: 'Warren', latitude: 41.3247, longitude: -93.5656 },
  'Washington': { county: 'Washington', latitude: 41.3222, longitude: -91.7256 },
  'Wayne': { county: 'Wayne', latitude: 40.7450, longitude: -93.3111 },
  'Webster': { county: 'Webster', latitude: 42.4261, longitude: -94.1733 },
  'Winnebago': { county: 'Winnebago', latitude: 43.3781, longitude: -93.7283 },
  'Winneshiek': { county: 'Winneshiek', latitude: 43.2819, longitude: -91.8606 },
  'Woodbury': { county: 'Woodbury', latitude: 42.4433, longitude: -96.0833 },
  'Worth': { county: 'Worth', latitude: 43.3783, longitude: -93.2583 },
  'Wright': { county: 'Wright', latitude: 42.7281, longitude: -93.7400 }
};

/**
 * Get county centroid coordinates
 * Returns null if county not found or not in Iowa
 */
export function getCountyCentroid(countyName: string): CountyCentroid | null {
  if (!countyName) return null;
  
  // Normalize county name (remove " County" suffix, trim, title case)
  const normalized = countyName
    .replace(/\s+County$/i, '')
    .trim();
  
  return iowaCountyCentroids[normalized] || null;
}

/**
 * Get all Iowa county names
 */
export function getAllIowaCounties(): string[] {
  return Object.keys(iowaCountyCentroids).sort();
}

