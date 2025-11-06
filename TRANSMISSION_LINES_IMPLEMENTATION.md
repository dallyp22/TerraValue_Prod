# High Voltage Transmission Lines Feature

## Overview
Successfully integrated high voltage transmission line data from 5 states (Kansas, Minnesota, Missouri, Nebraska, and South Dakota) into the map application with comprehensive filtering capabilities by both state and voltage level.

## Implementation Summary

### 1. Data Files Added
Copied 5 GeoJSON files to `client/public/`:
- `KS_HighVtransmission.geojson` (6.9 MB)
- `MN_HighVtransmission.geojson` (13 MB)
- `MO_HighVtransmission.geojson` (9.5 MB)
- `NE_HighVtransmission.geojson` (6.6 MB)
- `SD_HighVtransmission.geojson` (11 MB)

### 2. Files Modified

#### `client/src/components/LeftSidebar.tsx`
- **Updated `MapOverlays` interface** to include:
  - `showTransmissionLines: boolean` - Master toggle for all transmission lines
  - `transmissionLineStates` - Object with toggles for each state (kansas, minnesota, missouri, nebraska, southDakota)
  - `transmissionLineVoltages` - Object with toggles for each voltage level (345kV, 230kV, 161kV, 138kV, 115kV, 69kV)
- **Added UI Controls** - New collapsible section titled "⚡ HV Transmission Lines" with:
  - State filter checkboxes (Kansas, Minnesota, Missouri, Nebraska, South Dakota)
  - Voltage level filter checkboxes (345kV, 230kV, 161kV, 138kV, 115kV, 69kV)
  - Orange-themed border styling matching Iowa power lines

#### `client/src/components/MapCentricHome.tsx`
- **Updated initial state** for `mapOverlays` to include default values:
  - All transmission lines enabled by default
  - All states enabled by default
  - All voltage levels enabled by default
- **Passed new props** to `EnhancedMap` component:
  - `showTransmissionLines`
  - `transmissionLineStates`
  - `transmissionLineVoltages`

#### `client/src/components/EnhancedMap.tsx`
- **Updated `EnhancedMapProps` interface** to include the new transmission line props
- **Added data sources** for each state's transmission lines:
  - `transmission-kansas`
  - `transmission-minnesota`
  - `transmission-missouri`
  - `transmission-nebraska`
  - `transmission-southdakota`
- **Created layer system** with 30 total layers (5 states × 6 voltage levels):
  - Dynamic layer IDs: `transmission-{state}-{voltage}kv`
  - Example: `transmission-kansas-345kv`, `transmission-minnesota-115kv`
- **Implemented color-coding** (orange gradient by voltage, matching Iowa power lines):
  - 345 kV: `#c2410c` (darkest orange, 3.5px width)
  - 230 kV: `#d97706` (dark orange, 3px width)
  - 161 kV: `#ea580c` (medium-dark orange, 2.5px width)
  - 138 kV: `#f97316` (medium orange, 2px width)
  - 115 kV: `#fb923c` (light orange, 1.5px width)
  - 69 kV: `#fdba74` (lightest orange, 1px width)
- **Added interactive popups** showing:
  - State name
  - Operator
  - Voltage level (kV)
  - Number of circuits (if available)
  - Frequency (if available)
- **Implemented visibility controls** via useEffect hook:
  - Toggles based on master switch (`showTransmissionLines`)
  - Per-state filtering
  - Per-voltage filtering
  - Layers only visible when all three conditions are true

#### `client/src/components/MapControls.tsx`
- **Updated legend** to include:
  - Orange line indicator for "Power & Transmission Lines"
  - Added "Darker = Higher Voltage" hint

## Features

### User Controls
1. **Master Toggle**: Turn all transmission lines on/off
2. **State Filtering**: Toggle individual states independently
3. **Voltage Filtering**: Toggle voltage levels (345kV down to 69kV)
4. **Interactive Popups**: Click any transmission line to see details
5. **Unified Color Scheme**: Orange gradient matches Iowa power lines for consistency

### Data Handling
- Voltage data parsed from GeoJSON properties
- Supports multiple voltage formats in the data (e.g., "115000", "115000;69000")
- Filters handle voltage variations gracefully

### Visual Design
- Color gradient from dark orange (high voltage) to light orange (low voltage)
- Line width scales with voltage level (thicker = higher voltage)
- Smooth opacity variations for visual hierarchy
- Matches existing Iowa power lines for unified appearance

## Technical Details

### Layer Naming Convention
```
transmission-{stateid}-{voltage}kv
```
Examples:
- `transmission-kansas-345kv`
- `transmission-minnesota-161kv`
- `transmission-southdakota-69kv`

### Voltage Filtering Logic
Uses MapLibre GL filter expressions:
```javascript
filter: ['any',
  ['==', ['get', 'voltage'], '345000'],
  ['in', '345000', ['get', 'voltage']]
]
```
This handles both single voltages and multi-value strings (e.g., "115000;69000").

### Performance
- 30 separate layers for fine-grained control
- Efficient visibility toggling without data reloading
- GeoJSON sources loaded once at map initialization

## Usage

### For Users
1. Open the map application
2. Open the left sidebar (hamburger menu on mobile)
3. Scroll to "Map Overlays" section
4. Find "⚡ HV Transmission Lines" section
5. Toggle master switch to show/hide all transmission lines
6. When enabled, use state checkboxes to filter by state
7. Use voltage checkboxes to filter by voltage level
8. Click any transmission line on the map to see details

### For Developers
All transmission line code follows the existing pattern:
- State management in `MapCentricHome.tsx`
- UI controls in `LeftSidebar.tsx`
- Map rendering in `EnhancedMap.tsx`
- Toggle visibility with standard React hooks

## Testing Checklist
- [x] GeoJSON files copied to public directory
- [x] No TypeScript/linting errors
- [x] Interface definitions updated
- [x] Default values set correctly
- [x] Props passed through component tree
- [x] Map layers created dynamically
- [x] Visibility controls working
- [x] Legend updated
- [x] Interactive popups functional
- [x] Hover cursors working

## Future Enhancements
Potential improvements:
1. Add operator filtering (e.g., show only Evergy lines)
2. Add search/filter by line ID or properties
3. Implement line measurement tool
4. Add buffer zone visualization
5. Display total line length statistics
6. Export filtered transmission lines to GeoJSON
7. Add more states as data becomes available

## Files Summary
**New Files**: 5 GeoJSON files in `client/public/`  
**Modified Files**: 4 TypeScript components  
**Lines Added**: ~400 lines of code  
**No Breaking Changes**: All existing functionality preserved

