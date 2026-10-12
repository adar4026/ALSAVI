import { describe, expect, it } from 'vitest';
import { hashForView, NAV_ITEMS, urlForView, viewFromHash, type View } from '../src/nav';

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
    for (const h of ['#/settings', '#/cards/123', '#/session', '#top']) expect(viewFromHash(h)).toBe('home');
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
