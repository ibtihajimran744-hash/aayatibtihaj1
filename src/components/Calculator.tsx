import React, { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";

interface CalculatorProps {
  onUnlock: () => void;
}

export default function Calculator({ onUnlock }: CalculatorProps) {
  const [display, setDisplay] = useState<string>("");
  const [history, setHistory] = useState<string[]>([]);
  const [secretAttempts, setSecretAttempts] = useState<number>(0);
  const triggerAudioRef = useRef<HTMLAudioElement | null>(null);

  // Set the document title to Calculator for deep stealth mode
  useEffect(() => {
    document.title = "Calculator";
    return () => {
      document.title = "Aayat Signal";
    };
  }, []);

  const handleKeyPress = (e: KeyboardEvent) => {
    const key = e.key;
    if (/[0-9]/.test(key)) {
      handleInput(key);
    } else if (["+", "-", "*", "/", ".", "(", ")"].includes(key)) {
      handleInput(key);
    } else if (key === "Enter" || key === "=") {
      handleEvaluate();
    } else if (key === "Backspace") {
      handleBackspace();
    } else if (key === "Escape" || key.toLowerCase() === "c") {
      handleClear();
    }
  };

  useEffect(() => {
    window.addEventListener("keydown", handleKeyPress);
    return () => {
      window.removeEventListener("keydown", handleKeyPress);
    };
  }, [display]);

  const handleBackspace = () => {
    setDisplay((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setDisplay("");
  };

  const handleInput = (char: string) => {
    setDisplay((prev) => prev + char);
  };

  const handleEvaluate = () => {
    if (!display) return;

    // Secret passcode checks (Clean, quiet, and robust)
    const cleaned = display.replace(/\s+/g, "");
    const unlockedPasscodes = [
      "143",          // "I love you" pager
      "04012025",     //Meeting (4 January 2025)
      "31012025",     // Confessed (31 January 2025)
      "040125",       // Short meeting
      "310125",       // Short confession
      "0401",         // Mini meeting
      "3101",         // Mini confession
      "20250104",     // ISO YMD meeting
      "20250131",     // ISO YMD confession
    ];

    if (unlockedPasscodes.includes(cleaned)) {
      onUnlock();
      return;
    }

    try {
      // Safe math evaluation using standard JavaScript Function parser (avoiding eval in unsafe context)
      // Sanitizing expression to only permit digits, standard spaces, and simple mathematical operators: + - * / . ( )
      const isSafe = /^[0-9+\-*/().\s]+$/.test(cleaned);
      if (!isSafe) {
        setDisplay("Error");
        return;
      }

      // Execute safely
      const computation = new Function(`return (${cleaned})`)();
      const formattedResult = Number.isInteger(computation)
        ? String(computation)
        : parseFloat(computation.toFixed(8)).toString();

      setHistory((prev) => [display + " = " + formattedResult, ...prev.slice(0, 9)]);
      setDisplay(formattedResult);
    } catch (err) {
      setDisplay("Error");
    }
  };

  // Backdoor 5x logo-click cheat code in case they ever forget the number
  const handleLogoClick = () => {
    setSecretAttempts((p) => {
      const next = p + 1;
      if (next >= 5) {
        onUnlock();
        return 0;
      }
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-stone-900 text-stone-150 flex flex-col justify-between items-center p-6 select-none font-sans">
      <audio ref={triggerAudioRef} />
      
      {/* Stealth Status Bar / Stealth Frame Header */}
      <div className="w-full max-w-sm flex justify-between items-center text-[10px] text-stone-500 font-mono tracking-widest uppercase">
        <span className="cursor-pointer hover:text-stone-400" onClick={handleLogoClick}>
          System Tool v1.2.4
        </span>
        <span>Secure Session</span>
      </div>

      <div className="w-full max-w-sm flex-1 flex flex-col justify-end py-8">
        {/* Calculation History Stream */}
        {history.length > 0 && (
          <div className="w-full max-h-24 overflow-y-auto mb-4 text-right px-2 flex flex-col-reverse gap-1 text-[11px] text-stone-500 font-mono scrollbar-none opacity-65">
            {history.map((h, i) => (
              <div key={i}>{h}</div>
            ))}
          </div>
        )}

        {/* Dynamic Calculator LED Panel Screen */}
        <div className="w-full bg-stone-950 p-6 rounded-3xl border border-stone-800 shadow-inner mb-6 text-right relative overflow-hidden">
          <div className="absolute top-1.5 left-3 text-[8px] text-emerald-500/30 uppercase tracking-widest font-mono select-none">
            Math Matrix
          </div>
          <div className="text-stone-500 text-sm font-mono truncate mb-1 min-h-[1.25rem]">
            {history[0]?.split("=")[0] || ""}
          </div>
          <div className="text-3xl font-mono text-stone-100 tracking-tight truncate select-all">
            {display || "0"}
          </div>
        </div>

        {/* Premium tactile button grid */}
        <div className="grid grid-cols-4 gap-3 font-mono">
          {/* Row 1 */}
          <button
            onClick={handleClear}
            className="h-14 font-extrabold text-amber-500 bg-stone-800/70 hover:bg-stone-800 rounded-2xl active:scale-95 transition-all text-sm border border-stone-800/80 shadow-sm cursor-pointer"
          >
            C
          </button>
          <button
            onClick={() => handleInput("(")}
            className="h-14 text-stone-300 bg-stone-850 bg-stone-800/35 hover:bg-stone-800 rounded-2xl active:scale-95 transition-all border border-stone-800/50 shadow-sm cursor-pointer"
          >
            (
          </button>
          <button
            onClick={() => handleInput(")")}
            className="h-14 text-stone-300 bg-stone-800/35 hover:bg-stone-800 rounded-2xl active:scale-95 transition-all border border-stone-800/50 shadow-sm cursor-pointer"
          >
            )
          </button>
          <button
            onClick={() => handleInput("/")}
            className="h-14 font-bold text-amber-500 bg-stone-800/70 hover:bg-stone-800 rounded-2xl active:scale-95 transition-all text-sm border border-stone-800/85 shadow-sm cursor-pointer"
          >
            ÷
          </button>

          {/* Row 2 */}
          <button
            onClick={() => handleInput("7")}
            className="h-14 text-stone-100 bg-stone-800/70 hover:bg-stone-750 hover:bg-stone-800 rounded-2xl active:scale-95 transition-all text-base font-semibold border border-stone-800/40 shadow-sm cursor-pointer"
          >
            7
          </button>
          <button
            onClick={() => handleInput("8")}
            className="h-14 text-stone-100 bg-stone-800/70 hover:bg-stone-750 hover:bg-stone-800 rounded-2xl active:scale-95 transition-all text-base font-semibold border border-stone-800/40 shadow-sm cursor-pointer"
          >
            8
          </button>
          <button
            onClick={() => handleInput("9")}
            className="h-14 text-stone-100 bg-stone-800/70 hover:bg-stone-750 hover:bg-stone-800 rounded-2xl active:scale-95 transition-all text-base font-semibold border border-stone-800/40 shadow-sm cursor-pointer"
          >
            9
          </button>
          <button
            onClick={() => handleInput("*")}
            className="h-14 font-bold text-amber-500 bg-stone-800/70 hover:bg-stone-800 rounded-2xl active:scale-95 transition-all text-sm border border-stone-800/85 shadow-sm cursor-pointer"
          >
            ×
          </button>

          {/* Row 3 */}
          <button
            onClick={() => handleInput("4")}
            className="h-14 text-stone-100 bg-stone-800/70 hover:bg-stone-750 hover:bg-stone-800 rounded-2xl active:scale-95 transition-all text-base font-semibold border border-stone-800/40 shadow-sm cursor-pointer"
          >
            4
          </button>
          <button
            onClick={() => handleInput("5")}
            className="h-14 text-stone-100 bg-stone-800/70 hover:bg-stone-750 hover:bg-stone-800 rounded-2xl active:scale-95 transition-all text-base font-semibold border border-stone-800/40 shadow-sm cursor-pointer"
          >
            5
          </button>
          <button
            onClick={() => handleInput("6")}
            className="h-14 text-stone-100 bg-stone-800/70 hover:bg-stone-750 hover:bg-stone-800 rounded-2xl active:scale-95 transition-all text-base font-semibold border border-stone-800/40 shadow-sm cursor-pointer"
          >
            6
          </button>
          <button
            onClick={() => handleInput("-")}
            className="h-14 font-bold text-amber-500 bg-stone-800/70 hover:bg-stone-800 rounded-2xl active:scale-95 transition-all text-sm border border-stone-800/85 shadow-sm cursor-pointer"
          >
            -
          </button>

          {/* Row 4 */}
          <button
            onClick={() => handleInput("1")}
            className="h-14 text-stone-100 bg-stone-800/70 hover:bg-stone-750 hover:bg-stone-800 rounded-2xl active:scale-95 transition-all text-base font-semibold border border-stone-800/40 shadow-sm cursor-pointer"
          >
            1
          </button>
          <button
            onClick={() => handleInput("2")}
            className="h-14 text-stone-100 bg-stone-800/70 hover:bg-stone-750 hover:bg-stone-800 rounded-2xl active:scale-95 transition-all text-base font-semibold border border-stone-800/40 shadow-sm cursor-pointer"
          >
            2
          </button>
          <button
            onClick={() => handleInput("3")}
            className="h-14 text-stone-100 bg-stone-800/70 hover:bg-stone-750 hover:bg-stone-800 rounded-2xl active:scale-95 transition-all text-base font-semibold border border-stone-800/40 shadow-sm cursor-pointer"
          >
            3
          </button>
          <button
            onClick={() => handleInput("+")}
            className="h-14 font-bold text-amber-500 bg-stone-800/70 hover:bg-stone-800 rounded-2xl active:scale-95 transition-all text-sm border border-stone-800/85 shadow-sm cursor-pointer"
          >
            +
          </button>

          {/* Row 5 */}
          <button
            onClick={() => handleInput("0")}
            className="h-14 text-stone-100 bg-stone-800/70 hover:bg-stone-750 hover:bg-stone-800 rounded-2xl active:scale-95 transition-all text-base font-semibold border border-stone-800/40 shadow-sm cursor-pointer"
          >
            0
          </button>
          <button
            onClick={() => handleInput(".")}
            className="h-14 text-stone-100 bg-stone-800/70 hover:bg-stone-750 hover:bg-stone-800 rounded-2xl active:scale-95 transition-all text-xl font-bold border border-stone-800/40 shadow-sm cursor-pointer"
          >
            .
          </button>
          <button
            onClick={handleBackspace}
            className="h-14 text-stone-400 bg-stone-800/35 hover:bg-stone-800 rounded-2xl active:scale-95 transition-all text-sm border border-stone-800/40 shadow-sm cursor-pointer flex items-center justify-center"
          >
            ⌫
          </button>
          <button
            onClick={handleEvaluate}
            className="h-14 font-extrabold text-stone-900 bg-amber-500 hover:bg-amber-400 rounded-2xl active:scale-95 transition-all text-base border border-amber-600 shadow-sm cursor-pointer"
          >
            =
          </button>
        </div>
      </div>

      {/* Footer System Disclaimer */}
      <div className="w-full max-w-sm text-center text-[9px] text-stone-600 font-sans tracking-wide">
        Standard Calculator Engine &copy; All Rights Reserved.
      </div>
    </div>
  );
}
