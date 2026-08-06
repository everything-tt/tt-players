import type { ClassValue } from 'clsx';
import { cn } from '../lib/utils';

/** @deprecated Prefer `cn`; retained so existing TT components keep a stable API. */
export function cx(...inputs: ClassValue[]): string {
  return cn(...inputs);
}
