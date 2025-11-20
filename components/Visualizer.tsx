
import React, { useRef, useEffect } from 'react';

interface VisualizerProps {
  audioBuffer: AudioBuffer | null;
  isPlaying: boolean;
  currentTime: number; 
  analyser?: AnalyserNode; 
}

export const Visualizer: React.FC<VisualizerProps> = ({ audioBuffer, isPlaying, analyser }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    
    const resize = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth * dpr;
        canvas.height = parent.clientHeight * dpr;
        ctx.scale(dpr, dpr);
      }
    };
    
    resize();
    window.addEventListener('resize', resize);

    if(!isPlaying) {
         const width = canvas.width / dpr;
         const height = canvas.height / dpr;
         ctx.clearRect(0, 0, width, height);
         const time = Date.now() / 1000;
         ctx.beginPath();
         ctx.lineWidth = 2;
         ctx.strokeStyle = '#e0e7ff'; 
         for (let x = 0; x < width; x++) {
            const y = (height / 2) + Math.sin(x * 0.05 + time) * 10 * Math.sin(x * 0.01 + time);
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
         }
         ctx.stroke();
    }

    const draw = () => {
      if (!ctx) return;
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;

      ctx.clearRect(0, 0, width, height);

      if (analyser && isPlaying) {
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);

        const bars = 64; 
        const barWidth = (width / bars) * 0.8;
        const step = Math.floor(bufferLength / bars);
        
        let x = 0;

        const gradient = ctx.createLinearGradient(0, height, 0, 0);
        gradient.addColorStop(0, '#4f46e5'); 
        gradient.addColorStop(0.5, '#8b5cf6'); 
        gradient.addColorStop(1, '#ec4899'); 

        ctx.fillStyle = gradient;

        for (let i = 0; i < bars; i++) {
          const dataIndex = i * step;
          const value = dataArray[dataIndex];
          const percent = value / 255;
          const barHeight = Math.max(percent * height, 4); 
          
          const y = height - barHeight;
          
          ctx.beginPath();
          ctx.moveTo(x, height);
          ctx.lineTo(x, y + 5);
          ctx.quadraticCurveTo(x, y, x + 5, y);
          ctx.lineTo(x + barWidth - 5, y);
          ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + 5);
          ctx.lineTo(x + barWidth, height);
          ctx.closePath();
          ctx.fill();

          x += (width / bars);
        }
      } else {
        const time = Date.now() / 1000;
        ctx.beginPath();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#e0e7ff'; 

        for (let x = 0; x < width; x++) {
          const y = (height / 2) + Math.sin(x * 0.05 + time) * 10 * Math.sin(x * 0.01 + time);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [analyser, isPlaying]);

  return (
    <div className="w-full h-28 bg-white rounded-2xl overflow-hidden border border-indigo-50 relative shadow-inner">
      <canvas ref={canvasRef} className="w-full h-full block" style={{ width: '100%', height: '100%' }} />
    </div>
  );
};
