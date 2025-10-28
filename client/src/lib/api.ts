// API utility functions
import { API_BASE_URL } from '../config';

export function getApiUrl(path: string): string {
  // Remove leading slash if present
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${API_BASE_URL}/${cleanPath}`;
}

export async function fetchApi(path: string, options?: RequestInit) {
  const url = getApiUrl(path);
  const response = await fetch(url, options);
  return response;
}

