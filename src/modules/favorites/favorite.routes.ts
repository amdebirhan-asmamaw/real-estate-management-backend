import { Router } from "express";
import * as controller from "./favorite.controller";
import { validate } from "../../core/middleware/validate.middleware";
import { authenticate } from "../../core/middleware/auth.middleware";
import { createFavoriteSchema } from "./favorite.validation";

export const favoriteRouter = Router();

// Any authenticated user may manage their own favorites.
favoriteRouter.get("/", authenticate, controller.list);
favoriteRouter.post("/", authenticate, validate(createFavoriteSchema), controller.add);
favoriteRouter.delete("/:listingId", authenticate, controller.remove);
