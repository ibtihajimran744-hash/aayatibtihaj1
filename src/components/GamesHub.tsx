import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Heart,
  Sparkles,
  RotateCcw,
  Trophy,
  MessageCircle,
  Zap,
  HelpCircle,
  TrendingUp,
  Smile,
  Check,
  ChevronLeft,
  Flame,
  User,
  Crown
} from "lucide-react";
import { db } from "../firebase";
import { doc, setDoc, onSnapshot, getDoc } from "firebase/firestore";

interface GamesHubProps {
  currentUser: "Aayat" | "Ibtihaj";
}

// Romantic Quotes shown dynamically on complete
const romanticQuotes = [
  "Aayat + Ibti = best team ❤️",
  "You two are dangerously compatible 💌",
  "Winner doesn't matter, only you two do 🫶",
  "Every game of life is won together ✨",
  "Built to love, played to connect 💖",
];

export default function GamesHub({ currentUser }: GamesHubProps) {
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  
  // Real-time globally synced stats state
  const [globalStats, setGlobalStats] = useState({
    tictactoeWinsAayat: 0,
    tictactoeWinsIbti: 0,
    quizHighAayat: 0,
    quizHighIbti: 0,
    tapHighAayat: 0,
    tapHighIbti: 0,
    moodGuessedRight: 0,
  });

  // Current Mood state linked to firestore
  const [currentMoodDoc, setCurrentMoodDoc] = useState<{
    selector: string;
    selectedMood: string;
    timestamp: string;
    guessedBy: string;
    guessResult: string | null;
  } | null>(null);

  // Load / listen to global stats from Firebase Firestore
  useEffect(() => {
    const unsubStats = onSnapshot(doc(db, "gameStats", "global"), (docSnapshot) => {
      if (docSnapshot.exists()) {
        const d = docSnapshot.data();
        setGlobalStats({
          tictactoeWinsAayat: d.tictactoeWinsAayat || 0,
          tictactoeWinsIbti: d.tictactoeWinsIbti || 0,
          quizHighAayat: d.quizHighAayat || 0,
          quizHighIbti: d.quizHighIbti || 0,
          tapHighAayat: d.tapHighAayat || 0,
          tapHighIbti: d.tapHighIbti || 0,
          moodGuessedRight: d.moodGuessedRight || 0,
        });
      }
    });

    const unsubMood = onSnapshot(doc(db, "gameStats", "moodGame"), (docSnapshot) => {
      if (docSnapshot.exists()) {
        setCurrentMoodDoc(docSnapshot.data() as any);
      }
    });

    return () => {
      unsubStats();
      unsubMood();
    };
  }, []);

  // Update a stat safely
  const incrementStats = async (field: string & keyof typeof globalStats, incrementBy = 1) => {
    try {
      const statsRef = doc(db, "gameStats", "global");
      const currentStatsSnap = await getDoc(statsRef);
      const currentData = currentStatsSnap.exists() ? currentStatsSnap.data() : {};
      const currentVal = Number(currentData[field] || 0);
      
      await setDoc(statsRef, {
        ...currentData,
        [field]: currentVal + incrementBy
      }, { merge: true });
    } catch (e) {
      // Fallback local storage
      const fieldStr = String(field);
      const localValue = Number(localStorage.getItem(`stats_${fieldStr}`) || "0") + incrementBy;
      localStorage.setItem(`stats_${fieldStr}`, String(localValue));
      setGlobalStats((prev) => ({
        ...prev,
        [field]: localValue
      }));
    }
  };

  // Play micro synth sound using Web Audio API for immersive game sounds (no static assets required!)
  const playSoundEffect = (type: "win" | "click" | "tap" | "success" | "fail") => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === "click") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(450, ctx.currentTime);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        osc.start();
        osc.stop(ctx.currentTime + 0.12);
      } else if (type === "tap") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
      } else if (type === "win") {
        osc.type = "triangle";
        osc.frequency.setValueAtTime(330, ctx.currentTime);
        osc.frequency.setValueAtTime(440, ctx.currentTime + 0.1);
        osc.frequency.setValueAtTime(660, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
        osc.start();
        osc.stop(ctx.currentTime + 0.6);
      } else if (type === "success") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
        osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      } else if (type === "fail") {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(180, ctx.currentTime);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
      }
    } catch (_) {}
  };

  const getRandomQuote = () => romanticQuotes[Math.floor(Math.random() * romanticQuotes.length)];

  // --- 1. TIC TAC TOE ❤️ ---
  const TicTacToeGame = () => {
    const [board, setBoard] = useState<(string | null)[]>(Array(9).fill(null));
    const [isXNext, setIsXNext] = useState<boolean>(true); // True for Aayat, False for Ibti
    const [gameQuote, setGameQuote] = useState<string>("");
    
    const calculateWinner = (squares: (string | null)[]) => {
      const lines = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
        [0, 4, 8], [2, 4, 6]             // diagonals
      ];
      for (const [a, b, c] of lines) {
        if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) {
          return squares[a];
        }
      }
      return squares.includes(null) ? null : "Draw";
    };

    const winner = calculateWinner(board);

    const handleCellClick = (idx: number) => {
      if (board[idx] || winner) return;
      playSoundEffect("click");
      const nextBoard = [...board];
      nextBoard[idx] = isXNext ? "💖" : "⚡";
      setBoard(nextBoard);
      
      const newWinner = calculateWinner(nextBoard);
      if (newWinner) {
        playSoundEffect("win");
        setGameQuote(getRandomQuote());
        if (newWinner === "💖") {
          incrementStats("tictactoeWinsAayat");
        } else if (newWinner === "⚡") {
          incrementStats("tictactoeWinsIbti");
        }
      } else {
        setIsXNext(!isXNext);
      }
    };

    const resetGame = () => {
      playSoundEffect("click");
      setBoard(Array(9).fill(null));
      setIsXNext(true);
      setGameQuote("");
    };

    return (
      <div className="space-y-6 text-center">
        <div className="flex justify-center items-center gap-6 mb-4">
          <div className="text-center">
            <div className="p-2 border border-pink-100 rounded-2xl bg-pink-50 text-pink-500 font-bold mb-1 text-sm flex items-center justify-center gap-1">
              💖 Aayat
            </div>
            <p className="font-mono text-xl font-black text-pink-900">{globalStats.tictactoeWinsAayat} Wins</p>
          </div>
          <div className="text-stone-300 font-mono text-xs">V/S</div>
          <div className="text-center">
            <div className="p-2 border border-pink-100 rounded-2xl bg-pink-50 text-pink-700 font-bold mb-1 text-sm flex items-center justify-center gap-1">
              ⚡ Ibti
            </div>
            <p className="font-mono text-xl font-black text-pink-900">{globalStats.tictactoeWinsIbti} Wins</p>
          </div>
        </div>

        <div className="bg-pink-50/50 p-3 rounded-[2rem] border border-pink-100 inline-block">
          <div className="grid grid-cols-3 gap-2 w-72 h-72">
            {board.map((cell, idx) => (
              <button
                key={idx}
                id={`cell-${idx}`}
                onClick={() => handleCellClick(idx)}
                className="bg-white hover:bg-pink-50/40 rounded-2xl flex items-center justify-center text-3xl cursor-pointer duration-100 border border-white shadow-sm transition-transform active:scale-95"
              >
                {cell}
              </button>
            ))}
          </div>
        </div>

        <div>
          {winner ? (
            <div className="p-4 bg-white rounded-2xl border border-pink-100/50 shadow-sm max-w-sm mx-auto">
              <p className="text-lg font-bold text-pink-700 mb-1 flex items-center justify-center gap-1.5 animate-bounce">
                <Crown size={16} fill="currentColor" /> {winner === "Draw" ? "It's a tie!" : `${winner === "💖" ? "Aayat" : "Ibti"} Wins! 🎉`}
              </p>
              <p className="text-xs text-stone-500 italic font-medium">{gameQuote}</p>
            </div>
          ) : (
            <div className="text-xs font-bold uppercase tracking-wider text-pink-600">
              Current Turn: {isXNext ? "💖 Aayat" : "⚡ Ibti"}
            </div>
          )}
        </div>

        <button
          onClick={resetGame}
          className="px-6 py-2.5 bg-pink-100 hover:bg-pink-200 text-pink-700 font-bold rounded-2xl text-xs transition-colors flex items-center gap-1.5 mx-auto cursor-pointer"
        >
          <RotateCcw size={14} /> Play Again
        </button>
      </div>
    );
  };

  // --- 2. TRUTH OR DARE 💬 ---
  const TruthOrDareGame = () => {
    const [deckItem, setDeckItem] = useState<{ type: "Truth" | "Dare"; text: string } | null>(null);
    const [cardQuote, setCardQuote] = useState("");
    const [customList, setCustomList] = useState<{ type: "Truth" | "Dare"; text: string }[]>(() => {
      const saved = localStorage.getItem("custom_truth_dares");
      return saved ? JSON.parse(saved) : [];
    });
    const [newText, setNewText] = useState("");
    const [newType, setNewType] = useState<"Truth" | "Dare">("Truth");

    const builtinTruths = [
      "When did you start liking me?",
      "Who said 'I love you' first emotionally?",
      "What is my most annoying habit that you secretly find adorable?",
      "If you could relive one memory of us forever, which would it be?",
      "What was your first impression when we talked on Jan 4?",
      "When did you realize you wanted us to be together on Jan 31?",
      "What is your dream holiday location for us two?",
    ];

    const builtinDares = [
      "Send me a heart emoji right now ❤️",
      "Draft a 2-sentence love message and send it in the private chat!",
      "Take a secret selfie or funny face snapped right now and upload to the Polaroid gallery!",
      "Hum our favorite song and post a hint to the chat",
      "Text me the cutest nickname you can think of!",
      "Promise me you will hold my hand for the next 15 minutes next time we meet!",
    ];

    const drawCard = (type: "Truth" | "Dare") => {
      playSoundEffect("click");
      const choices = type === "Truth"
        ? [...builtinTruths, ...customList.filter(item => item.type === "Truth").map(i => i.text)]
        : [...builtinDares, ...customList.filter(item => item.type === "Dare").map(i => i.text)];

      const randomText = choices[Math.floor(Math.random() * choices.length)];
      setDeckItem({ type, text: randomText });
      setCardQuote(getRandomQuote());
    };

    const handleAddCustom = (e: React.FormEvent) => {
      e.preventDefault();
      if (!newText.trim()) return;
      playSoundEffect("success");
      const updatedList = [...customList, { type: newType, text: newText }];
      setCustomList(updatedList);
      localStorage.setItem("custom_truth_dares", JSON.stringify(updatedList));
      setNewText("");
    };

    const handleDeleteCustom = (idx: number) => {
      const filtered = customList.filter((_, i) => i !== idx);
      setCustomList(filtered);
      localStorage.setItem("custom_truth_dares", JSON.stringify(filtered));
    };

    return (
      <div className="space-y-6 max-w-sm mx-auto">
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => drawCard("Truth")}
            className="p-5 rounded-[2rem] bg-pink-100 hover:bg-pink-150 text-[#d81b60] font-black border border-white shadow-sm duration-150 scale-100 hover:scale-[1.03] active:scale-95 text-center flex flex-col items-center justify-center gap-1 cursor-pointer"
          >
            <span className="text-2xl">💖</span>
            <span className="text-xs uppercase tracking-wider">Choose Truth</span>
          </button>
          <button
            onClick={() => drawCard("Dare")}
            className="p-5 rounded-[2rem] bg-rose-50 hover:bg-rose-100 text-pink-700 font-black border border-white shadow-sm duration-150 scale-100 hover:scale-[1.03] active:scale-95 text-center flex flex-col items-center justify-center gap-1 cursor-pointer"
          >
            <span className="text-2xl">⚡</span>
            <span className="text-xs uppercase tracking-wider">Choose Dare</span>
          </button>
        </div>

        <AnimatePresence mode="wait">
          {deckItem && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-gradient-to-br from-white to-pink-50/20 p-6 rounded-[2.5rem] border border-pink-100/50 shadow-md text-center space-y-4"
            >
              <span className={`inline-block px-4 py-1.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest ${
                deckItem.type === "Truth" ? "bg-pink-100 text-[#d81b60]" : "bg-[#ffeef2] text-pink-600"
              }`}>
                {deckItem.type} CARD
              </span>
              <p className="text-base text-pink-900 font-extrabold px-2">"{deckItem.text}"</p>
              <div className="h-[1px] bg-pink-100 w-12 mx-auto" />
              <p className="text-[10px] text-pink-800 italic font-semibold">{cardQuote}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="bg-stone-50 p-5 rounded-[2rem] border border-stone-150 space-y-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-stone-600 flex items-center gap-1">
            ✨ Add custom task
          </h4>
          <form onSubmit={handleAddCustom} className="flex flex-col gap-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setNewType("Truth")}
                className={`flex-1 py-1.5 rounded-xl text-[10px] font-extrabold duration-100 ${
                  newType === "Truth" ? "bg-pink-100 text-[#d81b60]" : "bg-white text-stone-400 border border-stone-200"
                }`}
              >
                TRUTH
              </button>
              <button
                type="button"
                onClick={() => setNewType("Dare")}
                className={`flex-1 py-1.5 rounded-xl text-[10px] font-extrabold duration-100 ${
                  newType === "Dare" ? "bg-pink-100 text-[#d81b60]" : "bg-white text-stone-400 border border-stone-200"
                }`}
              >
                DARE
              </button>
            </div>
            <div className="flex gap-1">
              <input
                type="text"
                placeholder={`Write a ${newType.toLowerCase()} prompt...`}
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                className="flex-1 px-3 py-2 bg-white rounded-xl text-xs border border-stone-200 text-stone-700 focus:outline-none focus:ring-1 focus:ring-pink-300"
              />
              <button
                type="submit"
                className="px-3 py-2 bg-[#d81b60] text-white font-bold rounded-xl text-xs hover:bg-pink-600 shrink-0 cursor-pointer"
              >
                Add
              </button>
            </div>
          </form>

          {customList.length > 0 && (
            <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
              {customList.map((item, id) => (
                <div key={id} className="flex justify-between items-center text-xs p-1.5 px-2.5 bg-white rounded-lg border border-stone-100">
                  <span className="truncate max-w-[80%] text-stone-600">
                    <strong className="text-pink-600 font-extrabold">{item.type[0]}:</strong> {item.text}
                  </span>
                  <button onClick={() => handleDeleteCustom(id)} className="text-rose-500 hover:text-red-700 font-bold ml-1 text-[10px]">
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // --- 3. COUPLE QUIZ 🧠 ---
  const CoupleQuizGame = () => {
    const questions = [
      {
        q: "When did we first meet or start talking?",
        a: "January 4, 2025 🌱",
        options: ["May 14, 2026", "January 4, 2025 🌱", "January 31, 2025", "None of the above"]
      },
      {
        q: "When did we confess our feelings to each other?",
        a: "January 31, 2025 💕",
        options: ["January 4, 2025", "February 14, 2025", "January 31, 2025 💕", "March 3, 2025"]
      },
      {
        q: "Who said 'I love you' first emotionally?",
        a: "Aayat (first to hold the feeling) ❤️",
        options: ["Ibtihaj (no fears)", "Aayat (first to hold the feeling) ❤️", "Both at the exact frame", "A friendly signal helper"]
      },
      {
        q: "What is Ibti's favourite thing about Aayat?",
        a: "Her warm, sweet personality and heart 🎁",
        options: [
          "Her warm, sweet personality and heart 🎁",
          "Her strict rules on calculators",
          "Her speed matching memory matches",
          "Everything in existence plus infinity"
        ]
      },
      {
        q: "What is Aayat's best romantic superpower?",
        a: "Melting his worries with a single smile 🥰",
        options: ["Her competitive tap speed", "Melting his worries with a single smile 🥰", "Silent status bio updates", "Her perfect math values"]
      }
    ];

    const [qIdx, setQIdx] = useState(0);
    const [score, setScore] = useState(0);
    const [selectedOpt, setSelectedOpt] = useState<string | null>(null);
    const [isComplete, setIsComplete] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [quizQuote, setQuizQuote] = useState("");

    const handleOptionSelect = (opt: string) => {
      if (submitted) return;
      playSoundEffect("click");
      setSelectedOpt(opt);
    };

    const handleSubmitAnswer = () => {
      if (!selectedOpt || submitted) return;
      setSubmitted(true);
      const isRight = selectedOpt === questions[qIdx].a;
      if (isRight) {
        playSoundEffect("success");
        setScore((prev) => prev + 1);
      } else {
        playSoundEffect("fail");
      }
    };

    const handleNext = () => {
      if (qIdx + 1 < questions.length) {
        setQIdx(qIdx + 1);
        setSelectedOpt(null);
        setSubmitted(false);
      } else {
        playSoundEffect("win");
        setIsComplete(true);
        setQuizQuote(getRandomQuote());
        
        // Sync score high stats
        if (currentUser === "Aayat") {
          if (score + (selectedOpt === questions[qIdx].a ? 1 : 0) > globalStats.quizHighAayat) {
            incrementStats("quizHighAayat", (score + (selectedOpt === questions[qIdx].a ? 1 : 0)) - globalStats.quizHighAayat);
          }
        } else {
          if (score + (selectedOpt === questions[qIdx].a ? 1 : 0) > globalStats.quizHighIbti) {
            incrementStats("quizHighIbti", (score + (selectedOpt === questions[qIdx].a ? 1 : 0)) - globalStats.quizHighIbti);
          }
        }
      }
    };

    const resetQuiz = () => {
      setQIdx(0);
      setScore(0);
      setSelectedOpt(null);
      setSubmitted(false);
      setIsComplete(false);
    };

    if (isComplete) {
      return (
        <div className="text-center space-y-5 p-6 bg-white rounded-3xl border border-pink-100 max-w-sm mx-auto shadow-sm">
          <div className="inline-flex items-center justify-center p-4 bg-pink-50 rounded-full text-pink-500 mb-2">
            <Trophy size={48} fill="currentColor" />
          </div>
          <h3 className="text-xl font-extrabold text-pink-850">Quiz Complete!</h3>
          <p className="text-4xl font-extrabold text-[#d81b60] font-mono leading-none">
            {score}/{questions.length}
          </p>
          <p className="text-xs text-stone-500">
            {score === questions.length ? "Incredible! You guys know each other perfectly 💕" : "Beautiful effort! Love is an ongoing adventure 🥰"}
          </p>
          <div className="bg-pink-50/50 p-3 rounded-2xl text-[10px] text-pink-700 italic border border-pink-100 font-medium">
            "{quizQuote}"
          </div>
          <button
            onClick={resetQuiz}
            className="w-full py-3 bg-[#d81b60] hover:bg-pink-600 text-white font-black rounded-2xl text-xs duration-150 cursor-pointer"
          >
            Restart Quiz
          </button>
        </div>
      );
    }

    const currentQ = questions[qIdx];

    return (
      <div className="space-y-6 max-w-sm mx-auto">
        <div className="flex justify-between items-center text-[10px] font-bold tracking-wider uppercase text-pink-700">
          <span>Question {qIdx + 1}/{questions.length}</span>
          <span>Score: {score}</span>
        </div>

        {/* Quiz Progress slider gauge */}
        <div className="w-full bg-stone-100 h-1.5 rounded-full overflow-hidden">
          <div
            className="bg-[#d81b60] h-full duration-300 transition-all"
            style={{ width: `${((qIdx + 1) / questions.length) * 100}%` }}
          />
        </div>

        <div className="p-6 bg-white rounded-[2rem] border border-pink-100/60 shadow-sm text-center">
          <p className="text-sm font-black text-pink-900 leading-normal">{currentQ.q}</p>
        </div>

        <div className="space-y-2">
          {currentQ.options.map((opt, i) => {
            const isSelected = selectedOpt === opt;
            const isCorrect = opt === currentQ.a;
            
            let buttonStyle = "bg-white hover:bg-pink-50/20 text-stone-700 border-stone-200";
            if (submitted) {
              if (isCorrect) {
                 buttonStyle = "bg-emerald-50 border-emerald-300 text-emerald-800 font-bold";
              } else if (isSelected) {
                 buttonStyle = "bg-red-50 border-red-300 text-red-800 font-bold";
              } else {
                 buttonStyle = "bg-white text-stone-300 border-stone-100";
              }
            } else if (isSelected) {
              buttonStyle = "bg-pink-50 border-[#d81b60] text-pink-900 font-bold border-2";
            }

            return (
              <button
                key={i}
                id={`quiz-opt-${i}`}
                onClick={() => handleOptionSelect(opt)}
                disabled={submitted}
                className={`w-full p-3.5 rounded-2xl text-xs flex justify-between items-center transition-all duration-150 select-none cursor-pointer border ${buttonStyle}`}
              >
                <span>{opt}</span>
                {submitted && isCorrect && <span className="text-emerald-500 font-bold font-mono">✓</span>}
                {submitted && isSelected && !isCorrect && <span className="text-red-500 font-bold font-mono">✗</span>}
              </button>
            );
          })}
        </div>

        <div className="pt-2">
          {!submitted ? (
            <button
              onClick={handleSubmitAnswer}
              disabled={!selectedOpt}
              className={`w-full py-3.5 rounded-2xl text-xs font-black tracking-wide shadow-sm duration-100 transition-all ${
                selectedOpt
                  ? "bg-[#d81b60] hover:bg-pink-600 text-white cursor-pointer active:scale-[0.99]"
                  : "bg-stone-100 text-stone-400 cursor-not-allowed"
              }`}
            >
              Verify Answer 🌟
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="w-full py-3.5 bg-pink-700 hover:bg-pink-850 text-white font-black rounded-2xl text-xs tracking-wide shadow-sm transition-all duration-100 cursor-pointer active:scale-[0.99]"
            >
              {qIdx + 1 === questions.length ? "Finish & See results 👑" : "Next Question 💖"}
            </button>
          )}
        </div>
      </div>
    );
  };

  // --- 4. MEMORY MATCH GAME 🧩 ---
  const MemoryMatchGame = () => {
    const symbols = ["❤️", "💋", "🔒", "🗓️", "🌹", "🍭", "🥑", "⚡"];
    const [cards, setCards] = useState<{ id: number; symbol: string; isFlipped: boolean; isMatched: boolean }[]>([]);
    const [selected, setSelected] = useState<number[]>([]);
    const [moves, setMoves] = useState(0);
    const [isComplete, setIsComplete] = useState(false);
    const [winQuote, setWinQuote] = useState("");

    const initializeGame = () => {
      // Create duplicate pairs
      const doubled = [...symbols, ...symbols];
      // Random shuffle
      const shuffled = doubled
        .map((s, index) => ({ id: index, symbol: s, isFlipped: false, isMatched: false }))
        .sort(() => Math.random() - 0.5);

      setCards(shuffled);
      setSelected([]);
      setMoves(0);
      setIsComplete(false);
    };

    useEffect(() => {
      initializeGame();
    }, []);

    const handleFlip = (id: number) => {
      // Prevent flipping if already flipped/matched or 2 already selected
      const actualCard = cards.find(c => c.id === id);
      if (!actualCard || actualCard.isFlipped || actualCard.isMatched || selected.length >= 2) return;

      playSoundEffect("tap");
      const updated = cards.map(c => c.id === id ? { ...c, isFlipped: true } : c);
      setCards(updated);

      const nextSelected = [...selected, id];
      setSelected(nextSelected);

      if (nextSelected.length === 2) {
        setMoves(m => m + 1);
        const [firstId, secondId] = nextSelected;
        const c1 = cards.find(c => c.id === firstId)!;
        const c2 = cards.find(c => c.id === secondId)!;

        if (c1.symbol === actualCard.symbol) {
          // Match!
          setTimeout(() => {
            playSoundEffect("success");
            const matchedCards = updated.map(c =>
              c.id === firstId || c.id === secondId ? { ...c, isMatched: true } : c
            );
            setCards(matchedCards);
            setSelected([]);

            // Check if game won
            const isWin = matchedCards.every(c => c.isMatched);
            if (isWin) {
              playSoundEffect("win");
              setIsComplete(true);
              setWinQuote(getRandomQuote());
            }
          }, 450);
        } else {
          // No match, turn back
          setTimeout(() => {
            playSoundEffect("click");
            const resetCards = updated.map(c =>
              c.id === firstId || c.id === secondId ? { ...c, isFlipped: false } : c
            );
            setCards(resetCards);
            setSelected([]);
          }, 1000);
        }
      }
    };

    return (
      <div className="space-y-6 text-center max-w-sm mx-auto">
        <div className="flex justify-between items-center text-[10px] font-bold tracking-wider uppercase text-pink-700">
          <span>Moves Made: {moves}</span>
          <button
            onClick={initializeGame}
            className="flex items-center gap-1 hover:text-pink-900 cursor-pointer text-[9px] uppercase tracking-widest bg-pink-50 px-2 py-1 rounded-md"
          >
            <RotateCcw size={10} /> Reset
          </button>
        </div>

        {isComplete ? (
          <div className="p-6 bg-white rounded-3xl border border-pink-100 text-center space-y-4 shadow-sm">
            <span className="text-4xl">👑</span>
            <p className="text-base font-extrabold text-pink-850">Outstanding Matcher!</p>
            <p className="text-xs text-stone-500">You cleared the memory grid in <strong className="text-pink-[#d81b60]">{moves} moves</strong>. Fast and compatible!</p>
            <div className="bg-pink-50/50 p-3 rounded-2xl text-[9px] text-pink-700 italic border border-pink-100 font-medium">
              "{winQuote}"
            </div>
            <button
              onClick={initializeGame}
              className="w-full py-2.5 bg-[#d81b60] text-white font-bold rounded-2xl text-xs hover:bg-pink-600 duration-150 cursor-pointer"
            >
              Play Matcher Again
            </button>
          </div>
        ) : (
          <div className="bg-pink-50/20 p-3 rounded-[2rem] border border-pink-100 inline-block w-full">
            <div className="grid grid-cols-4 gap-2 aspect-square">
              {cards.map((card) => {
                const show = card.isFlipped || card.isMatched;
                return (
                  <button
                    key={card.id}
                    id={`mem-card-${card.id}`}
                    onClick={() => handleFlip(card.id)}
                    className={`
                      aspect-square rounded-2xl border transition-all duration-350 cursor-pointer flex items-center justify-center text-2xl
                      ${show 
                        ? "bg-white border-pink-150 transform rotate-y-180 scale-100" 
                        : "bg-gradient-to-br from-[#d81b60] to-pink-500 text-white border-[#d81b60] shadow-sm transform rotate-0 hover:scale-105 active:scale-95"
                      }
                    `}
                  >
                    {show ? (
                      <span className="transform animate-scaleUp">{card.symbol}</span>
                    ) : (
                      <span className="text-xs opacity-60">💖</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  // --- 5. MOOD GUESS GAME 😏 ---
  const MoodGuessGame = () => {
    const moods = [
      { emoji: "🥰", name: "Happy & Lovestruck" },
      { emoji: "🥺", name: "Baby Sad / Sulking" },
      { emoji: "💕", name: "Missing You Craving" },
      { emoji: "😴", name: "Incredibly Sleepy" },
      { emoji: "⚡", name: "Excited / Hyper Active" },
      { emoji: "🙈", name: "Shy or Flustered" }
    ];

    const [loading, setLoading] = useState(false);
    const [guessSelection, setGuessSelection] = useState<string | null>(null);
    const [gameResult, setGameResult] = useState<string | null>(null);

    // Is current user the selector?
    const isSelector = currentMoodDoc ? currentMoodDoc.selector === currentUser : true;

    // Send/Select dynamic secret mood
    const handleSelectMood = async (mood: string) => {
      playSoundEffect("success");
      setLoading(true);
      try {
        await setDoc(doc(db, "gameStats", "moodGame"), {
          selector: currentUser,
          selectedMood: mood,
          timestamp: new Date().toISOString(),
          guessedBy: "",
          guessResult: null,
        });
      } catch (err) {
        // Local state fallback in case of write delay
        localStorage.setItem("local_selected_mood", mood);
      } finally {
        setLoading(false);
      }
    };

    // Evaluate Guess
    const handleGuessSubmit = async (guessedName: string) => {
      if (!currentMoodDoc) return;
      setGuessSelection(guessedName);
      
      const isCorrect = guessedName === currentMoodDoc.selectedMood;
      if (isCorrect) {
        playSoundEffect("success");
        setGameResult("correct");
        await incrementStats("moodGuessedRight");
      } else {
        playSoundEffect("fail");
        setGameResult("incorrect");
      }

      try {
        await setDoc(doc(db, "gameStats", "moodGame"), {
          ...currentMoodDoc,
          guessedBy: currentUser,
          guessResult: isCorrect ? "correct" : "incorrect"
        });
      } catch (err) {}
    };

    // Reset loop
    const handleResetMoodGame = async () => {
      playSoundEffect("click");
      setGuessSelection(null);
      setGameResult(null);
      try {
        await setDoc(doc(db, "gameStats", "moodGame"), {
          selector: currentUser === "Aayat" ? "Ibtihaj" : "Aayat", // swap host role!
          selectedMood: "",
          timestamp: new Date().toISOString(),
          guessedBy: "",
          guessResult: null,
        });
      } catch (err) {}
    };

    // Display state logic
    const requiresSelection = !currentMoodDoc || !currentMoodDoc.selectedMood;
    const hasBeenGuessed = currentMoodDoc && currentMoodDoc.guessResult;

    if (requiresSelection) {
      return (
        <div className="space-y-5 text-center max-w-sm mx-auto">
          {isSelector ? (
            <>
              <div className="bg-pink-100/30 p-4 rounded-3xl border border-pink-100">
                <p className="text-xs font-bold text-pink-700 uppercase tracking-widest flex items-center justify-center gap-1.5 mb-1 text-center">
                  <Smile size={14} /> Secret mood setter
                </p>
                <p className="text-[11px] text-stone-500">Set your secret mood from indices below, then let your partner guess what you are feeling in real-time!</p>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                {moods.map((m) => (
                  <button
                    key={m.name}
                    id={`mood-choose-${m.name}`}
                    onClick={() => handleSelectMood(m.name)}
                    disabled={loading}
                    className="p-4 bg-white hover:bg-pink-50/20 active:scale-95 transition-all rounded-2xl border border-pink-100 flex flex-col items-center justify-center gap-1 shadow-sm cursor-pointer"
                  >
                    <span className="text-3xl">{m.emoji}</span>
                    <span className="text-[10px] font-bold text-stone-600 truncate w-full">{m.name}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="bg-white p-6 rounded-3xl border border-pink-100 text-center space-y-4 shadow-sm">
              <span className="text-4xl block animate-bounce">😏</span>
              <p className="font-extrabold text-pink-850 text-sm">Waiting for Mood Selection</p>
              <p className="text-xs text-stone-400">Your companion ({currentUser === "Aayat" ? "Ibtihaj" : "Aayat"}) is picking their secret mood state right now. Check back in a second! ✨</p>
            </div>
          )}
        </div>
      );
    }

    if (hasBeenGuessed) {
      const selectedMoodObj = moods.find(m => m.name === currentMoodDoc.selectedMood);
      const isCorrect = currentMoodDoc.guessResult === "correct";

      return (
        <div className="bg-white p-6 rounded-3xl border border-pink-100 text-center space-y-5 max-w-sm mx-auto shadow-sm">
          <p className="text-[10px] font-extrabold text-[#d81b60] uppercase tracking-wider bg-[#ffeef2] inline-block px-3.5 py-1.5 rounded-full leading-none">
            REVEAL REPORT
          </p>
          <div className="text-4xl block my-2">{selectedMoodObj?.emoji || "🥰"}</div>
          <h3 className="text-lg font-extrabold text-pink-900 leading-snug">
            {currentMoodDoc.selector}'s current mood was indeed: <br />
            <span className="text-pink-[#d81b60]">"{currentMoodDoc.selectedMood}"</span>
          </h3>
          <p className="text-xs text-stone-500 font-medium">
            {isCorrect 
              ? `Correctly Guessed! Your heart synch scores are amazing. (Total Guessed: ${globalStats.moodGuessedRight}) 🎯` 
              : `Nice attempt, but they are feeling a bit different! Communication is key 💕`
            }
          </p>
          <div className="p-3 bg-pink-50/50 rounded-2xl text-[9px] text-pink-700 font-bold border border-pink-100">
            "{getRandomQuote()}"
          </div>
          <button
            onClick={handleResetMoodGame}
            className="w-full py-2.5 bg-[#d81b60] hover:bg-pink-600 text-white font-extrabold rounded-2xl text-xs duration-120 cursor-pointer"
          >
            Play Next Turn ⚡
          </button>
        </div>
      );
    }

    // Interactive Guess page
    return (
      <div className="space-y-4 max-w-sm mx-auto">
        {isSelector ? (
          <div className="bg-white p-6 rounded-3xl border border-pink-100 text-center space-y-4 shadow-sm">
            <span className="text-4xl block animate-pulse">🤫</span>
            <p className="font-extrabold text-pink-850 text-sm">Your Mood is Sent!</p>
            <p className="text-xs text-stone-400">Waiting for {currentUser === "Aayat" ? "Ibtihaj" : "Aayat"} to load this page and guess what you chose. Don't spoil it! 🙈</p>
          </div>
        ) : (
          <>
            <div className="bg-gradient-to-r from-pink-50 to-white border border-pink-100 p-5 rounded-3xl text-center space-y-1">
              <span className="text-2xl animate-spin block text-pink-500">😏</span>
              <p className="font-extrabold text-pink-850 text-sm">{currentMoodDoc.selector} wants you to guess!</p>
              <p className="text-[11px] text-stone-500">Pick the mood option below that you think matches their immediate vibrations!</p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              {moods.map((m) => (
                <button
                  key={m.name}
                  id={`mood-guess-${m.name}`}
                  onClick={() => handleGuessSubmit(m.name)}
                  className="p-4 bg-white hover:bg-pink-50/20 active:scale-95 transition-all rounded-x2 border border-pink-100 flex flex-col items-center justify-center gap-1 shadow-sm rounded-2xl duration-200 cursor-pointer"
                >
                  <span className="text-3xl">{m.emoji}</span>
                  <span className="text-[10px] font-bold text-stone-600 truncate w-full text-center">{m.name}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  };

  // --- 6. TAP BATTLE GAME ⚡ ---
  const TapBattleGame = () => {
    const [timeLeft, setTimeLeft] = useState<number>(0);
    const [hasStarted, setHasStarted] = useState<boolean>(false);
    const [p1Taps, setP1Taps] = useState<number>(0);
    const [p2Taps, setP2Taps] = useState<number>(0);
    const [battleQuote, setBattleQuote] = useState("");

    useEffect(() => {
      let interval: any = null;
      if (hasStarted && timeLeft > 0) {
        interval = setInterval(() => {
          setTimeLeft((t) => t - 1);
        }, 1000);
      } else if (hasStarted && timeLeft === 0) {
        playSoundEffect("win");
        setHasStarted(false);
        setBattleQuote(getRandomQuote());
        
        // Sync solo-tapped highscores (Using absolute values based on best submission metrics)
        const totalA = currentUser === "Aayat" ? p1Taps : p2Taps;
        const totalI = currentUser === "Ibtihaj" ? p1Taps : p2Taps;
        
        if (currentUser === "Aayat" && totalA > globalStats.tapHighAayat) {
          incrementStats("tapHighAayat", totalA - globalStats.tapHighAayat);
        } else if (currentUser === "Ibtihaj" && totalI > globalStats.tapHighIbti) {
          incrementStats("tapHighIbti", totalI - globalStats.tapHighIbti);
        }
      }
      return () => clearInterval(interval);
    }, [hasStarted, timeLeft]);

    const startTimer = () => {
      playSoundEffect("success");
      setP1Taps(0);
      setP2Taps(0);
      setTimeLeft(10);
      setHasStarted(true);
      setBattleQuote("");
    };

    const handleTap = (player: 1 | 2) => {
      if (!hasStarted || timeLeft === 0) return;
      playSoundEffect("tap");
      if (player === 1) {
        setP1Taps(t => t + 1);
      } else {
        setP2Taps(t => t + 1);
      }
    };

    const isGameOver = !hasStarted && timeLeft === 0 && (p1Taps > 0 || p2Taps > 0);

    return (
      <div className="space-y-6 text-center max-w-sm mx-auto">
        <div className="bg-[#ffeef2] p-4 rounded-3xl text-center border border-pink-100">
          <p className="text-xs font-black text-pink-800 uppercase tracking-widest flex items-center justify-center gap-1.5 mb-1">
             <Zap size={14} fill="currentColor" fillOpacity={0.8} /> Tactile Tapping Arena
          </p>
          <p className="text-[11px] text-stone-500">Tap furiously! Split the canvas in halves for a live side-by-side local dual, or play solo to beat your partner's highscores!</p>
        </div>

        {/* Solo Cloud scoreboard */}
        <div className="grid grid-cols-2 gap-3 text-center border-b border-pink-100/50 pb-4">
          <div>
            <p className="text-[8px] tracking-widest uppercase font-mono text-stone-400">Aayat Record Taps</p>
            <p className="text-base font-black text-pink-900">{globalStats.tapHighAayat} Hz</p>
          </div>
          <div>
            <p className="text-[8px] tracking-widest uppercase font-mono text-stone-400">Ibti Record Taps</p>
            <p className="text-base font-black text-pink-900">{globalStats.tapHighIbti} Hz</p>
          </div>
        </div>

        {!hasStarted && timeLeft === 0 && !isGameOver && (
          <button
            onClick={startTimer}
            className="w-full py-4 bg-[#d81b60] hover:bg-pink-650 text-white text-sm font-black rounded-2xl shadow-md transition-all outline-none duration-150 cursor-pointer"
          >
            🔥 Launch 10-Sec Arena
          </button>
        )}

        {hasStarted && (
          <div className="text-center font-mono py-2 animate-pulse">
            <span className="text-xs uppercase font-bold tracking-wider text-pink-500 mr-2">TIME REMAINING:</span>
            <span className="text-3xl font-extrabold text-[#d81b60]">{timeLeft}s</span>
          </div>
        )}

        {(hasStarted || isGameOver) && (
          <div className="flex flex-col gap-4 w-full pt-1">
            <div className="grid grid-cols-2 gap-4 h-48">
              {/* Player 1 split pad */}
              <button
                onClick={() => handleTap(1)}
                disabled={!hasStarted}
                className="bg-pink-100/65 hover:bg-pink-200/50 border border-pink-250 active:scale-95 duration-75 select-none rounded-[2rem] flex flex-col justify-center items-center cursor-pointer transition-all shadow-sm"
              >
                <span className="text-[10px] font-bold text-[#d81b60] uppercase tracking-wider">Aayat Side 💖</span>
                <span className="text-4xl font-black text-pink-950 font-mono mt-2">{p1Taps}</span>
              </button>

              {/* Player 2 split pad */}
              <button
                onClick={() => handleTap(2)}
                disabled={!hasStarted}
                className="bg-rose-100/65 hover:bg-rose-200/50 border border-pink-250 active:scale-95 duration-75 select-none rounded-[2rem] flex flex-col justify-center items-center cursor-pointer transition-all shadow-sm"
              >
                <span className="text-[10px] font-bold text-pink-700 uppercase tracking-wider">Ibti Side ⚡</span>
                <span className="text-4xl font-black text-pink-950 font-mono mt-2">{p2Taps}</span>
              </button>
            </div>
          </div>
        )}

        {isGameOver && (
          <div className="p-5 bg-white rounded-3xl border border-pink-100 text-center space-y-3 shadow-md">
            <h4 className="text-sm font-extrabold text-[#d81b60] flex items-center justify-center gap-1">
              <Crown size={14} fill="currentColor" /> Match Complete!
            </h4>
            <div className="flex items-center justify-center gap-6">
              <div>
                <p className="text-[9px] font-bold text-stone-400">AAYAT</p>
                <p className={`text-xl font-bold font-mono ${p1Taps >= p2Taps ? 'text-pink-600': 'text-stone-500'}`}>{p1Taps} taps</p>
              </div>
              <span className="text-xs font-bold text-stone-300">vs</span>
              <div>
                <p className="text-[9px] font-bold text-stone-400">IBTI</p>
                <p className={`text-xl font-bold font-mono ${p2Taps >= p1Taps ? 'text-pink-700': 'text-stone-500'}`}>{p2Taps} taps</p>
              </div>
            </div>
            <p className="text-xs text-[#d81b60] font-black animate-scaleUp">
              {p1Taps === p2Taps 
                ? "Perfectly Synched Tie! 🫶" 
                : `${p1Taps > p2Taps ? 'Aayat' : 'Ibti'} takes the victory crown! 👑`
              }
            </p>
            <p className="text-[9px] text-gray-400 italic font-medium">"{battleQuote}"</p>
            
            <button
              onClick={startTimer}
              className="w-full py-2.5 bg-[#d81b60] hover:bg-pink-650 text-white rounded-2xl text-xs font-bold transition-all cursor-pointer"
            >
              Play Match Once More
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-4 py-8 max-w-sm mx-auto space-y-6 pb-28">
      
      {/* Games Header Area */}
      <div className="text-center space-y-1.5 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-pink-300/10 blur-[100px] pointer-events-none rounded-full" />
        <p className="text-[10px] font-black tracking-widest uppercase text-[#d81b60] flex items-center justify-center gap-1 shadow-sm px-3.5 py-1.5 bg-pink-100/55 rounded-full w-max mx-auto border border-pink-200 mb-2">
          <Sparkles size={11} fill="currentColor" fillOpacity={0.7} /> Play together 🎮
        </p>
        <h1 className="text-3xl font-extrabold text-pink-850 tracking-tight leading-none mb-1">
          Games Hub
        </h1>
        <p className="text-[10px] text-stone-400 font-medium">Romantic mini challenges crafted for Aayat + Ibtihaj</p>
      </div>

      <AnimatePresence mode="wait">
        {selectedGame === null ? (
          /* Hub Dashboard Grid list of available projects */
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="grid grid-cols-2 gap-3"
            id="games-selection-card-grid"
          >
            {/* Game 1 Button */}
            <button
              onClick={() => { playSoundEffect("click"); setSelectedGame("TicTacToe"); }}
              className="glass-card bg-white p-5 rounded-[2rem] border-white text-center shadow-sm flex flex-col items-center justify-center gap-2 hover:bg-pink-50/20 active:scale-95 duration-150 cursor-pointer"
            >
              <div className="w-12 h-12 rounded-full bg-pink-100 flex items-center justify-center text-2xl">
                ❤️
              </div>
              <div>
                <p className="text-xs font-extrabold text-pink-850">Tic Tac Toe</p>
                <p className="text-[8px] text-stone-400 font-mono tracking-widest mt-0.5 uppercase">Aayat v/s Ibti</p>
              </div>
            </button>

            {/* Game 2 Button */}
            <button
              onClick={() => { playSoundEffect("click"); setSelectedGame("TruthOrDare"); }}
              className="glass-card bg-white p-5 rounded-[2rem] border-white text-center shadow-sm flex flex-col items-center justify-center gap-2 hover:bg-pink-50/20 active:scale-95 duration-150 cursor-pointer"
            >
              <div className="w-12 h-12 rounded-full bg-pink-100 flex items-center justify-center text-2xl">
                💬
              </div>
              <div>
                <p className="text-xs font-extrabold text-pink-850">Truth or Dare</p>
                <p className="text-[8px] text-stone-400 font-mono tracking-widest mt-0.5 uppercase">Lovers Chat</p>
              </div>
            </button>

            {/* Game 3 Button */}
            <button
              onClick={() => { playSoundEffect("click"); setSelectedGame("Quiz"); }}
              className="glass-card bg-white p-5 rounded-[2rem] border-white text-center shadow-sm flex flex-col items-center justify-center gap-2 hover:bg-pink-50/20 active:scale-95 duration-150 cursor-pointer"
            >
              <div className="w-12 h-12 rounded-full bg-pink-100 flex items-center justify-center text-2xl">
                🧠
              </div>
              <div>
                <p className="text-xs font-extrabold text-pink-850">Couple Quiz</p>
                <p className="text-[8px] text-stone-400 font-mono tracking-widest mt-0.5 uppercase">Trivia Match</p>
              </div>
            </button>

            {/* Game 4 Button */}
            <button
              onClick={() => { playSoundEffect("click"); setSelectedGame("Memory"); }}
              className="glass-card bg-white p-5 rounded-[2rem] border-white text-center shadow-sm flex flex-col items-center justify-center gap-2 hover:bg-pink-50/20 active:scale-95 duration-150 cursor-pointer"
            >
              <div className="w-12 h-12 rounded-full bg-pink-100 flex items-center justify-center text-2xl">
                🧩
              </div>
              <div>
                <p className="text-xs font-extrabold text-pink-850">Memory Match</p>
                <p className="text-[8px] text-stone-400 font-mono tracking-widest mt-0.5 uppercase">Pair symbols</p>
              </div>
            </button>

            {/* Game 5 Button */}
            <button
              onClick={() => { playSoundEffect("click"); setSelectedGame("Mood"); }}
              className="glass-card bg-white p-5 rounded-[2rem] border-white text-center shadow-sm flex flex-col items-center justify-center gap-2 hover:bg-pink-50/20 active:scale-95 duration-150 cursor-pointer"
            >
              <div className="w-12 h-12 rounded-full bg-pink-100 flex items-center justify-center text-2xl">
                😏
              </div>
              <div>
                <p className="text-xs font-extrabold text-pink-850">Mood Guess</p>
                <p className="text-[8px] text-stone-400 font-mono tracking-widest mt-0.5 uppercase">Real-time guessing</p>
              </div>
            </button>

            {/* Game 6 Button */}
            <button
              onClick={() => { playSoundEffect("click"); setSelectedGame("Tap"); }}
              className="glass-card bg-white p-5 rounded-[2rem] border-white text-center shadow-sm flex flex-col items-center justify-center gap-2 hover:bg-pink-50/20 active:scale-95 duration-150 cursor-pointer"
            >
              <div className="w-12 h-12 rounded-full bg-pink-100 flex items-center justify-center text-2xl">
                ⚡
              </div>
              <div>
                <p className="text-xs font-extrabold text-pink-850">Tap Battle</p>
                <p className="text-[8px] text-stone-400 font-mono tracking-widest mt-0.5 uppercase">10s furious tap</p>
              </div>
            </button>

          </motion.div>
        ) : (
          /* Single game arena */
          <motion.div
            initial={{ opacity: 0, scale: 0.98, x: 20 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.98, x: -25 }}
            className="space-y-4"
          >
            {/* Back button header */}
            <div className="flex items-center justify-between border-b border-pink-100/50 pb-3">
              <button
                onClick={() => { playSoundEffect("click"); setSelectedGame(null); }}
                className="p-2 px-3 bg-white hover:bg-pink-50/20 max-w-max text-stone-600 rounded-xl transition-colors cursor-pointer text-xs font-bold gap-1 flex items-center border border-pink-50 shadow-sm"
              >
                <ChevronLeft size={14} /> Back to Hub
              </button>
              <span className="text-[10px] font-bold text-pink-700 tracking-wider uppercase bg-[#ffeef2] px-3.5 py-1.5 rounded-full leading-none">
                {selectedGame === "TicTacToe" && "Tic Tac Toe ❤️"}
                {selectedGame === "TruthOrDare" && "Truth or Dare 💬"}
                {selectedGame === "Quiz" && "Couple Quiz 🧠"}
                {selectedGame === "Memory" && "Memory Match 🧩"}
                {selectedGame === "Mood" && "Mood Guess😏"}
                {selectedGame === "Tap" && "Tap Battle ⚡"}
              </span>
            </div>

            {/* Mount current game with fallback handles */}
            <div className="py-2">
              {selectedGame === "TicTacToe" && <TicTacToeGame />}
              {selectedGame === "TruthOrDare" && <TruthOrDareGame />}
              {selectedGame === "Quiz" && <CoupleQuizGame />}
              {selectedGame === "Memory" && <MemoryMatchGame />}
              {selectedGame === "Mood" && <MoodGuessGame />}
              {selectedGame === "Tap" && <TapBattleGame />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
