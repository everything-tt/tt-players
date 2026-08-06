import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Canonical shadcn-compatible class composer.
 *
 * `clsx` handles conditional values while `tailwind-merge` prevents generated
 * utility conflicts. Existing TT class hooks remain ordinary strings and pass
 * through untouched.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
