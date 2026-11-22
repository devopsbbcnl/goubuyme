import { uploadImage } from '@/utils/upload';

/**
 * Uploads an identity or verification photo (ID, selfie, certificate, licence) privately.
 * Returns the reference to send back to the API when submitting the form; the photo itself can only be
 * viewed by its owner and GoBuyMe staff, through short-lived links.
 */
export const uploadKycImage = (uri: string): Promise<string> => uploadImage(uri, 'kyc');
