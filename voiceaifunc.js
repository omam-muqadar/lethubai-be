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

// WebRTC Function Execution Endpoint
app.post("/execute-function", async (req, res) => {
  try {
    const { name, parameters } = req.body;
    console.log(`Executing function: ${name}`, parameters);

    let result;
    if (name === "get_weather") {
      const weatherApiKey = process.env.WEATHER_API_KEY;
      const location = parameters.location || "New York";
      const weatherResponse = await axios.get(
        `https://api.weatherapi.com/v1/current.json?key=${weatherApiKey}&q=${location}`
      );
      result = {
        location: weatherResponse.data.location.name,
        temperature: weatherResponse.data.current.temp_c,
        condition: weatherResponse.data.current.condition.text,
      };
    } else if (name === "update_crm") {
      // Example: Simulated CRM update
      result = { success: true, message: "CRM updated successfully" };
    } else {
      result = { error: "Unknown function" };
    }

    res.json({ result });
  } catch (error) {
    console.error("Function execution error:", error);
    res.status(500).json({ error: "Function execution failed" });
  }
});

// Handle voice input via WebRTC
app.post("/voice-ai", upload.single("audio"), async (req, res) => {
  try {
    const audioFilePath = req.file.path;

    // Step 1: Convert Speech to Text (STT)
    const transcription = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file: fs.createReadStream(audioFilePath),
    });

    const userText = transcription.text.toLowerCase();
    console.log("User said:", userText);

    // Step 2: Check if function call is needed
    let functionCall = null;
    if (userText.includes("weather")) {
      functionCall = {
        name: "get_weather",
        parameters: { location: "New York" },
      };
    } else if (userText.includes("update CRM")) {
      functionCall = { name: "update_crm", parameters: { lead_id: "1234" } };
    }

    let aiResponseText;
    if (functionCall) {
      aiResponseText = `Let me check that for you...`;
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

    const outputPath = "output.mp3";
    const buffer = Buffer.from(await ttsResponse.arrayBuffer());
    fs.writeFileSync(outputPath, buffer);

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
      voice: "verse",
    }),
  });
  const data = await r.json();

  // Send back the JSON we received from the OpenAI REST API
  res.send(data);
});

const PORT = process.env.PORT || 8080; // Use Azure's port
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
