import { uploadImage, type UploadPurpose } from './upload';

// Uploads no longer go to Cloudinary: this file only keeps the old function names working for the pages that
// still import them. New code should call `uploadImage(file, purpose)` from './upload' directly.

const PURPOSE_BY_FOLDER: Record<string, UploadPurpose> = {
  'rider-avatars': 'avatar',
  'customer-avatars': 'avatar',
  'vendor-logos': 'logo',
  'vendor-onboarding/logo': 'logo',
  'vendor-onboarding/cover': 'cover',
  'vendor-covers': 'cover',
  'vendor-promotions': 'promo',
  'menu-items': 'menu',
};

/** Identity and verification photos: stored privately. */
export const uploadKycImage = (file: File): Promise<string> => uploadImage(file, 'kyc');

/** Public photos. `folder` is the old Cloudinary folder name; it now only chooses the upload purpose. */
export async function uploadToCloudinary(file: File, folder = 'uploads'): Promise<string> {
  const purpose = PURPOSE_BY_FOLDER[folder];
  if (!purpose) throw new Error(`Unknown upload folder: ${folder}`);
  return uploadImage(file, purpose);
}
