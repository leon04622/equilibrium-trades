import { useState, useCallback } from "react";
import type { UppyFile } from "@uppy/core";

interface UploadMetadata {
  name: string;
  size: number;
  contentType: string;
}

interface UploadResponse {
  uploadURL: string;
  objectPath: string;
  metadata: UploadMetadata;
}

interface UseUploadOptions {
  onSuccess?: (response: UploadResponse) => void;
  onError?: (error: Error) => void;
}

async function parseUploadJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Empty response from upload server");
  }
  if (trimmed.startsWith("<")) {
    throw new Error(
      "Upload API returned HTML instead of JSON. Open the app through your app URL (same host as the API), not a separate Vite port.",
    );
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error(trimmed.length > 120 ? `${trimmed.slice(0, 120)}…` : trimmed);
  }
}

/**
 * React hook for handling file uploads with presigned URLs.
 *
 * This hook implements the two-step presigned URL upload flow:
 * 1. Request a presigned URL from your backend (sends JSON metadata, NOT the file)
 * 2. Upload the file directly to the presigned URL
 *
 * @example
 * ```tsx
 * function FileUploader() {
 *   const { uploadFile, isUploading, error } = useUpload({
 *     onSuccess: (response) => {
 *       console.log("Uploaded to:", response.objectPath);
 *     },
 *   });
 *
 *   const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
 *     const file = e.target.files?.[0];
 *     if (file) {
 *       await uploadFile(file);
 *     }
 *   };
 *
 *   return (
 *     <div>
 *       <input type="file" onChange={handleFileChange} disabled={isUploading} />
 *       {isUploading && <p>Uploading...</p>}
 *       {error && <p>Error: {error.message}</p>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useUpload(options: UseUploadOptions = {}) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [progress, setProgress] = useState(0);

  /**
   * Request a presigned URL from the backend.
   * IMPORTANT: Send JSON metadata, NOT the file itself.
   */
  const requestUploadUrl = useCallback(
    async (file: File): Promise<UploadResponse> => {
      const response = await fetch("/api/uploads/request-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type || "application/octet-stream",
        }),
      });

      const data = (await parseUploadJsonResponse(response)) as {
        error?: string;
        uploadURL?: string;
        objectPath?: string;
        metadata?: UploadMetadata;
      };

      if (!response.ok) {
        const serverMsg = typeof data.error === "string" ? data.error : "Failed to get upload URL";
        const isUnavailable = response.status === 503 || response.status === 504;
        const fallback = isUnavailable
          ? "Upload service unavailable (503/504). Confirm the server is running and /api/uploads/request-url is reachable."
          : "";
        throw new Error(`${serverMsg}${fallback ? ` ${fallback}` : ""}`);
      }

      if (!data.uploadURL || !data.objectPath) {
        throw new Error("Invalid upload URL response from server");
      }

      return {
        uploadURL: data.uploadURL,
        objectPath: data.objectPath,
        metadata: data.metadata ?? {
          name: file.name,
          size: file.size,
          contentType: file.type || "application/octet-stream",
        },
      };
    },
    []
  );

  /**
   * Upload a file directly to the presigned URL.
   */
  const uploadToPresignedUrl = useCallback(
    async (file: File, uploadURL: string): Promise<void> => {
      const response = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
      });

      if (!response.ok) {
        const corsHint =
          uploadURL.startsWith("http") && !uploadURL.startsWith(window.location.origin)
            ? " If this is cloud storage, confirm bucket CORS allows browser PUT from your domain."
            : "";
        throw new Error(
          `Upload failed (${response.status} ${response.statusText || ""}).${corsHint}`.trim(),
        );
      }
    },
    []
  );

  /**
   * Upload a file using the presigned URL flow.
   *
   * @param file - The file to upload
   * @returns The upload response containing the object path
   */
  const uploadFile = useCallback(
    async (file: File): Promise<UploadResponse | null> => {
      setIsUploading(true);
      setError(null);
      setProgress(0);

      try {
        // Step 1: Request presigned URL (send metadata as JSON)
        setProgress(10);
        const uploadResponse = await requestUploadUrl(file);

        // Step 2: Upload file directly to presigned URL
        setProgress(30);
        await uploadToPresignedUrl(file, uploadResponse.uploadURL);

        setProgress(100);
        options.onSuccess?.(uploadResponse);
        return uploadResponse;
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Upload failed");
        setError(error);
        options.onError?.(error);
        return null;
      } finally {
        setIsUploading(false);
      }
    },
    [requestUploadUrl, uploadToPresignedUrl, options]
  );

  /**
   * Get upload parameters for Uppy's AWS S3 plugin.
   *
   * IMPORTANT: This function receives the UppyFile object from Uppy.
   * Use file.name, file.size, file.type to request per-file presigned URLs.
   *
   * Use this with the ObjectUploader component:
   * ```tsx
   * <ObjectUploader onGetUploadParameters={getUploadParameters}>
   *   Upload
   * </ObjectUploader>
   * ```
   */
  const getUploadParameters = useCallback(
    async (
      file: UppyFile<Record<string, unknown>, Record<string, unknown>>
    ): Promise<{
      method: "PUT";
      url: string;
      headers?: Record<string, string>;
    }> => {
      // Use the actual file properties to request a per-file presigned URL
      const response = await fetch("/api/uploads/request-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type || "application/octet-stream",
        }),
      });

      const data = (await parseUploadJsonResponse(response)) as {
        uploadURL?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Failed to get upload URL",
        );
      }

      if (!data.uploadURL) {
        throw new Error("Failed to get upload URL");
      }

      return {
        method: "PUT",
        url: data.uploadURL,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      };
    },
    []
  );

  return {
    uploadFile,
    getUploadParameters,
    isUploading,
    error,
    progress,
  };
}

