import { Request, Response } from 'express';
import { apiResponse } from '../utils/apiResponse';
import { catchAsync } from '../utils/catchAsync';
import { searchAddressSuggestions, reverseGeocodeCoords } from '../services/geocoding.service';

export const searchGeocode = catchAsync(async (req: Request, res: Response) => {
  const { address } = req.query as { address?: string };
  if (!address || address.trim().length < 3) {
    return apiResponse.success(res, 'Query too short.', []);
  }

  const suggestions = await searchAddressSuggestions(address.trim());
  return apiResponse.success(res, 'Address suggestions.', suggestions);
});

export const reverseGeocode = catchAsync(async (req: Request, res: Response) => {
  const { lat, lng } = req.query as { lat?: string; lng?: string };
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
    return apiResponse.error(res, 'Valid lat and lng are required.', 400);
  }

  const result = await reverseGeocodeCoords(latNum, lngNum);
  if (!result) {
    return apiResponse.error(res, 'Could not resolve an address for these coordinates.', 400);
  }

  return apiResponse.success(res, 'Reverse geocoded.', result);
});
