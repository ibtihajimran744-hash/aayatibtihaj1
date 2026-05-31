import React, { useState, useEffect, useRef } from "react";
import { Play, Pause, Volume2 } from "lucide-react";

interface VoiceNotePlayerProps {
  voiceUrl: string;
  duration?: number;
  isMe: boolean;
}

export default function VoiceNotePlayer({ voiceUrl, duration = 0, isMe }: VoiceNotePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!voiceUrl) return;
    const audio = new Audio(voiceUrl);
    audioRef.current = audio;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [voiceUrl]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch((err) => {
        console.error("Audio playback failed:", err);
      });
      setIsPlaying(true);
    }
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  // Safe fallback for duration if not supplied or standard estimate
  const activeDuration = duration || (audioRef.current?.duration) || 5;
  const progress = activeDuration > 0 ? (currentTime / activeDuration) * 100 : 0;

  return (
    <div className="flex items-center gap-3.5 py-1 min-w-[200px]">
      <button
        type="button"
        onClick={togglePlay}
        className={`w-9 h-9 rounded-full flex items-center justify-center shadow-md transition-all active:scale-90 cursor-pointer ${
          isMe ? "bg-white text-[#d81b60]" : "bg-gradient-to-br from-[#d81b60] to-pink-500 text-white"
        }`}
      >
        {isPlaying ? (
          <Pause size={14} fill="currentColor" />
        ) : (
          <Play size={14} fill="currentColor" className="ml-0.5" />
        )}
      </button>

      <div className="flex-1 space-y-1.5">
        {/* Customized Progress slider bar */}
        <div className="relative w-full h-1.5 rounded-full bg-stone-200/50 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-100 ${isMe ? "bg-pink-200" : "bg-[#d81b60]"}`}
            style={{ width: `${Math.min(100, Math.max(1, progress))}%` }}
          />
        </div>
        <div className="flex justify-between items-center text-[9px] font-bold tracking-tight">
          <span className={isMe ? "text-pink-100" : "text-stone-500"}>
            {formatDuration(isPlaying ? currentTime : activeDuration)}
          </span>
          <span className={`flex items-center gap-0.5 ${isMe ? "text-pink-100" : "text-stone-400"}`}>
            <Volume2 size={10} /> Voice Note
          </span>
        </div>
      </div>
    </div>
  );
}
