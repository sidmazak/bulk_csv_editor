import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Normalizes a location string to lowercase kebab-case
 * - Removes Unicode diacritics (accents)
 * - Converts to lowercase
 * - Replaces spaces with hyphens (but keeps camelCase words together)
 * - Removes special characters
 * - Removes multiple consecutive hyphens
 * - Trims hyphens from start/end
 * 
 * Examples:
 * - "SuZhou" → "suzhou" (camelCase stays together)
 * - "São Paulo" → "sao-paulo" (space becomes hyphen, diacritics removed)
 * - "München" → "munchen" (diacritics removed)
 * - "New York" → "new-york" (space becomes hyphen)
 */
export function normalizeToKebabCase(input: string): string {
  if (!input) return '';
  
  return input
    // Normalize Unicode to NFD (decompose characters with diacritics)
    .normalize('NFD')
    // Remove diacritics (accents) - keep only base characters
    .replace(/[\u0300-\u036f]/g, '')
    // Convert to lowercase
    .toLowerCase()
    // Replace spaces with hyphens (but not camelCase - spaces only)
    .replace(/\s+/g, '-')
    // Remove special characters (keep only alphanumeric and hyphens)
    .replace(/[^\w-]/g, '')
    // Remove multiple consecutive hyphens
    .replace(/-+/g, '-')
    // Trim hyphens from start and end
    .replace(/^-+|-+$/g, '');
}
