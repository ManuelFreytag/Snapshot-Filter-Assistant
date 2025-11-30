import React, { useEffect, useState, useRef } from 'react';
import { ImageFile } from '../types';
import { Loader2, AlertCircle, CheckCircle, XCircle } from 'lucide-react';

interface ImageThumbnailProps {
  imageFile: ImageFile;
  isSelected: boolean;
  onClick: (id: string) => void;
}

const ImageThumbnail: React.FC<ImageThumbnailProps> = ({ imageFile, isSelected, onClick }) => {
  const [src, setSrc] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [error, setError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.disconnect();
          }
        });
      },
      { rootMargin: '200px' }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadThumbnail = async () => {
      if (!isVisible || src || error) return;

      try {
        const file = await imageFile.handle.getFile();
        
        // Use createImageBitmap to resize the image on the browser side before rendering
        // This drastically reduces memory usage compared to URL.createObjectURL(file) for high-res photos
        const bitmap = await createImageBitmap(file);
        
        // Calculate thumbnail dimensions (max 300px)
        const scale = Math.min(300 / bitmap.width, 300 / bitmap.height, 1);
        const width = bitmap.width * scale;
        const height = bitmap.height * scale;

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        if (ctx) {
          ctx.drawImage(bitmap, 0, 0, width, height);
          if (active) {
             setSrc(canvas.toDataURL('image/jpeg', 0.7));
          }
        }
        bitmap.close();
      } catch (err) {
        console.error("Thumbnail generation failed for", imageFile.name, err);
        if (active) setError(true);
      }
    };

    loadThumbnail();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible, imageFile.handle, imageFile.name]);

  const getBorderColor = () => {
    if (isSelected) return 'border-indigo-500 ring-2 ring-indigo-500/50';
    if (imageFile.status === 'processing') return 'border-yellow-500 animate-pulse';
    if (imageFile.status === 'done') return 'border-gray-600';
    if (imageFile.status === 'error') return 'border-red-500';
    return 'border-transparent hover:border-gray-600';
  };

  const handleClick = () => {
    onClick(imageFile.id);
  };

  return (
    <div 
      ref={containerRef}
      onClick={handleClick}
      className={`relative aspect-square cursor-pointer overflow-hidden rounded-lg border-2 transition-all duration-200 group bg-gray-800 ${getBorderColor()}`}
    >
      {src && !error ? (
        <img
          src={src}
          alt={imageFile.name}
          className={`h-full w-full object-cover transition-transform duration-500 ${imageFile.status === 'processing' ? 'opacity-50 grayscale' : 'group-hover:scale-105'}`}
          loading="lazy"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-gray-600 bg-gray-900">
          {error ? (
            <AlertCircle className="h-8 w-8 text-red-500/50" />
          ) : (
            <Loader2 className="h-8 w-8 animate-spin opacity-20" />
          )}
        </div>
      )}
      
      {/* Processing Overlay */}
      {imageFile.status === 'processing' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
           <Loader2 className="h-8 w-8 animate-spin text-white drop-shadow-lg" />
        </div>
      )}

      {/* Error Overlay */}
      {imageFile.status === 'error' && (
         <div className="absolute top-2 left-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white shadow-md" title="Analysis Failed">
                !
            </span>
         </div>
      )}
      
      {/* Name Overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-2 pt-6 opacity-0 group-hover:opacity-100 transition-opacity">
         <span className="text-xs text-white truncate block">{imageFile.name}</span>
      </div>

      {/* Score Badge */}
      {imageFile.evaluation && imageFile.status === 'done' && (
        <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
             {imageFile.evaluation.isWorthKeeping ? (
                 <span className="flex h-7 w-7 items-center justify-center rounded-full bg-green-500 text-white shadow-md border border-white/20" title="Worth Keeping">
                     <CheckCircle size={16} fill="currentColor" className="text-white" />
                 </span>
             ) : (
                 <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-600/80 text-white shadow-md border border-white/10" title="Discard">
                     <XCircle size={16} />
                 </span>
             )}
             <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold shadow-lg border border-black/10 backdrop-blur-sm ${
                imageFile.evaluation.totalScore >= 80 ? 'bg-green-900/80 text-green-200' :
                imageFile.evaluation.totalScore >= 50 ? 'bg-yellow-900/80 text-yellow-200' :
                'bg-red-900/80 text-red-200'
             }`}>
                {Math.round(imageFile.evaluation.totalScore / 10)}
             </span>
        </div>
      )}
    </div>
  );
};

// Optimization: Prevent re-renders unless essential props change
export default React.memo(ImageThumbnail, (prev, next) => {
  return (
    prev.imageFile === next.imageFile &&
    prev.isSelected === next.isSelected
  );
});