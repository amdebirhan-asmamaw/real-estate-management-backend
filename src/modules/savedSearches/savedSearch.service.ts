import { StatusCodes } from "http-status-codes";
import { SavedSearch, ISavedSearch } from "./savedSearch.model";
import { IListing } from "../listings/listing.model";
import { AppError } from "../../core/utils/AppError";
import * as notifications from "../notifications/notification.service";
import type {
  CreateSavedSearchInput,
  UpdateSavedSearchInput,
} from "./savedSearch.validation";

const findOwnOr404 = async (
  userId: string,
  id: string,
): Promise<ISavedSearch> => {
  const saved = await SavedSearch.findOne({ _id: id, user: userId });
  if (!saved) {
    throw new AppError("Saved search not found", StatusCodes.NOT_FOUND);
  }
  return saved;
};

export const create = async (
  userId: string,
  input: CreateSavedSearchInput,
): Promise<ISavedSearch> =>
  SavedSearch.create({
    user: userId,
    name: input.name,
    query: input.query,
    alertEnabled: input.alertEnabled,
  });

export const listMine = async (userId: string): Promise<ISavedSearch[]> =>
  SavedSearch.find({ user: userId }).sort({ updatedAt: -1 });

export const update = async (
  userId: string,
  id: string,
  input: UpdateSavedSearchInput,
): Promise<ISavedSearch> => {
  const saved = await findOwnOr404(userId, id);
  saved.set(input);
  await saved.save();
  return saved;
};

export const remove = async (userId: string, id: string): Promise<void> => {
  const saved = await findOwnOr404(userId, id);
  await saved.deleteOne();
};

const numberQuery = (
  query: Record<string, unknown>,
  key: string,
): number | undefined => {
  const value = query[key];
  return typeof value === "number" ? value : undefined;
};

const stringQuery = (
  query: Record<string, unknown>,
  key: string,
): string | undefined => {
  const value = query[key];
  return typeof value === "string" ? value : undefined;
};

const listingPrice = (listing: IListing): number | undefined =>
  listing.listingType === "sale" ? listing.price : listing.monthlyRent;

const inBox = (listing: IListing, query: Record<string, unknown>): boolean => {
  const swLng = numberQuery(query, "swLng");
  const swLat = numberQuery(query, "swLat");
  const neLng = numberQuery(query, "neLng");
  const neLat = numberQuery(query, "neLat");
  if (
    swLng === undefined ||
    swLat === undefined ||
    neLng === undefined ||
    neLat === undefined
  ) {
    return true;
  }
  const [lng, lat] = listing.location.coordinates;
  return lng >= swLng && lng <= neLng && lat >= swLat && lat <= neLat;
};

const distanceMeters = (
  [lng1, lat1]: [number, number],
  [lng2, lat2]: [number, number],
): number => {
  const earthRadius = 6371000;
  const toRad = (n: number) => (n * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const inRadius = (listing: IListing, query: Record<string, unknown>): boolean => {
  const lng = numberQuery(query, "lng");
  const lat = numberQuery(query, "lat");
  const radius = numberQuery(query, "radius");
  if (lng === undefined || lat === undefined || radius === undefined) return true;
  return distanceMeters(listing.location.coordinates, [lng, lat]) <= radius;
};

const inPolygon = (listing: IListing, query: Record<string, unknown>): boolean => {
  const polygon = query.polygon;
  if (!Array.isArray(polygon)) return true;
  const [x, y] = listing.location.coordinates;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const current = polygon[i] as unknown;
    const previous = polygon[j] as unknown;
    if (!Array.isArray(current) || !Array.isArray(previous)) return true;
    const [xi, yi] = current as [number, number];
    const [xj, yj] = previous as [number, number];
    const intersects =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
};

export const matchesListing = (
  saved: Pick<ISavedSearch, "query">,
  listing: IListing,
): boolean => {
  const query = saved.query;
  if (stringQuery(query, "listingType") && query.listingType !== listing.listingType) return false;
  if (stringQuery(query, "category") && query.category !== listing.category) return false;
  if (stringQuery(query, "propertyType") && query.propertyType !== listing.propertyType) return false;
  if (numberQuery(query, "minBedrooms") !== undefined && (listing.bedrooms ?? 0) < numberQuery(query, "minBedrooms")!) return false;
  if (numberQuery(query, "minBathrooms") !== undefined && (listing.bathrooms ?? 0) < numberQuery(query, "minBathrooms")!) return false;

  const price = listingPrice(listing);
  const minPrice = numberQuery(query, "minPrice");
  const maxPrice = numberQuery(query, "maxPrice");
  if (minPrice !== undefined && (price === undefined || price < minPrice)) return false;
  if (maxPrice !== undefined && (price === undefined || price > maxPrice)) return false;

  return inBox(listing, query) && inRadius(listing, query) && inPolygon(listing, query);
};

export const notifyMatchingSavedSearches = async (
  listing: IListing,
): Promise<number> => {
  if (listing.status !== "published") return 0;
  const searches = await SavedSearch.find({ alertEnabled: true });
  const matches = searches.filter((saved) => matchesListing(saved, listing));
  await Promise.all(
    matches.map((saved) =>
      notifications.notify({
        recipient: saved.user.toString(),
        type: "saved_search.match",
        title: "New listing matched your search",
        message: `"${listing.title}" matches your saved search "${saved.name}".`,
        metadata: { listingId: listing.id, savedSearchId: saved.id },
      }),
    ),
  );
  return matches.length;
};
