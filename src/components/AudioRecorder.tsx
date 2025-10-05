import { useState, useRef, useEffect } from 'react';
import { Mic, Square, Play, Pause, Trash2 } from 'lucide-react';

interface AudioRecorderProps {
  onAudioRecorded: (audioBlob: Blob) => void;
  onAudioRemoved: () => void;
  maxDuration?: number;
}

export default function AudioRecorder({
  onAudioRecorded,
  onAudioRemoved,
  maxDuration = 15
}: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  const startRecording = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm'
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(audioBlob);

        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);

        onAudioRecorded(audioBlob);

        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => {
          const newTime = prev + 1;
          if (newTime >= maxDuration) {
            stopRecording();
            return maxDuration;
          }
          return newTime;
        });
      }, 1000);

    } catch (err) {
      setError('Failed to access microphone. Please grant permission.');
      console.error('Error accessing microphone:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const togglePlayback = () => {
    if (!audioRef.current || !audioUrl) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const removeAudio = () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioUrl(null);
    setAudioBlob(null);
    setRecordingTime(0);
    setIsPlaying(false);
    onAudioRemoved();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      <label className="block text-sm font-semibold text-gray-300 mb-3">
        Voice Recording (Optional)
      </label>

      {error && (
        <div className="bg-red-900/50 text-red-300 px-4 py-3.5 rounded-xl text-sm border border-red-800/50 backdrop-blur-sm">
          {error}
        </div>
      )}

      {!audioBlob ? (
        <div className="bg-gray-900/50 rounded-2xl p-6 border border-gray-700/50">
          <div className="flex flex-col items-center gap-4">
            <div className="text-center">
              <p className="text-gray-400 text-sm mb-2">
                Record a short voice message ({maxDuration} seconds max)
              </p>
              {isRecording && (
                <div className="text-2xl font-bold text-blue-400 mb-2">
                  {formatTime(recordingTime)} / {formatTime(maxDuration)}
                </div>
              )}
            </div>

            {!isRecording ? (
              <button
                type="button"
                onClick={startRecording}
                className="flex items-center gap-3 px-6 py-3.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-blue-800 transition-all duration-200 shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 transform hover:scale-[1.02] active:scale-[0.98]"
              >
                <Mic className="w-5 h-5" />
                Start Recording
              </button>
            ) : (
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={stopRecording}
                  className="flex items-center gap-2 px-6 py-3.5 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-all duration-200 shadow-lg"
                >
                  <Square className="w-5 h-5" />
                  Stop
                </button>
              </div>
            )}

            {isRecording && (
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                <span className="text-red-500 text-sm font-medium">Recording...</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-gray-900/50 rounded-2xl p-6 border border-gray-700/50">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={togglePlayback}
              className="flex-shrink-0 w-12 h-12 flex items-center justify-center bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors duration-200"
            >
              {isPlaying ? (
                <Pause className="w-6 h-6 text-white" />
              ) : (
                <Play className="w-6 h-6 text-white" />
              )}
            </button>

            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-gray-300 text-sm font-medium">Voice Recording</span>
              </div>
              <div className="text-gray-400 text-sm">
                Duration: {formatTime(recordingTime)}
              </div>
            </div>

            <button
              type="button"
              onClick={removeAudio}
              className="flex-shrink-0 px-4 py-2.5 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded-xl transition-all duration-200 border border-red-900/30 hover:border-red-900/50 flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Remove
            </button>
          </div>

          <audio
            ref={audioRef}
            src={audioUrl || undefined}
            onEnded={() => setIsPlaying(false)}
            className="hidden"
          />
        </div>
      )}
    </div>
  );
}
