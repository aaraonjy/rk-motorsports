export const SEA_COUNTRIES = [
  { code: "MY", name: "Malaysia" },
  { code: "SG", name: "Singapore" },
  { code: "TH", name: "Thailand" },
  { code: "ID", name: "Indonesia" },
  { code: "VN", name: "Vietnam" },
  { code: "PH", name: "Philippines" },
  { code: "BN", name: "Brunei" },
  { code: "KH", name: "Cambodia" },
  { code: "LA", name: "Laos" },
  { code: "MM", name: "Myanmar" },
] as const;

export const CUSTOMER_CURRENCIES = [
  { code: "MYR", name: "Malaysian Ringgit" },
  { code: "SGD", name: "Singapore Dollar" },
  { code: "THB", name: "Thai Baht" },
  { code: "IDR", name: "Indonesian Rupiah" },
  { code: "VND", name: "Vietnamese Dong" },
  { code: "PHP", name: "Philippine Peso" },
  { code: "BND", name: "Brunei Dollar" },
  { code: "USD", name: "US Dollar" },
] as const;

export const CUSTOMER_REGISTRATION_ID_TYPES = [
  { value: "BRN", label: "BRN" },
  { value: "NRIC", label: "NRIC" },
  { value: "PASSPORT", label: "Passport" },
  { value: "ARMY", label: "Army" },
] as const;
