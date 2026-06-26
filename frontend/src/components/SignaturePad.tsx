import React, { useRef, useState, useEffect } from 'react';

interface SignaturePadProps {
  onSign: (signature: string) => void;
}

const SignaturePad: React.FC<SignaturePadProps> = ({ onSign }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = canvas.offsetWidth;
      canvas.height = 120;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.lineCap = 'round';
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#312783';
      }
    }
  }, []);

  const startDrawing = (e: React.MouseEvent | React.TouchEvent | any) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (canvas.width !== canvas.offsetWidth) {
      const currentData = canvas.toDataURL();
      canvas.width = canvas.offsetWidth;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.lineCap = 'round';
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#312783';
        const img = new Image();
        img.src = currentData;
        img.onload = () => ctx.drawImage(img, 0, 0);
      }
    }

    const offsetX = e.nativeEvent.offsetX ?? (e.nativeEvent.touches && e.nativeEvent.touches[0].clientX - canvas.getBoundingClientRect().left);
    const offsetY = e.nativeEvent.offsetY ?? (e.nativeEvent.touches && e.nativeEvent.touches[0].clientY - canvas.getBoundingClientRect().top);

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(offsetX, offsetY);
      setIsDrawing(true);
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent | any) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const offsetX = e.nativeEvent.offsetX ?? (e.nativeEvent.touches && e.nativeEvent.touches[0].clientX - canvas.getBoundingClientRect().left);
    const offsetY = e.nativeEvent.offsetY ?? (e.nativeEvent.touches && e.nativeEvent.touches[0].clientY - canvas.getBoundingClientRect().top);

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.lineTo(offsetX, offsetY);
      ctx.stroke();
    }
  };

  const endDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (canvasRef.current) {
      onSign(canvasRef.current.toDataURL('image/png'));
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    onSign('');
  };

  return (
    <div className="space-y-2 mt-4 pb-2">
      <div className="flex justify-between items-center">
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Authorized Signature <span className="text-emerald-400">(Optional)</span>
        </label>
        <button type="button" onClick={clear} className="text-xs text-rose-400 hover:text-rose-300 transition-colors">Clear</button>
      </div>
      <canvas
        ref={canvasRef}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={endDrawing}
        onMouseLeave={endDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={endDrawing}
        className="w-full bg-slate-100 border border-white/20 rounded-lg cursor-crosshair touch-none"
      />
      <p className="text-[10px] text-slate-500 italic">Please draw your official signature above.</p>
    </div>
  );
};

export default SignaturePad;
