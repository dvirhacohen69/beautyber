import { prisma } from "@database/prisma";

export const categoryService = {
  async listActive() {
    return prisma.serviceCategory.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { categoryId: true, name: true, iconUrl: true },
    });
  },
};
