export const PASSWORD_REQUIREMENTS_TEXT =
  "Password must be at least 8 characters and include uppercase, lowercase, and a number.";

export function validatePasswordComplexity(password: string) {
  const normalized = password || "";

  if (normalized.length < 8) {
    return PASSWORD_REQUIREMENTS_TEXT;
  }

  if (!/[A-Z]/.test(normalized)) {
    return PASSWORD_REQUIREMENTS_TEXT;
  }

  if (!/[a-z]/.test(normalized)) {
    return PASSWORD_REQUIREMENTS_TEXT;
  }

  if (!/\d/.test(normalized)) {
    return PASSWORD_REQUIREMENTS_TEXT;
  }

  return null;
}
