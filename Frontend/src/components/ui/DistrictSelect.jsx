import { useState, useMemo, useRef, useEffect } from "react";
import { useTranslation } from "@/lib/i18n/useTranslation";

const PAKISTAN_CITIES = {
  Punjab: [
    "Faisalabad", "Lahore", "Rawalpindi", "Multan", "Gujranwala", "Sialkot",
    "Bahawalpur", "Sargodha", "Sheikhupura", "Jhang", "Rahim Yar Khan",
    "Gujrat", "Kasur", "Okara", "Sahiwal", "Wah Cantonment", "Dera Ghazi Khan",
    "Chiniot", "Kamoke", "Hafizabad", "Khanewal", "Muzaffargarh", "Mianwali",
    "Bhakkar", "Vehari", "Pakpattan", "Toba Tek Singh", "Jhelum", "Mandi Bahauddin",
    "Attock", "Chakwal", "Khushab", "Lodhran", "Narowal", "Nankana Sahib",
  ],
  Sindh: [
    "Karachi", "Hyderabad", "Sukkur", "Larkana", "Nawabshah", "Mirpur Khas",
    "Jacobabad", "Shikarpur", "Khairpur", "Dadu", "Thatta", "Badin",
    "Tando Adam", "Tando Allahyar", "Umerkot", "Sanghar", "Ghotki", "Kashmore",
  ],
  "Khyber Pakhtunkhwa": [
    "Peshawar", "Mardan", "Abbottabad", "Swat", "Kohat", "Dera Ismail Khan",
    "Charsadda", "Nowshera", "Mansehra", "Swabi", "Bannu", "Haripur",
    "Chitral", "Dir", "Timergara", "Batkhela", "Shangla", "Hangu",
  ],
  Balochistan: [
    "Quetta", "Gwadar", "Turbat", "Khuzdar", "Chaman", "Sibi", "Zhob",
    "Loralai", "Pishin", "Hub", "Dera Murad Jamali", "Usta Muhammad",
  ],
  "Islamabad Capital Territory": ["Islamabad"],
  "Azad Jammu & Kashmir": [
    "Muzaffarabad", "Mirpur", "Kotli", "Rawalakot", "Bhimber", "Bagh",
  ],
  Gilgit: ["Gilgit", "Skardu", "Hunza", "Chilas", "Ghanche"],
};

// English → Urdu city names
const CITY_URDU = {
  // Punjab
  Faisalabad: "فیصل آباد",
  Lahore: "لاہور",
  Rawalpindi: "راولپنڈی",
  Multan: "ملتان",
  Gujranwala: "گوجرانوالہ",
  Sialkot: "سیالکوٹ",
  Bahawalpur: "بہاولپور",
  Sargodha: "سرگودھا",
  Sheikhupura: "شیخوپورہ",
  Jhang: "جھنگ",
  "Rahim Yar Khan": "رحیم یار خان",
  Gujrat: "گجرات",
  Kasur: "قصور",
  Okara: "اوکاڑہ",
  Sahiwal: "ساہیوال",
  "Wah Cantonment": "واہ کینٹ",
  "Dera Ghazi Khan": "ڈیرہ غازی خان",
  Chiniot: "چنیوٹ",
  Kamoke: "کامونکی",
  Hafizabad: "حافظ آباد",
  Khanewal: "خانیوال",
  Muzaffargarh: "مظفر گڑھ",
  Mianwali: "میانوالی",
  Bhakkar: "بھکر",
  Vehari: "وہاڑی",
  Pakpattan: "پاکپتن",
  "Toba Tek Singh": "ٹوبہ ٹیک سنگھ",
  Jhelum: "جہلم",
  "Mandi Bahauddin": "منڈی بہاؤالدین",
  Attock: "اٹک",
  Chakwal: "چکوال",
  Khushab: "خوشاب",
  Lodhran: "لودھراں",
  Narowal: "نارووال",
  "Nankana Sahib": "ننکانہ صاحب",

  // Sindh
  Karachi: "کراچی",
  Hyderabad: "حیدرآباد",
  Sukkur: "سکھر",
  Larkana: "لاڑکانہ",
  Nawabshah: "نوابشاہ",
  "Mirpur Khas": "میرپور خاص",
  Jacobabad: "جیکب آباد",
  Shikarpur: "شکا پور",
  Khairpur: "خیرپور",
  Dadu: "دادو",
  Thatta: "ٹھٹہ",
  Badin: "بدین",
  "Tando Adam": "ٹنڈو آدم",
  "Tando Allahyar": "ٹنڈو اللہ یار",
  Umerkot: "عمرکوٹ",
  Sanghar: "سانگھڑ",
  Ghotki: "گھوٹکی",
  Kashmore: "کشمور",

  // Khyber Pakhtunkhwa
  Peshawar: "پشاور",
  Mardan: "مردان",
  Abbottabad: "ایبٹ آباد",
  Swat: "سوات",
  Kohat: "کوہاٹ",
  "Dera Ismail Khan": "ڈیرہ اسماعیل خان",
  Charsadda: "چارسدہ",
  Nowshera: "نوشہرہ",
  Mansehra: "مانسہرہ",
  Swabi: "سوابی",
  Bannu: "بنوں",
  Haripur: "ہری پور",
  Chitral: "چترال",
  Dir: "دیر",
  Timergara: "تیمگرہ",
  Batkhela: "بٹ خیلہ",
  Shangla: "شانگلہ",
  Hangu: "ہنگو",

  // Balochistan
  Quetta: "کوئٹہ",
  Gwadar: "گوادر",
  Turbat: "تربٹ",
  Khuzdar: "خضدار",
  Chaman: "چمن",
  Sibi: "سبی",
  Zhob: "ژوب",
  Loralai: "لورالائی",
  Pishin: "پشین",
  Hub: "حب",
  "Dera Murad Jamali": "ڈیرہ مراد جمالی",
  "Usta Muhammad": "استا محمد",

  // ICT
  Islamabad: "اسلام آباد",

  // AJK
  Muzaffarabad: "مظفر آباد",
  Mirpur: "میرپور",
  Kotli: "کوٹلی",
  Rawalakot: "راولاکوٹ",
  Bhimber: "بھمبر",
  Bagh: "باغ",

  // Gilgit
  Gilgit: "گلگت",
  Skardu: "سکردو",
  Hunza: "ہنزہ",
  Chilas: "چلاس",
  Ghanche: "گھانچے",
};

const PROVINCE_KEYS = {
  Punjab: "provincePunjab",
  Sindh: "provinceSindh",
  "Khyber Pakhtunkhwa": "provinceKPK",
  Balochistan: "provinceBalochistan",
  "Islamabad Capital Territory": "provinceICT",
  "Azad Jammu & Kashmir": "provinceAJK",
  Gilgit: "provinceGilgit",
};

const ALL_CITIES = Object.entries(PAKISTAN_CITIES).flatMap(([province, cities]) =>
  cities.map((city) => ({ city, province }))
);

export default function DistrictSelect({ value, onChange, placeholder }) {
  const { t, lang } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedProvince, setSelectedProvince] = useState(null);
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const containerRef = useRef(null);
  const customInputRef = useRef(null);

  const resolvedPlaceholder = placeholder ?? t("districtPlaceholder");

  // Show Urdu name when language is ur, otherwise English
  function cityLabel(city) {
    if (lang === "ur" && CITY_URDU[city]) {
      return CITY_URDU[city];
    }
    return city;
  }

  // Display value on the closed button
  const displayValue = value ? cityLabel(value) : resolvedPlaceholder;

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setSelectedProvince(null);
        setSearch("");
        setIsCustomMode(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isCustomMode && customInputRef.current) {
      customInputRef.current.focus();
    }
  }, [isCustomMode]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ALL_CITIES;
    return ALL_CITIES.filter((item) => {
      const provinceName = t(PROVINCE_KEYS[item.province] || item.province);
      const cityUrdu = CITY_URDU[item.city] || "";
      return (
        item.city.toLowerCase().includes(q) ||
        cityUrdu.includes(q) ||
        item.province.toLowerCase().includes(q) ||
        provinceName.toLowerCase().includes(q)
      );
    });
  }, [search, t]);

  const provinces = Object.keys(PAKISTAN_CITIES);

  function handleSelectCity(city) {
    onChange(city); // still save English value
    setOpen(false);
    setSelectedProvince(null);
    setSearch("");
    setIsCustomMode(false);
  }

  function handleCustomSave() {
    const trimmed = customValue.trim();
    if (trimmed) {
      onChange(trimmed);
      setOpen(false);
      setIsCustomMode(false);
      setCustomValue("");
      setSearch("");
      setSelectedProvince(null);
    }
  }

  function citiesLabel(count) {
    return t("citiesCount").replace("{n}", count);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-full items-center justify-between rounded-lg border border-border bg-white px-3 text-left text-[13px] text-ink-900"
      >
        <span className={value ? "text-ink-900" : "text-ink-400"}>
          {displayValue}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path
            d="M2 4 L6 8 L10 4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-border bg-cream-card shadow-lg">
          {!isCustomMode && (
            <div className="border-b border-border p-2">
              <input
                autoFocus
                type="text"
                placeholder={t("searchCityProvince")}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSelectedProvince(null);
                }}
                className="h-9 w-full rounded-lg border border-border bg-cream-inset px-3 text-[13px] outline-none focus:border-forest-500"
              />
            </div>
          )}

          <div className="max-h-64 overflow-y-auto">
            {isCustomMode ? (
              <div className="p-3">
                <div className="mb-2 text-xs font-semibold text-ink-600">
                  {t("enterCityManually")}
                </div>
                <input
                  ref={customInputRef}
                  type="text"
                  placeholder={t("typeYourCity")}
                  value={customValue}
                  onChange={(e) => setCustomValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleCustomSave();
                    }
                  }}
                  className="mb-3 h-9 w-full rounded-lg border border-border bg-cream-inset px-3 text-[13px] outline-none focus:border-forest-500"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleCustomSave}
                    disabled={!customValue.trim()}
                    className="h-9 flex-1 rounded-lg bg-forest-900 text-[13px] font-semibold text-white disabled:opacity-50"
                  >
                    {t("saveCity")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomMode(false);
                      setCustomValue("");
                    }}
                    className="h-9 rounded-lg border border-border px-3 text-[13px] font-medium text-ink-700"
                  >
                    {t("cancel")}
                  </button>
                </div>
              </div>
            ) : search.trim() ? (
              filtered.length === 0 ? (
                <div className="px-3 py-4 text-center">
                  <div className="mb-3 text-xs text-ink-400">{t("noCitiesFound")}</div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomMode(true);
                      setCustomValue(search);
                    }}
                    className="text-[13px] font-semibold text-forest-700 underline"
                  >
                    {t("addCustomCity").replace("{search}", search)}
                  </button>
                </div>
              ) : (
                <>
                  {filtered.map((item) => (
                    <button
                      key={`${item.province}-${item.city}`}
                      type="button"
                      onClick={() => handleSelectCity(item.city)}
                      className="flex w-full items-center justify-between px-3 py-2.5 text-left text-[13px] hover:bg-mint-100"
                    >
                      <span className="font-medium text-ink-900">
                        {cityLabel(item.city)}
                      </span>
                      <span className="text-xs text-ink-400">
                        {t(PROVINCE_KEYS[item.province])}
                      </span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setIsCustomMode(true)}
                    className="flex w-full items-center gap-2 border-t border-border px-3 py-2.5 text-left text-[13px] font-semibold text-forest-700 hover:bg-mint-50"
                  >
                    {t("cityNotListed")}
                  </button>
                </>
              )
            ) : selectedProvince ? (
              <>
                <button
                  type="button"
                  onClick={() => setSelectedProvince(null)}
                  className="flex w-full items-center gap-2 border-b border-border px-3 py-2.5 text-left text-[13px] font-semibold text-forest-700 hover:bg-mint-50"
                >
                  {t("backToProvinces")}
                </button>
                {PAKISTAN_CITIES[selectedProvince].map((city) => (
                  <button
                    key={city}
                    type="button"
                    onClick={() => handleSelectCity(city)}
                    className={`flex w-full px-3 py-2.5 text-left text-[13px] hover:bg-mint-100 ${
                      value === city
                        ? "bg-mint-100 font-semibold text-forest-800"
                        : "text-ink-900"
                    }`}
                  >
                    {cityLabel(city)}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setIsCustomMode(true)}
                  className="flex w-full items-center gap-2 border-t border-border px-3 py-2.5 text-left text-[13px] font-semibold text-forest-700 hover:bg-mint-50"
                >
                  {t("cityNotListed")}
                </button>
              </>
            ) : (
              <>
                {provinces.map((province) => (
                  <button
                    key={province}
                    type="button"
                    onClick={() => setSelectedProvince(province)}
                    className="flex w-full items-center justify-between px-3 py-2.5 text-left text-[13px] hover:bg-mint-100"
                  >
                    <span className="font-medium text-ink-900">
                      {t(PROVINCE_KEYS[province])}
                    </span>
                    <span className="text-xs text-ink-400">
                      {citiesLabel(PAKISTAN_CITIES[province].length)}
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setIsCustomMode(true)}
                  className="flex w-full items-center gap-2 border-t border-border px-3 py-2.5 text-left text-[13px] font-semibold text-forest-700 hover:bg-mint-50"
                >
                  {t("cityNotListed")}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}