import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

interface Job {
  company: string;
  role: string;
  location: string;
  salary: string;
  apply: string;
  posted: string;
}

// Convert “18d” / “0d” / “3d” / “12h” → minutes
function postedToMinutes(value: string): number {
  value = value.trim().toLowerCase();

  if (value.endsWith("h")) {
    return parseInt(value) * 60;
  }
  if (value.endsWith("d")) {
    return parseInt(value) * 1440;
  }
  if (value.endsWith("m")) {
    return parseInt(value);
  }

  return 999999; // fallback
}

// Parse Markdown table rows
function parseJobs(md: string): Job[] {
  const lines = md.split("\n").filter(l => l.includes("|"));
  const jobs: Job[] = [];

  for (const line of lines) {
    const cells = line.split("|").map(c => c.trim());
    if (cells.length < 7) continue;

    try {
      const company = cells[1].replace(/<[^>]*>/g, "");
      const role = cells[2];
      const location = cells[3];
      const salary = cells[4];
      const applyLinkMatch = cells[5].match(/href="([^"]+)"/);
      const posted = cells[6];

      jobs.push({
        company,
        role,
        location,
        salary,
        apply: applyLinkMatch ? applyLinkMatch[1] : "",
        posted,
      });
    } catch { }
  }

  return jobs;
}

// Send email using Gmail
async function sendEmail(html: string) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER!,
      pass: process.env.EMAIL_PASS!,
    },
  });

  await transporter.sendMail({
    from: `"Job Alerts" <${process.env.EMAIL_USER}>`,
    to: process.env.EMAIL_USER,
    subject: "🔥 New AI New Grad USA Jobs (Last 1 Hour)",
    html,
  });
}

function buildTable(jobs: Job[]): string {
  let table = `
  <h2>🔥 New Jobs Posted in the Last 1 Hour</h2>
  <table border="1" cellpadding="6" style="border-collapse: collapse;">
    <tr>
      <th>Company</th>
      <th>Role</th>
      <th>Location</th>
      <th>Salary</th>
      <th>Apply</th>
      <th>Posted</th>
    </tr>
  `;

  for (const job of jobs) {
    table += `
      <tr>
        <td>${job.company}</td>
        <td>${job.role}</td>
        <td>${job.location}</td>
        <td>${job.salary}</td>
        <td><a href="${job.apply}">Apply</a></td>
        <td>${job.posted}</td>
      </tr>
    `;
  }

  table += "</table>";
  return table;
}

async function main() {
  const mdPath = path.join(process.cwd(), "../../NEW_GRAD_USA.md");
  const mdText = fs.readFileSync(mdPath, "utf-8");

  const jobs = parseJobs(mdText);

  const newJobs = jobs.filter(job => postedToMinutes(job.posted) <= 60);

  if (newJobs.length === 0) {
    console.log("No new jobs posted in the last hour.");
    return;
  }

  const html = buildTable(newJobs);
  await sendEmail(html);

  console.log(`Sent ${newJobs.length} new job alerts.`);
}

main();
