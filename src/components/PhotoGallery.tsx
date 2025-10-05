import { useEffect, useState, useRef } from 'react';
import { supabase, MemoryPhoto } from '../lib/supabase';
import { Images, MapPin, Calendar, Trash2, Volume2, VolumeX } from 'lucide-react';
import { HeicImage } from './HeicImage';

interface PhotoGalleryProps {
  refreshTrigger: number;
}

export function PhotoGallery({ refreshTrigger }: PhotoGalleryProps) {
  const [photos, setPhotos] = useState<MemoryPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement }>({});

  const fetchPhotos = async () => {
    try {
      const { data, error } = await supabase
        .from('memories_photos')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPhotos(data || []);
    } catch (err) {
      console.error('Error fetching photos:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPhotos();
  }, [refreshTrigger]);

  const toggleAudio = (photoId: string, audioUrl: string) => {
    if (playingAudioId === photoId) {
      audioRefs.current[photoId]?.pause();
      setPlayingAudioId(null);
    } else {
      if (playingAudioId) {
        audioRefs.current[playingAudioId]?.pause();
      }

      if (!audioRefs.current[photoId]) {
        const audio = new Audio(audioUrl);
        audio.onended = () => setPlayingAudioId(null);
        audioRefs.current[photoId] = audio;
      }

      audioRefs.current[photoId].play();
      setPlayingAudioId(photoId);
    }
  };

  const handleDelete = async (photo: MemoryPhoto) => {
    if (!confirm('Are you sure you want to delete this memory?')) return;

    setDeletingId(photo.id);
    try {
      const fileName = photo.image_url.split('/').pop();
      if (fileName) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.storage
            .from('memories-photos')
            .remove([`${user.id}/${fileName}`]);
        }
      }

      if (photo.audio_url) {
        const audioFileName = photo.audio_url.split('/').pop();
        if (audioFileName) {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await supabase.storage
              .from('memories-audio')
              .remove([`${user.id}/${audioFileName}`]);
          }
        }
      }

      const { error } = await supabase
        .from('memories_photos')
        .delete()
        .eq('id', photo.id);

      if (error) throw error;

      setPhotos(photos.filter(p => p.id !== photo.id));
    } catch (err) {
      console.error('Error deleting photo:', err);
      alert('Failed to delete photo');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-gray-700 border-t-blue-500 mx-auto"></div>
          <p className="text-gray-400 mt-4 font-medium">Loading memories...</p>
        </div>
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 to-purple-600/10 rounded-3xl blur-2xl"></div>
        <div className="relative bg-gradient-to-br from-gray-800/80 to-gray-900/80 backdrop-blur-xl rounded-3xl shadow-2xl p-16 border border-gray-700/50 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-gray-700/50 to-gray-800/50 rounded-2xl mb-6">
            <Images className="w-10 h-10 text-gray-400" />
          </div>
          <h3 className="text-2xl font-bold text-white mb-3">No memories yet</h3>
          <p className="text-gray-400 font-medium">Upload your first photo to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 to-purple-600/10 rounded-3xl blur-2xl"></div>
      <div className="relative bg-gradient-to-br from-gray-800/80 to-gray-900/80 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-gray-700/50">
        <div className="flex items-center gap-4 mb-8">
          <div className="bg-gradient-to-br from-blue-600 to-blue-700 p-3 rounded-xl shadow-lg shadow-blue-500/20">
            <Images className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-white tracking-tight">Memory Gallery</h2>
          <span className="ml-auto text-sm font-semibold text-gray-400 bg-gray-700/50 px-4 py-2 rounded-xl">{photos.length} {photos.length === 1 ? 'memory' : 'memories'}</span>
        </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {photos.map((photo) => (
          <div
            key={photo.id}
            className="group relative bg-gradient-to-br from-gray-700/50 to-gray-800/50 border border-gray-600/50 rounded-2xl overflow-hidden hover:shadow-2xl hover:shadow-blue-500/10 transition-all duration-300 hover:scale-[1.02] hover:border-gray-500/50"
          >
            <div className="aspect-square overflow-hidden bg-gray-900/50">
              <HeicImage
                src={photo.image_url}
                alt={photo.person_name}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
              />
            </div>

            <div className="p-5">
              <h3 className="font-bold text-xl text-white mb-4 tracking-tight">
                {photo.person_name}
              </h3>

              <div className="space-y-2.5 mb-4">

                {photo.location && (
                  <div className="flex items-start gap-2.5 text-sm text-gray-300">
                    <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-400" />
                    <span className="line-clamp-1">{photo.location}</span>
                  </div>
                )}

                {photo.event && (
                  <div className="flex items-start gap-2.5 text-sm text-gray-300">
                    <Calendar className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-400" />
                    <span className="line-clamp-1">{photo.event}</span>
                  </div>
                )}
              </div>

              {photo.audio_url && (
                <button
                  type="button"
                  onClick={() => toggleAudio(photo.id, photo.audio_url!)}
                  className="w-full mb-3 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-blue-400 hover:text-blue-300 hover:bg-blue-900/30 rounded-xl transition-all duration-200 border border-blue-900/30 hover:border-blue-900/50"
                >
                  {playingAudioId === photo.id ? (
                    <>
                      <VolumeX className="w-4 h-4" />
                      Stop Audio
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-4 h-4" />
                      Play Audio
                    </>
                  )}
                </button>
              )}

              <button
                onClick={() => handleDelete(photo)}
                disabled={deletingId === photo.id}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded-xl transition-all duration-200 disabled:opacity-50 border border-red-900/30 hover:border-red-900/50"
              >
                <Trash2 className="w-4 h-4" />
                {deletingId === photo.id ? 'Deleting...' : 'Delete Memory'}
              </button>
            </div>
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}
