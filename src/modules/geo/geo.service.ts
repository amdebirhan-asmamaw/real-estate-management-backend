import { StatusCodes } from "http-status-codes";
import type { FilterQuery } from "mongoose";
import { env } from "../../core/config/env";
import { AppError } from "../../core/utils/AppError";
import { Listing } from "../listings/listing.model";
import { ListingEvent } from "../listingAnalytics/listingEvent.model";
import { GeoCache, Neighborhood, POI, INeighborhood } from "./geo.model";
import type { NeighborhoodQuery } from "./geo.validation";

export interface GeocodeResult {
  label: string;
  location: { type: "Point"; coordinates: [number, number] };
  address?: Record<string, string>;
  provider: string;
  confidence?: number;
}

const provider = (): "mock" | "nominatim" =>
  env.GEOCODER_PROVIDER === "nominatim" ? "nominatim" : "mock";

const normalize = (value: string): string => value.trim().toLowerCase();

const cacheKey = (kind: "geocode" | "reverse", query: string): string =>
  `${provider()}:${kind}:${normalize(query)}`;

const cacheTtl = (): Date =>
  new Date(Date.now() + env.GEOCODER_CACHE_TTL_HOURS * 60 * 60 * 1000);

const mockGeocode = (query: string): GeocodeResult[] => [
  {
    label: query,
    location: { type: "Point", coordinates: [38.7578, 8.9806] },
    address: { city: "Addis Ababa", country: "Ethiopia" },
    provider: "mock",
    confidence: 0.5,
  },
];

const mockReverse = (lat: number, lng: number): GeocodeResult => ({
  label: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
  location: { type: "Point", coordinates: [lng, lat] },
  address: { city: "Addis Ababa", country: "Ethiopia" },
  provider: "mock",
  confidence: 0.5,
});

const nominatimUrl = (path: string, params: URLSearchParams): string => {
  const base = env.NOMINATIM_BASE_URL.replace(/\/$/, "");
  return `${base}${path}?${params.toString()}`;
};

const fetchJson = async <T>(url: string): Promise<T> => {
  const res = await fetch(url, {
    headers: {
      "User-Agent": env.NOMINATIM_USER_AGENT,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new AppError(
      `Geocoder request failed: ${res.status}`,
      StatusCodes.BAD_GATEWAY,
    );
  }
  return (await res.json()) as T;
};

const mapNominatim = (item: Record<string, unknown>): GeocodeResult => {
  const address = (item.address ?? {}) as Record<string, string>;
  return {
    label: String(item.display_name ?? ""),
    location: {
      type: "Point",
      coordinates: [Number(item.lon), Number(item.lat)],
    },
    address,
    provider: "nominatim",
    confidence: item.importance ? Number(item.importance) : undefined,
  };
};

export const geocode = async (query: string): Promise<GeocodeResult[]> => {
  const key = cacheKey("geocode", query);
  const cached = await GeoCache.findOne({ key });
  if (cached) return cached.result as unknown as GeocodeResult[];

  let result: GeocodeResult[];
  if (provider() === "nominatim") {
    const params = new URLSearchParams({
      q: query,
      format: "jsonv2",
      addressdetails: "1",
      limit: "5",
    });
    const raw = await fetchJson<Record<string, unknown>[]>(
      nominatimUrl("/search", params),
    );
    result = raw.map(mapNominatim);
  } else {
    result = mockGeocode(query);
  }

  await GeoCache.findOneAndUpdate(
    { key },
    { key, provider: provider(), query, result, expiresAt: cacheTtl() },
    { upsert: true, new: true },
  );
  return result;
};

export const reverseGeocode = async (
  lat: number,
  lng: number,
): Promise<GeocodeResult> => {
  const query = `${lat},${lng}`;
  const key = cacheKey("reverse", query);
  const cached = await GeoCache.findOne({ key });
  if (cached) return cached.result as unknown as GeocodeResult;

  let result: GeocodeResult;
  if (provider() === "nominatim") {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lng),
      format: "jsonv2",
      addressdetails: "1",
    });
    const raw = await fetchJson<Record<string, unknown>>(
      nominatimUrl("/reverse", params),
    );
    result = mapNominatim(raw);
  } else {
    result = mockReverse(lat, lng);
  }

  await GeoCache.findOneAndUpdate(
    { key },
    { key, provider: provider(), query, result, expiresAt: cacheTtl() },
    { upsert: true, new: true },
  );
  return result;
};

export const listNeighborhoods = async (query: NeighborhoodQuery) => {
  const filter: FilterQuery<INeighborhood> = {};
  if (query.city) filter.city = new RegExp(query.city, "i");
  if (query.country) filter.country = new RegExp(query.country, "i");
  if (query.q) filter.name = new RegExp(query.q, "i");

  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    Neighborhood.find(filter).sort({ name: 1 }).skip(skip).limit(query.limit),
    Neighborhood.countDocuments(filter),
  ]);
  return { items, total, page: query.page, limit: query.limit };
};

export const getNeighborhoodAnalytics = async (id: string) => {
  const neighborhood = await Neighborhood.findById(id);
  if (!neighborhood) {
    throw new AppError("Neighborhood not found", StatusCodes.NOT_FOUND);
  }

  const geoFilter = {
    status: "published",
    location: { $geoWithin: { $geometry: neighborhood.boundary } },
  };
  const [listingAgg, availabilityAgg, listings, nearbyPois] = await Promise.all(
    [
      Listing.aggregate([
        { $match: geoFilter },
        {
          $group: {
            _id: "$listingType",
            count: { $sum: 1 },
            avgPrice: { $avg: "$price" },
            avgRent: { $avg: "$monthlyRent" },
          },
        },
      ]),
      Listing.aggregate([
        { $match: geoFilter },
        { $group: { _id: "$availabilityStatus", count: { $sum: 1 } } },
      ]),
      Listing.find(geoFilter).select("_id").lean(),
      POI.find({
        location: {
          $near: {
            $geometry: neighborhood.centroid,
            $maxDistance: 3000,
          },
        },
      }).limit(25),
    ],
  );

  const listingIds = listings.map((item) => item._id);
  const leadAgg = await ListingEvent.aggregate([
    {
      $match: {
        listing: { $in: listingIds },
        eventType: { $in: ["inquiry", "offer", "rental_application"] },
      },
    },
    { $group: { _id: "$eventType", count: { $sum: 1 } } },
  ]);

  return {
    neighborhood,
    listings: listingAgg,
    availability: availabilityAgg,
    leads: leadAgg,
    poiCount: nearbyPois.length,
    pois: nearbyPois,
  };
};
