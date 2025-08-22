/**
 * Expense Final - JSON storage + Excel export + optional Google Drive upload
 * - Place service account JSON at `credentials/drive-sa.json`
 * - Put target Google Drive folder ID in .env as DRIVE_FOLDER_ID
 * - If credentials exist, exported reports will be uploaded automatically.
 */
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const {google} = require("googleapis");
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const DATA = path.join(__dirname, "data.json");
const CRED_PATH = path.join(__dirname, "credentials", "drive-sa.json");
const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID || ""; // set in .env if you want auto-upload

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function ensure() {
  if (!fs.existsSync(DATA)) fs.writeFileSync(DATA, JSON.stringify({ months: {} }, null, 2));
}
function load() {
  ensure();
  try { return JSON.parse(fs.readFileSync(DATA, "utf8")); }
  catch { return { months: {} }; }
}
function save(d) {
  fs.writeFileSync(DATA, JSON.stringify(d, null, 2));
}
function sum(arr, fn) { return arr.reduce((s,x)=> s + (fn ? fn(x) : x), 0); }
function uid() { return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }

let driveClient = null;
async function initDriveClient() {
  if (!fs.existsSync(CRED_PATH)) return null;
  try {
    const auth = new google.auth.GoogleAuth({
      keyFilename: CRED_PATH,
      scopes: ['https://www.googleapis.com/auth/drive.file','https://www.googleapis.com/auth/drive']
    });
    const client = await auth.getClient();
    return google.drive({version: 'v3', auth: client});
  } catch (e) {
    console.error("Failed to init Drive client:", e.message);
    return null;
  }
}

// APIs
app.post("/api/capital", (req, res) => {
  const { month, amount } = req.body;
  if (!month || amount == null) return res.status(400).json({ error: "month and amount required" });
  const d = load();
  if (!d.months[month]) d.months[month] = { capital: 0, expenses: [] };
  d.months[month].capital = Number(amount) || 0;
  save(d);
  res.json({ ok:true, capital: d.months[month].capital });
});

app.post("/api/expenses", (req, res) => {
  const { month, date, category, amount, note } = req.body;
  if (!month || !date || !category || amount == null) {
    return res.status(400).json({ error: "month, date, category, amount required" });
  }
  const d = load();
  if (!d.months[month]) d.months[month] = { capital: 0, expenses: [] };
  const exp = { id: uid(), date, category, amount: Number(amount), note: note || "" };
  d.months[month].expenses.push(exp);
  save(d);
  res.status(201).json(exp);
});

app.get("/api/expenses/:month", (req, res) => {
  const { month } = req.params;
  const d = load();
  const m = d.months[month] || { capital: 0, expenses: [] };
  res.json(m.expenses.sort((a,b)=> new Date(b.date) - new Date(a.date)));
});

app.delete("/api/expenses/:id", (req, res) => {
  const { id } = req.params;
  const { month } = req.query;
  if (!month) return res.status(400).json({ error: "month query is required" });
  const d = load();
  const m = d.months[month];
  if (!m) return res.json({ ok:true, removed:0 });
  const before = m.expenses.length;
  m.expenses = m.expenses.filter(e => e.id !== id);
  save(d);
  res.json({ ok:true, removed: before - m.expenses.length });
});

app.get("/api/summary/:month", (req, res) => {
  const { month } = req.params;
  const d = load();
  const m = d.months[month] || { capital: 0, expenses: [] };
  const totalSpent = sum(m.expenses, e => e.amount);
  const remaining = Math.max(0, (Number(m.capital)||0) - totalSpent);
  const byDate = {};
  const byCategory = {};
  for (const e of m.expenses) {
    byDate[e.date] = (byDate[e.date] || 0) + Number(e.amount);
    byCategory[e.category] = (byCategory[e.category] || 0) + Number(e.amount);
  }
  res.json({ month, capital: Number(m.capital)||0, totalSpent, remaining, byDate, byCategory, count: m.expenses.length });
});

app.get("/api/export/:month", async (req, res) => {
  const { month } = req.params;
  const d = load();
  const m = d.months[month] || { capital: 0, expenses: [] };
  const wb = new ExcelJS.Workbook();
  const headerFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2FF" } };
  const currencyFmt = "#,##0.00";
  const border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
  const ws1 = wb.addWorksheet("Overview");
  ws1.getCell("A1").value = `Monthly Report: ${month}`;
  ws1.getCell("A1").font = { size: 16, bold: true };
  ws1.addRow([]);
  ws1.addRow(["Capital", Number(m.capital)||0]).font = { bold:true };
  const totalSpent = sum(m.expenses, e => e.amount);
  ws1.addRow(["Total Spent", totalSpent]).font = { bold:true };
  ws1.addRow(["Remaining", Math.max(0, (Number(m.capital)||0) - totalSpent)]).font = { bold:true };
  ws1.getColumn(2).numFmt = currencyFmt;
  ws1.addRow([]);
  ws1.addRow(["Category", "Total"]).font = { bold:true };
  const catTotals = {};
  for (const e of m.expenses) catTotals[e.category] = (catTotals[e.category]||0) + Number(e.amount);
  for (const [cat, val] of Object.entries(catTotals)) ws1.addRow([cat, val]);
  ws1.getColumn(2).numFmt = currencyFmt;
  const ws2 = wb.addWorksheet("Details");
  ws2.addRow(["Date", "Category", "Amount", "Note"]).font = { bold:true };
  ws2.getRow(1).eachCell(c => c.fill = headerFill);
  m.expenses.sort((a,b)=> new Date(a.date)-new Date(b.date)).forEach(e => ws2.addRow([e.date, e.category, e.amount, e.note || ""]));
  const last = ws2.rowCount + 1;
  ws2.addRow([]);
  ws2.addRow(["Total", { formula: `SUM(C2:C${last-2})` }]);
  ws2.getColumn(3).numFmt = currencyFmt;
  for (const ws of [ws1, ws2]) {
    ws.columns.forEach(col => {
      let max = 10;
      col.eachCell({ includeEmpty:true }, cell => {
        const v = cell.value ? cell.value.toString() : "";
        if (v.length > max) max = v.length;
      });
      col.width = max + 2;
      ws.eachRow(r => r.eachCell(c => c.border = border));
    });
  }
  const filename = `report-${month}.xlsx`;
  const outPath = path.join(__dirname, filename);
  await wb.xlsx.writeFile(outPath);
  let uploadedFile = null;
  if (fs.existsSync(CRED_PATH) && DRIVE_FOLDER_ID) {
    try {
      if (!driveClient) driveClient = await initDriveClient();
      if (driveClient) {
        const fileMetadata = { name: filename, parents: [DRIVE_FOLDER_ID] };
        const media = { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', body: fs.createReadStream(outPath) };
        const resp = await driveClient.files.create({ resource: fileMetadata, media, fields: 'id,webViewLink' });
        uploadedFile = resp.data;
      }
    } catch (e) { console.error("Drive upload failed:", e.message); }
  }
  res.download(outPath, filename, err => {
    if (!err) setTimeout(() => { try { fs.unlinkSync(outPath); } catch {} }, 8000);
  });
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, async () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  driveClient = await initDriveClient();
  if (driveClient) console.log("✅ Google Drive client initialized (will upload reports if DRIVE_FOLDER_ID set).");
});