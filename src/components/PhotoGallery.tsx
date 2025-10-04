import { useEffect, useState } from 'react';
import { supabase, MemoryPhoto } from '../lib/supabase';
import { Images, MapPin, Calendar, Trash2 } from 'lucide-react';

interface PhotoGalleryProps {
  refreshTrigger: number;
}

export function PhotoGallery({ refreshTrigger }: PhotoGalleryProps) {
  const [photos, setPhotos] = useState<MemoryPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
          <Images className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No memories yet</h3>
        <p className="text-gray-600">Upload your first photo to get started</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-blue-100 p-2 rounded-lg">
          <Images className="w-6 h-6 text-blue-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-800">Memory Gallery</h2>
        <span className="ml-auto text-sm text-gray-500">{photos.length} {photos.length === 1 ? 'memory' : 'memories'}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {photos.map((photo) => (
          <div
            key={photo.id}
            className="group relative bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-xl transition-shadow"
          >
            <div className="aspect-square overflow-hidden bg-gray-100">
              <img
                src={photo.image_url}
                alt={photo.person_name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
            </div>

            <div className="p-4">
              <h3 className="font-semibold text-lg text-gray-900 mb-3">
                {photo.person_name}
              </h3>

              {photo.location && (
                <div className="flex items-start gap-2 text-sm text-gray-600 mb-2">
                  <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span className="line-clamp-1">{photo.location}</span>
                </div>
              )}

              {photo.event && (
                <div className="flex items-start gap-2 text-sm text-gray-600 mb-3">
                  <Calendar className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span className="line-clamp-1">{photo.event}</span>
                </div>
              )}

              <button
                onClick={() => handleDelete(photo)}
                disabled={deletingId === photo.id}
                className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                {deletingId === photo.id ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
