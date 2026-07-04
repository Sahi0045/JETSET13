import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import hotelService from '../../Services/HotelService';

export function useHotelSearch({ destination, checkInDate, checkOutDate, adults = 2 } = {}, options = {}) {
  return useQuery({
    queryKey: queryKeys.hotels.search({ destination, checkInDate, checkOutDate, adults }),
    queryFn: () => hotelService.searchHotels(destination, checkInDate, checkOutDate, adults),
    enabled: options.enabled ?? !!(destination && checkInDate && checkOutDate),
    ...options,
  });
}

export function useHotelById(hotelId, { checkInDate, checkOutDate, adults = 2 } = {}, options = {}) {
  return useQuery({
    queryKey: queryKeys.hotels.details(hotelId),
    queryFn: () => hotelService.getHotelById(hotelId, checkInDate, checkOutDate, adults),
    enabled: (options.enabled ?? true) && !!hotelId,
    ...options,
  });
}

export function useHotelLocations(keyword, options = {}) {
  return useQuery({
    queryKey: queryKeys.hotels.destinations(),
    queryFn: () => hotelService.searchLocations(keyword),
    enabled: (options.enabled ?? true) && !!keyword && keyword.trim().length >= 2,
    staleTime: 1000 * 60 * 30,
    ...options,
  });
}
