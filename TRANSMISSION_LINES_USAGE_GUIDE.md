# High Voltage Transmission Lines - User Guide

## Quick Start

The high voltage transmission lines feature adds multi-state electrical infrastructure data to your map, showing transmission lines from Kansas, Minnesota, Missouri, Nebraska, and South Dakota.

## How to Access

1. **Open the Application**
   - Navigate to your map application in the browser
   - Default URL: `http://localhost:5173` (development)

2. **Open the Sidebar**
   - Desktop: The sidebar is open by default on the left
   - Mobile/Tablet: Tap the hamburger menu (☰) in the top-left corner

3. **Find the Controls**
   - Scroll down in the sidebar to "Map Overlays"
   - Look for "⚡ HV Transmission Lines" section (orange-themed)

## Using the Filters

### Master Toggle
- **Toggle the main checkbox** to show/hide ALL transmission lines at once
- When unchecked, all transmission lines are hidden regardless of other settings

### Filter by State
When the master toggle is ON, you'll see state checkboxes:
- ☑ **Kansas** - Show/hide Kansas transmission lines
- ☑ **Minnesota** - Show/hide Minnesota transmission lines
- ☑ **Missouri** - Show/hide Missouri transmission lines
- ☑ **Nebraska** - Show/hide Nebraska transmission lines
- ☑ **South Dakota** - Show/hide South Dakota transmission lines

**Tip**: Uncheck all states except one to focus on a specific state's infrastructure.

### Filter by Voltage Level
Below the states, filter by voltage level (from highest to lowest):
- ☑ **345 kV** - Ultra-high voltage (darkest orange, thickest lines)
- ☑ **230 kV** - Very high voltage
- ☑ **161 kV** - High voltage
- ☑ **138 kV** - High voltage
- ☑ **115 kV** - Medium voltage
- ☑ **69 kV** - Lower voltage (lightest orange, thinnest lines)

**Tip**: Uncheck lower voltages to see only the major transmission corridors.

## Visual Guide

### Color Coding
Transmission lines are shown in **orange shades** (matching Iowa power lines):
- **Darker orange** = Higher voltage (more important infrastructure)
- **Lighter orange** = Lower voltage
- **Thicker lines** = Higher voltage
- **Thinner lines** = Lower voltage

### Legend
Check the bottom-left corner of the map for the legend:
- 🟠 Orange lines = Power & Transmission Lines (all states)
- Darker shades = Higher voltage

## Interacting with Transmission Lines

### Click for Details
1. Click on any transmission line (orange line on the map)
2. A popup will appear showing:
   - **State**: Which state the line is in
   - **Operator**: The utility company that operates it (e.g., Evergy, MidAmerican Energy)
   - **Voltage**: The voltage level in kV
   - **Circuits**: Number of electrical circuits (if available)
   - **Frequency**: Electrical frequency in Hz (typically 60 Hz)

### Hover Effects
- When you hover over a transmission line, your cursor will change to a pointer
- This indicates the line is clickable for more information

## Example Use Cases

### 1. Find High-Voltage Corridors
To see only the major transmission infrastructure:
1. Check **all states**
2. Uncheck **69 kV**, **115 kV**, **138 kV**
3. Keep only **345 kV**, **230 kV**, **161 kV** checked
4. The map now shows only the major power corridors

### 2. Compare States
To compare infrastructure between two states:
1. Check **only Kansas and Nebraska**
2. Uncheck all other states
3. Keep all voltages checked
4. Zoom out to see both states

### 3. Find Nearby Transmission
To find transmission near a property:
1. Navigate to your property on the map
2. Enable all transmission lines
3. Click nearby orange lines to see voltage and operator
4. Note the distance to high-voltage lines

### 4. Study a Specific State
To focus on one state:
1. Check **only one state** (e.g., Missouri)
2. Keep all voltages checked
3. Zoom to that state
4. Click lines to learn about operators

## Tips & Tricks

### Performance
- The transmission line data is large (47 MB total)
- Lines load once when the map initializes
- Toggling visibility is instant (no reloading)
- If the map feels slow, try unchecking some states or voltages

### Combining with Other Layers
The transmission lines work great with:
- **Substations** - See where transmission lines connect
- **Parcel Boundaries** - Check if transmission crosses your property
- **Land Auctions** - Identify properties near transmission corridors

### Mobile Use
- All controls work on mobile/tablet
- Use pinch-to-zoom to see line details
- Tap a line to see the popup
- Swipe to close the sidebar and see the full map

### Keyboard Users
- Tab through checkboxes
- Space to toggle checkboxes
- Escape to close popups

## Comparison: Power Lines vs. Transmission Lines

| Feature | Iowa Power Lines 🟠 | HV Transmission Lines 🟠 |
|---------|-------------------|------------------------|
| **Coverage** | Iowa only | 5 states (KS, MN, MO, NE, SD) |
| **Color** | Orange gradient | Orange gradient (same) |
| **Voltage Range** | 69-345 kV | 69-345 kV (includes 230 kV) |
| **Filtering** | By voltage only | By state AND voltage |
| **Data Source** | Iowa GeoJSON | State-specific GeoJSON |
| **Use Case** | Iowa-focused projects | Multi-state analysis |

## Troubleshooting

### Lines Not Showing
1. Check that **master toggle** is ON
2. Verify at least one **state** is checked
3. Verify at least one **voltage level** is checked
4. Try zooming out - you might be too zoomed in
5. Refresh the page if the data didn't load

### Popup Not Appearing
- Make sure you're clicking directly on the line (orange)
- Try zooming in closer
- Check that popups aren't disabled in your browser

### Slow Performance
- Uncheck states you don't need
- Uncheck lower voltage levels (69 kV, 115 kV)
- Close other browser tabs
- Disable other map layers temporarily

### Can't Find a State
The current implementation includes:
- Kansas (KS)
- Minnesota (MN)
- Missouri (MO)
- Nebraska (NE)
- South Dakota (SD)

Other states are not yet available.

## Advanced Usage

### Finding Transmission Near Auctions
1. Enable **Land Auctions** layer
2. Enable **HV Transmission Lines**
3. Click an auction marker
4. Look for orange lines nearby
5. Click lines to verify voltage and operator
6. Evaluate whether proximity affects value

### Buffering Transmission Lines
Currently, there's no automatic buffer tool, but you can:
1. Click a transmission line to see details
2. Manually measure distance using the map scale
3. Note high-voltage lines (345 kV, 230 kV) typically need larger buffers

### Export Considerations
- Transmission line data is public (OpenStreetMap)
- Attribution: "© OpenStreetMap contributors"
- Data licensed under ODbL (Open Database License)

## Support

For issues or feature requests:
1. Check the `TRANSMISSION_LINES_IMPLEMENTATION.md` file for technical details
2. Review the console for error messages (F12 in browser)
3. Verify all GeoJSON files are in `client/public/`

## What's Next?

Planned enhancements:
- [ ] More states (Iowa transmission separate from power lines)
- [ ] Operator filtering (show only specific utilities)
- [ ] Line measurement tools
- [ ] Buffer zone visualization
- [ ] Export filtered data
- [ ] Statistics (total miles, operators, etc.)

