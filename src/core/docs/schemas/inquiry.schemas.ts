// Inquiry-related schemas.

export const inquirySchemas: Record<string, unknown> = {
  Inquiry: {
    type: "object",
    properties: {
      id: { type: "string" },
      listing: { type: "string" },
      listingOwner: { type: "string" },
      inquirer: { type: "string" },
      inquiryType: {
        type: "string",
        enum: ["rent", "buy", "general"],
      },
      message: { type: "string" },
      contactInfo: {
        type: "object",
        properties: {
          phone: { type: "string" },
          email: { type: "string", format: "email" },
        },
      },
      status: {
        type: "string",
        enum: ["open", "responded", "in_discussion", "closed", "spam"],
      },
      response: { type: "string" },
      createdAt: { type: "string", format: "date-time" },
    },
  },
  CreateInquiryInput: {
    type: "object",
    required: ["listingId", "message"],
    properties: {
      listingId: {
        type: "string",
        description: "24-char hex Mongo ObjectId of a published listing",
      },
      inquiryType: {
        type: "string",
        enum: ["rent", "buy", "general"],
        default: "general",
      },
      message: { type: "string", minLength: 1, maxLength: 2000 },
      contactInfo: {
        type: "object",
        properties: {
          phone: { type: "string", maxLength: 20 },
          email: { type: "string", format: "email", maxLength: 254 },
        },
      },
    },
  },
  UpdateInquiryInput: {
    type: "object",
    minProperties: 1,
    properties: {
      status: {
        type: "string",
        enum: ["open", "responded", "in_discussion", "closed", "spam"],
      },
      response: { type: "string", maxLength: 2000 },
    },
  },
};
