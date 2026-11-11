// The 14 major allergens that must be declared under EU food-information
// law (Regulation (EU) No 1169/2011, Annex II) + the dietary flags guests
// filter by. Keys are stored in menu_items.allergens / menu_items.dietary
// as text[] — never free text, so filters and labels stay consistent.
export const ALLERGENS = [
  { key: "celery", label: "Celery" },
  { key: "gluten", label: "Cereals containing gluten" },
  { key: "crustaceans", label: "Crustaceans" },
  { key: "eggs", label: "Eggs" },
  { key: "fish", label: "Fish" },
  { key: "lupin", label: "Lupin" },
  { key: "milk", label: "Milk" },
  { key: "molluscs", label: "Molluscs" },
  { key: "mustard", label: "Mustard" },
  { key: "nuts", label: "Tree nuts" },
  { key: "peanuts", label: "Peanuts" },
  { key: "sesame", label: "Sesame seeds" },
  { key: "soy", label: "Soya" },
  { key: "sulphites", label: "Sulphur dioxide / sulphites" },
] as const;

export const DIETARY = [
  { key: "vegan", label: "Vegan", ur: "ویگن" },
  { key: "vegetarian", label: "Vegetarian", ur: "سبزی خور" },
  { key: "gluten_free", label: "Gluten-free", ur: "گلوٹین فری" },
  { key: "halal", label: "Halal", ur: "حلال" },
] as const;

export const allergenLabel = (key: string): string =>
  ALLERGENS.find((a) => a.key === key)?.label ?? key;

export const dietaryLabel = (key: string, lang: "en" | "ur" = "en"): string => {
  const d = DIETARY.find((x) => x.key === key);
  if (!d) return key;
  return lang === "ur" ? d.ur : d.label;
};
