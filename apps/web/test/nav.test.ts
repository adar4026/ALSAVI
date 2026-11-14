import { describe, expect, it } from 'vitest';
import {
  hashForRoute,
  hashForView,
  NAV_ITEMS,
  routeFromHash,
  sameRoute,
  urlForRoute,
  urlForView,
  viewFromHash,
  type Route,
  type View,
} from '../src/nav';

const loc = (hash: string) => ({ pathname: '/ALSAVI/', search: '', hash });

describe('NAV_ITEMS', () => {
  it('four sections in the agreed order', () => {
    expect(NAV_ITEMS.map((i) => [i.view, i.label])).toEqual([
      ['home', 'Главная'],
      ['cards', 'Карточки'],
      ['stats', 'Статистика'],
      ['profile', 'Профиль'],
    ]);
  });
});

describe('viewFromHash / hashForView', () => {
  it('every section round-trips through its address', () => {
    for (const { view } of NAV_ITEMS) {
      expect(viewFromHash(hashForView(view))).toBe(view);
    }
  });

  it('home has no hash', () => {
    expect(hashForView('home')).toBe('');
    for (const h of ['', '#', '#/', '#/home']) expect(viewFromHash(h)).toBe('home');
  });

  it('tolerates a missing slash, a trailing slash and capitals', () => {
    expect(viewFromHash('#stats')).toBe('stats');
    expect(viewFromHash('#/stats/')).toBe('stats');
    expect(viewFromHash('#/Profile')).toBe('profile');
  });

  it('anything unknown opens the home screen', () => {
    for (const h of ['#/settings', '#/session', '#top', '#/stats/123', '#/cards/a/b', '#/cards/%20x']) {
      expect(viewFromHash(h)).toBe('home');
    }
  });

  it('a card sub-address belongs to "Карточки"', () => {
    expect(viewFromHash('#/cards/new')).toBe('cards');
    expect(viewFromHash('#/cards/0f8e6a1c-6b0e-4b6c-9a51-2d1f0e9c7b11')).toBe('cards');
  });
});

describe('urlForView', () => {
  it('keeps path and query, swaps only the hash', () => {
    expect(urlForView('stats', { pathname: '/ALSAVI/', search: '?x=1', hash: '' })).toBe('/ALSAVI/?x=1#/stats');
    expect(urlForView('home', loc('#/cards'))).toBe('/ALSAVI/');
  });

  it('adds no history entry when the address is already right', () => {
    const cases: Array<[View, string]> = [
      ['home', ''],
      ['cards', '#/cards'],
      ['stats', '#/stats'],
      ['profile', '#/profile'],
    ];
    for (const [view, hash] of cases) expect(urlForView(view, loc(hash))).toBeNull();
  });

  it('normalises an equivalent but different address', () => {
    expect(urlForView('home', loc('#/'))).toBe('/ALSAVI/');
    expect(urlForView('stats', loc('#stats'))).toBe('/ALSAVI/#/stats');
  });
});

describe('card sub-addresses (TASK_037)', () => {
  const id = '0f8e6a1c-6b0e-4b6c-9a51-2d1f0e9c7b11';

  it('parses the new-word form and a note id', () => {
    expect(routeFromHash('#/cards/new')).toEqual({ view: 'cards', card: { kind: 'new' } });
    expect(routeFromHash(`#/cards/${id}`)).toEqual({ view: 'cards', card: { kind: 'note', id } });
    expect(routeFromHash('#/cards')).toEqual({ view: 'cards' });
  });

  it('normalises like the sections: slash, trailing slash, capitals of "new"', () => {
    expect(routeFromHash('#cards/new')).toEqual({ view: 'cards', card: { kind: 'new' } });
    expect(routeFromHash('#/Cards/NEW/')).toEqual({ view: 'cards', card: { kind: 'new' } });
    expect(routeFromHash(`#/cards/${id}/`)).toEqual({ view: 'cards', card: { kind: 'note', id } });
  });

  it('keeps the id exactly as written (ids are case-sensitive)', () => {
    expect(routeFromHash('#/cards/AbC-1')).toEqual({ view: 'cards', card: { kind: 'note', id: 'AbC-1' } });
  });

  it('an unknown id is still a card address — whether it exists is the screen\'s question', () => {
    expect(routeFromHash('#/cards/does-not-exist')).toEqual({ view: 'cards', card: { kind: 'note', id: 'does-not-exist' } });
  });

  it('rejects what cannot be an id', () => {
    for (const h of ['#/cards/', '#/cards/a b', '#/cards/' + 'x'.repeat(65), '#/cards/ü']) {
      const r = routeFromHash(h);
      expect(r.card, h).toBeUndefined();
    }
  });

  it('every route round-trips through its address', () => {
    const routes: Route[] = [
      { view: 'home' },
      { view: 'cards' },
      { view: 'cards', card: { kind: 'new' } },
      { view: 'cards', card: { kind: 'note', id } },
      { view: 'stats' },
      { view: 'profile' },
    ];
    for (const r of routes) expect(routeFromHash(hashForRoute(r))).toEqual(r);
  });

  it('sub-addresses only exist for "Карточки"', () => {
    expect(hashForRoute({ view: 'stats', card: { kind: 'new' } })).toBe('#/stats');
  });

  it('urlForRoute adds no history entry for the address already open', () => {
    expect(urlForRoute({ view: 'cards', card: { kind: 'new' } }, loc('#/cards/new'))).toBeNull();
    expect(urlForRoute({ view: 'cards', card: { kind: 'new' } }, loc('#/cards'))).toBe('/ALSAVI/#/cards/new');
    expect(urlForRoute({ view: 'cards' }, loc('#/cards/new'))).toBe('/ALSAVI/#/cards');
    expect(urlForRoute({ view: 'cards', card: { kind: 'note', id } }, loc('#/cards'))).toBe(`/ALSAVI/#/cards/${id}`);
  });

  it('sameRoute compares normalised routes', () => {
    expect(sameRoute(routeFromHash('#cards/NEW'), { view: 'cards', card: { kind: 'new' } })).toBe(true);
    expect(sameRoute({ view: 'cards' }, { view: 'cards', card: { kind: 'new' } })).toBe(false);
  });
});
