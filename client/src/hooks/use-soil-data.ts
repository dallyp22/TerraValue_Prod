import { useQuery } from '@tanstack/react-query';

export interface SoilComponentData {
  soilSeries: string;
  slope: number | null;
  slopeLow: number | null;
  slopeHigh: number | null;
  drainage: string | null;
  hydrologicGroup: string | null;
  farmlandClass: string | null;
  percentage: number | null;
  taxonomicOrder: string | null;
}

export interface SurfaceHorizonData {
  sand: number | null;
  silt: number | null;
  clay: number | null;
  ph: number | null;
  organicMatter: number | null;
  depth: number | null;
}

export interface SoilDataResponse {
  soilSeries: string;
  slope: number | null;
  drainage: string | null;
  hydrologicGroup: string | null;
  farmlandClass: string | null;
  texture: SurfaceHorizonData | null;
  components?: SoilComponentData[];
}

/**
 * Hook to fetch soil data by map unit key
 */
export function useSoilData(mukey: string | null | undefined) {
  return useQuery<{success: boolean; data: SoilDataResponse} | null>({
    queryKey: ['soil-data', mukey],
    queryFn: async () => {
      if (!mukey) return null;
      
      const response = await fetch(`/api/soil/mukey/${mukey}`);
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error('Failed to fetch soil data');
      }
      
      return response.json();
    },
    enabled: !!mukey,
    staleTime: 1000 * 60 * 60, // 1 hour - soil data doesn't change often
    retry: 1,
  });
}

/**
 * Hook to fetch all soil series
 */
export function useSoilSeriesList() {
  return useQuery<string[]>({
    queryKey: ['soil-series-list'],
    queryFn: async () => {
      const response = await fetch('/api/soil/series');
      if (!response.ok) {
        throw new Error('Failed to fetch soil series list');
      }
      
      const data = await response.json();
      return data.series || [];
    },
    staleTime: 1000 * 60 * 60 * 24, // 24 hours - list rarely changes
  });
}

/**
 * Hook to search soil components
 */
export function useSearchSoilComponents(criteria: {
  minSlope?: number;
  maxSlope?: number;
  drainage?: string;
  hydrologicGroup?: string;
  soilSeries?: string;
  farmlandClass?: string;
}) {
  return useQuery<SoilComponentData[]>({
    queryKey: ['soil-search', criteria],
    queryFn: async () => {
      const response = await fetch('/api/soil/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(criteria),
      });
      
      if (!response.ok) {
        throw new Error('Failed to search soil components');
      }
      
      const data = await response.json();
      return data.results || [];
    },
    enabled: Object.keys(criteria).length > 0,
    staleTime: 1000 * 60 * 60, // 1 hour
  });
}

