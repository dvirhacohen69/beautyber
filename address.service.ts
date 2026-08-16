import { prisma } from "@database/prisma";
import { CreateAddressDto } from "../dto/address.dto";

export const addressService = {
  async list(userId: string) {
    return prisma.savedAddress.findMany({
      where: { userId },
      orderBy: [{ isDefault: "desc" }],
    });
  },

  /**
   * הכתובת הראשונה של משתמש הופכת אוטומטית לברירת מחדל, גם אם לא
   * התבקש כך במפורש - כדי שלא יישאר משתמש בלי כתובת default בכלל.
   * אם המשתמש מבקש isDefault=true על כתובת חדשה, מבטלים קודם את
   * ברירת המחדל הקודמת בטרנזקציה אחת (לעולם לא שתי כתובות default יחד).
   */
  async create(userId: string, dto: CreateAddressDto) {
    const existingCount = await prisma.savedAddress.count({ where: { userId } });
    const shouldBeDefault = dto.isDefault || existingCount === 0;

    return prisma.$transaction(async (tx) => {
      if (shouldBeDefault) {
        await tx.savedAddress.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.savedAddress.create({
        data: {
          userId,
          label: dto.label,
          lat: dto.lat,
          lng: dto.lng,
          fullAddressText: dto.fullAddressText,
          isDefault: shouldBeDefault,
        },
      });
    });
  },
};
