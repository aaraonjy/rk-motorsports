import { put } from "@vercel/blob";

export async function saveFile(file: File, prefix: string) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const pathname = `${prefix}/${Date.now()}-${safeName}`;

  const blob = await put(pathname, file, {
    access: "private",
    addRandomSuffix: false,
  });

  return {
    fileName: file.name,
    storagePath: blob.pathname, // store blob pathname, not local /uploads path
    mimeType: file.type || "application/octet-stream",
  };
}