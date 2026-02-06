
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Piece, Difficulty } from './types';
import { generateRods, shufflePieces } from './utils/puzzleEngine';
import RodPiece from './components/RodPiece';

// Default image served from /public/images (place your file at public/images/default-skin.png)
const DEFAULT_IMAGE = "/images/default-skin.png";
const DEFAULT_VIDEO = "https://assets.mixkit.co/videos/preview/mixkit-bright-neon-shining-light-abstract-background-40742-large.mp4";

const App: React.FC = () => {
  const [sourceUrl, setSourceUrl] = useState<string>(DEFAULT_IMAGE);
  const [isSourceVideo, setIsSourceVideo] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>(Difficulty.Medium);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isSolved, setIsSolved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [geminiHint, setGeminiHint] = useState<string | null>(null);
  const [showReference, setShowReference] = useState(false);
  const [containerSize, setContainerSize] = useState(600);

  const containerRef = useRef<HTMLDivElement>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  
  const gridSize = difficulty === Difficulty.Easy ? 6 : difficulty === Difficulty.Medium ? 10 : 16;

  // Handle Responsiveness
  useEffect(() => {
    const updateSize = () => {
      if (parentRef.current) {
        const width = parentRef.current.offsetWidth;
        const newSize = Math.max(300, Math.min(600, width - 32));
        setContainerSize(newSize);
      }
    };

    const resizeObserver = new ResizeObserver(updateSize);
    if (parentRef.current) resizeObserver.observe(parentRef.current);
    updateSize();

    return () => resizeObserver.disconnect();
  }, []);

  const initPuzzle = useCallback((url: string, isVid: boolean) => {
    setLoading(true);
    // Pieces are stored in grid coords, so containerSize doesn't affect generation data
    const newPieces = generateRods(600, 600, gridSize, url, isVid);
    const shuffled = shufflePieces(newPieces, gridSize);
    setPieces(shuffled);
    setIsSolved(false);
    setGeminiHint(null);
    setLoading(false);
  }, [gridSize]);

  useEffect(() => {
    initPuzzle(sourceUrl, isSourceVideo);
  }, [initPuzzle, sourceUrl, isSourceVideo]);

  // Global drag handler (Mouse + Touch)
  useEffect(() => {
    if (!draggingId || !containerRef.current) return;

    const handleMove = (clientX: number, clientY: number) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const cellSize = containerSize / gridSize;
      
      const relativeX = clientX - rect.left;
      const relativeY = clientY - rect.top;

      setPieces(prev => prev.map(p => {
        if (p.id === draggingId) {
          let nextX = Math.round((relativeX - offset.x) / cellSize);
          let nextY = Math.round((relativeY - offset.y) / cellSize);
          
          nextX = Math.max(0, Math.min(gridSize - p.width, nextX));
          nextY = Math.max(0, Math.min(gridSize - p.height, nextY));

          return { ...p, currentX: nextX, currentY: nextY };
        }
        return p;
      }));
    };

    const handleEnd = () => {
      setPieces(prev => {
        const draggedPiece = prev.find(p => p.id === draggingId);
        if (draggedPiece && draggedPiece.currentX === draggedPiece.originalX && draggedPiece.currentY === draggedPiece.originalY) {
          const updated = prev.map(p => 
            p.id === draggingId ? { ...p, isLocked: true } : p
          );
          
          const locked = updated.filter(p => p.isLocked);
          const unlocked = updated.filter(p => !p.isLocked);
          const final = [...locked, ...unlocked];

          if (final.every(p => p.isLocked)) {
            setIsSolved(true);
          }
          return final;
        }
        return prev;
      });
      setDraggingId(null);
    };

    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY);
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', handleEnd);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [draggingId, offset, gridSize, containerSize]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const isVid = file.type.startsWith('video/');
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setSourceUrl(event.target.result as string);
          setIsSourceVideo(isVid);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const startDrag = (clientX: number, clientY: number, clickedPiece: Piece) => {
    if (clickedPiece.isLocked) return;
    
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const cellSize = containerSize / gridSize;
    const relativeX = clientX - rect.left;
    const relativeY = clientY - rect.top;

    setPieces(prev => {
      const otherPieces = prev.filter(p => p.id !== clickedPiece.id);
      return [...otherPieces, clickedPiece];
    });

    setDraggingId(clickedPiece.id);
    setOffset({
      x: relativeX - (clickedPiece.currentX * cellSize),
      y: relativeY - (clickedPiece.currentY * cellSize)
    });
  };

  const onMouseDownPiece = (e: React.MouseEvent, clickedPiece: Piece) => {
    if (e.button !== 0) return;
    startDrag(e.clientX, e.clientY, clickedPiece);
  };

  const onTouchStartPiece = (e: React.TouchEvent, clickedPiece: Piece) => {
    if (e.touches.length > 0) {
      startDrag(e.touches[0].clientX, e.touches[0].clientY, clickedPiece);
    }
  };

  const scatterPieces = () => {
    setPieces(prev => {
      const locked = prev.filter(p => p.isLocked);
      const unlocked = prev.filter(p => !p.isLocked);
      const scattered = unlocked.map(p => ({
        ...p,
        currentX: Math.floor(Math.random() * (gridSize - p.width + 1)),
        currentY: Math.floor(Math.random() * (gridSize - p.height + 1))
      }));
      const scatteredShuffled = [...scattered].sort(() => Math.random() - 0.5);
      return [...locked, ...scatteredShuffled];
    });
  };

  const fetchHint = async () => {
    try {
      setLoading(true);
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const promptText = isSourceVideo 
        ? "Describe the movement and aesthetics of this video in a poetic way to help solve a jigsaw puzzle. Focus on the flow of colors."
        : "Describe the aesthetics and patterns of this image poetically to help someone solve a rod-based jigsaw puzzle. Focus on the textures and the composition.";

      const contents: any[] = [{ text: promptText }];
      
      if (!isSourceVideo && sourceUrl.startsWith('data:')) {
         contents.push({
            inlineData: {
              mimeType: 'image/jpeg',
              data: sourceUrl.split(',')[1]
            }
         });
      } else if (!isSourceVideo) {
        // Fallback for remote URLs
        const response_proxy = await fetch(sourceUrl);
        const blob = await response_proxy.blob();
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve) => {
          reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
          reader.readAsDataURL(blob);
        });
        contents.push({
          inlineData: { mimeType: 'image/jpeg', data: base64 }
        });
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents,
      });
      setGeminiHint(response.text || "Let the patterns guide your vision.");
    } catch (err) {
      console.error(err);
      setGeminiHint("Observe the flow of contrasting textures and edges.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-4 md:p-8 bg-[#0f172a]">
      <header className="mb-6 md:mb-8 text-center">
        <h1 className="text-4xl md:text-6xl font-brand font-black bg-gradient-to-r from-slate-200 to-slate-500 bg-clip-text text-transparent uppercase tracking-tighter">
          AfterImage
        </h1>
        <p className="text-slate-400 font-light mt-1 md:mt-2 tracking-widest text-[10px] md:text-sm uppercase">Fragments of a remembered surface</p>
      </header>

      <div className="flex flex-col lg:flex-row gap-6 md:gap-8 items-center lg:items-start justify-center max-w-7xl w-full">
        <aside className="w-full lg:w-72 space-y-4 md:space-y-6">
          <div className="bg-slate-800/50 border border-white/5 rounded-2xl p-4 md:p-6 backdrop-blur-xl shadow-2xl">
            <h2 className="text-lg font-semibold mb-3 md:mb-4 text-white/90">Controls</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-wider text-slate-500 mb-2">Upload File</label>
                <div className="relative group">
                  <input 
                    type="file" 
                    onChange={handleFileUpload}
                    accept="image/*,video/*"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <div className="bg-slate-700/50 group-hover:bg-slate-700 p-2 md:p-3 rounded-lg border border-dashed border-slate-600 group-hover:border-blue-500/50 text-center transition-all">
                    <span className="text-xs md:text-sm text-slate-300">Choose Image or Video</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-slate-500 mb-2">Difficulty</label>
                <div className="grid grid-cols-3 gap-2">
                  {[Difficulty.Easy, Difficulty.Medium, Difficulty.Hard].map(d => (
                    <button
                      key={d}
                      onClick={() => setDifficulty(d)}
                      className={`py-2 text-[10px] md:text-xs rounded-lg font-medium transition-all ${
                        difficulty === d 
                        ? 'bg-slate-200 text-slate-900 shadow-lg' 
                        : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between py-2 border-y border-white/5">
                <span className="text-xs uppercase tracking-wider text-slate-400">Preview Solution</span>
                <button
                  onClick={() => setShowReference(!showReference)}
                  className={`relative inline-flex h-5 w-10 md:h-6 md:w-11 items-center rounded-full transition-colors focus:outline-none ${
                    showReference ? 'bg-blue-600' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`inline-block h-3 w-3 md:h-4 md:w-4 transform rounded-full bg-white transition-transform ${
                      showReference ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => initPuzzle(sourceUrl, isSourceVideo)}
                  className="py-2 md:py-3 bg-slate-200 hover:bg-white text-slate-900 rounded-xl font-bold transition-all active:scale-95 text-[10px] md:text-xs"
                >
                  Reset
                </button>
                <button 
                  onClick={scatterPieces}
                  className="py-2 md:py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold transition-all active:scale-95 text-[10px] md:text-xs"
                >
                  Scatter
                </button>
              </div>

              <button 
                onClick={fetchHint}
                disabled={loading}
                className="w-full py-2 md:py-3 bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-200 rounded-xl font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-[10px] md:text-xs"
              >
                {loading ? 'Analyzing...' : '✨ Get AI Hint'}
              </button>
            </div>
          </div>

          {geminiHint && (
            <div className="bg-slate-200/5 border border-white/10 rounded-2xl p-4 md:p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h3 className="text-slate-400 text-[10px] font-bold uppercase mb-2 tracking-widest flex items-center gap-1">
                <span className="text-sm">✨</span> Visionary Guidance
              </h3>
              <p className="text-slate-200 text-xs md:text-sm leading-relaxed italic">
                "{geminiHint}"
              </p>
            </div>
          )}
        </aside>

        <div className="relative flex-1 flex flex-col items-center w-full" ref={parentRef}>
          <div 
            ref={containerRef}
            className="relative bg-black rounded-lg shadow-2xl overflow-hidden select-none border-4 border-slate-800 touch-none"
            style={{ 
              width: `${containerSize}px`, 
              height: `${containerSize}px`,
              cursor: draggingId ? 'grabbing' : 'default'
            }}
          >
            {/* Reference/Solution Overlay */}
            <div 
              className={`absolute inset-0 transition-all duration-300 pointer-events-none ${showReference ? 'opacity-100 z-40' : 'opacity-10 grayscale'}`}
            >
              {isSourceVideo ? (
                <video src={sourceUrl} autoPlay loop muted playsInline className="w-full h-full object-cover" />
              ) : (
                <div 
                  className="w-full h-full bg-cover bg-center"
                  style={{ backgroundImage: `url(${sourceUrl})` }}
                />
              )}
            </div>

            {/* Grid Helper Lines */}
            <div className="absolute inset-0 pointer-events-none z-[45]" style={{
              backgroundImage: `linear-gradient(to right, rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.02) 1px, transparent 1px)`,
              backgroundSize: `${containerSize / gridSize}px ${containerSize / gridSize}px`
            }} />

            {pieces.map((piece) => (
              <RodPiece 
                key={piece.id} 
                piece={piece}
                gridSize={gridSize}
                containerSize={containerSize}
                onMouseDown={onMouseDownPiece}
                onTouchStart={onTouchStartPiece}
                isDragging={draggingId === piece.id}
              />
            ))}

            {isSolved && (
              <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-700">
                <div className="text-center p-6 md:p-8 bg-white/10 rounded-3xl border border-white/20 shadow-2xl m-4">
                  <h2 className="text-2xl md:text-4xl font-brand font-black text-white mb-2 tracking-tighter uppercase">Assembled!</h2>
                  <p className="text-slate-300 font-medium mb-4 md:mb-6 text-sm md:text-base">The vision is restored.</p>
                  <button 
                    onClick={() => initPuzzle(sourceUrl, isSourceVideo)}
                    className="px-6 md:px-8 py-2 md:py-3 bg-white text-black rounded-full font-bold hover:scale-105 transition-transform text-sm md:text-base"
                  >
                    Play Again
                  </button>
                </div>
              </div>
            )}
          </div>
          
          <div className="mt-4 flex justify-between w-full max-w-[600px] text-[8px] md:text-xs font-mono uppercase tracking-widest text-slate-500 px-2">
            <span>Progress: {Math.round((pieces.filter(p => p.isLocked).length / pieces.length) * 100)}%</span>
            <span>{difficulty} • {isSourceVideo ? 'MOTION MODE' : 'STILL MODE'}</span>
          </div>
        </div>
      </div>

      <footer className="mt-16 md:mt-20 text-slate-600 text-[8px] md:text-[10px] uppercase tracking-[0.3em] font-light">
        Afterimage © 2026 &copy; 2024
      </footer>
    </div>
  );
};

export default App;
