require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error("ANTHROPIC_API_KEY belum diset. Buat file .env berdasarkan .env.example.");
  process.exit(1);
}

const SYSTEM_PROMPT = `Kamu adalah isiPR, asisten belajar untuk siswa sekolah di Indonesia.
Tugasmu: ketika siswa mengirim pertanyaan (teks dan/atau foto soal), berikan JAWABAN YANG BENAR dengan jelas.
Format jawabanmu selalu begini:
1. Mulai dengan jawaban akhir yang tegas, diawali kata "Jawaban:".
2. Lalu beri penjelasan singkat langkah-langkahnya (maks 4-6 kalimat atau poin), bahasa sederhana seperti guru les.
Gunakan Bahasa Indonesia yang ramah dan mudah dipahami siswa. Jika gambar berisi soal, baca soalnya dulu sebelum menjawab. Jika soal kurang jelas, tetap beri jawaban terbaik berdasarkan asumsi paling masuk akal, sebutkan asumsinya singkat.`;

const requestLog = new Map();
const MAX_REQUESTS_PER_MINUTE = 8;

function isRateLimited(ip) {
  const now = Date.now();
  const windowStart = now - 60_000;
  const timestamps = (requestLog.get(ip) || []).filter((t) => t > windowStart);
  timestamps.push(now);
  requestLog.set(ip, timestamps);
  return timestamps.length > MAX_REQUESTS_PER_MINUTE;
}

app.post("/api/chat", async (req, res) => {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: "Terlalu banyak permintaan, coba lagi sebentar lagi." });
  }

  const { messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "Field 'messages' wajib diisi." });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("Anthropic API error:", data);
      return res.status(response.status).json({ error: data.error?.message || "Gagal menghubungi model." });
    }

    res.json(data);
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Terjadi kesalahan di server." });
  }
});

app.get("/health", (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`isiPR backend jalan di port ${PORT}`));
