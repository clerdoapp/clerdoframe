import { LogIn, LogOut, Route, Sparkle, type LucideIcon } from 'lucide-react';
import type { AnimClass } from '../../model/deck';

export const CLASS_ICON: Record<AnimClass, LucideIcon> = { entr: LogIn, emph: Sparkle, exit: LogOut, path: Route };
export const CLASS_LABEL: Record<AnimClass, string> = { entr: 'Entrance', emph: 'Emphasis', exit: 'Exit', path: 'Motion path' };
