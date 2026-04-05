import { put } from "@vercel/blob";

export const MAX_SINGLE_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB
export const MAX_PACKAGE_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB (10MB ECU + 10MB TCU)

export const ALLOWED_UPLOAD_EXTENSIONS = [
  ".bin",
  ".ori",
  ".hex",
  ".frf",
  ".sgo",
  ".read",
  ".full",
  ".mod",
] as const;

export function formatFileSizeLimitMessage(limitBytes: number) {
  const mb = Math.round(limitBytes / (1024 * 1024));
  return `File size limit exceeded. Maximum allowed size is ${mb}MB.`;
}

function hasAllowedFileExtension(fileName: string) {
  const lowerName = fileName.toLowerCase().trim();
  return ALLOWED_UPLOAD_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
}

function formatAllowedExtensionsMessage() {
  return `Invalid file type. Only ${ALLOWED_UPLOAD_EXTENSIONS.join(", ")} files are allowed.`;
}

export function validateSingleUploadFile(file: File) {
  if (!(file instanceof File) || file.size <= 0) {
    return "No file uploaded.";
  }

  if (file.size > MAX_SINGLE_UPLOAD_BYTES) {
    return formatFileSizeLimitMessage(MAX_SINGLE_UPLOAD_BYTES);
  }

  if (!hasAllowedFileExtension(file.name)) {
    return formatAllowedExtensionsMessage();
  }

  return null;
}

export function validatePackageUploadFiles(files: File[]) {
  if (!files.length) {
    return "No file uploaded.";
  }

  for (const file of files) {
    if (!(file instanceof File) || file.size <= 0) {
      return "Invalid file upload.";
    }

    if (file.size > MAX_SINGLE_UPLOAD_BYTES) {
      return formatFileSizeLimitMessage(MAX_SINGLE_UPLOAD_BYTES);
    }

    if (!hasAllowedFileExtension(file.name)) {
      return `Invalid file type for "${file.name}". Only ${ALLOWED_UPLOAD_EXTENSIONS.join(", ")} files are allowed.`;
    }
  }

  const totalSize = files.reduce((sum, file) => sum + file.size, 0);

  if (totalSize > MAX_PACKAGE_UPLOAD_BYTES) {
    return "Total upload size limit exceeded. Maximum allowed size for package upload is 20MB.";
  }

  return null;
}

export async function saveFile(file: File, prefix: string) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const pathname = `${prefix}/${Date.now()}-${safeName}`;

  const blob = await put(pathname, file, {
    access: "private",
    addRandomSuffix: false,
  });

  return {
    fileName: file.name,
    storagePath: blob.pathname,
    mimeType: file.type || "application/octet-stream",
  };
}