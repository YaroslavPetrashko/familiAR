import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Upload, Image as ImageIcon, X } from 'lucide-react';
import heic2any from 'heic2any';

interface PhotoUploadProps {
  onUploadSuccess: () => void;
}

export function PhotoUpload({ onUploadSuccess }: PhotoUploadProps) {
  const [personName, setPersonName] = useState('');
  const [location, setLocation] = useState('');
  const [event, setEvent] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const isHeic = file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif');

      if (!file.type.startsWith('image/') && !isHeic) {
        setError('Please select an image file');
        return;
      }

      setImageFile(file);
      setError('');

      if (isHeic) {
        try {
          const convertedBlob = await heic2any({
            blob: file,
            toType: 'image/jpeg',
            quality: 0.8,
          });
          const blobArray = Array.isArray(convertedBlob) ? convertedBlob : [convertedBlob];
          setPreviewUrl(URL.createObjectURL(blobArray[0]));
        } catch (err) {
          console.error('Error converting HEIC:', err);
          setError('Error processing HEIC file');
        }
      } else {
        setPreviewUrl(URL.createObjectURL(file));
      }
    }
  };

  const clearImage = () => {
    setImageFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!imageFile) {
      setError('Please select an image');
      return;
    }

    setUploading(true);
    setError('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const fileExt = imageFile.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('memories-photos')
        .upload(fileName, imageFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('memories-photos')
        .getPublicUrl(fileName);

      const { error: dbError } = await supabase
        .from('memories_photos')
        .insert({
          image_url: publicUrl,
          person_name: personName,
          location,
          event,
          uploaded_by: user.id,
        });

      if (dbError) throw dbError;

      setPersonName('');
      setLocation('');
      setEvent('');
      clearImage();
      onUploadSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload photo');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-gray-800 rounded-2xl shadow-lg p-6 max-w-2xl mx-auto border border-gray-700">
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-blue-600 p-2 rounded-lg">
          <Upload className="w-6 h-6 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-white">Upload New Memory</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Photo
          </label>

          {!previewUrl ? (
            <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-gray-600 rounded-xl cursor-pointer hover:border-blue-500 hover:bg-gray-700 transition bg-gray-900">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <ImageIcon className="w-12 h-12 text-gray-500 mb-3" />
                <p className="mb-2 text-sm text-gray-300">
                  <span className="font-semibold">Click to upload</span> or drag and drop
                </p>
                <p className="text-xs text-gray-400">PNG, JPG, HEIC, GIF up to 10MB</p>
              </div>
              <input
                type="file"
                className="hidden"
                accept="image/*,.heic,.heif"
                onChange={handleFileChange}
              />
            </label>
          ) : (
            <div className="relative bg-gray-900 rounded-xl">
              <img
                src={previewUrl}
                alt="Preview"
                className="w-full h-96 object-contain rounded-xl"
              />
              <button
                type="button"
                onClick={clearImage}
                className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full hover:bg-red-600 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="personName" className="block text-sm font-medium text-gray-300 mb-1">
            Person's Name <span className="text-red-400">*</span>
          </label>
          <input
            id="personName"
            type="text"
            value={personName}
            onChange={(e) => setPersonName(e.target.value)}
            required
            className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition placeholder-gray-400"
            placeholder="e.g., Sarah Johnson"
          />
        </div>

        <div>
          <label htmlFor="location" className="block text-sm font-medium text-gray-300 mb-1">
            Location
          </label>
          <input
            id="location"
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition placeholder-gray-400"
            placeholder="e.g., Central Park, New York"
          />
        </div>

        <div>
          <label htmlFor="event" className="block text-sm font-medium text-gray-300 mb-1">
            Event
          </label>
          <input
            id="event"
            type="text"
            value={event}
            onChange={(e) => setEvent(e.target.value)}
            className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition placeholder-gray-400"
            placeholder="e.g., Birthday Celebration 2023"
          />
        </div>

        {error && (
          <div className="bg-red-900/50 text-red-300 px-4 py-3 rounded-lg text-sm border border-red-800">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={uploading}
          className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
        >
          <Upload className="w-5 h-5" />
          {uploading ? 'Uploading...' : 'Upload Memory'}
        </button>
      </form>
    </div>
  );
}
