const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

// =============================================
//  GROQ API ANAHTARINI BURAYA YAPISTIR
//  https://console.groq.com/keys
// =============================================
const GROQ_API_KEY = process.env.GROQ_API_KEY || "gsk_BURAYA_YAPISTIR";

const PORT = process.env.PORT || 3000;

function groqRequest(payload, callback) {
  const body = Buffer.from(JSON.stringify(payload));
  const options = {
    hostname: "api.groq.com",
    path: "/openai/v1/chat/completions",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": body.length,
      "Authorization": `Bearer ${GROQ_API_KEY}`,
    },
  };

  const req = https.request(options, (res) => {
    let data = "";
    res.on("data", (chunk) => (data += chunk));
    res.on("end", () => {
      try { callback(null, JSON.parse(data)); }
      catch (e) { callback(e); }
    });
  });

  req.on("error", callback);
  req.write(body);
  req.end();
}

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  // ── Ana sayfa ──
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    const htmlPath = path.join(__dirname, "kumpir.html");
    if (fs.existsSync(htmlPath)) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(fs.readFileSync(htmlPath));
    } else {
      res.writeHead(404);
      res.end("kumpir.html bulunamadi.");
    }
    return;
  }

  // ── Chat ──
  if (req.method === "POST" && req.url === "/api/chat") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body);
        const payload = {
          model: "llama-3.3-70b-versatile",
          max_tokens: parsed.max_tokens || 600,
          messages: [
            { role: "system", content: parsed.system || "Sen Kumpir adında yardımcı bir asistansın. MUTLAKA Türkçe konuş." },
            ...parsed.messages
          ]
        };

        groqRequest(payload, (err, data) => {
          if (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ content: [{ type: "text", text: "Bağlantı hatası: " + err.message }] }));
            return;
          }
          const text = data.choices?.[0]?.message?.content || "Bir hata oluştu.";
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ content: [{ type: "text", text }] }));
        });
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ content: [{ type: "text", text: "İstek hatası: " + e.message }] }));
      }
    });
    return;
  }

  // ── Image Generation (Pollinations AI - ücretsiz) ──
  if (req.method === "POST" && req.url === "/api/image") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { prompt } = JSON.parse(body);

        // Türkçe prompt'u İngilizceye çevir
        const translatePayload = {
          model: "llama-3.3-70b-versatile",
          max_tokens: 120,
          messages: [
            { role: "system", content: "Translate the following image description to English. Return ONLY the English translation, nothing else, no explanation." },
            { role: "user", content: prompt }
          ]
        };

        groqRequest(translatePayload, (err, data) => {
          const englishPrompt = (data?.choices?.[0]?.message?.content?.trim() || prompt)
            .replace(/['"]/g, '');
          const encoded = encodeURIComponent(englishPrompt + ", digital art, high quality, detailed, vibrant colors");
          const imageUrl = `https://image.pollinations.ai/prompt/${encoded}?width=512&height=512&nologo=true&seed=${Date.now()}`;

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ imageUrl, prompt: englishPrompt }));
        });
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // ── Vision (Görsel yorumlama) ──
  if (req.method === "POST" && req.url === "/api/vision") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { imageBase64, mimeType, question, system } = JSON.parse(body);
        const payload = {
          model: "llama-3.2-11b-vision-preview",
          max_tokens: 600,
          messages: [
            {
              role: "system",
              content: system || "Sen Kumpir adında bir yapay zeka asistanısın. MUTLAKA Türkçe konuş. Görseli analiz et ve Türkçe açıkla."
            },
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: { url: `data:${mimeType};base64,${imageBase64}` }
                },
                {
                  type: "text",
                  text: question || "Bu görseli Türkçe olarak detaylıca açıkla."
                }
              ]
            }
          ]
        };

        groqRequest(payload, (err, data) => {
          if (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ content: [{ type: "text", text: "Görsel analiz hatası: " + err.message }] }));
            return;
          }
          const text = data.choices?.[0]?.message?.content || "Görseli analiz edemedim.";
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ content: [{ type: "text", text }] }));
        });
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ content: [{ type: "text", text: "Hata: " + e.message }] }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log("╔════════════════════════════════════════╗");
  console.log("║     🥔  Kumpir AI - Sunucu            ║");
  console.log("╠════════════════════════════════════════╣");
  console.log(`║  http://localhost:${PORT}  adresini ac    ║`);
  console.log("╚════════════════════════════════════════╝");
});
