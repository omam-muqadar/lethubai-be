const express = require("express");
const multer = require("multer");
const cors = require("cors");
const { OpenAI } = require("openai");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");

dotenv.config();
const app = express();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(cors());
app.use(express.json());

app.use(express.urlencoded({ extended: false }));
app.use(
  cors({
    origin: "*",
  })
);

app.use((req, res, next) => {
  console.log("Incoming request:", req.method, req.url);
  next();
});

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + Date.now() + ext); // Preserve extension
  },
});

const upload = multer({ storage });

// Speech-to-Text (STT) API
// app.post("/stt", upload.single("audio"), async (req, res) => {
//   try {
//     if (!req.file) {
//       return res.status(400).json({ error: "No file uploaded" });
//     }

//     console.log(`🎵 Received File: ${req.file.originalname}`);
//     console.log(`📂 Saved As: ${req.file.filename}`);
//     console.log(`📝 File Path: ${req.file.path}`);

//     // Ensure OpenAI API gets the correct format
//     const filePath = req.file.path;
//     const mimeType = req.file.mimetype;
//     console.log(`📑 MIME Type: ${mimeType}`);

//     if (
//       ![
//         "audio/flac",
//         "audio/m4a",
//         "audio/mp3",
//         "audio/mp4",
//         "audio/mpeg",
//         "audio/mpga",
//         "audio/oga",
//         "audio/ogg",
//         "audio/wav",
//         "audio/webm",
//       ].includes(mimeType)
//     ) {
//       return res.status(400).json({ error: "Invalid file format" });
//     }

//     // OpenAI API request
//     const response = await openai.audio.transcriptions.create({
//       file: fs.createReadStream(filePath),
//       model: "whisper-1",
//       language: "en",
//     });

//     console.log("✅ Transcription:", response.text);
//     fs.unlinkSync(filePath);
//     res.json({ transcription: response.text });
//   } catch (error) {
//     console.error("❌ STT Error:", error);
//     res.status(500).json({ error: error.message });
//   }
// });

// Speech-to-Text (STT)
// Fix for Speech-to-Text (STT)
app.post("/stt", upload.single("audio"), async (req, res) => {
  try {
    console.log("\n📢 Received Speech-to-Text request...");

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const filePath = req.file.path;
    console.log(`🎵 Audio File Name: ${req.file.filename}`);
    console.log(`📦 File Size: ${req.file.size} bytes`);

    // Send the file to OpenAI for transcription
    const response = await openai.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: "whisper-1",
      language: "en",
    });

    console.log("✅ Transcription:", response.text);

    // Delete the temporary file
    fs.unlinkSync(filePath);

    // Send back the transcription
    res.json({ transcription: response.text });
  } catch (error) {
    console.error("❌ STT Error:", error);
    res.status(500).json({ error: "STT processing failed" });
  }
});

// Fix for Text-to-Speech (TTS)
app.post("/tts", async (req, res) => {
  try {
    const { text } = req.body;
    console.log("\n📢 Received Text-to-Speech request...");
    console.log(`📜 Text Input: "${text}"`);

    // Request speech generation
    const response = await openai.audio.speech.create({
      model: "tts-1",
      input: text,
      voice: "alloy",
    });

    // Convert to a buffer
    const buffer = Buffer.from(await response.arrayBuffer());
    console.log(`🔊 Generated Audio Size: ${buffer.length} bytes`);

    // Send audio with correct headers
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", buffer.length);
    res.send(buffer);
  } catch (error) {
    console.error("❌ TTS Error:", error);
    res.status(500).json({ error: "TTS processing failed" });
  }
});

app.listen(3000, () => console.log("Server running on port 3000"));
