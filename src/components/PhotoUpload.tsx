import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Upload, Image as ImageIcon, X } from 'lucide-react';
import AudioRecorder from './AudioRecorder';

interface PhotoUploadProps {
  onUploadSuccess: () => void;
}

export function PhotoUpload({ onUploadSuccess }: PhotoUploadProps) {
  const [personName, setPersonName] = useState('');
  const [location, setLocation] = useState('');
  const [event, setEvent] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
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
        setPreviewUrl(null);
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

  const handleAudioRecorded = (blob: Blob) => {
    setAudioBlob(blob);
  };

  const handleAudioRemoved = () => {
    setAudioBlob(null);
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

      let voiceId = null;
      if (audioBlob) {
        const reader = new FileReader();
        const audioBase64 = await new Promise<string>((resolve, reject) => {
          reader.onload = () => {
            const base64 = (reader.result as string).split(',')[1];
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(audioBlob);
        });

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        const cloneVoiceUrl = `${supabaseUrl}/functions/v1/clone-voice`;

        const response = await fetch(cloneVoiceUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            audioBlob: audioBase64,
            name: `${personName} - ${Date.now()}`,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          console.error('Voice cloning error:', errorData);
          throw new Error(errorData.error || 'Failed to clone voice');
        }

        const result = await response.json();
        voiceId = result.voiceId;
      }

      const { error: dbError } = await supabase
        .from('memories_photos')
        .insert({
          image_url: publicUrl,
          voice_id: voiceId,
          person_name: personName,
          location,
          event,
          uploaded_by: user.id,
        });

      if (dbError) throw dbError;

      setPersonName('');
      setLocation('');
      setEvent('');
      setAudioBlob(null);
      clearImage();
      onUploadSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload photo');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="relative">
      <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 to-purple-600/10 rounded-3xl blur-2xl"></div>
      <div className="relative bg-gradient-to-br from-gray-800/80 to-gray-900/80 backdrop-blur-xl rounded-3xl shadow-2xl p-8 max-w-2xl mx-auto border border-gray-700/50">
        <div className="flex items-center gap-4 mb-8">
          <div className="bg-gradient-to-br from-blue-600 to-blue-700 p-3 rounded-xl shadow-lg shadow-blue-500/20">
            <Upload className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-white tracking-tight">Upload New Memory</h2>
        </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-3">
            Photo
          </label>

          {!imageFile ? (
            <label className="group flex flex-col items-center justify-center w-full h-72 border-2 border-dashed border-gray-600 rounded-2xl cursor-pointer hover:border-blue-500 hover:bg-gray-700/30 transition-all duration-300 bg-gray-900/50">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <div className="bg-gray-700/50 p-4 rounded-xl mb-4 group-hover:bg-blue-600/20 transition-colors duration-300">
                  <ImageIcon className="w-12 h-12 text-gray-400 group-hover:text-blue-400 transition-colors duration-300" />
                </div>
                <p className="mb-2 text-base text-gray-300">
                  <span className="font-semibold text-blue-400">Click to upload</span> or drag and drop
                </p>
                <p className="text-sm text-gray-400">PNG, JPG, HEIC, GIF up to 10MB</p>
              </div>
              <input
                type="file"
                className="hidden"
                accept="image/*,.heic,.heif"
                onChange={handleFileChange}
              />
            </label>
          ) : previewUrl ? (
            <div className="relative bg-gray-900/50 rounded-2xl overflow-hidden border border-gray-700/50">
              <img
                src={previewUrl}
                alt="Preview"
                className="w-full h-96 object-contain rounded-2xl"
              />
              <button
                type="button"
                onClick={clearImage}
                className="absolute top-3 right-3 bg-red-500/90 backdrop-blur-sm text-white p-2.5 rounded-xl hover:bg-red-600 transition-all duration-200 shadow-lg hover:scale-110"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <div className="relative bg-gray-900/50 rounded-2xl overflow-hidden border border-gray-700/50 p-8">
              <div className="flex flex-col items-center justify-center h-80">
                <div className="bg-gray-700/50 p-4 rounded-xl mb-4">
                  <ImageIcon className="w-12 h-12 text-gray-400" />
                </div>
                <p className="text-lg text-gray-300 font-semibold mb-2">{imageFile.name}</p>
                <p className="text-sm text-gray-400 mb-6">HEIC files cannot be previewed</p>
              </div>
              <button
                type="button"
                onClick={clearImage}
                className="absolute top-3 right-3 bg-red-500/90 backdrop-blur-sm text-white p-2.5 rounded-xl hover:bg-red-600 transition-all duration-200 shadow-lg hover:scale-110"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="personName" className="block text-sm font-semibold text-gray-300 mb-2">
            Person's Name <span className="text-red-400">*</span>
          </label>
          <input
            id="personName"
            type="text"
            value={personName}
            onChange={(e) => setPersonName(e.target.value)}
            required
            className="w-full px-4 py-3.5 bg-gray-700/50 border border-gray-600 text-white rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all duration-200 placeholder-gray-400 hover:bg-gray-700/70"
            placeholder="e.g., Sarah Johnson"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="location" className="block text-sm font-semibold text-gray-300 mb-2">
              Location
            </label>
            <input
              id="location"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full px-4 py-3.5 bg-gray-700/50 border border-gray-600 text-white rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all duration-200 placeholder-gray-400 hover:bg-gray-700/70"
              placeholder="e.g., Central Park"
            />
          </div>

          <div>
            <label htmlFor="event" className="block text-sm font-semibold text-gray-300 mb-2">
              Event
            </label>
            <input
              id="event"
              type="text"
              value={event}
              onChange={(e) => setEvent(e.target.value)}
              className="w-full px-4 py-3.5 bg-gray-700/50 border border-gray-600 text-white rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all duration-200 placeholder-gray-400 hover:bg-gray-700/70"
              placeholder="e.g., Birthday 2023"
            />
          </div>
        </div>

        <AudioRecorder
          onAudioRecorded={handleAudioRecorded}
          onAudioRemoved={handleAudioRemoved}
          maxDuration={15}
        />

        {error && (
          <div className="bg-red-900/50 text-red-300 px-4 py-3.5 rounded-xl text-sm border border-red-800/50 backdrop-blur-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={uploading}
          className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white py-4 rounded-xl font-semibold hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
        >
          <Upload className="w-5 h-5" />
          {uploading ? 'Uploading...' : 'Upload Memory'}
        </button>
      </form>
      </div>
    </div>
  );
}
