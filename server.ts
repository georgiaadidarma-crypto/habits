import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "20mb" }));

  // Shared server-side Gemini client utility
  const apiKey = process.env.GEMINI_API_KEY;
  const ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  // API router endpoint
  app.post("/api/analyze-document", async (req, res) => {
    try {
      const { image } = req.body;
      if (!image) {
        return res.status(400).json({ error: "Missing image data in body" });
      }

      // Check if API key is missing
      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ 
          error: "GEMINI_API_KEY is not configured. Please add it to your secrets." 
        });
      }

      // Extract details from base64
      const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) {
        return res.status(400).json({ error: "Invalid base64 image encoding" });
      }

      const mimeType = matches[1];
      const base64Data = matches[2];

      const imagePart = {
        inlineData: {
          mimeType: mimeType,
          data: base64Data,
        },
      };

      const promptPart = {
        text: "You are an expert academic tutor and visual AI systems analyst. Check if the scanned image shows an actual piece of student homework, a scanned study sheet, a completed worksheet, writing inside a notebook, a printed textbook page, or other academic study material. If yes, mark documentScanned: true and set documentType to 'homework'. Respond with a precision rating and visual detail description.",
      };

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: { parts: [imagePart, promptPart] },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              documentScanned: {
                type: Type.BOOLEAN,
                description: "Whether a valid study sheet, document, homework, or textbook is scanned."
              },
              confidence: {
                type: Type.NUMBER,
                description: "Confidence grade score between 0.0 and 1.0."
              },
              documentType: {
                type: Type.STRING,
                description: "Identified category, e.g., homework, worksheet, book page, or none."
              },
              notes: {
                type: Type.STRING,
                description: "Short, clean explanation of detected documents and handwriting/content features."
              }
            },
            required: ["documentScanned", "confidence", "documentType", "notes"]
          }
        }
      });

      const resultText = response.text;
      if (!resultText) {
        throw new Error("Empty response from GenAI client");
      }

      const parsed = JSON.parse(resultText.trim());
      res.json(parsed);
    } catch (err: any) {
      console.error("API error during GenAI scan:", err);
      res.status(500).json({ error: err.message || "Unknown analysis error" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
