import fs from "node:fs/promises";
import path from "node:path";

function uploadDir() {
  return process.env.LOCAL_UPLOAD_DIR || "public/uploads";
}

export async function saveFile(file: File, prefix: string) {
  const dir = path.join(process.cwd(), uploadDir());
  await fs.mkdir(dir, { recursive: true });
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const finalName = `${Date.now()}-${prefix}-${safeName}`;
  const fullPath = path.join(dir, finalName);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(fullPath, buffer);
  return {
    fileName: file.name,
    storagePath: `/uploads/${finalName}`,
    mimeType: file.type || "application/octet-stream",
  };
}
