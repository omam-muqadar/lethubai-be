const express = require("express");
const multer = require("multer");
const cors = require("cors");
const { OpenAI } = require("openai");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");
const { default: axios } = require("axios");

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

app.get("/hello", (req, res) => {
  console.log("Hello, world!");
  res.send("Hello, world!");
});

// Speech-to-Text (STT)
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

// Text-to-Speech (TTS)
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

// Handle voice input and return AI-generated voice response
app.post("/voice-ai", upload.single("audio"), async (req, res) => {
  try {
    const audioFilePath = req.file.path;

    // Step 1: Convert Speech to Text (STT)
    const transcription = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file: fs.createReadStream(audioFilePath),
    });

    const userText = transcription.text;
    console.log("User said:", userText);

    // Step 2: Get AI Response (LLM)
    const gptResponse = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [{ role: "user", content: userText }],
    });

    const aiResponseText = gptResponse.choices[0].message.content;
    console.log("AI Response:", aiResponseText);

    // Step 3: Convert AI Response to Speech (TTS)
    const ttsResponse = await openai.audio.speech.create({
      model: "tts-1",
      voice: "alloy", // Other voices: "echo", "fable", "onyx", "nova", "shimmer"
      input: aiResponseText,
    });

    // Save the AI-generated voice response
    const outputPath = "output.mp3";
    const buffer = Buffer.from(await ttsResponse.arrayBuffer());
    fs.writeFileSync(outputPath, buffer);

    // Send response
    res.sendFile(outputPath, { root: __dirname }, () => {
      // Clean up files after sending response
      fs.unlinkSync(audioFilePath);
      fs.unlinkSync(outputPath);
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.post("/voice-ai-weather", upload.single("audio"), async (req, res) => {
  try {
    const audioFilePath = req.file.path;

    // Step 1: Convert Speech to Text (STT)
    const transcription = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file: fs.createReadStream(audioFilePath),
    });

    const userText = transcription.text.toLowerCase();
    console.log("User said:", userText);

    let aiResponseText;

    if (userText.includes("weather") || userText.includes("temperature")) {
      // Extract location (For simplicity, assuming user mentions a city in the request)
      const location = userText.split("in ")[1] || "New York"; // Default to New York if no location found

      // Step 2: Fetch Weather Data
      const weatherApiKey = process.env.WEATHER_API_KEY;
      const weatherResponse = await axios.get(
        `https://api.weatherapi.com/v1/current.json?key=${weatherApiKey}&q=${location}`
      );

      const weatherData = weatherResponse.data;
      aiResponseText = `The current temperature in ${weatherData.location.name} is ${weatherData.current.temp_c} degrees Celsius with ${weatherData.current.condition.text}.`;
    } else {
      // Step 3: Get AI Response (LLM)
      const gptResponse = await openai.chat.completions.create({
        model: "gpt-4-turbo",
        messages: [{ role: "user", content: userText }],
      });

      aiResponseText = gptResponse.choices[0].message.content;
    }

    console.log("AI Response:", aiResponseText);

    // Step 4: Convert AI Response to Speech (TTS)
    const ttsResponse = await openai.audio.speech.create({
      model: "tts-1",
      voice: "alloy",
      input: aiResponseText,
    });

    // Save the AI-generated voice response
    const outputPath = "output.mp3";
    const buffer = Buffer.from(await ttsResponse.arrayBuffer());
    fs.writeFileSync(outputPath, buffer);

    // Send response
    res.sendFile(outputPath, { root: __dirname }, () => {
      fs.unlinkSync(audioFilePath);
      fs.unlinkSync(outputPath);
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.get("/session", async (req, res) => {
  const r = await fetch("https://api.openai.com/v1/realtime/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-realtime-preview-2024-12-17",
      voice: "alloy",
    }),
  });
  const data = await r.json();

  // Send back the JSON we received from the OpenAI REST API
  res.send(data);
});

const PORT = process.env.PORT || 8080; // Use Azure's port
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
