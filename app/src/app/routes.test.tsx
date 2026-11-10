import type { ComponentType } from 'react';
import { describe, expect, it } from 'vitest';
import type { RouteObject } from 'react-router';
import { routes } from './routes';

const everyRoute = (list: RouteObject[]): RouteObject[] => list.flatMap((r) => [r, ...everyRoute(r.children ?? [])]);

// Pages named by an id that don't have to start over for each one, and why not.
const NEED_NOT: Record<string, string> = {
  'proofs/:id': 'a redirect to the proof’s deal: nothing is typed or opened on it',
  'messages/:id': 'its list stays put from one conversation to the next; what’s typed is kept per conversation (lib/drafts.ts)',
};

describe('pages with an id in their address', () => {
  it('start over for each offer, deal or creator, or are listed here with the reason they needn’t', async () => {
    const byId = everyRoute(routes).filter((r) => r.path?.includes(':'));
    // a new page of this kind belongs in this list, and then either gets its `about` in routes.tsx or a reason above
    expect(byId.map((r) => r.path).sort()).toEqual(['c/:handle', 'deals/:id', 'messages/:id', 'offers/:id', 'proofs/:id']);
    for (const route of byId) {
      const { Component } = await (route.lazy as () => Promise<{ Component: ComponentType }>)();
      const startsOver = Component.name === 'PageAboutOneThing';
      expect([route.path, startsOver]).toEqual([route.path, !(route.path! in NEED_NOT)]);
    }
  });
});
