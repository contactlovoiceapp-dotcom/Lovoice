/* Shared city search logic — query state, deduplication, and result selection. */

import { useState } from 'react';
import { searchCities, type CitySearchResult } from '../api/citySearch';

export type CitySearchError = 'query_too_short' | 'search_failed' | null;

export interface CitySearchOutcome {
  results: CitySearchResult[];
  error: CitySearchError;
}

export interface UseCitySearchReturn {
  query: string;
  setQuery: (text: string) => void;
  results: CitySearchResult[];
  selectedResultId: string | null;
  isSearching: boolean;
  error: CitySearchError;
  /** Runs the search, updates internal state, and returns the outcome for immediate use by the caller. */
  search: () => Promise<CitySearchOutcome>;
  select: (result: CitySearchResult) => void;
  clear: () => void;
}

export function useCitySearch(initialQuery = ''): UseCitySearchReturn {
  const [query, setQueryState] = useState(initialQuery);
  const [results, setResults] = useState<CitySearchResult[]>([]);
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<CitySearchError>(null);

  const setQuery = (text: string) => {
    setQueryState(text);
    setError(null);
    setSelectedResultId(null);
  };

  const search = async (): Promise<CitySearchOutcome> => {
    setIsSearching(true);
    setError(null);
    setSelectedResultId(null);

    try {
      const raw = await searchCities(query);
      const unique = raw.filter(
        (result, index, list) =>
          index ===
          list.findIndex(
            (item) => item.city === result.city && item.displayName === result.displayName,
          ),
      );
      setResults(unique);
      return { results: unique, error: null };
    } catch (err) {
      setResults([]);
      const searchError: CitySearchError =
        err instanceof Error && err.message === 'profile.city_query_too_short'
          ? 'query_too_short'
          : 'search_failed';
      setError(searchError);
      return { results: [], error: searchError };
    } finally {
      setIsSearching(false);
    }
  };

  const select = (result: CitySearchResult) => {
    setSelectedResultId(result.id);
    setQueryState(result.city);
    setResults([]);
    setError(null);
  };

  const clear = () => {
    setQueryState('');
    setResults([]);
    setSelectedResultId(null);
    setError(null);
  };

  return { query, setQuery, results, selectedResultId, isSearching, error, search, select, clear };
}
