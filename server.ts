import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

const PORT = 3000;
const DB_FILE = path.join(process.cwd(), "private_database.json");

// Ensure database file exists
function initDatabase() {
  if (!fs.existsSync(DB_FILE)) {
    const initialData = {
      signals: [
        { id: "1", sender: "Ibtihaj", text: "Good morning", timestamp: new Date(Date.now() - 3600000 * 2).toISOString() },
        { id: "2", sender: "Aayat", text: "❤️ I miss you", timestamp: new Date(Date.now() - 3600000).toISOString() }
      ],
      messages: [
        { id: "1", sender: "Ibtihaj", text: "Hey baby! Did you see my signal? ❤️", timestamp: new Date(Date.now() - 3600000 * 2).toISOString() },
        { id: "2", sender: "Aayat", text: "Yes my love! It made my heart flutter 🥰", timestamp: new Date(Date.now() - 3600000).toISOString() }
      ],
      gallery: [
        {
          id: "g1",
          url: "https://images.unsplash.com/photo-1518199266791-5375a83190b7?auto=format&fit=crop&q=80&w=600",
          caption: "Our favorite place 🌅",
          uploader: "Ibtihaj",
          timestamp: new Date(Date.now() - 86400000 * 5).toISOString()
        },
        {
          id: "g2",
          url: "https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?auto=format&fit=crop&q=80&w=600",
          caption: "Holding hands forever 💖",
          uploader: "Aayat",
          timestamp: new Date(Date.now() - 86400000 * 2).toISOString()
        }
      ],
      events: [
        {
          id: "e1",
          title: "Our First Date 🍿",
          date: "2026-05-14",
          description: "We watched a movie and walked under the rain.",
          category: "date",
          createdBy: "Aayat"
        },
        {
          id: "e2",
          title: "Anniversary 💍",
          date: "2026-06-14",
          description: "Celebrating our deep connection!",
          category: "milestone",
          createdBy: "Ibtihaj"
        }
      ],
      profiles: {
        Aayat: {
          avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=200&h=200",
          status: "Miss you baby... 💕",
          lastActive: new Date().toISOString()
        },
        Ibtihaj: {
          avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200&h=200",
          status: "Dreaming of Aayat ✨",
          lastActive: new Date().toISOString()
        }
      }
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), "utf8");
  }
}

initDatabase();

function readDB() {
  try {
    const data = fs.readFileSync(DB_FILE, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Error reading database:", error);
    return {};
  }
}

function writeDB(data: any) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.error("Error writing database:", error);
  }
}

async function startServer() {
  const app = express();

  // Middleware for large text payloads (compressed Base64 photos)
  app.use(express.json({ limit: "25mb" }));
  app.use(express.urlencoded({ limit: "25mb", extended: true }));

  // --- API ROUTES ---

  // 1. Fetch entire synced state
  app.get("/api/state", (req, res) => {
    const db = readDB();
    res.json(db);
  });

  // 2. Auth Login (Custom local check)
  app.post("/api/auth/login", (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Missing identity or key" });
    }

    const lowerUser = username.toLowerCase();
    if (lowerUser === "aayat" && password === "IlovemybabyIbtihaj") {
      return res.json({ success: true, username: "Aayat" });
    } else if (lowerUser === "ibtihaj" && password === "IlovemybabyAayat") {
      return res.json({ success: true, username: "Ibtihaj" });
    }

    return res.status(401).json({ error: "Incorrect private password" });
  });

  // 3. Post Signal
  app.post("/api/signals", (req, res) => {
    const { sender, text } = req.body;
    if (!sender || !text) {
      return res.status(400).json({ error: "Invalid payload input" });
    }

    const db = readDB();
    const newSignal = {
      id: Math.random().toString(36).substr(2, 9),
      sender,
      text,
      timestamp: new Date().toISOString(),
    };

    db.signals.unshift(newSignal);
    
    // Limit signals history to last 50 entries
    if (db.signals.length > 50) {
      db.signals = db.signals.slice(0, 50);
    }

    writeDB(db);

    // Try a webhook trigger safely as requested in user specification
    fetch("https://example.com/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user: sender,
        action: text,
        timestamp: newSignal.timestamp
      })
    }).catch(() => {
      // Mocking webhook fail logs silently (example.com won't accept local requests typically)
    });

    res.json({ success: true, signal: newSignal });
  });

  // 4. Send Chat Message
  app.post("/api/messages", (req, res) => {
    const { sender, text } = req.body;
    if (!sender || !text) {
      return res.status(400).json({ error: "Missing attributes" });
    }

    const db = readDB();
    const newMessage = {
      id: Math.random().toString(36).substr(2, 9),
      sender,
      text,
      timestamp: new Date().toISOString()
    };

    db.messages.push(newMessage);
    
    // Limit chat messages to last 200 to save space
    if (db.messages.length > 200) {
      db.messages = db.messages.slice(-200);
    }

    writeDB(db);
    res.json({ success: true, message: newMessage });
  });

  // 5. Add Event to Calendar/Timeline
  app.post("/api/events", (req, res) => {
    const { title, date, description, category, createdBy } = req.body;
    if (!title || !date || !createdBy) {
      return res.status(400).json({ error: "Missing event parameters" });
    }

    const db = readDB();
    const newEvent = {
      id: Math.random().toString(36).substr(2, 9),
      title,
      date,
      description: description || "",
      category: category || "date",
      createdBy,
      timestamp: new Date().toISOString()
    };

    db.events.push(newEvent);
    // Sort events by date ascending
    db.events.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

    writeDB(db);
    res.json({ success: true, event: newEvent });
  });

  // 6. Delete Event from Calendar/Timeline
  app.delete("/api/events/:id", (req, res) => {
    const { id } = req.params;
    const db = readDB();
    db.events = db.events.filter((e: any) => e.id !== id);
    writeDB(db);
    res.json({ success: true });
  });

  // 7. Upload Photo to Gallery
  app.post("/api/gallery", (req, res) => {
    const { imageBase64, caption, uploader } = req.body;
    if (!imageBase64 || !uploader) {
      return res.status(400).json({ error: "No image payload found" });
    }

    const db = readDB();
    const newGalleryItem = {
      id: "u_" + Math.random().toString(36).substr(2, 9),
      url: imageBase64, // Storing optimized Base64 in our private JSON file
      caption: caption || "Captured moment 💖",
      uploader,
      timestamp: new Date().toISOString()
    };

    db.gallery.unshift(newGalleryItem);
    writeDB(db);
    res.json({ success: true, item: newGalleryItem });
  });

  // 8. Update Profile Details & Status
  app.post("/api/profile", (req, res) => {
    const { username, avatarBase64, status } = req.body;
    if (!username) {
      return res.status(400).json({ error: "Missing username details" });
    }

    const db = readDB();
    if (db.profiles[username]) {
      if (avatarBase64) {
        db.profiles[username].avatar = avatarBase64;
      }
      if (status !== undefined) {
        db.profiles[username].status = status;
      }
      db.profiles[username].lastActive = new Date().toISOString();
      writeDB(db);
      return res.json({ success: true, profile: db.profiles[username] });
    }

    res.status(404).json({ error: "User profile not found" });
  });

  // Vite Integration for Hot Middleware loading & production serves
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Aayat Signal Server] running live on port http://0.0.0.0:${PORT}`);
  });
}

startServer();
