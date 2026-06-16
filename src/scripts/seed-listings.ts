/**
 * Seed script — creates 10 sample listings spread across 5 property owners.
 *
 * Usage:
 *   npx ts-node src/scripts/seed-listings.ts
 *
 * Prerequisites:
 *   Run `npm run seed:users` first so the property owners exist.
 */

import "dotenv/config";
import mongoose from "mongoose";
import { User } from "../modules/auth/auth.model";
import { Listing } from "../modules/listings/listing.model";
import { env } from "../core/config/env";

// owner email → listings
const listingsByOwner: Record<string, Array<Record<string, unknown>>> = {
  // ─── Owner 1: John Owner ──────────────────────────────────────────────────
  "owner@realestate.dev": [
    {
      title: "Modern 3-Bedroom Villa in Bole",
      description:
        "A stunning modern villa in the heart of Bole, Addis Ababa. Open-plan living, fully equipped kitchen, private garden, and secure parking for two vehicles.",
      listingType: "sale", category: "residential", propertyType: "villa",
      status: "published", price: 12_500_000, currency: "ETB",
      bedrooms: 3, bathrooms: 2, area: { value: 250, unit: "sqm" },
      yearBuilt: 2022, parkingSpaces: 2, totalFloors: 2,
      maintenanceFee: 5000, furnishingStatus: "semi_furnished",
      nearbyLandmarks: ["Bole Medhanialem Church", "Edna Mall", "Bole International Airport"],
      saleTerms: "Negotiable. Title deed transfer included. 30% down payment required.",
      availabilityStatus: "available",
      address: { street: "Bole Road, Sub-city 03", city: "Addis Ababa", region: "Addis Ababa", country: "Ethiopia", postalCode: "1000" },
      location: { type: "Point", coordinates: [38.7893, 9.0107] },
      amenities: ["wifi", "parking", "garden", "security", "generator", "water_tank"],
      verificationStatus: "verified",
      neighborhoodInfo: "Bole is the most cosmopolitan district, home to embassies, restaurants, and major shopping centers.",
    },
    {
      title: "Cozy 2-Bedroom Apartment in CMC",
      description:
        "Well-maintained apartment in CMC with city views. 5th floor with elevator access. Close to transport, schools, and supermarkets.",
      listingType: "rent", category: "residential", propertyType: "apartment",
      status: "published", monthlyRent: 25_000, currency: "ETB",
      bedrooms: 2, bathrooms: 1, area: { value: 90, unit: "sqm" },
      yearBuilt: 2020, floorNumber: 5, parkingSpaces: 1, totalFloors: 8,
      furnishingStatus: "furnished",
      nearbyLandmarks: ["CMC Michael Church", "Safari Supermarket", "CMC Bus Station"],
      rentalTerms: "Minimum 1-year lease. 2 months deposit. No pets.",
      availabilityStatus: "available",
      address: { street: "CMC Road, Yeka Sub-city", city: "Addis Ababa", region: "Addis Ababa", country: "Ethiopia", postalCode: "1100" },
      location: { type: "Point", coordinates: [38.8305, 9.0396] },
      amenities: ["wifi", "elevator", "parking", "water_tank", "security"],
      verificationStatus: "verified",
      neighborhoodInfo: "CMC is a rapidly developing residential area with modern apartment complexes.",
    },
  ],

  // ─── Owner 2: Abebe Kebede ────────────────────────────────────────────────
  "abebe@realestate.dev": [
    {
      title: "Spacious Office Space in Kazanchis",
      description:
        "Prime commercial office on the 3rd floor of a modern business center. Open floor plan with conference room, kitchenette, and dedicated server room.",
      listingType: "rent", category: "commercial", propertyType: "office",
      status: "published", monthlyRent: 85_000, currency: "ETB",
      area: { value: 180, unit: "sqm" }, yearBuilt: 2021, floorNumber: 3, totalFloors: 10,
      serviceCharge: 15_000, furnishingStatus: "unfurnished",
      nearbyLandmarks: ["Kazanchis Business District", "Hilton Hotel", "National Bank of Ethiopia"],
      rentalTerms: "Minimum 2-year lease. 3 months deposit. Tenant responsible for fit-out.",
      availabilityStatus: "available",
      address: { street: "Kazanchis, Kirkos Sub-city", city: "Addis Ababa", region: "Addis Ababa", country: "Ethiopia" },
      location: { type: "Point", coordinates: [38.7612, 9.0147] },
      amenities: ["elevator", "security", "generator", "parking", "cctv"],
      verificationStatus: "verified",
    },
    {
      title: "4-Bedroom Family House in Old Airport",
      description:
        "Charming family home in the quiet Old Airport neighborhood. Spacious compound with mature garden, servants quarters, and double garage.",
      listingType: "sale", category: "residential", propertyType: "house",
      status: "published", price: 18_000_000, currency: "ETB",
      bedrooms: 4, bathrooms: 3, area: { value: 320, unit: "sqm" },
      yearBuilt: 2015, parkingSpaces: 2, totalFloors: 2,
      furnishingStatus: "unfurnished",
      nearbyLandmarks: ["Old Airport Area", "Wollo Sefer", "Bambis Supermarket"],
      saleTerms: "Price firm. Clean title deed. Immediate handover.",
      availabilityStatus: "available",
      address: { street: "Old Airport, Nifas Silk-Lafto", city: "Addis Ababa", region: "Addis Ababa", country: "Ethiopia" },
      location: { type: "Point", coordinates: [38.7531, 9.0008] },
      amenities: ["garden", "parking", "security", "water_tank", "generator"],
      verificationStatus: "verified",
    },
  ],

  // ─── Owner 3: Tigist Haile ────────────────────────────────────────────────
  "tigist@realestate.dev": [
    {
      title: "Luxury Penthouse in Sarbet",
      description:
        "Exclusive top-floor penthouse with panoramic city views. High-end finishes, private rooftop terrace, smart home features, and dedicated elevator access.",
      listingType: "sale", category: "residential", propertyType: "apartment",
      status: "published", price: 35_000_000, currency: "ETB",
      bedrooms: 4, bathrooms: 3, area: { value: 400, unit: "sqm" },
      yearBuilt: 2023, floorNumber: 12, parkingSpaces: 3, totalFloors: 12,
      maintenanceFee: 12_000, furnishingStatus: "furnished",
      nearbyLandmarks: ["Sarbet Area", "Megenagna Square", "Yeka Park"],
      saleTerms: "Premium property. Bank financing accepted. Viewing by appointment.",
      availabilityStatus: "available",
      address: { street: "Sarbet, Yeka Sub-city", city: "Addis Ababa", region: "Addis Ababa", country: "Ethiopia" },
      location: { type: "Point", coordinates: [38.8012, 9.0234] },
      amenities: ["wifi", "elevator", "gym", "pool", "parking", "security", "generator", "smart_home"],
      verificationStatus: "verified",
    },
    {
      title: "Studio Apartment near Arat Kilo",
      description:
        "Compact and efficient studio in the university district. Perfect for students or young professionals. Walking distance to Addis Ababa University.",
      listingType: "rent", category: "residential", propertyType: "apartment",
      status: "published", monthlyRent: 12_000, currency: "ETB",
      bedrooms: 1, bathrooms: 1, area: { value: 35, unit: "sqm" },
      yearBuilt: 2019, floorNumber: 2, totalFloors: 5,
      furnishingStatus: "furnished",
      nearbyLandmarks: ["Addis Ababa University", "National Museum", "Arat Kilo Square"],
      rentalTerms: "6-month minimum. 1 month deposit. Utilities included.",
      availabilityStatus: "available",
      address: { street: "Arat Kilo, Arada Sub-city", city: "Addis Ababa", region: "Addis Ababa", country: "Ethiopia" },
      location: { type: "Point", coordinates: [38.7482, 9.0341] },
      amenities: ["wifi", "water_tank", "security"],
      verificationStatus: "verified",
    },
  ],

  // ─── Owner 4: Dawit Mekonnen ──────────────────────────────────────────────
  "dawit@realestate.dev": [
    {
      title: "Commercial Shop in Merkato",
      description:
        "Ground-floor retail space in Africa's largest open-air market. High foot traffic location with storage basement and loading access.",
      listingType: "rent", category: "commercial", propertyType: "shop",
      status: "published", monthlyRent: 45_000, currency: "ETB",
      area: { value: 60, unit: "sqm" }, yearBuilt: 2018, totalFloors: 3,
      serviceCharge: 8_000,
      nearbyLandmarks: ["Merkato Market", "Addis Ketema Bus Terminal", "Anwar Mosque"],
      rentalTerms: "1-year minimum. 3 months advance. Key money negotiable.",
      availabilityStatus: "available",
      address: { street: "Merkato, Addis Ketema", city: "Addis Ababa", region: "Addis Ababa", country: "Ethiopia" },
      location: { type: "Point", coordinates: [38.7275, 9.0302] },
      amenities: ["security", "cctv", "loading_dock"],
      verificationStatus: "verified",
    },
    {
      title: "3-Bedroom Townhouse in Summit",
      description:
        "Modern townhouse in the gated Summit Residences community. Private entrance, rooftop terrace, and shared green spaces.",
      listingType: "sale", category: "residential", propertyType: "condominium",
      status: "published", price: 9_800_000, currency: "ETB",
      bedrooms: 3, bathrooms: 2, area: { value: 180, unit: "sqm" },
      yearBuilt: 2021, parkingSpaces: 1, totalFloors: 3,
      maintenanceFee: 3_500, furnishingStatus: "semi_furnished",
      nearbyLandmarks: ["Summit Area", "Ayat Condominium", "Kotebe Teachers College"],
      saleTerms: "Bank financing available. Title deed ready. HOA applies.",
      availabilityStatus: "available",
      address: { street: "Summit, Yeka Sub-city", city: "Addis Ababa", region: "Addis Ababa", country: "Ethiopia" },
      location: { type: "Point", coordinates: [38.8421, 9.0456] },
      amenities: ["parking", "garden", "security", "playground", "water_tank"],
      verificationStatus: "verified",
    },
  ],

  // ─── Owner 5: Sara Bekele ─────────────────────────────────────────────────
  "sara@realestate.dev": [
    {
      title: "Warehouse in Akaki-Kality",
      description:
        "Large industrial warehouse near the Addis-Adama expressway. Ideal for logistics, manufacturing, or storage. Heavy-duty floor, high ceilings, truck access.",
      listingType: "rent", category: "commercial", propertyType: "warehouse",
      status: "published", monthlyRent: 120_000, currency: "ETB",
      area: { value: 800, unit: "sqm" }, yearBuilt: 2017, totalFloors: 1,
      nearbyLandmarks: ["Akaki-Kality Industrial Zone", "Addis-Adama Expressway"],
      rentalTerms: "2-year minimum lease. Tenant handles internal modifications.",
      availabilityStatus: "available",
      address: { street: "Akaki-Kality Industrial Zone", city: "Addis Ababa", region: "Addis Ababa", country: "Ethiopia" },
      location: { type: "Point", coordinates: [38.7935, 8.8972] },
      amenities: ["parking", "security", "loading_dock", "generator"],
      verificationStatus: "verified",
    },
    {
      title: "1-Bedroom Apartment in Gerji",
      description:
        "Bright and airy apartment in the popular Gerji neighborhood. Close to Imperial Hotel, shopping, and nightlife. Well-suited for expats or young couples.",
      listingType: "rent", category: "residential", propertyType: "apartment",
      status: "published", monthlyRent: 18_000, currency: "ETB",
      bedrooms: 1, bathrooms: 1, area: { value: 55, unit: "sqm" },
      yearBuilt: 2020, floorNumber: 3, parkingSpaces: 1, totalFloors: 7,
      furnishingStatus: "furnished",
      nearbyLandmarks: ["Gerji Imperial Hotel", "Gerji Mebrat Hail", "Friendship Park"],
      rentalTerms: "Minimum 6 months. 1 month deposit. Water included.",
      availabilityStatus: "available",
      address: { street: "Gerji, Bole Sub-city", city: "Addis Ababa", region: "Addis Ababa", country: "Ethiopia" },
      location: { type: "Point", coordinates: [38.8123, 9.0023] },
      amenities: ["wifi", "parking", "elevator", "security", "water_tank"],
      verificationStatus: "verified",
    },
  ],
};

async function seed(): Promise<void> {
  const uri = env.MONGODB_URI || "mongodb://localhost:27017/real-estate-dev";
  await mongoose.connect(uri);
  console.log(`Connected to ${uri}`);

  for (const [email, listings] of Object.entries(listingsByOwner)) {
    const owner = await User.findOne({ email });
    if (!owner) {
      console.error(`❌ Owner not found: ${email}. Run \`npm run seed:users\` first.`);
      continue;
    }

    console.log(`\n── ${owner.name} (${email}) ──`);

    for (const data of listings) {
      const exists = await Listing.findOne({ title: data.title, createdBy: owner._id });
      if (exists) {
        console.log(`  ⏭  Skipped: ${data.title}`);
        continue;
      }

      await Listing.create({ ...data, createdBy: owner._id });
      console.log(`  ✅ Created: ${data.title} [${data.listingType}]`);
    }
  }

  await mongoose.disconnect();
  console.log("\nSeed complete.");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
