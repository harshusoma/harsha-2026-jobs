import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import nodemailer from "nodemailer";

// Path to the file we want to monitor
const NEW_GRAD_PATH = path.resolve(__dirname, "../../../NEW_GRAD_USA.md");

// Directory to store previously seen job IDs
const STATE_DIR = path.resolve(__dirname, "../state");
const STATE_FILE = path.join(STATE_DIR, "seen-newgrad-usa.json");

// Create a unique ID based on each job row
function computeJobId(line: string): string {
  return crypto.createHash("sha256").update(line).digest("hex").slice(0, 16);
}

async function ensureStateDir() {
  await fs.mkdir(STATE_DIR, { recursive: true });
}

async function loadSeenIds(): Promise<Set<string>> {
  try {
    const raw = await fs.readFile(STATE_FILE, "utf8");
    const arr: string[] = JSON.parse(raw);
    return new Set(arr);
  } catch {
    return new Set();
  }
}

async function saveSeenIds(ids: Set<string>) {
  const arr = Array.from(ids);
  await fs.writeFile(STATE_FILE, JSON.stringify(arr, null, 2), "utf8");
}

// Extract all job rows from NEW_GRAD_USA.md tables
function extractJobLines(markdown: string): string[] {
  const lines = markdown.split(/\r?\n/);
  const jobs: string[] = [];

  let inTable = false;

  for (const line of lines) {
    if (
      line.includes("<!-- TABLE_FAANG_START -->") ||
      line.includes("<!-- TABLE_QUANT_START -->") ||
      line.trim() === "<!-- TABLE_START -->"
    ) {
      inTable = true;
      continue;
    }

    if (
      line.includes("<!-- TABLE_FAANG_END -->") ||
      line.includes("<!-- TABLE_QUANT_END -->") ||
      line.trim() === "<!-- TABLE_END -->"
    ) {
      inTable = false;
      continue;
    }

    if (!inTable) continue;

    const trimmed = line.trim();
    if (trimmed.startsWith("|") && trimmed.includes("<a href=")) {
      jobs.push(trimmed);
    }
  }

  return jobs;
}

type JobRow = {
  id: string;
  line: string;
};

function parseJobs(markdown: string): JobRow[] {
  const lines = extractJobLines(markdown);
  return lines.map((line) => ({
    id: computeJobId(line),
    line,
  }));
}

// SEND EMAIL WHEN NEW JOBS APPEAR
async function sendEmail(newJobs: JobRow[]) {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  const to = process.env.EMAIL_TO || user;

  if (!user || !pass || !to) {
    console.log("Missing EMAIL_USER / EMAIL_PASS / EMAIL_TO. Cannot send email.");
    return;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user,
      pass,
    },
  });

  const subject = `[New Grad USA] ${newJobs.length} new job${newJobs.length > 1 ? "s" : ""} found`;
  const textBody = newJobs.map((j) => `• ${j.line}`).join("\n");

  await transporter.sendMail({
    from: user,
    to,
    subject,
    text: textBody,
  });

  console.log(`Email sent to ${to} for ${newJobs.length} jobs.`);
}

// MAIN FUNCTION
async function main() {
  await ensureStateDir();

  const markdown = await fs.readFile(NEW_GRAD_PATH, "utf8");
  const jobs = parseJobs(markdown);

  const seen = await loadSeenIds();
  const newJobs = jobs.filter((j) => !seen.has(j.id));

  if (newJobs.length === 0) {
    console.log("No new jobs found.");
    return;
  }

  console.log(`Found ${newJobs.length} new job(s).`);

  // Save new jobs
  newJobs.forEach((j) => seen.add(j.id));
  await saveSeenIds(seen);

  // Send email
  await sendEmail(newJobs);
}

main().catch((err) => {
  console.error("Error in watcher:", err);
  process.exit(1);
});
