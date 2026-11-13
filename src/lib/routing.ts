import type { ViewId } from '../db/schema';

export interface RouteMatch {
  normalizedPath: string;
  isValid: boolean;
  view: ViewId | null;
  sectionHash?: string;
}

const VIEW_ROUTES: Record<string, ViewId> = {
  '/my-day': 'my_day',
  '/my_day': 'my_day',
  '/board': 'board',
  '/list': 'list',
  '/calendar': 'calendar',
  '/matrix': 'matrix',
  '/insights': 'insights',
};

const VALID_NON_VIEW_ROUTES = new Set(['/', '/pricing']);

export function resolveAppRoute(pathname: string): RouteMatch {
  const normalizedPath = (pathname || '/').trim().toLowerCase().replace(/\/+$/, '') || '/';

  if (normalizedPath in VIEW_ROUTES) {
    return {
      normalizedPath,
      isValid: true,
      view: VIEW_ROUTES[normalizedPath],
    };
  }

  if (VALID_NON_VIEW_ROUTES.has(normalizedPath)) {
    return {
      normalizedPath,
      isValid: true,
      view: null,
      sectionHash: normalizedPath === '/pricing' ? 'pricing' : undefined,
    };
  }

  return {
    normalizedPath,
    isValid: false,
    view: null,
  };
}
