/* Tests for Nominatim city search parsing so onboarding stores valid display cities and coordinates. */

import { buildNominatimSearchUrl, mapNominatimPlace, searchCities } from '../citySearch';

describe('buildNominatimSearchUrl', () => {
  it('builds an explicit Nominatim search URL without country filtering', () => {
    const url = new URL(buildNominatimSearchUrl(' Paris '));

    expect(url.origin + url.pathname).toBe('https://nominatim.openstreetmap.org/search');
    expect(url.searchParams.get('q')).toBe('Paris');
    expect(url.searchParams.get('format')).toBe('jsonv2');
    expect(url.searchParams.get('limit')).toBe('5');
    expect(url.searchParams.has('countrycodes')).toBe(false);
  });
});

describe('mapNominatimPlace', () => {
  it('maps a valid place to a city search result', () => {
    expect(
      mapNominatimPlace({
        place_id: 123,
        name: 'Paris',
        display_name: 'Paris, Ile-de-France, France',
        lat: '48.8566',
        lon: '2.3522',
      }),
    ).toEqual({
      id: '123',
      city: 'Paris',
      displayName: 'Paris, Ile-de-France, France',
      coordinates: {
        latitude: 48.8566,
        longitude: 2.3522,
      },
    });
  });

  it('drops malformed places', () => {
    expect(mapNominatimPlace({ display_name: 'Nowhere', lat: 'oops', lon: '2' })).toBeNull();
  });
});

describe('searchCities', () => {
  it('rejects searches shorter than two characters', async () => {
    await expect(searchCities('P', jest.fn())).rejects.toThrow('profile.city_query_too_short');
  });

  it('surfaces failed HTTP responses', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      json: jest.fn(),
    });

    await expect(searchCities('Paris', fetchMock)).rejects.toThrow('profile.city_search_failed');
  });

  it('returns mapped results from Nominatim', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue([
        {
          place_id: 'abc',
          name: 'Namur',
          display_name: 'Namur, Wallonie, Belgique',
          lat: '50.4669',
          lon: '4.8675',
        },
      ]),
    });

    await expect(searchCities('Namur', fetchMock)).resolves.toEqual([
      {
        id: 'abc',
        city: 'Namur',
        displayName: 'Namur, Wallonie, Belgique',
        coordinates: {
          latitude: 50.4669,
          longitude: 4.8675,
        },
      },
    ]);
  });
});
