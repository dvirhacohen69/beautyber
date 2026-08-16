import { prisma } from "@database/prisma";
import { AppError } from "@modules/common/errors/AppError";
import { haversineDistanceKm } from "@modules/common/utils/math";
import { SearchProvidersQuery } from "../dto/provider.dto";

export const providerService = {
  /**
   * חיפוש ספקים לפי מיקום/קטגוריה. מרחק לא מחושב ב-SQL (אין PostGIS
   * מותקן) - נשלף כל הספקים הפעילים הרלוונטיים, ומחשבים ומסננים לפי
   * מרחק באפליקציה. מקובל בהיקף הנתונים הצפוי בשלב זה של המוצר;
   * שדרוג טבעי בעתיד הוא שאילתת רדיוס גיאוגרפי אמיתית ב-DB.
   */
  async search(query: SearchProvidersQuery) {
    const providers = await prisma.provider.findMany({
      where: {
        kycStatus: "approved",
        isOnline: true,
        ...(query.category_id
          ? { services: { some: { categoryId: query.category_id, isActive: true } } }
          : {}),
        ...(query.min_rating !== undefined ? { averageRating: { gte: query.min_rating } } : {}),
        ...(query.q
          ? {
              OR: [
                { businessName: { contains: query.q, mode: "insensitive" as const } },
                { bio: { contains: query.q, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      include: {
        services: {
          where: query.category_id
            ? { categoryId: query.category_id, isActive: true }
            : { isActive: true },
          orderBy: { customPrice: "asc" },
          take: 1,
        },
        portfolioImages: { orderBy: { sortOrder: "asc" }, take: 1 },
      },
    });

    const withDistance = providers
      .map((provider) => ({
        provider,
        distanceKm: haversineDistanceKm(
          query.lat,
          query.lng,
          Number(provider.baseLocationLat),
          Number(provider.baseLocationLng)
        ),
      }))
      .filter(({ distanceKm }) => distanceKm <= query.radius_km)
      // ספק בלי שירות פעיל תואם (אחרי סינון הקטגוריה) לא רלוונטי להצגה
      .filter(({ provider }) => provider.services.length > 0);

    const sorted = withDistance.sort((a, b) => {
      if (query.sort_by === "rating") {
        return Number(b.provider.averageRating) - Number(a.provider.averageRating);
      }
      if (query.sort_by === "price") {
        return Number(a.provider.services[0].customPrice) - Number(b.provider.services[0].customPrice);
      }
      return a.distanceKm - b.distanceKm;
    });

    return sorted.map(({ provider, distanceKm }) => ({
      providerId: provider.providerId,
      businessName: provider.businessName,
      averageRating: provider.averageRating.toString(),
      totalReviews: provider.totalReviews,
      distanceKm: Math.round(distanceKm * 10) / 10,
      priceFrom: Number(provider.services[0].customPrice),
      thumbnailUrl: provider.portfolioImages[0]?.imageUrl ?? null,
    }));
  },

  async getPublicProfile(providerId: string) {
    const provider = await prisma.provider.findUnique({
      where: { providerId },
      include: {
        services: {
          where: { isActive: true },
          include: { category: true },
          orderBy: { customPrice: "asc" },
        },
        portfolioImages: { orderBy: { sortOrder: "asc" } },
      },
    });

    // גם אם הספק קיים אבל טרם אושר (kycStatus != 'approved'), מחזירים 404 -
    // לא חושפים למשתמש חיצוני שהפרופיל "קיים אבל לא מאושר"
    if (!provider || provider.kycStatus !== "approved") {
      throw AppError.notFound("Provider not found");
    }

    return {
      providerId: provider.providerId,
      businessName: provider.businessName,
      bio: provider.bio,
      averageRating: provider.averageRating.toString(),
      totalReviews: provider.totalReviews,
      portfolioImages: provider.portfolioImages.map((image) => ({
        imageId: image.imageId,
        imageUrl: image.imageUrl,
      })),
      services: provider.services.map((service) => ({
        providerServiceId: service.providerServiceId,
        categoryId: service.categoryId,
        categoryName: service.category.name,
        customPrice: service.customPrice.toString(),
        durationMinutes: service.durationMinutes,
      })),
    };
  },

  async getReviews(providerId: string) {
    const provider = await prisma.provider.findUnique({ where: { providerId } });
    if (!provider || provider.kycStatus !== "approved") {
      throw AppError.notFound("Provider not found");
    }

    return prisma.review.findMany({
      where: { providerId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { reviewId: true, rating: true, comment: true, createdAt: true },
    });
  },
};
