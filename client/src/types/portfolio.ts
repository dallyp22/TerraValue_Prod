export type PinCategory = 'high-priority' | 'interested' | 'watching' | 'purchased' | 'passed';

export interface PinCategoryConfig {
  id: PinCategory;
  label: string;
  color: string;
}

export const PIN_CATEGORIES: PinCategoryConfig[] = [
  { id: 'high-priority', label: 'High Priority', color: '#ef4444' },
  { id: 'interested', label: 'Interested', color: '#f59e0b' },
  { id: 'watching', label: 'Watching', color: '#3b82f6' },
  { id: 'purchased', label: 'Purchased', color: '#10b981' },
  { id: 'passed', label: 'Passed', color: '#6b7280' },
];

export interface FarmPin {
  id: string;
  lng: number;
  lat: number;
  category: PinCategory;
  name: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface PortfolioData {
  pins: FarmPin[];
  version: 1;
}
