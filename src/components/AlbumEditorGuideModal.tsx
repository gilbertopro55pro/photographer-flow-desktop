// Ported from the web app's own editor (src/components/AlbumEditorGuideModal.tsx) — content
// adapted to what's actually true for the DESKTOP editor specifically: no multi-page picker/
// top-menu export flow (this app is a single-page native editor; page-switching isn't ported yet),
// double-click enters pan/position mode here (not a direct re-center), and every feature ported
// across this session's rounds (adjustments panel, shadow distance/blur split, outline/line
// shapes, element locking, undo, multi-select bulk drag) is included since it's now real.
type GuideSection = {
  title: string;
  items: string[];
};

const GUIDE_SECTIONS: GuideSection[] = [
  {
    title: "הוספת תמונות לעמוד",
    items: [
      "פאנל התמונות המועדפות בתחתית התפריט הצדדי מציג את כל התמונות שהלקוח/ה סימנו כמועדפות — גררו תמונה משם היישר אל המסגרת הרצויה בעמוד.",
      "מעבר עכבר מעל תמונה בפאנל מציג תצוגה מוגדלת שלה בצד — יש מתג קטן (עם סימן שאלה) להפעלה/כיבוי של התצוגה הזו לפי הצורך.",
      "לחיצה על כמה תמונות בפאנל בוחרת אותן יחד (מסומנות בעיגול כתום) — גררו כל אחת מהן כדי לשבץ את כולן בעמוד בבת אחת, לפי הכיוון של כל תמונה.",
      "\"רק זמינות / הצג הכל\" בפאנל קובע אם רואים גם תמונות שכבר שובצו בעמוד הנוכחי (מסומנות ב-✓ ירוק) או רק כאלה שעדיין לא נוצלו.",
      "כפתור \"+ תמונה\" פותח קודם בורר גודל קבוע (אוטומטי / מלבן / עיגול / ריבוע), ואז בורר מלא המאפשר לבחור כמה תמונות בבת אחת — הכלי בונה עבורן אוטומטית פריסה בעמוד.",
    ],
  },
  {
    title: "עריכה חופשית על הקנבס",
    items: [
      "גרירה רגילה מזיזה תמונה/צורה/טקסט; גרירה מהפינות או מהצדדים משנה גודל בכל אחד מ-8 הכיוונים. אחיזת Alt בזמן שינוי גודל מגדילה/מקטינה סימטרית משני הצדדים יחד.",
      "אחיזת Ctrl וגרירה בתוך תמונה מזיזה את הזום שלה; לחיצה כפולה על תמונה נכנסת למצב מיקום/פאן — גרירה אחריה מזיזה את התמונה בתוך המסגרת הקבועה שלה.",
      "מקשי החצים מזיזים את האלמנט הנבחר בעדינות (הזזה גדולה יותר עם Shift), ומקש Delete/Backspace מוחק את מה שנבחר.",
      "Cmd/Ctrl+Z מבטל את הפעולה האחרונה (גרירה, שינוי גודל, מחיקה ועוד).",
      "קליק ימני על תמונה בפאנל התמונות המועדפות פותח תפריט לקביעה/ביטול שלה כתמונת רקע לעמוד.",
    ],
  },
  {
    title: "בחירה מרובה",
    items: [
      "Cmd/Ctrl+A בוחר בבת אחת את כל התמונות/עיטורים/צורות בעמוד.",
      "גרירת מלבן ריק על אזור בעמוד (\"מרקיזה\") בוחרת בבת אחת את כל התמונות שבתוכו.",
      "כל פעולה בתפריט הצף (מחיקה, קדימה/אחורה, שינוי גודל) פועלת על כל האלמנטים שנבחרו יחד, לא רק על אחד.",
    ],
  },
  {
    title: "נעילת אלמנט",
    items: [
      "כפתור הנעילה בתפריט הצף של כל אלמנט (תמונה/טקסט/עיטור/צורה) חוסם הזזה ושינוי גודל שלו בטעות — האלמנט עדיין ניתן לבחירה ולעריכה בכל דרך אחרת (צבע, אפקטים וכו׳), ואפשר לשחרר את הנעילה באותו כפתור.",
    ],
  },
  {
    title: "תפריט צף לתמונה נבחרת",
    items: [
      "מופיע צמוד לתמונה הנבחרת: הצגה בגודל נכון, שמירת יחס גובה-רוחב, נעילה, שקיפות, טשטוש, סיבוב, צל וקו מתאר (כולל מרחק וטשטוש נפרדים לצל), קדימה/אחורה בשכבות ומחיקה.",
      "כפתור \"עריכת תמונה\" פותח פאנל כוונון מלא: חשיפה, ניגודיות, הבהרות/צללים, לבנים/שחורים, איזון לבן (טמפרטורה/גוון), רוויה, וחידוד — כל השינויים נשמרים כחלק מהעיצוב וגם נכנסים לייצוא הסופי (PDF/JPG/PSD).",
    ],
  },
  {
    title: "מסכות, עיטורים וצורות",
    items: [
      "כפתור \"מסכות\" פותח בנק מסכות מוכן — גררו מסכה אל תמונה או צורה כדי להחיל אותה.",
      "כפתור \"עיטורים\" מוסיף לעמוד עיטורים גרפיים בלחיצה או בגרירה למיקום מדויק; אפשר גם להעלות עיטורים מותאמים אישית וללשוניות משלכם, ולצבוע אותם בכל צבע.",
      "כפתור \"צורות\" מוסיף מלבן, ריבוע, עיגול או קו — כולל גרסאות \"קו מתאר בלבד\" בלי מילוי (ריבוע/מלבן/עיגול), עם סרגל עובי קו ייעודי לצורת הקו הדק.",
      "לכל עיטור וצורה יש תפריט צף משלו לשינוי צבע, שקיפות, סיבוב, שכבה, נעילה ומחיקה.",
    ],
  },
  {
    title: "טקסט",
    items: [
      "כפתור \"T\" (או מקש T במקלדת) פותח תיבת טקסט חדשה בעמוד.",
      "התפריט הצף של טקסט נבחר מאפשר לשנות צבע מתוך פלטה מוכנה, יישור (ימין/מרכז/שמאל), גופן (עברית/אנגלית בנפרד), גודל, נעילה ומחיקה.",
    ],
  },
  {
    title: "רקע העמוד וקווי עזר",
    items: [
      "אפשר לקבוע לעמוד תמונת רקע, עם שליטה על שקיפות, טשטוש (Blur) וזום שלה.",
      "בזמן גרירה/שינוי גודל מופיעים קווי עזר: מרכז העמוד, יישור לרכיבים שכנים, והצמדה למרווח הבטיחון להדפסה (המסגרת הירוקה) — עם הבהרה ויזואלית כשההצמדה פעילה.",
      "צורות \"קו מתאר בלבד\" וקווים יכולים לחרוג ולהימתח מעבר לגבולות העמוד בכוונה, בניגוד לכל אלמנט אחר.",
    ],
  },
  {
    title: "שמירה ויציאה",
    items: [
      "כל עריכה בעמוד נשמרת רק בלחיצה על כפתור \"שמירה\" בתחתית התפריט הצדדי.",
      "ניסיון לסגור את העורך כשיש שינויים שלא נשמרו מציג אישור יציאה, כדי שלא תאבדו עבודה בטעות.",
    ],
  },
];

export default function AlbumEditorGuideModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center p-4"
      style={{ background: "rgba(46,49,66,0.55)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-3xl bg-paper shadow-sheet max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 px-5 pt-5 pb-3 bg-paper flex items-center justify-between border-b border-line">
          <h2 className="text-lg font-bold font-display">מדריך לכלי עיצוב האלבום</h2>
          <button
            onClick={onClose}
            aria-label="סגירה"
            className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line"
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4 space-y-5">
          {GUIDE_SECTIONS.map((section) => (
            <div key={section.title}>
              <h3 className="text-sm font-bold mb-1.5 text-amber-deep">{section.title}</h3>
              <ul className="space-y-1">
                {section.items.map((item, i) => (
                  <li key={i} className="text-xs text-ink-soft leading-relaxed flex gap-1.5">
                    <span className="shrink-0">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
