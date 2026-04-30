/* City search wraps Nominatim so onboarding stores only an explicit user-selected city and coordinates. */

import type { ProfileCoordinates } from './profileMutations';

const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const CITY_SEARCH_LIMIT = 5;
const CITY_QUERY_MIN_LENGTH = 2;

export type CitySearchResult = {
  id: string;
  city: string;
  displayName: string;
  coordinates: ProfileCoordinates;
};

type FetchLike = typeof fetch;

type NominatimPlace = {
  place_id?: string;
  osm_type?: string;
  osm_id?: string;
  name?: string;
  display_name?: string;
  lat?: string;
  lon?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringFrom(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function idPartFrom(value: unknown): string | undefined {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }

  return undefined;
}

export function buildNominatimSearchUrl(query: string): string {
  const url = new URL(NOMINATIM_SEARCH_URL);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('q', query.trim());
  url.searchParams.set('limit', String(CITY_SEARCH_LIMIT));
  url.searchParams.set('addressdetails', '1');
  return url.toString();
}

export function mapNominatimPlace(place: unknown): CitySearchResult | null {
  if (!isRecord(place)) {
    return null;
  }

  const rawPlace: NominatimPlace = {
    place_id: idPartFrom(place.place_id),
    osm_type: stringFrom(place.osm_type),
    osm_id: idPartFrom(place.osm_id),
    name: stringFrom(place.name),
    display_name: stringFrom(place.display_name),
    lat: stringFrom(place.lat),
    lon: stringFrom(place.lon),
  };
  const displayName = rawPlace.display_name;
  const latitude = Number(rawPlace.lat);
  const longitude = Number(rawPlace.lon);

  if (!displayName || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const id = rawPlace.place_id ?? `${rawPlace.osm_type ?? 'place'}-${rawPlace.osm_id ?? displayName}`;
  const city = rawPlace.name?.trim() || displayName.split(',')[0]?.trim() || displayName;

  return {
    id,
    city,
    displayName,
    coordinates: {
      latitude,
      longitude,
    },
  };
}

export async function searchCities(query: string, fetchImpl: FetchLike = fetch): Promise<CitySearchResult[]> {
  if (query.trim().length < CITY_QUERY_MIN_LENGTH) {
    throw new Error('profile.city_query_too_short');
  }

  const response = await fetchImpl(buildNominatimSearchUrl(query), {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'LOVoice/1.0 profile-onboarding',
    },
  });

  if (!response.ok) {
    throw new Error('profile.city_search_failed');
  }

  const payload: unknown = await response.json();

  if (!Array.isArray(payload)) {
    throw new Error('profile.city_search_invalid_response');
  }

  return payload
    .map((place) => mapNominatimPlace(place))
    .filter((place): place is CitySearchResult => place !== null);
}
