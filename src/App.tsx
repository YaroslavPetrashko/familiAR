import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { AuthForm } from './components/AuthForm';
import { PhotoUpload } from './components/PhotoUpload';
import { PhotoGallery } from './components/PhotoGallery';
import { LogOut } from 'lucide-react';
import type { User } from '@supabase/supabase-js';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        setUser(session?.user ?? null);
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const handleUploadSuccess = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-gray-700 border-t-blue-500 mx-auto"></div>
          <p className="text-gray-400 mt-4 font-medium">Loading FamiliAR...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthForm onAuthSuccess={() => {}} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <header className="bg-gradient-to-r from-gray-800/95 to-gray-900/95 backdrop-blur-lg border-b border-gray-700/50 sticky top-0 z-10 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-5">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 bg-blue-500/20 rounded-xl blur-xl"></div>
                <img src="/image.png" alt="FamiliAR" className="w-14 h-14 relative z-10" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">FamiliAR</h1>
                <p className="text-sm text-gray-400 font-medium">Memory Care Portal</p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 px-5 py-2.5 text-gray-300 hover:text-white bg-gray-700/50 hover:bg-gray-700 rounded-xl transition-all duration-200 border border-gray-600/50 hover:border-gray-500"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline font-medium">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          <PhotoUpload onUploadSuccess={handleUploadSuccess} />
          <PhotoGallery refreshTrigger={refreshTrigger} />
        </div>
      </main>

      <footer className="mt-20 py-8 text-center text-gray-400 text-sm border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-4">
          <p className="font-medium">Helping families stay connected through memories</p>
          <p className="text-gray-500 text-xs mt-2">Powered by FamiliAR Technology</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
