import {
  createListingSchema,
  discoverySchema,
  transitionSchema,
  documentUploadSchema,
} from "../src/modules/listings/listing.validation";

const valid = {
  title: "Flat",
  listingType: "rent",
  category: "residential",
  propertyType: "apartment",
  monthlyRent: 1000,
  location: { type: "Point", coordinates: [13.4, 52.5] },
};

describe("createListingSchema", () => {
  it("accepts a valid rental listing", () => {
    expect(createListingSchema.validate(valid).error).toBeUndefined();
  });

  it("requires monthlyRent when listingType is rent", () => {
    const { monthlyRent: _omit, ...rest } = valid;
    expect(createListingSchema.validate(rest).error).toBeDefined();
  });

  it("requires price when listingType is sale", () => {
    const { error } = createListingSchema.validate({
      ...valid,
      listingType: "sale",
      monthlyRent: undefined,
    });
    expect(error).toBeDefined();
  });
});

describe("discoverySchema", () => {
  it("accepts a viewport query", () => {
    const { error } = discoverySchema.validate({
      swLng: "13.3",
      swLat: "52.4",
      neLng: "13.5",
      neLat: "52.6",
    });
    expect(error).toBeUndefined();
  });

  it("accepts a radius query", () => {
    const { error } = discoverySchema.validate({
      lng: "13.4",
      lat: "52.5",
      radius: "1000",
    });
    expect(error).toBeUndefined();
  });

  it("rejects mixing viewport and radius params", () => {
    const { error } = discoverySchema.validate({
      swLng: "13.3",
      swLat: "52.4",
      neLng: "13.5",
      neLat: "52.6",
      radius: "1000",
    });
    expect(error).toBeDefined();
  });
});

describe("transitionSchema", () => {
  it("accepts submit with no extra fields", () => {
    expect(transitionSchema.validate({ action: "submit" }).error).toBeUndefined();
  });

  it("requires a reason code when rejecting", () => {
    expect(transitionSchema.validate({ action: "reject" }).error).toBeDefined();
    expect(
      transitionSchema.validate({ action: "reject", reason: "missing_document" })
        .error,
    ).toBeUndefined();
  });

  it("requires a note when requesting info", () => {
    expect(
      transitionSchema.validate({ action: "request_info" }).error,
    ).toBeDefined();
    expect(
      transitionSchema.validate({ action: "request_info", note: "Add the deed" })
        .error,
    ).toBeUndefined();
  });

  it("rejects an unknown action", () => {
    expect(transitionSchema.validate({ action: "delete" }).error).toBeDefined();
  });
});

describe("documentUploadSchema", () => {
  it("accepts property document types", () => {
    expect(documentUploadSchema.validate({ type: "utility_bill" }).error).toBeUndefined();
    expect(documentUploadSchema.validate({ type: "ownership_certificate" }).error).toBeUndefined();
  });

  it("rejects identity documents (id belongs to KYC, not listings)", () => {
    expect(documentUploadSchema.validate({ type: "id" }).error).toBeDefined();
  });

  it("defaults the type to other", () => {
    const { value } = documentUploadSchema.validate({});
    expect(value.type).toBe("other");
  });
});
