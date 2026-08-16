import { randomUUID } from "crypto";
import { prisma } from "@database/prisma";
import { env } from "@config/env";
import { AppError } from "@modules/common/errors/AppError";

interface PreAuthorizeInput {
  bookingId: string;
  clientId: string;
  totalPrice: number;
  paymentMethodId?: string;
}

interface CaptureInput {
  bookingId: string;
  amount: number;
  tipAmount?: number;
}

/**
 * MOCK Payment Gateway — מדמה זרימת Pre-Auth/Capture/Release של ספק
 * סליקה מסוג Marketplace (כמו Stripe Connect), ללא קריאה חיצונית אמיתית.
 *
 * חשוב: הלוגיקה העסקית כאן (עיתוי ה-Pre-Auth, חישוב ה-Split בין הפלטפורמה
 * לספק) היא הלוגיקה הסופית כפי שסוכמה באפיון — כשמודול Payments האמיתי
 * (Stripe Connect) ייבנה, רק המימוש הפנימי (הקריאות ל-API החיצוני)
 * יוחלף; הממשק (preAuthorize/capture/release) יישאר זהה.
 */
export const mockPaymentGateway = {
  /**
   * מוודא שקיים אמצעי תשלום לחיוב. אם לא סופק paymentMethodId ולא קיים
   * אמצעי ברירת מחדל, נוצר "כרטיס בדיקה" מדומה — נוחות זמנית לבדיקות
   * עד שמודול ה-Payments האמיתי (הוספת כרטיס אמיתי דרך Stripe Elements)
   * ייבנה בחלק עתידי.
   */
  async ensurePaymentMethod(clientId: string, paymentMethodId?: string): Promise<string> {
    if (paymentMethodId) {
      const method = await prisma.paymentMethod.findUnique({ where: { paymentMethodId } });
      if (!method || method.userId !== clientId) {
        throw AppError.badRequest("Payment method not found for this user");
      }
      return method.paymentMethodId;
    }

    const existingDefault = await prisma.paymentMethod.findFirst({
      where: { userId: clientId, isDefault: true },
    });
    if (existingDefault) return existingDefault.paymentMethodId;

    const mockMethod = await prisma.paymentMethod.create({
      data: {
        userId: clientId,
        cardToken: `mock_tok_${randomUUID()}`,
        cardLast4: "4242",
        cardBrand: "visa",
        isDefault: true,
      },
    });
    return mockMethod.paymentMethodId;
  },

  /** תופס Hold על מלוא הסכום בעת יצירת ההזמנה (ללא חיוב בפועל) */
  async preAuthorize(input: PreAuthorizeInput): Promise<void> {
    const paymentMethodId = await this.ensurePaymentMethod(input.clientId, input.paymentMethodId);

    const platformCommission = round(input.totalPrice * env.PLATFORM_COMMISSION_RATE);
    const providerNetAmount = round(input.totalPrice - platformCommission);

    await prisma.payment.create({
      data: {
        bookingId: input.bookingId,
        clientId: input.clientId,
        paymentMethodId,
        preAuthStatus: "held",
        preAuthAmount: input.totalPrice,
        platformCommission,
        providerNetAmount,
        gatewayTransactionId: `mock_txn_${randomUUID()}`,
      },
    });
  },

  /**
   * סליקה סופית (Capture) — מלאה בסיום שירות, או חלקית לצורך דמי ביטול.
   * מחשב מחדש את ה-Split (עמלת פלטפורמה / נטו לספק) על הסכום שנסלק בפועל.
   */
  async capture(input: CaptureInput): Promise<void> {
    const payment = await prisma.payment.findUnique({ where: { bookingId: input.bookingId } });
    if (!payment) throw AppError.notFound("Payment record not found for this booking");

    const tipAmount = input.tipAmount ?? 0;
    const platformCommission = round(input.amount * env.PLATFORM_COMMISSION_RATE);
    // הטיפ מגיע במלואו לספק, ללא עמלת פלטפורמה
    const providerNetAmount = round(input.amount - platformCommission + tipAmount);

    await prisma.payment.update({
      where: { bookingId: input.bookingId },
      data: {
        preAuthStatus: "captured",
        capturedAmount: input.amount,
        tipAmount,
        platformCommission,
        providerNetAmount,
      },
    });
  },

  /** שחרור מלא של ה-Hold (ביטול ללא חיוב כלל) */
  async release(bookingId: string): Promise<void> {
    const payment = await prisma.payment.findUnique({ where: { bookingId } });
    if (!payment) return; // ייתכן שטרם נוצר תשלום (כשל מוקדם בזרימת היצירה)

    await prisma.payment.update({
      where: { bookingId },
      data: { preAuthStatus: "released", capturedAmount: 0 },
    });
  },

  /**
   * מוסיף טיפ לתשלום שכבר נסלק (Capture) בסיום השירות. נקרא בנפרד
   * מה-Capture הראשי כי הלקוח בפועל מחליט על טיפ רק אחרי שרואה את
   * השירות הושלם (במסך הדירוג), לא בזמן שהספק מסמן "הושלם". הטיפ
   * מתווסף (לא דורס) ל-tipAmount הקיים, ומועבר במלואו לספק — ללא
   * עמלת פלטפורמה, כמו בכל תוספת טיפ.
   */
  async addTip(bookingId: string, tipAmount: number): Promise<void> {
    const payment = await prisma.payment.findUnique({ where: { bookingId } });
    if (!payment) {
      throw AppError.notFound("Payment record not found for this booking");
    }
    if (payment.preAuthStatus !== "captured") {
      throw AppError.conflict("Cannot add a tip before the service payment has been captured");
    }

    await prisma.payment.update({
      where: { bookingId },
      data: {
        tipAmount: round(Number(payment.tipAmount) + tipAmount),
        providerNetAmount: round(Number(payment.providerNetAmount) + tipAmount),
      },
    });
  },
};

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
