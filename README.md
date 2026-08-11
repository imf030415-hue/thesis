# THESIS — הפעלה עם נתונים אמיתיים

אפליקציית THESIS מוכנה לפריסה. היא מושכת נתוני שוק אמיתיים ומריצה את Melo (ה‑AI)
דרך שני שרתי‑ביניים שמחזיקים את המפתחות בצד השרת (המפתחות לעולם לא נחשפים בדפדפן).

## מה צריך: שני מפתחות (חינם/זול)
1. **Twelve Data** — לנתוני השוק. הרשמה חינם ב‑https://twelvedata.com/register
   המפתח מופיע בדשבורד תחת "API Keys". תוכנית חינמית: 800 קרדיטים/יום, 8 בקשות/דקה.
2. **Anthropic** — ל‑Melo (ה‑AI). מפתח מ‑https://console.anthropic.com (Billing → API Keys).

## פריסה ב‑Vercel (הדרך הקלה)
1. העלה את התיקייה הזו ל‑GitHub (repo חדש).
2. היכנס ל‑https://vercel.com → "Add New… → Project" → בחר את ה‑repo → Deploy.
3. ב‑Vercel: Settings → Environment Variables, הוסף:
   - `TWELVEDATA_API_KEY` = המפתח מ‑Twelve Data
   - `ANTHROPIC_API_KEY` = המפתח מ‑Anthropic
4. חזור ל‑Deployments → Redeploy. זהו — פתח את האתר, לשונית "השוק" תתמלא בנתונים אמיתיים.

Vercel מזהה אוטומטית את התיקייה `api/` כפונקציות שרת (`/api/td`, `/api/ai`) —
אין מה להגדיר ידנית.

## הרצה מקומית (לבדיקה על המחשב שלך)
```
npm install
# הגדר משתני סביבה (למשל בקובץ .env או ב‑terminal):
#   TWELVEDATA_API_KEY=...   ANTHROPIC_API_KEY=...
npm run dev
```
להרצה מקומית מלאה עם הפונקציות מומלץ `vercel dev` (דורש Vercel CLI: `npm i -g vercel`).

## הערות
- הקוד לא ממציא נתונים. אם מפתח חסר או נתון לא זמין — יוצג "אין נתון זמין כרגע".
- ה‑proxy כולל caching קצר כדי לא לשרוף קרדיטים של Twelve Data.
- אם ה‑AI מחזיר שגיאת מודל, עדכן את `AI_MODEL` בראש `src/App.jsx` לשם מודל עדכני
  מ‑https://docs.claude.com.
