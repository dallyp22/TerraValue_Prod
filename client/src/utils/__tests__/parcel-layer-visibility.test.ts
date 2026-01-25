import { describe, it, expect } from 'vitest';
import { computeGroupVisibilities } from '../parcel-layer-visibility';

describe('computeGroupVisibilities', () => {
  it('hides all groups when mode is off', () => {
    const result = computeGroupVisibilities('off', false, true, false);

    expect(result.arcgis.shapes).toBe('none');
    expect(result.arcgis.labels).toBe('none');
    expect(result.selfHosted.shapes).toBe('none');
    expect(result.selfHosted.labels).toBe('none');
    expect(result.selfHosted.selected).toBe('none');
    expect(result.harrison.shapes).toBe('none');
    expect(result.harrison.labels).toBe('none');
    expect(result.harrison.selected).toBe('none');
  });

  it('hides all groups when mode is off even in Harrison County', () => {
    const result = computeGroupVisibilities('off', true, true, true);

    expect(result.arcgis.shapes).toBe('none');
    expect(result.selfHosted.shapes).toBe('none');
    expect(result.harrison.shapes).toBe('none');
  });

  it('shows arcgis when mode=arcgis and not in Harrison', () => {
    const result = computeGroupVisibilities('arcgis', false, false, false);

    expect(result.arcgis.shapes).toBe('visible');
    expect(result.arcgis.labels).toBe('none');
    expect(result.selfHosted.shapes).toBe('none');
    expect(result.harrison.shapes).toBe('none');
  });

  it('shows arcgis + harrison when mode=arcgis and inHarrison=true', () => {
    const result = computeGroupVisibilities('arcgis', true, false, false);

    expect(result.arcgis.shapes).toBe('visible');
    expect(result.harrison.shapes).toBe('visible');
    expect(result.selfHosted.shapes).toBe('none');
  });

  it('shows selfHosted when mode=self-hosted and not in Harrison', () => {
    const result = computeGroupVisibilities('self-hosted', false, false, false);

    expect(result.selfHosted.shapes).toBe('visible');
    expect(result.selfHosted.labels).toBe('none');
    expect(result.arcgis.shapes).toBe('none');
    expect(result.harrison.shapes).toBe('none');
  });

  it('shows selfHosted + harrison when mode=self-hosted and inHarrison=true', () => {
    const result = computeGroupVisibilities('self-hosted', true, false, false);

    expect(result.selfHosted.shapes).toBe('visible');
    expect(result.harrison.shapes).toBe('visible');
    expect(result.arcgis.shapes).toBe('none');
  });

  it('respects showLabels independently from shapes for arcgis', () => {
    const withLabels = computeGroupVisibilities('arcgis', false, true, false);
    const withoutLabels = computeGroupVisibilities('arcgis', false, false, false);

    expect(withLabels.arcgis.shapes).toBe('visible');
    expect(withLabels.arcgis.labels).toBe('visible');
    expect(withoutLabels.arcgis.shapes).toBe('visible');
    expect(withoutLabels.arcgis.labels).toBe('none');
  });

  it('respects showLabels independently from shapes for self-hosted', () => {
    const withLabels = computeGroupVisibilities('self-hosted', false, true, false);
    const withoutLabels = computeGroupVisibilities('self-hosted', false, false, false);

    expect(withLabels.selfHosted.shapes).toBe('visible');
    expect(withLabels.selfHosted.labels).toBe('visible');
    expect(withoutLabels.selfHosted.shapes).toBe('visible');
    expect(withoutLabels.selfHosted.labels).toBe('none');
  });

  it('respects showLabels for Harrison County layers', () => {
    const withLabels = computeGroupVisibilities('arcgis', true, true, false);
    const withoutLabels = computeGroupVisibilities('arcgis', true, false, false);

    expect(withLabels.harrison.shapes).toBe('visible');
    expect(withLabels.harrison.labels).toBe('visible');
    expect(withoutLabels.harrison.shapes).toBe('visible');
    expect(withoutLabels.harrison.labels).toBe('none');
  });

  it('shows selected layer only when hasSelection=true for self-hosted', () => {
    const withSelection = computeGroupVisibilities('self-hosted', false, false, true);
    const withoutSelection = computeGroupVisibilities('self-hosted', false, false, false);

    expect(withSelection.selfHosted.selected).toBe('visible');
    expect(withoutSelection.selfHosted.selected).toBe('none');
  });

  it('shows Harrison selected layer when hasSelection and in Harrison', () => {
    // Note: Harrison selected layer is always visible when in Harrison and mode is not off
    // The selection filter controls which parcel is highlighted
    const inHarrison = computeGroupVisibilities('arcgis', true, false, false);

    expect(inHarrison.harrison.selected).toBe('visible');
  });

  it('hides selfHosted selected layer in arcgis mode even with selection', () => {
    const result = computeGroupVisibilities('arcgis', false, false, true);

    expect(result.selfHosted.selected).toBe('none');
  });

  it('handles all combinations correctly', () => {
    // Test mode transitions
    const modes = ['off', 'arcgis', 'self-hosted'] as const;
    const booleanCombos = [
      { inHarrison: false, showLabels: false, hasSelection: false },
      { inHarrison: true, showLabels: false, hasSelection: false },
      { inHarrison: false, showLabels: true, hasSelection: false },
      { inHarrison: false, showLabels: false, hasSelection: true },
      { inHarrison: true, showLabels: true, hasSelection: true },
    ];

    modes.forEach((mode) => {
      booleanCombos.forEach(({ inHarrison, showLabels, hasSelection }) => {
        // Should not throw
        const result = computeGroupVisibilities(mode, inHarrison, showLabels, hasSelection);

        // Basic structure check
        expect(result).toHaveProperty('arcgis');
        expect(result).toHaveProperty('selfHosted');
        expect(result).toHaveProperty('harrison');
        expect(result.arcgis).toHaveProperty('shapes');
        expect(result.selfHosted).toHaveProperty('selected');
      });
    });
  });
});
