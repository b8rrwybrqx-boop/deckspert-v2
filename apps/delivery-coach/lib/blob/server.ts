import { put } from "@vercel/blob";

export async function uploadDerivedAsset(
  pathname: string,
  body: Blob | Uint8Array,
  contentType: string
) {
  return put(pathname, body, {
    access: "public",
    contentType,
    addRandomSuffix: true
  });
}
