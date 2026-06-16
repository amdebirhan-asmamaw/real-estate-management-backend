import { StatusCodes } from "http-status-codes";
import { SavedSearch, ISavedSearch } from "./savedSearch.model";
import { AppError } from "../../core/utils/AppError";
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
