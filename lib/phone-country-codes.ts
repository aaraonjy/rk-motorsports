export const PHONE_COUNTRY_CODES = [
  { code: "MY", label: "Malaysia", dialCode: "+60" },
  { code: "SG", label: "Singapore", dialCode: "+65" },
  { code: "ID", label: "Indonesia", dialCode: "+62" },
  { code: "TH", label: "Thailand", dialCode: "+66" },
  { code: "VN", label: "Vietnam", dialCode: "+84" },
  { code: "PH", label: "Philippines", dialCode: "+63" },
  { code: "KH", label: "Cambodia", dialCode: "+855" },
  { code: "LA", label: "Laos", dialCode: "+856" },
  { code: "MM", label: "Myanmar", dialCode: "+95" },
  { code: "BN", label: "Brunei", dialCode: "+673" },

  { code: "CN", label: "China", dialCode: "+86" },
  { code: "HK", label: "Hong Kong", dialCode: "+852" },
  { code: "MO", label: "Macau", dialCode: "+853" },
  { code: "TW", label: "Taiwan", dialCode: "+886" },

  { code: "JP", label: "Japan", dialCode: "+81" },
  { code: "KR", label: "South Korea", dialCode: "+82" },

  { code: "IN", label: "India", dialCode: "+91" },
  { code: "PK", label: "Pakistan", dialCode: "+92" },
  { code: "BD", label: "Bangladesh", dialCode: "+880" },
  { code: "LK", label: "Sri Lanka", dialCode: "+94" },

  { code: "AU", label: "Australia", dialCode: "+61" },
  { code: "NZ", label: "New Zealand", dialCode: "+64" },

  { code: "AE", label: "United Arab Emirates", dialCode: "+971" },
  { code: "SA", label: "Saudi Arabia", dialCode: "+966" },

  { code: "UK", label: "United Kingdom", dialCode: "+44" },
].sort((a, b) => {
  if (a.code === "MY") return -1;
  if (b.code === "MY") return 1;
  return a.label.localeCompare(b.label);
});