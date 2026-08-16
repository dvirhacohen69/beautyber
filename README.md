# Beauty On-Demand — Backend

Backend API עבור אפליקציית On-Demand לשירותי ספרות/טיפוח ניידים
(מודל מסוג Marketplace, בהשראת Uber/Wolt).

**סטטוס נוכחי:** חלק 1 הושלם — מבנה פרויקט + מסד נתונים.
החלקים הבאים (Auth/JWT, Booking Engine, Payments, Tracking) ייבנו בשלבים נפרדים.

---

## Stack טכנולוגי

- **Runtime:** Node.js 20+ / TypeScript
- **Web Framework:** Express
- **DB:** PostgreSQL 16 (דרך Prisma ORM)
- **Cache / Pub-Sub:** Redis 7
- **Real-time:** Socket.io (ייבנה בחלק Tracking)
- **Payments:** Stripe Connect (ייבנה בחלק Payments)

## מבנה הפרויקט

```
src/
  modules/            # ארכיטקטורת סגמנטים (Domain-Driven) — כל מודול עצמאי
    auth/              controllers | services | routes | dto | middleware
    users/             controllers | services | routes | dto
    providers/         controllers | services | routes | dto
    bookings/          controllers | services | routes | dto | state-machine
    payments/          controllers | services | routes | dto | providers (Stripe וכו')
    tracking/          controllers | services | routes | gateway (WebSocket)
    reviews/           controllers | services | routes | dto
    admin/             controllers | services | routes | dto
    notifications/     services | providers (FCM/SMS)
    common/            middleware | utils | errors | types | constants (משותף לכל המודולים)
  config/              קונפיגורציה גלובלית (env, קבועים)
  database/            Prisma Client singleton
prisma/
  schema.prisma        סכמת מסד הנתונים המלאה (17 טבלאות)
  migrations/          מיגרציות (ייווצרו אוטומטית ע"י prisma migrate)
tests/
  unit/
  integration/
docker-compose.yml      PostgreSQL + Redis לסביבה מקומית
.env.example             תבנית משתני סביבה
```

## הרצה מקומית (Part 1 — Database & Structure)

1. **הקמת שירותי תשתית (Postgres + Redis):**
   ```bash
   docker compose up -d
   ```

2. **התקנת תלויות:**
   ```bash
   npm install
   ```

3. **הגדרת משתני סביבה:**
   ```bash
   cp .env.example .env
   # ערוך את .env לפי הצורך (ברירת המחדל תואמת ל-docker-compose.yml)
   ```

4. **יצירת המיגרציה הראשונית והרצתה מול המסד:**
   ```bash
   npx prisma migrate dev --name init
   ```
   פקודה זו גם תריץ אוטומטית `prisma generate` וניתן יהיה לגשת ל-Prisma Client.

5. **בדיקה חזותית של המסד (אופציונלי):**
   ```bash
   npx prisma studio
   ```
   ייפתח בדפדפן בכתובת http://localhost:5555

## חלק 2 — מודול Auth

### נתיבים זמינים (`/v1/auth`)

| Method | Route | הגנה | תיאור |
|--------|-------|-------|--------|
| POST | `/register` | Rate-limited | הרשמת client/provider חדש + שליחת OTP ראשוני |
| POST | `/otp/send` | Rate-limited | שליחת OTP להתחברות למשתמש קיים |
| POST | `/otp/verify` | Rate-limited | אימות OTP → מנפיק Access+Refresh Token, מפעיל את המשתמש |
| POST | `/refresh-token` | — | Token Rotation: מבטל את ה-Refresh הישן ומנפיק זוג חדש |
| POST | `/logout` | — | מבטל Refresh Token ספציפי |
| GET | `/me` | `authenticate` | פרטי המשתמש המחובר + פרופיל ספק אם רלוונטי |

### בדיקה ידנית מהירה (לאחר `docker compose up -d` + `npm run dev`)

```bash
# 1. הרשמה
curl -X POST http://localhost:3000/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"+972501234567","fullName":"Dana Levi","role":"client"}'

# הקוד יודפס ללוג השרת (Mock SMS): 📱 [MOCK SMS] OTP for +972501234567: 123456

# 2. אימות OTP
curl -X POST http://localhost:3000/v1/auth/otp/verify \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"+972501234567","otpCode":"123456"}'

# 3. שימוש ב-Access Token שהתקבל
curl http://localhost:3000/v1/auth/me \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

### החלטות ארכיטקטורה מרכזיות

- **OTP-first, לא סיסמה:** ההרשמה וההתחברות מבוססות טלפון+OTP בלבד (תואם את זרימת המשתמש מה-PRD). `password_hash` נשאר בסכמה לשימוש עתידי (למשל כניסת אדמין).
- **Token Rotation:** בכל `refresh-token` מתבטל ה-Refresh הישן ומונפק חדש — Refresh Token גנוב יהפוך לחסום ברגע שהמשתמש האמיתי ירענן.
- **Refresh Token Whitelist ב-Redis:** לא מסתמכים רק על תפוגת JWT — ניתן לבטל טוקן ספציפי מיידית (logout, השעיית משתמש).
- **role נשלף מחדש מה-DB בכל refresh**, לא רק מהטוקן — כדי שהשעיית ספק/לקוח תיכנס לתוקף מיידית ולא תמתין לתפוגת ה-Access Token.

## חלק 3 — מודול Bookings (Pricing + State Machine)

### נתיבים זמינים (`/v1/bookings`) — כולם דורשים `authenticate`

| Method | Route | הרשאה | תיאור |
|--------|-------|--------|--------|
| POST | `/quote` | client | חישוב הצעת מחיר (ללא יצירת הזמנה) |
| POST | `/` | client | יצירת הזמנה + Pre-Authorization (Mock) |
| GET | `/me` | client/provider | רשימת ההזמנות של המשתמש המחובר |
| GET | `/:bookingId` | בעל ההזמנה בלבד | פרטי הזמנה **עשירים** (ר' עדכון בחלק 6 למטה) |
| PATCH | `/:bookingId/confirm` | provider | אישור הזמנה (`pending` → `confirmed`) |
| PATCH | `/:bookingId/reject` | provider | דחיית הזמנה (שחרור מלא ללקוח) |
| PATCH | `/:bookingId/status` | provider | קידום סטטוס: `provider_en_route`/`arrived`/`in_progress`/`completed` |
| PATCH | `/:bookingId/cancel` | client/provider | ביטול, עם חישוב דמי ביטול אוטומטי |
| PATCH | `/:bookingId/no-show` | client/provider | דיווח אי-הגעה (של הצד השני) |

### נוסחת התמחור בפועל (`pricing.service.ts`)

```
Distance Fee = Pickup Base Fee + (Km × Rate/km) + (Min × Rate/min)
Surge Multiplier = min(TimeMultiplier × DemandMultiplier, MAX_SURGE)   // חל על Distance Fee בלבד
Total = BasePrice + (Distance Fee × Surge Multiplier) + VAT

TimeMultiplier:  סופ"ש (שישי-שבת) +20% | ערב (19:00-06:00) +15% | אחרת ×1
DemandMultiplier: יחס הזמנות פעילות / ספקים מקוונים במערכת (קירוב MVP, לא גיאוגרפי)

Slot Duration = ServiceDuration + TravelDuration + ceil(TravelDuration × 20%)   ← מעוגל לרבע שעה קרוב
```

כל השדות (`min`/`max` תעריפים, אחוזי תוספת, מקדם ביטחון) מרוכזים ב-
`constants/pricing.constants.ts` — קובץ אחד לעדכן כשתעריפים ישתנו.

### State Machine (`booking-state-machine.ts`)

```
pending → confirmed → provider_en_route → arrived → in_progress → completed
   ↓            ↓              ↓               ↓
   cancelled_client / cancelled_provider     no_show (מ-en_route או arrived)
```
כל מעבר עובר דרך `assertTransition()` — מעבר לא חוקי נכשל תמיד עם שגיאת 409, ללא תלות ב-endpoint שקרא לו.

### מדיניות ביטולים (`cancellationPolicy.service.ts`)

| מצב | דמי ביטול ללקוח |
|------|--------------------|
| מעל 4 שעות לפני המועד | 0% |
| 1–4 שעות לפני | 25% |
| פחות משעה / הספק כבר `provider_en_route` | 100% |

ביטול ע"י הספק **תמיד** משחרר את הלקוח במלואו; הפונקציה `evaluateProviderCancellation` רק קובעת אם מגיעה סנקציה לספק (`cancellationCountMonth`+1) לפי אותו סף 4 שעות.

### Mock Payment Gateway (`payments/services/mockPaymentGateway.service.ts`)

מודול Payments המלא (Stripe Connect) ייבנה בחלק עתידי. עד אז, שירות זה מדמה
Pre-Authorization/Capture/Release ברמת ה-DB בלבד (ללא קריאה חיצונית), כדי
שזרימת ההזמנות תהיה ניתנת לבדיקה מקצה-לקצה כבר עכשיו. **הלוגיקה העסקית
(עיתוי ה-Hold, חישוב ה-Split לפי `PLATFORM_COMMISSION_RATE`) היא סופית** —
כשהאינטגרציה האמיתית תיבנה, רק הקריאות החיצוניות יוחלפו.

אם ללקוח אין אמצעי תשלום שמור, נוצר אוטומטית "כרטיס בדיקה" מדומה
(`mock_tok_...`) — נוחות זמנית עד שנבנה מודול הוספת כרטיס אמיתי.

### מגבלה שהוסרה: בדיקה מקצה-לקצה

בעבר סעיף זה ציין שמודולי Users/Providers לא היו קיימים, כך שלא ניתן היה ליצור הזמנה בלי להזין נתונים ידנית דרך `npx prisma studio`. הפער נסגר בחלק 5 (ר' למטה) — כעת אפשר להשתמש ב-`POST /users/me/addresses` וב-`GET /providers/search` כדי להקים תרחיש בדיקה מלא דרך ה-API בלבד. עדיין נדרש ליצור ידנית לפחות ספק אחד מאושר (`kycStatus='approved'`, `isOnline=true`) עם שירות פעיל, כי אין עדיין מודול הרשמת ספקים/אישור אדמין.

## חלק 4 — מודול Tracking (WebSocket + REST Fallback)

### ערוץ WebSocket: `/ws/tracking/{bookingId}`

מבוסס **Dynamic Namespace** של Socket.io — כל הזמנה מקבלת ערוץ מבודד משלה בנתיב `/ws/tracking/{bookingId}` (תואם בדיוק לנתיב שהוגדר באפיון ה-API בשלב 2), כך שאין צורך בניהול "rooms" ידני — הבידוד בין הזמנות מובנה בתוך ה-Namespace עצמו.

**התחברות (צד לקוח/ספק):**
```javascript
const socket = io(`${SERVER_URL}/ws/tracking/${bookingId}`, {
  auth: { token: accessToken }, // Access Token רגיל מה-Auth module
});

socket.on("tracking_ready", ({ status }) => { /* הערוץ מוכן */ });
socket.on("location_update", ({ lat, lng, timestamp }) => { /* עדכון מיקום חי */ });
socket.on("tracking_closed", ({ reason }) => { /* ההזמנה הסתיימה/בוטלה */ });
socket.on("tracking_error", ({ message }) => { /* אין הרשאה / סטטוס לא מתאים */ });
```

**שידור מיקום (רק מצד הספק):**
```javascript
socket.emit("location_update", { lat: 32.0853, lng: 34.7818 });
// תגובה אפשרית: socket.on("location_rejected", ({ reason }) => {...})
// reason: "implausible_speed" | "invalid_payload" | "booking_not_in_active_window"
```

### נתיבי REST (`/v1/tracking`) — Fallback ל-WebSocket

| Method | Route | תיאור |
|--------|-------|--------|
| GET | `/:bookingId/location` | המיקום האחרון הידוע (מ-Redis Cache) |
| GET | `/:bookingId/eta` | זמן הגעה משוער + מרחק, מבוסס המיקום האחרון |
| POST | `/:bookingId/location` | דיווח מיקום ידני (provider בלבד) — לבדיקות/גיבוי כשאין WebSocket |

### החלטות ארכיטקטורה מרכזיות

- **אין כתיבה ל-DB על כל פינג GPS.** מיקום נשמר אך ורק ב-Redis עם TTL (6 שעות), לפי עקרון מזעור הנתונים מה-NFR. נקודות ציון (הגעה/יציאה) נשמרות ב-`BookingStatusLog` כבר דרך מודול ה-Bookings, לא דרך ה-Tracking.
- **בדיקת סבירות מהירות (Anti-Spoofing):** כל עדכון מיקום מושווה למיקום הקודם — אם המרחק/זמן מרמזים על מהירות מעל 140 קמ"ש, המיקום נדחה ולא משודר. הסף וזמן המינימום לבדיקה מרוכזים ב-`tracking.constants.ts`.
- **סגירה אוטומטית:** `booking.service.ts` קורא ל-`closeTrackingRoom()` + מנקה את ה-Cache בכל מעבר לסטטוס סופי (`completed`/`cancelled_client`/`cancelled_provider`/`no_show`) — האפליקציות מקבלות אירוע `tracking_closed` ומתנתקות.
- **הרשאה כפולה:** גם ה-WebSocket (במעמד ההתחברות) וגם כל נתיב REST מוודאים שהמשתמש הוא צד להזמנה (`trackingAccess.service.ts`) — לא ניתן "להאזין" להזמנה של מישהו אחר.

## חלק 5 — מודולי Catalog ציבוריים (Categories, Providers, Addresses)

נבנה בדיעבד כדי לסגור פער: חלק F3 ב-Frontend דרש נתונים שלא היה להם מקור אמיתי — הקטלוג לא היה חשוף כלל מעבר למה שתועד באפיון שלב 2. שלושת המודולים הבאים סוגרים את הפער.

### נתיבים חדשים

| Method | Route | הרשאה | תיאור |
|--------|-------|--------|--------|
| GET | `/v1/categories` | ציבורי | רשימת קטגוריות שירות פעילות |
| GET | `/v1/providers/search` | ציבורי | חיפוש ספקים לפי מיקום/קטגוריה/טקסט חופשי |
| GET | `/v1/providers/:providerId` | ציבורי | פרופיל ספק מלא (רק אם `kycStatus='approved'`) |
| GET | `/v1/providers/:providerId/reviews` | ציבורי | ביקורות על הספק (עד 50 אחרונות) |
| GET | `/v1/users/me/addresses` | authenticate | רשימת כתובות שמורות של המשתמש המחובר |
| POST | `/v1/users/me/addresses` | authenticate | הוספת כתובת שמורה חדשה |

### החלטות מפתח

- **חיפוש גיאוגרפי ברמת אפליקציה, לא SQL:** אין PostGIS מותקן, כך שהחיפוש ב-`/providers/search` שולף את כל הספקים הפעילים הרלוונטיים (מאושרים + מקוונים, מסוננים לפי קטגוריה/דירוג/טקסט ברמת ה-DB), ואז מחשב ומסנן לפי מרחק (`haversineDistanceKm`, אותה פונקציה מ-`common/utils/math.ts` שכבר משמשת את מנוע התמחור) **באפליקציה**. סביר לגמרי בהיקף הנתונים הצפוי כרגע; שדרוג טבעי בעתיד הוא שאילתת רדיוס אמיתית ב-DB.
- **פרופיל ספק לא-מאושר מוחזר כ-404, לא כ"קיים אבל לא מאושר":** אם `kycStatus !== 'approved'`, `/providers/:id` מחזיר 404 רגיל — לא חושפים למשתמש חיצוני אינפורמציה על תהליכי אישור פנימיים.
- **כתובת ראשונה = ברירת מחדל אוטומטית:** `addressService.create` קובע `isDefault=true` אוטומטית אם זו הכתובת הראשונה של המשתמש (גם בלי שהתבקש), ומבטל את ברירת המחדל הקודמת בטרנזקציה אחת אם מבקשים `isDefault=true` על כתובת חדשה — לעולם לא שתי כתובות default יחד.
- **⚠️ שינוי נתיב לעומת מה שתועד בשלב 2:** האפיון המקורי (Stage 2) תיעד `GET /search/providers`, אך בפועל בעבודה הזו סוכם ונבנה בתור `GET /providers/search` (מקונן תחת ה-Router של providers). ה-Frontend כבר עודכן בהתאם — אם יש מסמכים/קוד נוספים שמפנים לנתיב הישן, יש לעדכן אותם.

## חלק 6 — העשרת GET /bookings/:bookingId (עבור F5 ב-Frontend)

בזמן בניית מסך פרטי ההזמנה של הספק (F5 ב-Frontend) התברר ש-`GET /bookings/:id` היה מחזיר שורת DB גולמית בלבד (בלי Relations) — כך שהספק לא יכול היה לראות מי הלקוח או לאן להגיע, והלקוח לא יכול היה לראות פרטי קשר אמיתיים של הספק. תוקן ב-`booking.service.ts::getById`.

**התשובה החדשה כוללת כעת:**
```
{
  bookingId, clientId, providerId, addressId, status,
  scheduledStartTime, estimatedEndTime,
  basePrice, distanceFee, surgeMultiplier, totalPrice, cancellationReason,
  client: { fullName, phoneNumber },
  provider: { businessName, averageRating, phoneNumber },
  service: { categoryName, durationMinutes },
  address: { label, fullAddressText, lat, lng },
}
```

**נקודת אבטחה חשובה:** מספר הטלפון של שני הצדדים נחשף כאן **רק אחרי** `assertBookingOwnership` — כלומר רק למי שהוא בפועל לקוח/ספק של ההזמנה הספציפית הזו. זה שונה (ומאובטח יותר) מחשיפת טלפון בפרופיל ציבורי (`GET /providers/:id`, שנשאר **בלי** טלפון בכוונה, נגיש לכל גולש אנונימי). כשמודול Proxy Calling אמיתי (In-App Masking, ר' NFR §3.3) ייבנה, שני השדות האלה יוחלפו במספר וירטואלי זמני במקום החשיפה הישירה הנוכחית — זהו MVP-level, לא הפתרון הסופי.

**השפעה על ביצועים:** מדובר בשאילתה אחת עם 4 `include`s נוספים (client/provider/providerService/address) — קריאה בודדת ולא נתיב חם (hot path) כמו עדכוני מיקום, כך שההשפעה זניחה.

## חלק 7 — מודול Reviews (דירוג, ביקורת וטיפ אחרי סיום)

נבנה כדי לתמוך במסך הדירוג ב-Frontend (F6). כלל נוסף בתשובת `GET /bookings/:bookingId`: השדה `hasReview: boolean` (מבוסס `include: { review: { select: { reviewId: true } } }`) — כדי שהלקוח ידע אם כבר דירג הזמנה זו, בלי לצרוך שדות מיותרים.

### נתיב חדש

| Method | Route | הרשאה | תיאור |
|--------|-------|--------|--------|
| POST | `/v1/bookings/:bookingId/review` | client, בעל ההזמנה בלבד | יצירת ביקורת (`rating`, `comment?`) + טיפ אופציונלי (`tipAmount?`) |

מאוחסן תחת `modules/reviews/` (הפרדת תחום עסקי נקייה) אבל **מורכב** דרך `booking.routes.ts` (לא Router נפרד תחת `/v1/reviews`) — כי הנתיב מקונן תחת `/bookings/:id` ומשתמש כבר ב-`authenticate` שמופעל שם, בלי לכפול הגדרה.

### החלטות מפתח

- **ניתן לדרג רק הזמנה שהושלמה (`status='completed'`), ורק פעם אחת** — נאכף ב-`review.service.ts`: 404 אם ההזמנה לא קיימת/לא שייכת ללקוח, 400 אם עדיין לא הושלמה, 409 אם כבר קיימת ביקורת (מסתמך גם על ה-`@unique` על `Review.bookingId` בסכמה כרשת ביטחון נוספת ברמת ה-DB).
- **`averageRating`/`totalReviews` מחושבים מחדש מכל הביקורות בכל פעם** (לא ממוצע מצטבר/נע) — פשוט, קל להבין ולבדוק, וזול מספיק בהיקף הנתונים הנוכחי. שדרוג טבעי אם נפח הביקורות יגדל משמעותית.
- **טיפ הוא קריאה נפרדת מה-Capture הראשי, לא פרמטר עליו:** כשספק מסמן "הושלם" (`booking.service.ts`), הסליקה כבר מתבצעת (`tipAmount=0` באותו רגע), כי הספק לא יודע/לא קובע טיפ. הטיפ מתווסף בפועל **רק** כשהלקוח שולח אותו במסך הדירוג — `mockPaymentGateway.addTip()` מוסיף (לא דורס) ל-`tipAmount`/`providerNetAmount` הקיימים על אותו `Payment`.

## מצב הפרויקט לפי חלקים

| חלק | תיאור | סטטוס |
|-----|--------|--------|
| 1 | מבנה פרויקט + Database (Prisma Schema, Docker Compose) | ✅ הושלם |
| 2 | Authentication + JWT (OTP, Access/Refresh Tokens, Role Middleware, `/auth/me`) | ✅ הושלם |
| 3 | Booking & Pricing Engine (Quote, State Machine, Cancellation Policy, Slot Blocking) | ✅ הושלם |
| 4 | Live Tracking (Socket.io Gateway, Anti-Spoofing, ETA) | ✅ הושלם |
| 5 | Catalog ציבורי (Categories, Providers Search/Profile, Saved Addresses) | ✅ הושלם |
| 6 | העשרת GET /bookings/:id (פרטי קשר + כתובת, אחרי אימות בעלות) | ✅ הושלם |
| 7 | Reviews (דירוג + ביקורת + טיפ אחרי סיום) | ✅ הושלם |

**🎉 ה-Backend תומך כעת בזרימת המשתמש המלאה משני הצדדים — לקוח וספק — כולל הדירוג בסוף.** נותר להשלים בעתיד: Payments אמיתי (Stripe Connect, כרגע Mock), Admin Module, Provider Onboarding/KYC self-serve, ו-Proxy Calling אמיתי (במקום חשיפת טלפון ישירה).

## פריסה לענן (Deployment)

**מחסנית מומלצת (הכל בחינם, נכון ל-2026):** Render (שרת Node) + Supabase (PostgreSQL) + Upstash (Redis).
*למה לא Railway/Render לכל השלושה:* Railway כבר לא מציע Free Tier אמיתי (קרדיט חד-פעמי בלבד, אח"כ מינימום $5/חודש), ו-Postgres חינמי ב-Render נמחק אוטומטית אחרי 30 יום — לא מתאים לכלום מעבר להדגמה חד-פעמית.

1. **Supabase** → פרויקט חדש → Project Settings → Database → להעתיק את ה-Connection String (URI) → זה `DATABASE_URL`.
2. **Upstash** → Redis database חדש → להעתיק את ה-`redis://`/`rediss://` Connection String → זה `REDIS_URL`.
3. **Render** → New → Blueprint → לחבר את ה-repo הזה (מכיל `render.yaml` שכבר מוגדר) → למלא `DATABASE_URL`/`REDIS_URL` ב-Dashboard (שאר המשתנים כבר מוגדרים ב-Blueprint, כולל ג'נרוט אוטומטי של סודות JWT).
4. Render מריץ `prisma migrate deploy` אוטומטית בכל Deploy (מוגדר ב-`buildCommand`) — אין צורך להריץ מיגרציות ידנית.
5. **⚠️ אין מסך הרשמת ספק (ר' מגבלה ידועה למעלה) — יש ליצור ידנית לפחות ספק מאושר אחד** דרך SQL Editor של Supabase (או `npx prisma studio` מחובר ל-`DATABASE_URL` הפרודקשן) לפני שהאפליקציה תציג תוצאות חיפוש.
6. שירות ה-Web החינמי של Render "נרדם" אחרי 15 דקות חוסר פעילות (הבקשה הראשונה אחרי שינה לוקחת כ-30-60 שניות "להתעורר") — תקין להדגמה/בדיקות; לביטול לגמרי, לשדרג ל-Starter ($7/חודש).

