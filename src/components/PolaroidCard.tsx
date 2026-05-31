import React, { useState } from "react";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface GalleryItem {
  id: string;
  url: string;
  caption: string;
  uploader: string;
  timestamp: string;
  urls?: string[];
}

interface PolaroidCardProps {
  key?: string;
  item: GalleryItem;
  onDelete: (id: string) => void | Promise<void>;
}

export default function PolaroidCard({ item, onDelete }: PolaroidCardProps) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  // Fallback if urls is empty/undefined
  const images = item.urls && item.urls.length > 0 ? item.urls : [item.url];

  const handleNext = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setCurrentIdx((prev) => (prev + 1) % images.length);
  };

  const handlePrev = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setCurrentIdx((prev) => (prev - 1 + images.length) % images.length);
  };

  // Swiping controls
  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    if (isLeftSwipe) {
      handleNext();
    } else if (isRightSwipe) {
      handlePrev();
    }
  };

  return (
    <div className="bg-white p-3 pb-5 rounded-sm shadow-md border border-stone-100 flex flex-col relative rotate-[-1deg] hover:rotate-0 hover:scale-[1.02] duration-205 transition-all group select-none">
      {/* Retro Polaroid Visual Pin */}
      <div className="absolute top-0 right-1/2 translate-x-1/2 -translate-y-2.5 w-8 h-2.5 bg-rose-200/50 skew-x-3" />

      {/* Delete Polaroid Memory Button */}
      <button
        type="button"
        onClick={() => onDelete(item.id)}
        className="absolute top-2 right-2 z-25 p-1.5 bg-white/95 hover:bg-rose-500 hover:text-white text-stone-600 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-all duration-200 cursor-pointer border border-stone-100"
        title="Delete snapshot"
      >
        <Trash2 size={11} />
      </button>

      {/* Main image container */}
      <div
        className="aspect-square rounded-sm overflow-hidden bg-rose-50 border border-stone-100 mb-3 relative"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Animated Slide view */}
        <div className="w-full h-full relative">
          <AnimatePresence mode="popLayout">
            <motion.img
              key={currentIdx}
              src={images[currentIdx]}
              alt={item.caption}
              initial={{ opacity: 0.7, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0.7, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="w-full h-full object-cover select-none pointer-events-none"
            />
          </AnimatePresence>
        </div>

        {/* Carousel indicator badges */}
        {images.length > 1 && (
          <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-[2px] text-white text-[9px] font-bold px-2 py-0.5 rounded-full select-none z-10 font-mono">
            {currentIdx + 1} / {images.length}
          </div>
        )}

        {/* Left and Right navigation overlays (visible on hover or if mobile indicators) */}
        {images.length > 1 && (
          <>
            <button
              onClick={handlePrev}
              type="button"
              className="absolute left-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/80 active:bg-white text-stone-800 flex items-center justify-center shadow-md select-none opacity-0 group-hover:opacity-100 transition-all duration-150 cursor-pointer hover:scale-105"
            >
              <ChevronLeft size={12} strokeWidth={2.5} />
            </button>
            <button
              onClick={handleNext}
              type="button"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/80 active:bg-white text-stone-800 flex items-center justify-center shadow-md select-none opacity-0 group-hover:opacity-100 transition-all duration-150 cursor-pointer hover:scale-105"
            >
              <ChevronRight size={12} strokeWidth={2.5} />
            </button>

            {/* Slider Dots indicators */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/30 px-2 py-1 rounded-full backdrop-blur-[1px] pointer-events-none">
              {images.map((_, i) => (
                <div
                  key={i}
                  className={`w-1 h-1 rounded-full transition-all duration-250 ${
                    i === currentIdx ? "bg-white scale-125" : "bg-white/40"
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <p className="font-hand text-lg font-semibold text-rose-800 leading-tight block text-center truncate italic">
        {item.caption}
      </p>

      <div className="flex items-center justify-between text-[8px] text-gray-400 mt-2 font-mono border-t border-rose-50 pt-1.5 select-none">
        <span>By {item.uploader}</span>
        <span>
          {new Date(item.timestamp).toLocaleDateString([], { month: "short", day: "numeric" })}
        </span>
      </div>
    </div>
  );
}
