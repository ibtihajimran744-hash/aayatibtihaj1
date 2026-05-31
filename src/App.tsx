import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import Calculator from "./components/Calculator";
import GamesHub from "./components/GamesHub";
import VoiceNotePlayer from "./components/VoiceNotePlayer";
import PolaroidCard from "./components/PolaroidCard";
import {
  Heart,
  Settings,
  History as HistoryIcon,
  Image as ImageIcon,
  User as UserIcon,
  Send,
  ChevronRight,
  Plus,
  Trash2,
  Calendar as CalendarIcon,
  MessageCircle,
  X,
  Camera,
  LogOut,
  Sparkles,
  ChevronLeft,
  Lock,
  HeartHandshake,
  Gamepad2,
  Mic,
  Square
} from "lucide-react";
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  setDoc,
  doc,
  deleteDoc
} from "firebase/firestore";
import { db, authenticateApp, OperationType, handleFirestoreError } from "./firebase";

// --- Type Definitions ---
interface Signal {
  id: string;
  sender: string;
  text: string;
  timestamp: string;
}

interface Message {
  id: string;
  sender: string;
  text: string;
  timestamp: string;
  seen?: boolean;
  voiceUrl?: string;
  duration?: number;
}

interface GalleryItem {
  id: string;
  url: string;
  caption: string;
  uploader: string;
  timestamp: string;
  urls?: string[];
}

interface EventItem {
  id: string;
  title: string;
  date: string;
  description: string;
  category: "date" | "anniversary" | "fight" | "milestone" | "custom";
  createdBy: string;
}

interface UserProfile {
  avatar: string;
  status: string;
  lastActive: string;
}

interface AppState {
  signals: Signal[];
  messages: Message[];
  gallery: GalleryItem[];
  events: EventItem[];
  profiles: {
    Aayat: UserProfile;
    Ibtihaj: UserProfile;
  };
}

// Helper to scale/compress images before upload to keep payload small
const compressAndResizeImage = (file: File, maxWidth = 500, callback: (base64: string) => void) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = (event) => {
    const img = new Image();
    img.src = event.target?.result as string;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let width = img.width;
      let height = img.height;
      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        const maxHeight = maxWidth;
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(img, 0, 0, width, height);
      const compressedBase64 = canvas.toDataURL("image/jpeg", 0.65);
      callback(compressedBase64);
    };
  };
};

export default function App() {
  // Lockscreen / Calculator Disguise State
  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => {
    return localStorage.getItem("app_unlocked") === "true";
  });

  // Session / User Auth State
  const [currentUser, setCurrentUser] = useState<"Aayat" | "Ibtihaj" | null>(() => {
    const saved = localStorage.getItem("aayat_user");
    return saved === "Aayat" || saved === "Ibtihaj" ? saved : null;
  });
  
  const [loginTarget, setLoginTarget] = useState<"Aayat" | "Ibtihaj" | null>(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [loginError, setLoginError] = useState("");

  // Entire Synced Backend State
  const [state, setState] = useState<AppState>({
    signals: [],
    messages: [],
    gallery: [],
    events: [],
    profiles: {
      Aayat: { avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=200&h=200", status: "Miss you baby... 💕", lastActive: new Date().toISOString() },
      Ibtihaj: { avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200&h=200", status: "Dreaming of Aayat ✨", lastActive: new Date().toISOString() }
    }
  });

  // Client Navigation Tab: 'signals' | 'timeline' | 'gallery' | 'profile' | 'games'
  const [activeTab, setActiveTab ] = useState<"signals" | "timeline" | "gallery" | "profile" | "games">("signals");

  // UI States
  const [isSending, setIsSending] = useState(false);
  const [showNotification, setShowNotification] = useState<string | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessageInput, setChatMessageInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [lastViewedSignalId, setLastViewedSignalId] = useState<string | null>(() => localStorage.getItem("last_viewed_signal"));
  const [incomingSignal, setIncomingSignal] = useState<Signal | null>(null);

  // Gallery add modal
  const [isGalleryModalOpen, setIsGalleryModalOpen] = useState(false);
  const [galleryCaption, setGalleryCaption] = useState("");
  const [galleryBase64s, setGalleryBase64s] = useState<string[]>([]);

  // Calendar States
  const [calendarDate, setCalendarDate] = useState<Date>(new Date());
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [eventDate, setEventDate] = useState("");
  const [eventTitle, setEventTitle] = useState("");
  const [eventDesc, setEventDesc] = useState("");
  const [eventCat, setEventCat] = useState<EventItem["category"]>("date");

  // Profile status edit
  const [isEditingStatus, setIsEditingStatus] = useState(false);
  const [statusInputStr, setStatusInputStr] = useState("");

  // Heart animation tracker
  const [hearts, setHearts] = useState<{ id: number; left: number; delay: number; scale: number }[]>([]);

  // Refs
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<any>(null);
  const recordingIntervalRef = useRef<any>(null);
  const isRecordingDiscardedRef = useRef<boolean>(false);

  // Listen to Firestore real-time collections
  useEffect(() => {
    // Silently authenticate anonymously to support security rulesets
    authenticateApp().then(() => {
      // 1. Listen for signals
      const signalsQuery = query(collection(db, "signals"), orderBy("timestamp", "desc"), limit(50));
      const unsubscribeSignals = onSnapshot(signalsQuery, (snapshot) => {
        const list: Signal[] = [];
        snapshot.forEach((docSnapshot) => {
          const d = docSnapshot.data();
          list.push({
            id: docSnapshot.id,
            sender: d.sender || "",
            text: d.text || "",
            timestamp: d.timestamp || ""
          });
        });
        setState((prev) => {
          const nextState = { ...prev, signals: list };
          if (currentUser && list.length > 0) {
            const latestSignal = list[0];
            if (latestSignal.sender !== currentUser && latestSignal.id !== lastViewedSignalId) {
              setIncomingSignal(latestSignal);
              setLastViewedSignalId(latestSignal.id);
              localStorage.setItem("last_viewed_signal", latestSignal.id);
            }
          }
          return nextState;
        });
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, "signals");
      });

      // 2. Listen for messages
      const messagesQuery = query(collection(db, "messages"), orderBy("timestamp", "asc"), limit(200));
      const unsubscribeMessages = onSnapshot(messagesQuery, (snapshot) => {
        const list: Message[] = [];
        snapshot.forEach((docSnapshot) => {
          const d = docSnapshot.data();
          list.push({
            id: docSnapshot.id,
            sender: d.sender || "",
            text: d.text || "",
            timestamp: d.timestamp || "",
            seen: d.seen || false,
            voiceUrl: d.voiceUrl || "",
            duration: d.duration || 0
          });
        });
        setState((prev) => ({ ...prev, messages: list }));
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, "messages");
      });

      // 3. Listen for events
      const eventsQuery = query(collection(db, "events"), orderBy("date", "asc"));
      const unsubscribeEvents = onSnapshot(eventsQuery, (snapshot) => {
        const list: EventItem[] = [];
        snapshot.forEach((docSnapshot) => {
          const d = docSnapshot.data();
          list.push({
            id: docSnapshot.id,
            title: d.title || "",
            date: d.date || "",
            description: d.description || "",
            category: d.category || "custom",
            createdBy: d.createdBy || ""
          });
        });
        setState((prev) => ({ ...prev, events: list }));
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, "events");
      });

      // 4. Listen for gallery
      const galleryQuery = query(collection(db, "gallery"), orderBy("timestamp", "desc"), limit(100));
      const unsubscribeGallery = onSnapshot(galleryQuery, (snapshot) => {
        const list: GalleryItem[] = [];
        snapshot.forEach((docSnapshot) => {
          const d = docSnapshot.data();
          list.push({
            id: docSnapshot.id,
            url: d.url || "",
            caption: d.caption || "",
            uploader: d.uploader || "",
            timestamp: d.timestamp || "",
            urls: d.urls || []
          });
        });
        setState((prev) => ({ ...prev, gallery: list }));
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, "gallery");
      });

      // 5. Listen for profiles
      const unsubscribeProfiles = onSnapshot(collection(db, "profiles"), (snapshot) => {
        const profilesMap = {
          Aayat: { avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=200&h=200", status: "Miss you baby... 💕", lastActive: new Date().toISOString() },
          Ibtihaj: { avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200&h=200", status: "Dreaming of Aayat ✨", lastActive: new Date().toISOString() }
        };
        snapshot.forEach((docSnapshot) => {
          const name = docSnapshot.id;
          if (name === "Aayat" || name === "Ibtihaj") {
            const d = docSnapshot.data();
            profilesMap[name] = {
              avatar: d.avatar || profilesMap[name].avatar,
              status: d.status || profilesMap[name].status,
              lastActive: d.lastActive || profilesMap[name].lastActive
            };
          }
        });
        setState((prev) => ({ ...prev, profiles: profilesMap }));
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, "profiles");
      });

      return () => {
        unsubscribeSignals();
        unsubscribeMessages();
        unsubscribeEvents();
        unsubscribeGallery();
        unsubscribeProfiles();
      };
    });
  }, [currentUser, lastViewedSignalId]);

  // Generate falling/floating decorative romantic hearts in background
  useEffect(() => {
    const list = Array.from({ length: 12 }).map((_, i) => ({
      id: i,
      left: Math.random() * 95,
      delay: Math.random() * 8,
      scale: 0.7 + Math.random() * 0.8
    }));
    setHearts(list);
  }, []);

  // Scroll to bottom of messages
  useEffect(() => {
    if (isChatOpen) {
      setTimeout(() => {
        chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, [isChatOpen, state.messages]);

  // Mark partner's messages as seen
  useEffect(() => {
    if (isChatOpen && currentUser) {
      const partnerUser = currentUser === "Aayat" ? "Ibtihaj" : "Aayat";
      const unseen = state.messages.filter((msg) => msg.sender === partnerUser && !msg.seen);
      if (unseen.length > 0) {
        unseen.forEach((msg) => {
          setDoc(doc(db, "messages", msg.id), { seen: true }, { merge: true }).catch((err) => {
            console.error("Could not set message seen status:", err);
          });
        });
      }
    }
  }, [isChatOpen, state.messages, currentUser]);

  // Log in user locally with our bulletproof passwords
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginTarget) return;

    const lowerUser = loginTarget.toLowerCase();
    const isAayatMatch = lowerUser === "aayat" && passwordInput === "IlovemybabyIbtihaj";
    const isIbtihajMatch = lowerUser === "ibtihaj" && passwordInput === "IlovemybabyAayat";

    if (isAayatMatch || isIbtihajMatch) {
      const username = isAayatMatch ? "Aayat" : "Ibtihaj";
      setCurrentUser(username);
      localStorage.setItem("aayat_user", username);
      setLoginTarget(null);
      setPasswordInput("");
      setLoginError("");
    } else {
      setLoginError("Incorrect secret password! Try again 💕");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("aayat_user");
    localStorage.removeItem("app_unlocked");
    setCurrentUser(null);
    setIsUnlocked(false);
  };

  const handleLockApp = () => {
    localStorage.removeItem("app_unlocked");
    setIsUnlocked(false);
  };

  // Signal Buttons List
  const signalButtons = [
    { emoji: "❤️", text: "I miss you" },
    { emoji: "🥺", text: "I'm sad" },
    { emoji: "☀️", text: "Good morning" },
    { emoji: "🌙", text: "Good night" },
    { emoji: "💋", text: "Send love" },
    { emoji: "📞", text: "Call me" }
  ];

  // Send a signal action
  const handleSendSignal = async (signalText: string) => {
    if (!currentUser || isSending) return;
    setIsSending(true);

    try {
      const docId = Math.random().toString(36).substr(2, 9);
      const newSignal = {
        sender: currentUser,
        text: signalText,
        timestamp: new Date().toISOString()
      };
      await setDoc(doc(db, "signals", docId), newSignal);
      setShowNotification(`Signal Sent: ${signalText} ❤️`);
      setTimeout(() => setShowNotification(null), 3500);
    } catch (error) {
      console.error("Could not upload signal:", error);
      handleFirestoreError(error, OperationType.CREATE, "signals");
    } finally {
      setIsSending(false);
    }
  };

  // Chat message sending
  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessageInput.trim() || !currentUser) return;

    const textToSend = chatMessageInput;
    setChatMessageInput("");

    try {
      const docId = Math.random().toString(36).substr(2, 9);
      const newMessage = {
        sender: currentUser,
        text: textToSend,
        timestamp: new Date().toISOString()
      };
      await setDoc(doc(db, "messages", docId), newMessage);
    } catch (error) {
      console.error("Message send failed:", error);
      handleFirestoreError(error, OperationType.CREATE, "messages");
    }
  };

  // Helper to convert audio blob to Base64
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(reader.result as string);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Start voice recording session
  const startVoiceRecording = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Microphone API not available");
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      isRecordingDiscardedRef.current = false;

      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      const startTime = Date.now();

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        
        if (isRecordingDiscardedRef.current) {
          return;
        }

        const elapsedSeconds = Math.round((Date.now() - startTime) / 1000) || 1;
        const audioBlob = new Blob(chunks, { type: "audio/webm" });

        try {
          const base64Audio = await blobToBase64(audioBlob);
          const docId = Math.random().toString(36).substr(2, 9);
          const newMessage = {
            sender: currentUser,
            text: "🎙️ Voice Note",
            timestamp: new Date().toISOString(),
            seen: false,
            voiceUrl: base64Audio,
            duration: elapsedSeconds
          };
          await setDoc(doc(db, "messages", docId), newMessage);
        } catch (err) {
          console.error("Failed to upload voice note:", err);
          setShowNotification("Could not send voice note. Please try again! 🥺");
          setTimeout(() => setShowNotification(null), 3000);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);

      const interval = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
      recordingIntervalRef.current = interval;
    } catch (err) {
      console.error("Microphone permissions denied or error:", err);
      setShowNotification("Microphone permission restricted. Open in a new tab! 🎙️");
      setTimeout(() => setShowNotification(null), 4000);
    }
  };

  // Stop recording. Optional shouldDiscard to discard session without sending
  const stopVoiceRecording = (shouldDiscard = false) => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
    }
    
    if (shouldDiscard) {
      isRecordingDiscardedRef.current = true;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    
    setIsRecording(false);
    setRecordingDuration(0);
  };

  // Handle avatar click upload
  const handleAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && currentUser) {
      compressAndResizeImage(e.target.files[0], 200, async (base64) => {
        try {
          const profileDoc = doc(db, "profiles", currentUser);
          await setDoc(profileDoc, {
            avatar: base64,
            lastActive: new Date().toISOString()
          }, { merge: true });
        } catch (error) {
          console.error("Could not upload avatar image", error);
          handleFirestoreError(error, OperationType.UPDATE, `profiles/${currentUser}`);
        }
      });
    }
  };

  // Promise wrapper around compressAndResizeImage helper
  const compressFileAsync = (file: File, maxWidth = 600): Promise<string> => {
    return new Promise((resolve) => {
      compressAndResizeImage(file, maxWidth, (base64) => {
        resolve(base64);
      });
    });
  };

  // Handle gallery entry creation
  const handleAddGalleryItem = async () => {
    if (galleryBase64s.length === 0 || !currentUser) return;

    try {
      const docId = "u_" + Math.random().toString(36).substr(2, 9);
      const newGalleryItem = {
        url: galleryBase64s[0] || "",
        urls: galleryBase64s,
        caption: galleryCaption || "Sweet snapshot",
        uploader: currentUser,
        timestamp: new Date().toISOString()
      };
      await setDoc(doc(db, "gallery", docId), newGalleryItem);
      setIsGalleryModalOpen(false);
      setGalleryCaption("");
      setGalleryBase64s([]);
    } catch (error) {
      console.error("Photo posting error:", error);
      handleFirestoreError(error, OperationType.CREATE, "gallery");
    }
  };

  const handleGalleryFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files) as File[];
      try {
        const promises = filesArray.map((file: File) => compressFileAsync(file, 605));
        const processed = await Promise.all(promises);
        setGalleryBase64s((prev) => [...prev, ...processed]);
      } catch (err) {
        console.error("Could not compress selected files", err);
      }
    }
  };

  // Status updates
  const handleUpdateStatus = async () => {
    if (!currentUser) return;
    try {
      const profileDoc = doc(db, "profiles", currentUser);
      await setDoc(profileDoc, {
        status: statusInputStr,
        lastActive: new Date().toISOString()
      }, { merge: true });
      setIsEditingStatus(false);
    } catch (error) {
      console.error("Status update error", error);
      handleFirestoreError(error, OperationType.UPDATE, `profiles/${currentUser}`);
    }
  };

  // Event list modifiers
  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventTitle.trim() || !eventDate || !currentUser) return;

    try {
      const docId = Math.random().toString(36).substr(2, 9);
      const newEvent = {
        title: eventTitle,
        date: eventDate,
        description: eventDesc || "",
        category: eventCat,
        createdBy: currentUser,
        timestamp: new Date().toISOString()
      };
      await setDoc(doc(db, "events", docId), newEvent);
      setIsEventModalOpen(false);
      setEventTitle("");
      setEventDate("");
      setEventDesc("");
      setEventCat("date");
    } catch (error) {
      console.error("Calendar posting failed:", error);
      handleFirestoreError(error, OperationType.CREATE, "events");
    }
  };

  const handleDeleteEvent = async (id: string) => {
    if (!confirm("Are you sure you want to remove this milestone memory?")) return;
    try {
      await deleteDoc(doc(db, "events", id));
    } catch (error) {
      console.error("Could not delete memory:", error);
      handleFirestoreError(error, OperationType.DELETE, `events/${id}`);
    }
  };

  const handleDeleteGalleryItem = async (id: string) => {
    if (!confirm("Are you sure you want to remove this Polaroid memory?")) return;
    try {
      await deleteDoc(doc(db, "gallery", id));
    } catch (error) {
      console.error("Could not delete Polaroid memory:", error);
      handleFirestoreError(error, OperationType.DELETE, `gallery/${id}`);
    }
  };

  // Calendar Helpers
  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  const handlePrevMonth = () => {
    setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1));
  };

  const daysInMonth = getDaysInMonth(calendarDate.getFullYear(), calendarDate.getMonth());
  const firstDayIndex = getFirstDayOfMonth(calendarDate.getFullYear(), calendarDate.getMonth());
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  // Filter events belonging to a day
  const getEventsForDay = (day: number) => {
    const formattedYMD = `${calendarDate.getFullYear()}-${String(calendarDate.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return state.events.filter(e => e.date === formattedYMD);
  };

  // Compute relationship counter duration (Standard reference: January 31, 2025)
  const computeRelationDays = () => {
    const startDate = new Date("2025-01-31");
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - startDate.getTime());
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  };

  // Compute days since first meeting reference (January 4, 2025)
  const computeDaysSinceMet = () => {
    const startDate = new Date("2025-01-04");
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - startDate.getTime());
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  };

  const partnerUser = currentUser === "Aayat" ? "Ibtihaj" : "Aayat";

  // If not unlocked, render the secret calculator disguise
  if (!isUnlocked) {
    return (
      <Calculator
        onUnlock={() => {
          setIsUnlocked(true);
          localStorage.setItem("app_unlocked", "true");
        }}
      />
    );
  }

  // If not logged in, render the secret romantic lockscreen
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-pink-100 relative flex items-center justify-center p-4 overflow-hidden select-none">
        
        {/* Floating background heart animations */}
        <div className="absolute inset-0 pointer-events-none z-0">
          {hearts.map((h) => (
            <div
              key={h.id}
              className="absolute text-rose-300 opacity-20"
              style={{
                left: `${h.left}%`,
                top: `${(h.id * 8) % 90}%`,
                animationName: "bounce",
                animationDuration: "1s",
                animationIterationCount: "infinite",
                animationDelay: `${h.delay}s`,
                transform: `scale(${h.scale})`,
              }}
            >
              <Heart fill="currentColor" size={24} />
            </div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-sm glass-card rounded-[2.5rem] p-8 relative z-10 text-center flex flex-col items-center"
        >
          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-md border border-pink-100 mb-4 text-pink-500">
            <HeartHandshake size={32} strokeWidth={1.5} />
          </div>

          {!loginTarget ? (
            <>
              <h1 className="text-3xl font-bold tracking-tight text-pink-700 font-sans mb-1">Aayat Signal</h1>
              <p className="text-sm text-pink-500 font-medium mb-8">Choose your profile to enter</p>

              <div className="w-full space-y-4">
                <button
                  onClick={() => {
                    setLoginTarget("Aayat");
                    setLoginError("");
                  }}
                  className="w-full bg-white hover:bg-pink-50 text-pink-700 py-4 px-6 rounded-2xl flex items-center gap-4 border border-pink-200 shadow-sm transition-all text-left font-semibold group cursor-pointer"
                >
                  <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-pink-200">
                    <img
                      src={state.profiles.Aayat.avatar || "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=150&h=150"}
                      alt="Aayat placeholder"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="flex-1">
                    <p className="text-lg">🌸 Aayat</p>
                    <p className="text-xs text-pink-400 font-normal italic">Wait for my honey</p>
                  </div>
                  <ChevronRight size={18} className="text-pink-300 group-hover:translate-x-1 transition-transform" />
                </button>

                <button
                  onClick={() => {
                    setLoginTarget("Ibtihaj");
                    setLoginError("");
                  }}
                  className="w-full bg-white hover:bg-pink-50 text-pink-700 py-4 px-6 rounded-2xl flex items-center gap-4 border border-pink-200 shadow-sm transition-all text-left font-semibold group cursor-pointer"
                >
                  <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-pink-200">
                    <img
                      src={state.profiles.Ibtihaj.avatar || "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=150&h=150"}
                      alt="Ibtihaj placeholder"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="flex-1">
                    <p className="text-lg">⚡ Ibtihaj</p>
                    <p className="text-xs text-pink-400 font-normal italic">Protecting my girl</p>
                  </div>
                  <ChevronRight size={18} className="text-pink-300 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </>
          ) : (
            <form onSubmit={handleLogin} className="w-full text-center">
              <button
                type="button"
                onClick={() => setLoginTarget(null)}
                className="inline-flex items-center gap-1 text-xs text-rose-400 hover:text-rose-600 font-semibold mb-6 cursor-pointer"
              >
                <ChevronLeft size={14} /> Back to Selection
              </button>

              <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-rose-300 mx-auto mb-4">
                <img
                  src={state.profiles[loginTarget].avatar || (loginTarget === "Aayat" ? "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=150&h=150" : "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=150&h=150")}
                  alt={loginTarget}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>

              <h2 className="text-xl font-bold text-pink-800 mb-2">Hello, {loginTarget}!</h2>
              <p className="text-xs text-pink-400 mb-6">Enter your secret romantic passcode</p>

              <div className="mb-4 relative">
                <input
                  type="password"
                  placeholder="Enter private password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="w-full bg-white px-4 py-3 pb-3.5 rounded-2xl border border-pink-200 text-center text-rose-700 font-medium focus:outline-none focus:ring-2 focus:ring-rose-300 text-sm placeholder-stone-300"
                  required
                  autoFocus
                />
                <Lock size={14} className="absolute right-4 top-4 text-stone-300" />
              </div>

              {loginError && (
                <p className="text-xs bg-rose-50 border border-rose-200 p-2.5 rounded-xl text-rose-650 font-bold mb-4 animate-shake">
                  {loginError}
                </p>
              )}

              <button
                type="submit"
                className="w-full py-4 bg-pink-505 hover:bg-pink-600 bg-[#d81b60] text-white rounded-2xl font-semibold shadow-md cursor-pointer transition-all"
              >
                Enter App 💕
              </button>
            </form>
          )}

          <div className="mt-8 text-[11px] text-pink-400 font-mono">
            Aayat & Ibtihaj Private Space
          </div>
        </motion.div>
      </div>
    );
  }

  // Application Layout for logged in user
  return (
    <div className="min-h-screen bg-[#ffeef2] relative overflow-x-hidden font-sans flex flex-col pb-24">
      
      {/* Dynamic Hearts Shower */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {hearts.map((h) => (
          <div
            key={h.id}
            className="absolute text-rose-400 opacity-20 duration-1000"
            style={{
              left: `${h.left}%`,
              top: `${(h.id * 8) % 95}%`,
              animationName: "pulse",
              animationDuration: "2.5s",
              animationIterationCount: "infinite",
              animationTimingFunction: "ease-in-out",
              animationDelay: `${h.delay}s`,
              transform: `scale(${h.scale})`,
            }}
          >
            <Heart fill="currentColor" size={16} />
          </div>
        ))}
      </div>

      {/* Main Container */}
      <div className="w-full max-w-md mx-auto flex-1 flex flex-col relative z-10 px-4 pt-4">

        {/* Global Floating Toast Header */}
        <AnimatePresence>
          {showNotification && (
            <motion.div
              initial={{ opacity: 0, y: -50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="fixed top-6 left-4 right-4 z-[999] max-w-sm mx-auto bg-[#d81b60] text-white px-6 py-4 rounded-full shadow-2xl flex items-center gap-3 border border-pink-400"
            >
              <Heart fill="currentColor" size={20} className="text-white shrink-0 animate-pulse" />
              <p className="text-sm font-semibold tracking-wide flex-1">{showNotification}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Incoming Partner Signal Alert */}
        <AnimatePresence>
          {incomingSignal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[9999] bg-[#ffeef2]/75 backdrop-blur-md flex items-center justify-center p-4"
            >
              <motion.div
                initial={{ scale: 0.9, y: 50 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9 }}
                className="w-full max-w-xs bg-white rounded-[3rem] p-8 border border-pink-200 shadow-2xl text-center space-y-6 flex flex-col items-center"
              >
                <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-pink-300">
                  <img
                    src={state.profiles[partnerUser]?.avatar || "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=150&h=150"}
                    alt={partnerUser}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>

                <div>
                  <h3 className="text-xs font-bold text-pink-500 uppercase tracking-widest mb-1">
                    Incoming Signal
                  </h3>
                  <p className="text-xl font-bold text-pink-900">
                    From {partnerUser} ✨
                  </p>
                </div>

                <motion.div
                  animate={{ scale: [1, 1.05, 1], rotate: [-2, 2, -2] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                  className="bg-pink-50 border border-pink-100 text-pink-700 px-6 py-4 rounded-2xl w-full text-lg font-bold shadow-sm"
                >
                  {incomingSignal.text}
                </motion.div>

                <p className="text-[10px] text-gray-400">
                  {new Date(incomingSignal.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </p>

                <button
                  onClick={() => setIncomingSignal(null)}
                  className="w-full py-3.5 bg-[#d81b60] hover:bg-pink-600 text-white rounded-full font-bold focus:outline-none shadow-md cursor-pointer transition-colors"
                >
                  Send Love Back! 💖
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Top Header Controls with Avatar */}
        <header className="flex items-center justify-between py-3 mb-6 bg-white/45 backdrop-blur-xl border border-white/60 p-4 rounded-3xl shadow-[0_8px_32px_0_rgba(244,143,177,0.12)]">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div
                onClick={() => avatarInputRef.current?.click()}
                className="w-12 h-12 rounded-full border-2 border-pink-200 overflow-hidden bg-pink-100 flex items-center justify-center cursor-pointer hover:opacity-80 active:scale-95 transition-all group"
                title="Change Avatar"
              >
                <img
                  src={state.profiles[currentUser]?.avatar || "https://images.unsplash.com/photo-1544005313-94ddf0286df2"}
                  alt={currentUser}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-black/45 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                  <Camera size={14} />
                </div>
              </div>
              <input
                type="file"
                ref={avatarInputRef}
                onChange={handleAvatarFile}
                accept="image/*"
                className="hidden"
              />
              <div className="absolute -bottom-1 -right-1 bg-[#d81b60] border border-white text-white p-1 rounded-full text-[8px] leading-none shrink-0">
                ⭐
              </div>
            </div>
            <div>
              <h2 className="text-base font-bold text-pink-850 flex items-center gap-1.5 leading-none mb-1">
                Aayat Signal 💌
              </h2>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-ping shrink-0" />
                <span className="text-[10px] text-stone-500 font-semibold tracking-wide">
                  Logged in as {currentUser}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleLockApp}
              className="p-2.5 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-semibold font-sans"
              title="Stealth Lock"
            >
              <Lock size={14} />
              <span>Lock</span>
            </button>
            <button
              onClick={handleLogout}
              className="p-2.5 bg-rose-50 hover:bg-rose-100 text-rose-500 rounded-xl transition-colors cursor-pointer"
              title="Sign Out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>

        {/* Dynamic Pages Rendering based on tab */}
        {activeTab === "signals" && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6 flex-1 flex flex-col"
          >
            {/* Romantic Heading */}
            <div className="text-center bg-white/30 backdrop-blur-sm border border-white rounded-[2rem] p-6 py-8">
              <div className="w-14 h-14 bg-white/95 rounded-2xl flex items-center justify-center shadow-sm border border-pink-100 mx-auto mb-3">
                <Heart className="text-[#f48fb1]" fill="currentColor" size={26} />
              </div>
              <h1 className="text-2xl font-bold text-pink-805">Aayat Signal 💌</h1>
              <p className="text-xs text-pink-500 font-semibold opacity-75">
                Tap a button to send {partnerUser} a signal.
              </p>
            </div>

            {/* Signal Buttons Grid */}
            <div className="grid grid-cols-2 gap-3" id="signal-buttons-layout">
              {signalButtons.map((btn, i) => (
                <motion.button
                  key={i}
                  whileTap={{ scale: 0.94 }}
                  onClick={() => handleSendSignal(btn.text)}
                  disabled={isSending}
                  className="signal-btn bg-white hover:bg-pink-50/50 hover:border-pink-200 border border-transparent p-5 rounded-[1.75rem] shadow-[0_6px_15px_rgba(244,143,177,0.07)] text-[#d81b60] flex flex-col items-center justify-center gap-2 transition-all cursor-pointer group h-32 text-center"
                >
                  <span className="text-3xl group-hover:scale-110 duration-200">{btn.emoji}</span>
                  <span className="text-xs font-bold uppercase tracking-wider text-pink-850">
                    {btn.text}
                  </span>
                </motion.button>
              ))}
            </div>

            {/* Connection Status Live Card */}
            <div className="glass-card rounded-[2rem] p-5 flex flex-col bg-white/70 border-white shadow-md">
              <div className="flex justify-between items-center mb-4">
                <span className="text-[10px] font-bold text-pink-600 uppercase tracking-widest">
                  Live connection Status
                </span>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-xs font-semibold text-stone-600">Connected</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-12 h-12 rounded-full border-2 border-white overflow-hidden shadow-sm">
                    <img
                      src={state.profiles[partnerUser]?.avatar || "https://images.unsplash.com/photo-1544005313-94ddf0286df2"}
                      alt={partnerUser}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-white rounded-full p-0.5 shadow-md flex items-center justify-center">
                    <Heart size={10} className="text-[#d81b60]" fill="currentColor" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-pink-900 text-sm leading-none mb-1">
                    {partnerUser}
                  </p>
                  <p className="text-xs text-stone-500 italic truncate font-medium">
                    "{state.profiles[partnerUser]?.status || "Waiting for signal..."}"
                  </p>
                </div>
              </div>
            </div>

            {/* Recently Sent Logging Activity */}
            <div className="glass-card rounded-[2rem] p-5 space-y-3 bg-white/40 border-white shadow-inner flex-1 max-h-64 overflow-y-auto">
              <div className="flex items-center gap-1.5 text-pink-800 font-bold text-xs uppercase tracking-widest">
                <HistoryIcon size={14} />
                <span>Signal History</span>
              </div>

              {state.signals.length === 0 ? (
                <p className="text-center text-xs text-pink-400 py-6">No signals sent yet. Tap a button!</p>
              ) : (
                <div className="space-y-2">
                  {state.signals.map((sig) => (
                    <div
                      key={sig.id}
                      className="flex items-center justify-between bg-white/70 px-4 py-2.5 rounded-xl border border-pink-100 text-xs shadow-sm"
                    >
                      <span className="font-semibold text-rose-800">
                        {sig.sender === currentUser ? "You" : sig.sender} sent:
                      </span>
                      <span className="bg-pink-100/60 font-medium px-2 py-1 rounded text-pink-700 ml-1">
                        {sig.text}
                      </span>
                      <span className="text-[10px] text-gray-400 font-mono shrink-0 ml-auto pl-2">
                        {new Date(sig.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Tab 2: Timeline Events List & Month Calendar */}
        {activeTab === "timeline" && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6 flex-1 flex flex-col pb-6"
          >
            {/* Timeline Title Card */}
            <div className="text-center bg-white/40 p-5 rounded-[2rem] border border-white">
              <h2 className="text-xl font-bold text-pink-905 flex items-center justify-center gap-1.5">
                <CalendarIcon size={18} className="text-[#d81b60]" />
                Our Love Timeline 🗓️
              </h2>
              <p className="text-xs text-stone-500 font-semibold mb-1">
                Mark, save, and celebrate private events & milestones
              </p>
            </div>

            {/* Beautiful Calendar Grid */}
            <div className="glass-card rounded-[2rem] p-5 bg-white/80 border-white shadow-md">
              
              {/* Calendar Controls */}
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-pink-100/60">
                <button onClick={handlePrevMonth} className="p-1 px-1.5 hover:bg-pink-50 text-[#d81b60] rounded-xl cursor-pointer">
                  <ChevronLeft size={18} />
                </button>
                <h3 className="text-sm font-bold text-pink-850">
                  {monthNames[calendarDate.getMonth()]} {calendarDate.getFullYear()}
                </h3>
                <button onClick={handleNextMonth} className="p-1 px-1.5 hover:bg-pink-50 text-[#d81b60] rounded-xl cursor-pointer">
                  <ChevronRight size={18} />
                </button>
              </div>

              {/* Day Labels */}
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-pink-400 tracking-wider mb-2">
                <span>SUN</span><span>MON</span><span>TUE</span><span>WED</span><span>THU</span><span>FRI</span><span>SAT</span>
              </div>

              {/* Day Numbers Grid */}
              <div className="grid grid-cols-7 gap-1 text-center font-semibold text-xs text-stone-700">
                {/* Empty columns for offsets */}
                {Array.from({ length: firstDayIndex }).map((_, i) => (
                  <div key={`offset-${i}`} className="p-2 text-stone-300"></div>
                ))}

                {/* Days numbers */}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const dayNum = i + 1;
                  const dayEvents = getEventsForDay(dayNum);
                  const isToday = new Date().getDate() === dayNum && new Date().getMonth() === calendarDate.getMonth() && new Date().getFullYear() === calendarDate.getFullYear();
                  
                  return (
                    <div
                      key={`day-${dayNum}`}
                      className={`
                        p-2 rounded-xl relative flex items-center justify-center cursor-pointer select-none duration-150 group transition-all
                        ${isToday ? "bg-[#d81b60] text-white font-bold" : "hover:bg-rose-100"}
                      `}
                      onClick={() => {
                        const formattedDateYMD = `${calendarDate.getFullYear()}-${String(calendarDate.getMonth() + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
                        setEventDate(formattedDateYMD);
                        setIsEventModalOpen(true);
                      }}
                    >
                      <span>{dayNum}</span>
                      
                      {/* Heart Pin if day has milestones */}
                      {dayEvents.length > 0 && (
                        <div className="absolute -top-1 -right-1 text-rose-500 scale-90">
                          <Heart fill="currentColor" size={8} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex justify-between">
                <p className="text-[10px] text-gray-400 flex items-center gap-1">
                  <Heart fill="currentColor" className="text-rose-400 inline" size={8} /> Tap any date to add a milestone
                </p>
              </div>
            </div>

            {/* List of Marked Milestones */}
            <div className="space-y-3 flex-1 overflow-y-auto max-h-96 pr-1">
              <div className="flex items-center justify-between border-b border-pink-100/80 pb-1.5">
                <span className="text-xs font-bold text-pink-650 uppercase tracking-widest">
                  Memory List
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const todayStr = new Date().toISOString().split("T")[0];
                    setEventDate(todayStr);
                    setIsEventModalOpen(true);
                  }}
                  className="p-1 px-3.5 bg-white text-xs text-pink-600 rounded-full border border-pink-200 hover:bg-pink-50 flex items-center gap-1 cursor-pointer font-bold duration-150"
                >
                  <Plus size={12} /> Add memory
                </button>
              </div>

              {state.events.length === 0 ? (
                <div className="bg-white/40 p-6 rounded-2xl text-center border border-dashed border-pink-200">
                  <p className="text-xs text-pink-405 leading-relaxed">
                    No milestone memories logged yet.<br />Tap any calendar date to mark something sweet together!
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {state.events.map((evt) => (
                    <div
                      key={evt.id}
                      className="glass-card bg-white/70 p-4 rounded-2xl border border-pink-100/50 hover:shadow-md transition-shadow relative flex flex-col"
                    >
                      <button
                        onClick={() => handleDeleteEvent(evt.id)}
                        className="absolute top-4 right-4 text-rose-350 hover:text-rose-500 cursor-pointer"
                        title="Delete Milestone"
                      >
                        <Trash2 size={13} />
                      </button>

                      <div className="flex items-center gap-2 mb-1">
                         <span className="text-xs font-bold uppercase tracking-wider text-pink-700 bg-pink-100/80 px-2 py-0.5 rounded-md">
                           {evt.category}
                         </span>
                         <span className="text-[11px] text-stone-500 font-medium">
                           {new Date(evt.date).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                         </span>
                      </div>

                      <h4 className="font-bold text-gray-800 text-sm mb-1">{evt.title}</h4>
                      {evt.description && (
                        <p className="text-xs text-stone-600 leading-normal">{evt.description}</p>
                      )}

                      <div className="text-[9px] text-stone-400 mt-2 font-mono">
                         Logged by {evt.createdBy}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Event Adding Popup Modal */}
            <AnimatePresence>
              {isEventModalOpen && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[2000] bg-black/35 backdrop-blur-[2px] flex items-center justify-center p-4"
                >
                  <motion.div
                    initial={{ scale: 0.9, y: 30 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.9 }}
                    className="w-full max-w-sm bg-white rounded-[2rem] p-6 border border-pink-100 shadow-2xl relative"
                  >
                    <button
                      onClick={() => setIsEventModalOpen(false)}
                      className="absolute top-4 right-4 text-stone-400 hover:text-stone-600 cursor-pointer"
                    >
                      <X size={18} />
                    </button>

                    <h3 className="text-md font-bold text-pink-850 mb-4 flex items-center gap-1.5 border-b border-pink-100 pb-2">
                      <Sparkles size={16} className="text-[#d81b60]" /> Add Romantic Milestone
                    </h3>

                    <form onSubmit={handleAddEvent} className="space-y-4 text-left">
                      <div>
                        <label className="block text-[10px] font-bold text-pink-600 uppercase tracking-widest mb-1">
                          Milestone Title
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. First night walk, Big movie date"
                          value={eventTitle}
                          onChange={(e) => setEventTitle(e.target.value)}
                          className="w-full bg-stone-50 border border-stone-200 p-2.5 px-3 rounded-xl text-stone-800 focus:outline-none focus:ring-1 focus:ring-pink-300 text-xs"
                          required
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-pink-600 uppercase tracking-widest mb-1">
                            Date
                          </label>
                          <input
                            type="date"
                            value={eventDate}
                            onChange={(e) => setEventDate(e.target.value)}
                            className="w-full bg-stone-50 border border-stone-200 p-2 rounded-xl text-stone-800 focus:outline-none focus:ring-1 focus:ring-pink-300 text-xs"
                            required
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-pink-600 uppercase tracking-widest mb-1">
                            Type
                          </label>
                          <select
                            value={eventCat}
                            onChange={(e) => setEventCat(e.target.value as EventItem["category"])}
                            className="w-full bg-stone-50 border border-stone-200 p-2 rounded-xl text-stone-800 focus:outline-none focus:ring-1 focus:ring-pink-300 text-xs"
                          >
                            <option value="date">🍿 Date Night</option>
                            <option value="anniversary">💍 Anniversary</option>
                            <option value="milestone">💘 Milestone</option>
                            <option value="cute">🌸 Cute moment</option>
                            <option value="custom">✨ Other</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-pink-600 uppercase tracking-widest mb-1">
                          Brief Diary Note
                        </label>
                        <textarea
                          placeholder="Write down details of this magic moment..."
                          rows={3}
                          value={eventDesc}
                          onChange={(e) => setEventDesc(e.target.value)}
                          className="w-full bg-stone-50 border border-stone-200 p-2.5 px-3 rounded-xl text-stone-800 focus:outline-none focus:ring-1 focus:ring-pink-300 text-xs"
                        />
                      </div>

                      <button
                        type="submit"
                        className="w-full py-3.5 bg-[#d81b60] hover:bg-pink-600 text-white rounded-xl font-bold shadow-md cursor-pointer transition-colors text-xs uppercase"
                      >
                        Log Milestone 💖
                      </button>
                    </form>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* Tab 3: Polaroid-Style Gallery Wall */}
        {activeTab === "gallery" && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6 flex-1 flex flex-col pb-6"
          >
            {/* Title card */}
            <div className="text-center bg-white/40 p-5 rounded-[2rem] border border-white">
              <h2 className="text-xl font-bold text-pink-905 flex items-center justify-center gap-1.5">
                <ImageIcon size={18} className="text-[#d81b60]" />
                Memory Gallery 📸
              </h2>
              <p className="text-xs text-stone-505 font-medium">
                Snap, store, and reminisce your romantic snaps
              </p>
            </div>

            {/* Custom Snap Button Trigger */}
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => {
                  setGalleryBase64s([]);
                  setGalleryCaption("");
                  setIsGalleryModalOpen(true);
                }}
                className="bg-white hover:bg-pink-50 text-pink-700 py-3.5 px-6 rounded-2xl border border-pink-200 shadow-sm transition-all text-xs font-bold leading-none flex items-center gap-2 group cursor-pointer"
              >
                <div className="w-6 h-6 bg-pink-100 rounded-full flex items-center justify-center text-pink-650 group-hover:scale-110 duration-150 shrink-0">
                  <camera-icon className="w-3.5 h-3.5" />
                  <Camera size={12} />
                </div>
                Share Polaroid Snapshot 📸
              </button>
            </div>

            {/* Polaroid Masonry Stack */}
            {state.gallery.length === 0 ? (
              <div className="flex-1 bg-white/30 border border-dashed border-pink-200 rounded-[2.5rem] p-10 flex flex-col items-center justify-center text-center">
                <p className="text-xs text-pink-405 leading-relaxed">
                  No Polaroid Snaps taken yet.<br />Click the big photo button above to share a moment!
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {state.gallery.map((item) => (
                  <PolaroidCard
                    key={item.id}
                    item={item}
                    onDelete={handleDeleteGalleryItem}
                  />
                ))}
              </div>
            )}

            {/* Gallery Upload Polaroid Modal Dialog */}
            <AnimatePresence>
              {isGalleryModalOpen && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[2000] bg-black/30 backdrop-blur-[2px] flex items-center justify-center p-4 animate-fadeIn"
                >
                  <motion.div
                    initial={{ scale: 0.9, y: 30 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.9 }}
                    className="w-full max-w-sm bg-white rounded-[2rem] p-6 border border-pink-100 shadow-2xl relative"
                  >
                    <button
                      onClick={() => setIsGalleryModalOpen(false)}
                      className="absolute top-4 right-4 text-stone-400 hover:text-stone-600 cursor-pointer"
                    >
                      <X size={18} />
                    </button>

                    <h3 className="text-md font-bold text-pink-850 mb-4 pb-2 border-b border-pink-50 flex items-center gap-1.5">
                      <Camera size={16} className="text-[#d81b60]" /> Share Private Polaroid
                    </h3>

                    <div className="space-y-4 text-left">
                      {/* Photo selector target frame */}
                      <div className="flex flex-col gap-3">
                        {galleryBase64s.length > 0 ? (
                          <div className="space-y-3 w-full">
                            {/* Large primary preview */}
                            <div className="w-full h-48 rounded-2xl overflow-hidden border border-rose-100 shadow-sm relative bg-stone-50">
                              <img src={galleryBase64s[0]} alt="Pre-upload primary preview" className="w-full h-full object-cover" />
                              <div className="absolute top-2 left-2 bg-black/65 text-white text-[9px] font-bold px-2 py-0.5 rounded-full select-none font-mono">
                                Main photo ({galleryBase64s.length} total)
                              </div>
                            </div>
                            
                            {/* Horizontal grid list */}
                            <label className="block text-[9px] font-bold text-stone-400 uppercase tracking-widest leading-none">
                              Selected Carousel Photos ({galleryBase64s.length})
                            </label>
                            <div className="w-full flex items-center gap-2 overflow-x-auto py-1 scrollbar-thin">
                              {galleryBase64s.map((img, idx) => (
                                <div key={idx} className="relative w-14 h-14 shrink-0 rounded-lg overflow-hidden border border-rose-50 bg-stone-50 shadow-sm">
                                  <img src={img} className="w-full h-full object-cover" />
                                  <button
                                    onClick={() => setGalleryBase64s(prev => prev.filter((_, i) => i !== idx))}
                                    type="button"
                                    className="absolute top-0.5 right-0.5 p-0.5 bg-black/60 hover:bg-black/85 text-white rounded-full transition-colors cursor-pointer"
                                  >
                                    <X size={8} />
                                  </button>
                                </div>
                              ))}
                              
                              {/* Quick add extra photos slot */}
                              <button
                                type="button"
                                onClick={() => galleryInputRef.current?.click()}
                                className="w-14 h-14 shrink-0 rounded-lg border border-dashed border-pink-200 bg-rose-50/20 hover:bg-rose-50 flex flex-col items-center justify-center text-pink-600 transition-colors cursor-pointer"
                              >
                                <Plus size={14} />
                                <span className="text-[8px] font-bold">Add</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div
                            onClick={() => galleryInputRef.current?.click()}
                            className="w-full h-44 rounded-2xl border-2 border-dashed border-pink-200 bg-rose-50/40 flex flex-col items-center justify-center text-center p-6 hover:bg-rose-50 shrink-0 cursor-pointer duration-150"
                          >
                            <Camera size={26} className="text-pink-300 mb-2" />
                            <p className="text-xs font-bold text-pink-600 mb-1">Upload Photo Snapshot(s)</p>
                            <p className="text-[10px] text-stone-400">Click to select one or multiple photos</p>
                          </div>
                        )}

                        <input
                          type="file"
                          ref={galleryInputRef}
                          onChange={handleGalleryFileSelect}
                          accept="image/*"
                          multiple
                          className="hidden"
                        />
                      </div>

                      {/* Polaroid Caption */}
                      <div>
                        <label className="block text-[10px] font-bold text-pink-650 uppercase tracking-widest mb-1">
                          Polaroid Cursive Caption
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Walking under the moon..."
                          value={galleryCaption}
                          onChange={(e) => setGalleryCaption(e.target.value)}
                          className="w-full bg-stone-50 border border-stone-200 p-2.5 px-3 rounded-xl text-[#d81b60] font-hand text-lg focus:outline-none focus:ring-1 focus:ring-pink-300"
                        />
                      </div>

                      <button
                        onClick={handleAddGalleryItem}
                        disabled={galleryBase64s.length === 0}
                        className={`w-full py-3.5 rounded-xl font-bold shadow-md cursor-pointer text-xs uppercase transition-all ${
                          galleryBase64s.length > 0 ? "bg-[#d81b60] hover:bg-pink-600 text-white" : "bg-stone-100 text-stone-400 cursor-not-allowed"
                        }`}
                      >
                        Pin to Shared Polaroid Wall 💖
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* Tab 4: Biography Profiles & Love Stats */}
        {activeTab === "profile" && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6 flex-1 flex flex-col pb-6"
          >
            {/* Connection Title banner */}
            <div className="text-center bg-white/40 p-5 rounded-[2rem] border border-white">
              <h2 className="text-xl font-bold text-pink-905 flex items-center justify-center gap-1.5">
                <HeartHandshake size={18} className="text-[#d81b60]" />
                Heart Space Profile ✨
              </h2>
              <p className="text-xs text-pink-505 font-medium">
                Customize statuses and review romantic achievements
              </p>
            </div>

            {/* Profile Statistics Dashboard */}
            <div className="grid grid-cols-2 gap-3" id="achievements-bento">
              
              <div className="col-span-2 glass-card bg-gradient-to-r from-pink-500/10 via-rose-500/5 to-white/80 p-6 rounded-[2rem] border-white text-center shadow-sm flex flex-col items-center justify-center relative overflow-hidden">
                 <div className="absolute -right-4 -bottom-4 text-pink-500/10 pointer-events-none rotate-12">
                   <Heart size={80} fill="currentColor" />
                 </div>
                 <p className="text-[10px] font-bold text-[#d81b60] uppercase tracking-wider mb-1 flex items-center gap-1">
                   <Heart size={10} fill="currentColor" /> Days Together 💕
                 </p>
                 <p className="text-4xl font-extrabold text-pink-850 leading-none mb-1.5">{computeRelationDays()}</p>
                 <p className="text-[10px] text-pink-700 font-medium">Since January 31, 2025</p>
                 <p className="text-[9px] text-stone-400 italic font-medium mt-1">"I told her that I like her" confessions ✨</p>
              </div>

              <div className="glass-card bg-white/80 p-5 rounded-[2rem] border-white text-center shadow-sm flex flex-col items-center justify-center">
                 <p className="text-[10px] font-bold text-pink-600 uppercase tracking-wider mb-1">Days Since Met 🌱</p>
                 <p className="text-3xl font-extrabold text-[#d81b60] leading-none mb-1">{computeDaysSinceMet()}</p>
                 <p className="text-[9px] text-gray-400 italic font-medium">Since Jan 4, 2025</p>
              </div>

              <div className="glass-card bg-white/80 p-5 rounded-[2rem] border-white text-center shadow-sm flex flex-col items-center justify-center">
                 <p className="text-[10px] font-bold text-pink-600 uppercase tracking-wider mb-1">Polaroids Shared</p>
                 <p className="text-3xl font-extrabold text-pink-850 leading-none mb-1">{state.gallery.length}</p>
                 <p className="text-[9px] text-gray-400 italic font-medium">Capture of love snaps</p>
              </div>

              <div className="glass-card bg-white/80 p-5 rounded-[2rem] border-white text-center shadow-sm flex flex-col items-center justify-center">
                 <p className="text-[10px] font-bold text-pink-600 uppercase tracking-wider mb-1">Signals Sent</p>
                 <p className="text-3xl font-extrabold text-pink-850 leading-none mb-1">{state.signals.length}</p>
                 <p className="text-[9px] text-gray-400 italic font-medium">Tap triggers counted</p>
              </div>

              <div className="glass-card bg-white/80 p-5 rounded-[2rem] border-white text-center shadow-sm flex flex-col items-center justify-center">
                 <p className="text-[10px] font-bold text-pink-600 uppercase tracking-wider mb-1">Spoken Messages</p>
                 <p className="text-3xl font-extrabold text-pink-850 leading-none mb-1">{state.messages.length}</p>
                 <p className="text-[9px] text-gray-400 italic font-medium">Private chats logged</p>
              </div>
            </div>

            {/* Aayat Biography Information Card Card */}
            <div className="glass-card bg-white p-5 rounded-[2rem] border-pink-100/50 shadow-sm space-y-4">
              <div className="flex items-center gap-3">
                <div className="relative w-14 h-14 rounded-full border-2 border-pink-300 overflow-hidden shrink-0">
                  <img
                    src={state.profiles.Aayat.avatar || "https://images.unsplash.com/photo-1544005313-94ddf0286df2"}
                    alt="Aayat placeholder"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div>
                  <h3 className="font-bold text-pink-850 text-base leading-none mb-1">Aayat 🌸</h3>
                  <p className="text-[10px] font-bold text-pink-500 uppercase tracking-wider">Lover Principal</p>
                </div>
              </div>

               <div className="bg-pink-50/50 rounded-2xl p-3 border border-pink-100">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-[#d81b60] mb-1">Current Status</p>
                  <p className="text-xs text-gray-700 italic font-medium">"{state.profiles.Aayat.status || "Waiting for love..."}"</p>
               </div>

               {currentUser === "Aayat" && (
                 <div className="flex items-center gap-2">
                   {isEditingStatus ? (
                     <>
                       <input
                         type="text"
                         value={statusInputStr}
                         onChange={(e) => setStatusInputStr(e.target.value)}
                         placeholder="Update your status..."
                         className="flex-1 bg-stone-50 border border-stone-200 p-2 text-xs rounded-xl text-stone-700 focus:outline-none focus:ring-1 focus:ring-pink-300"
                       />
                       <button
                         onClick={handleUpdateStatus}
                         className="p-2 bg-[#d81b60] text-white rounded-xl text-xs hover:bg-pink-600 font-bold duration-150 cursor-pointer"
                       >
                         Save
                       </button>
                       <button
                         onClick={() => setIsEditingStatus(false)}
                         className="p-2 bg-stone-100 text-stone-500 rounded-xl text-xs hover:bg-stone-200 duration-150 cursor-pointer"
                       >
                         Cancel
                       </button>
                     </>
                   ) : (
                     <button
                       onClick={() => {
                         setStatusInputStr(state.profiles.Aayat.status);
                         setIsEditingStatus(true);
                       }}
                       className="w-full py-2 bg-pink-100/55 hover:bg-pink-100 text-pink-700 font-bold rounded-xl text-xs duration-150 cursor-pointer"
                     >
                       Edit status bio
                     </button>
                   )}
                 </div>
               )}
            </div>

            {/* Ibtihaj Biography Information Card Card */}
            <div className="glass-card bg-white p-5 rounded-[2rem] border-pink-100/50 shadow-sm space-y-4">
              <div className="flex items-center gap-3">
                <div className="relative w-14 h-14 rounded-full border-2 border-pink-300 overflow-hidden shrink-0">
                  <img
                    src={state.profiles.Ibtihaj.avatar || "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d"}
                    alt="Ibtihaj placeholder"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div>
                  <h3 className="font-bold text-pink-850 text-base leading-none mb-1">Ibtihaj ⚡</h3>
                  <p className="text-[10px] font-bold text-pink-500 uppercase tracking-wider">Guardian Defender</p>
                </div>
              </div>

               <div className="bg-pink-50/50 rounded-2xl p-3 border border-pink-100">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-[#d81b60] mb-1">Current Status</p>
                  <p className="text-xs text-gray-700 italic font-medium">"{state.profiles.Ibtihaj.status || "Defending her heart..."}"</p>
               </div>

               {currentUser === "Ibtihaj" && (
                 <div className="flex items-center gap-2">
                   {isEditingStatus ? (
                     <>
                       <input
                         type="text"
                         value={statusInputStr}
                         onChange={(e) => setStatusInputStr(e.target.value)}
                         placeholder="Update your status..."
                         className="flex-1 bg-stone-50 border border-stone-200 p-2 text-xs rounded-xl text-stone-700 focus:outline-none focus:ring-1 focus:ring-pink-300"
                       />
                       <button
                         onClick={handleUpdateStatus}
                         className="p-2 bg-[#d81b60] text-white rounded-xl text-xs hover:bg-pink-600 font-bold duration-150 cursor-pointer"
                       >
                         Save
                       </button>
                       <button
                         onClick={() => setIsEditingStatus(false)}
                         className="p-2 bg-stone-100 text-stone-500 rounded-xl text-xs hover:bg-stone-200 duration-150 cursor-pointer"
                       >
                         Cancel
                       </button>
                     </>
                   ) : (
                     <button
                       onClick={() => {
                         setStatusInputStr(state.profiles.Ibtihaj.status);
                         setIsEditingStatus(true);
                       }}
                       className="w-full py-2 bg-pink-100/55 hover:bg-pink-100 text-pink-700 font-bold rounded-xl text-xs duration-150 cursor-pointer"
                     >
                       Edit status bio
                     </button>
                   )}
                 </div>
               )}
            </div>

          </motion.div>
        )}

        {/* Tab 5: Games Hub */}
        {activeTab === "games" && (
          <GamesHub currentUser={currentUser} />
        )}

      </div>

      {/* Persistent Floating Chat Trigger Button */}
      <div className="fixed bottom-24 right-5 z-[500]">
        <button
          onClick={() => setIsChatOpen(!isChatOpen)}
          className="w-14 h-14 bg-[#d81b60] hover:bg-pink-650 text-white rounded-full shadow-2xl flex items-center justify-center relative active:scale-95 transition-all cursor-pointer border border-pink-400 group"
          id="chat-toggle-floating-btn"
        >
          {isChatOpen ? <X size={24} /> : (
            <div className="relative">
              <MessageCircle size={24} fill="currentColor" />
              {state.messages.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-yellow-400 border border-white rounded-full text-[8px] flex items-center justify-center text-pink-900 font-black shrink-0 font-mono">
                  ★
                </span>
              )}
            </div>
          )}
        </button>
      </div>

      {/* Floating sliding Chat Box Messenger Drawer */}
      <AnimatePresence>
        {isChatOpen && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed bottom-40 right-4 left-4 max-w-sm mx-auto z-[490] bg-white rounded-[2.5rem] border border-pink-100/60 shadow-[0_20px_50px_rgba(244,143,177,0.25)] overflow-hidden flex flex-col h-[28rem]"
          >
            {/* Chat Header banner */}
            <div className="bg-pink-50 border-b border-pink-100 p-4 px-6 flex justify-between items-center bg-white/70 backdrop-blur-md">
              <div className="flex items-center gap-2">
                 <div className="w-8 h-8 rounded-full overflow-hidden border border-pink-250 shrink-0 bg-white">
                   <img
                     src={state.profiles[partnerUser]?.avatar || "https://images.unsplash.com/photo-1544005313-94ddf0286df2"}
                     alt={partnerUser}
                     className="w-full h-full object-cover"
                     referrerPolicy="no-referrer"
                   />
                 </div>
                 <div>
                    <h4 className="font-bold text-gray-800 text-xs">Private Chat with {partnerUser}</h4>
                    <p className="text-[9px] text-green-500 font-bold uppercase tracking-wider animate-pulse leading-none">Online & Listening</p>
                 </div>
              </div>
              <button onClick={() => setIsChatOpen(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <X size={16} />
              </button>
            </div>

            {/* Chat Message Scroll */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#ffeef2]/50">
              {state.messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-1">
                  <div className="text-pink-300">
                    <Heart size={20} fill="currentColor" />
                  </div>
                  <p className="text-[11px] font-semibold text-pink-400">Your chat is totally secure & private.</p>
                  <p className="text-[10px] text-stone-400">Say hello my love! 🥰</p>
                </div>
              ) : (
                state.messages.map((msg) => {
                  const isMe = msg.sender === currentUser;
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
                    >
                      <div
                        className={`
                          max-w-[80%] rounded-2xl px-4 py-2.5 text-xs font-medium leading-relaxed shadow-sm
                          ${isMe ? "bg-[#d81b60] text-white rounded-br-none" : "bg-white text-gray-800 rounded-bl-none border border-pink-50"}
                        `}
                      >
                        {msg.voiceUrl ? (
                          <VoiceNotePlayer voiceUrl={msg.voiceUrl} duration={msg.duration} isMe={isMe} />
                        ) : (
                          msg.text
                        )}
                      </div>
                      <span className="text-[8px] text-gray-400 font-mono mt-1 px-1 flex items-center gap-1 leading-none select-none">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                        {isMe && (
                          <span className="text-stone-400">
                            • {msg.seen ? <span className="text-pink-600 font-bold">Seen 💖</span> : "Sent"}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* Message input Form */}
            {isRecording ? (
              <div className="p-3 border-t border-pink-100 bg-white flex items-center justify-between gap-2 bg-[#fffcfd]">
                <div className="flex-1 bg-red-50/50 border border-red-100/80 px-4 py-2.5 rounded-full flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                  </span>
                  <span className="text-[10px] font-bold text-red-650 animate-pulse font-mono uppercase tracking-tight">
                    Recording: {recordingDuration}s
                  </span>
                </div>
                
                <button
                  type="button"
                  onClick={() => stopVoiceRecording(true)}
                  className="w-10 h-10 bg-red-50 hover:bg-red-100 text-red-500 rounded-full flex items-center justify-center shadow-sm shrink-0 cursor-pointer transition-all active:scale-95"
                  title="Discard Recording"
                >
                  <Trash2 size={15} />
                </button>

                <button
                  type="button"
                  onClick={() => stopVoiceRecording(false)}
                  className="w-10 h-10 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full flex items-center justify-center shadow-md shrink-0 cursor-pointer transition-all active:scale-95"
                  title="Send Voice Note"
                >
                  <Send size={15} fill="currentColor" />
                </button>
              </div>
            ) : (
              <form onSubmit={handleSendChatMessage} className="p-3 border-t border-pink-100 bg-white flex gap-2">
                <button
                  type="button"
                  onClick={startVoiceRecording}
                  className="w-10 h-10 bg-pink-50 hover:bg-pink-100 text-[#d81b60] rounded-full flex items-center justify-center shadow-sm shrink-0 cursor-pointer transition-all active:scale-95"
                  title="Record Voice Note"
                >
                  <Mic size={15} />
                </button>

                <input
                  type="text"
                  placeholder="Write love message..."
                  value={chatMessageInput}
                  onChange={(e) => setChatMessageInput(e.target.value)}
                  className="flex-1 bg-stone-50 border border-stone-200 px-4 py-3 rounded-full text-xs text-stone-800 focus:outline-none focus:ring-1 focus:ring-pink-300"
                />

                <button
                  type="submit"
                  disabled={!chatMessageInput.trim()}
                  className={`w-10 h-10 rounded-full flex items-center justify-center shadow-md shrink-0 cursor-pointer transition-all active:scale-95 ${
                    chatMessageInput.trim() 
                      ? "bg-[#d81b60] hover:bg-pink-600 text-white" 
                      : "bg-stone-50 text-stone-305"
                  }`}
                >
                  <Send size={14} fill="currentColor" />
                </button>
              </form>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Floating Navigation Dock */}
      <nav className="fixed bottom-0 left-0 right-0 z-100 bg-white/95 backdrop-blur-xl border-t border-pink-100 px-4 py-3 pb-8 flex items-center justify-around shadow-[0_-10px_25px_rgba(244,143,177,0.08)]">
        
        <button
          onClick={() => setActiveTab("signals")}
          className={`flex flex-col items-center gap-1 group relative cursor-pointer ${activeTab === "signals" ? "text-pink-650" : "text-gray-400"}`}
          id="nav-tab-signals"
        >
          <div className={`p-2 rounded-2xl transition-all duration-300 speed-200 ${activeTab === "signals" ? "bg-rose-100 text-[#d81b60] scale-105" : "text-gray-400 group-hover:scale-105"}`}>
            <Heart size={20} fill={activeTab === "signals" ? "currentColor" : "none"} />
          </div>
          <span className="text-[9px] font-bold uppercase tracking-tighter">Signals</span>
        </button>

        <button
          onClick={() => setActiveTab("timeline")}
          className={`flex flex-col items-center gap-1 group relative cursor-pointer ${activeTab === "timeline" ? "text-pink-650" : "text-gray-400"}`}
          id="nav-tab-timeline"
        >
          <div className={`p-2 rounded-2xl transition-all duration-300 speed-200 ${activeTab === "timeline" ? "bg-rose-100 text-[#d81b60] scale-105" : "text-gray-400 group-hover:scale-105"}`}>
            <CalendarIcon size={20} />
          </div>
          <span className="text-[9px] font-bold uppercase tracking-tighter">Timeline</span>
        </button>

        <button
          onClick={() => setActiveTab("gallery")}
          className={`flex flex-col items-center gap-1 group relative cursor-pointer ${activeTab === "gallery" ? "text-pink-650" : "text-gray-400"}`}
          id="nav-tab-gallery"
        >
          <div className={`p-2 rounded-2xl transition-all duration-300 speed-200 ${activeTab === "gallery" ? "bg-rose-100 text-[#d81b60] scale-105" : "text-gray-400 group-hover:scale-105"}`}>
            <div className="relative">
              <ImageIcon size={20} />
              {state.gallery.length > 0 && <span className="absolute top-0 right-0 w-1.5 h-1.5 bg-rose-500 rounded-full" />}
            </div>
          </div>
          <span className="text-[9px] font-bold uppercase tracking-tighter">Gallery</span>
        </button>

        <button
          onClick={() => setActiveTab("games")}
          className={`flex flex-col items-center gap-1 group relative cursor-pointer ${activeTab === "games" ? "text-pink-650" : "text-gray-400"}`}
          id="nav-tab-games"
        >
          <div className={`p-2 rounded-2xl transition-all duration-300 speed-200 ${activeTab === "games" ? "bg-rose-100 text-[#d81b60] scale-105" : "text-gray-400 group-hover:scale-105"}`}>
            <Gamepad2 size={20} fill={activeTab === "games" ? "currentColor" : "none"} />
          </div>
          <span className="text-[9px] font-bold uppercase tracking-tighter">Games</span>
        </button>

        <button
          onClick={() => setActiveTab("profile")}
          className={`flex flex-col items-center gap-1 group relative cursor-pointer ${activeTab === "profile" ? "text-pink-650" : "text-gray-400"}`}
          id="nav-tab-profile"
        >
          <div className={`p-2 rounded-2xl transition-all duration-300 speed-200 ${activeTab === "profile" ? "bg-rose-100 text-[#d81b60] scale-105" : "text-gray-400 group-hover:scale-105"}`}>
            <UserIcon size={20} />
          </div>
          <span className="text-[9px] font-bold uppercase tracking-tighter">Profile</span>
        </button>

      </nav>
    </div>
  );
}
