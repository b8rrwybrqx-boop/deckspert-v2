export type UploadedBlobResult = {
  url: string;
  pathname: string;
  contentType: string;
};

export async function uploadVideoDirect(
  file: File,
  onProgress?: (percent: number) => void,
  handleUploadUrl = "/api/upload-token"
): Promise<UploadedBlobResult> {
  const { upload } = await import("@vercel/blob/client");

  const blob = await upload(file.name, file, {
    access: "public",
    handleUploadUrl,
    onUploadProgress(progressEvent) {
      onProgress?.(Math.round(progressEvent.percentage));
    }
  });

  return {
    url: blob.url,
    pathname: blob.pathname,
    contentType: blob.contentType
  };
}
