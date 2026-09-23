import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function uploadToCloudinary(
  fileBuffer: Buffer,
  folder: string,
): Promise<{ secure_url: string; public_id: string }> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "image" },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error("Cloudinary upload failed"));
          return;
        }

        resolve({
          secure_url: result.secure_url,
          public_id: result.public_id,
        });
      },
    );

    uploadStream.end(fileBuffer);
  });
}

export async function uploadRawToCloudinary(
  fileBuffer: Buffer,
  folder: string,
  publicId: string,
): Promise<{ secure_url: string; public_id: string }> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder, public_id: publicId, resource_type: "raw" },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error("Cloudinary raw upload failed"));
          return;
        }

        resolve({ secure_url: result.secure_url, public_id: result.public_id });
      },
    );
    uploadStream.end(fileBuffer);
  });
}

export async function uploadInvoicePdfToCloudinary(
  fileBuffer: Buffer,
  folder: string,
  publicId: string,
): Promise<{ secure_url: string; public_id: string }> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: "image",
        format: "pdf",
      },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error("Cloudinary invoice PDF upload failed"));
          return;
        }

        resolve({ secure_url: result.secure_url, public_id: result.public_id });
      },
    );
    uploadStream.end(fileBuffer);
  });
}

export async function deleteFromCloudinary(publicId: string): Promise<void> {
  const result = await cloudinary.uploader.destroy(publicId, {
    resource_type: "image",
  });

  if (result.result !== "ok" && result.result !== "not found") {
    throw new Error(`Cloudinary delete failed: ${result.result}`);
  }
}

export default cloudinary;
