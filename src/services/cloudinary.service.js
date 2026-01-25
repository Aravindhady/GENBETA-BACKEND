import cloudinary from '../config/cloudinary.js';

export const uploadImage = async (base64String, folder = 'signatures') => {
  try {
    const uploadResponse = await cloudinary.uploader.upload(base64String, {
      folder: folder,
      resource_type: 'image',
    });
    return {
      url: uploadResponse.secure_url,
      publicId: uploadResponse.public_id,
    };
    } catch (error) {
      console.error('Cloudinary upload error:', error);
      throw new Error(error.message || 'Failed to upload image to Cloudinary');
    }
};

export const deleteImage = async (publicId) => {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error('Cloudinary delete error:', error);
  }
};
