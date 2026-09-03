const fs = require('fs');
const path = require('path');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error("CRITICAL ERROR: GEMINI_API_KEY environment variable is missing or empty.");
  console.error("Please verify that you added GEMINI_API_KEY in Repository Settings > Secrets and variables > Actions.");
  process.exit(1);
}

// Standard v1beta Flash endpoint with Google Search grounding
const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

async function fetchDailyNews() {
  console.log("Starting daily California legal & safety update sweep...");

  const prompt = `
You are an authoritative legal research editor for the Sikh Rifle and Pistol Association (SikhRPA), a California 501(c)(3) nonprofit public charity.

Task:
Perform a targeted search for verified California firearm legislation, California Department of Justice (CA DOJ) Bureau of Firearms regulatory bulletins, and federal 9th Circuit or district court rulings affecting California firearm owners (e.g., safe storage mandates under PC § 25100, vehicle transport laws under PC § 25610, DROS waiting periods, sensitive locations, handgun roster, or ammunition excise taxes).

Identify 3 distinct, verified public legal updates.

Requirements:
- Return ONLY a valid JSON array of objects. Do not include markdown code fences or conversational text.
- Follow this JSON schema:
[
  {
    "id": "slug-id",
    "date": "YYYY-MM-DD",
    "category": "Legislation",
    "badge_status": "In Effect",
    "badge_color": "emerald",
    "headline": "Short title",
    "statute_or_case": "Statute or court case reference",
    "summary": "2-3 sentences in plain English explaining the legal status or requirement.",
    "community_takeaway": "Actionable advice for first-time owners and families (what to do or verify).",
    "source_name": "Official entity (e.g., CA DOJ Bureau of Firearms, 9th Circuit)",
    "source_url": "Direct URL to official court docket, CA legislature site, or DOJ bulletin"
  }
]
`;

  const payload = {
    contents: [{
      parts: [{ text: prompt }]
    }],
    tools: [{
      googleSearch: {}
    }],
    generationConfig: {
      temperature: 0.2
    }
  };

  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Google API returned HTTP ${response.status}: ${errText}`);
    }

    const result = await response.json();
    const rawContent = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawContent) {
      console.error("Raw API result structure:", JSON.stringify(result, null, 2));
      throw new Error("Empty text response received from Gemini.");
    }

    // Robust JSON extraction without fragile backtick regex
    let cleanJson = rawContent.trim();
    const firstBracket = cleanJson.indexOf('[');
    const lastBracket = cleanJson.lastIndexOf(']');

    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      cleanJson = cleanJson.substring(firstBracket, lastBracket + 1);
    }

    const newsItems = JSON.parse(cleanJson);

    if (!Array.isArray(newsItems) || newsItems.length === 0) {
      throw new Error("Parsed response was not a non-empty array of items.");
    }

    const now = new Date();
    const formattedDate = now.toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric', 
      year: 'numeric',
      timeZone: 'America/Los_Angeles'
    });
    const formattedTime = now.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit', 
      timeZoneName: 'short',
      timeZone: 'America/Los_Angeles'
    });

    const outputData = {
      last_updated: now.toISOString(),
      updated_formatted: `${formattedDate} • ${formattedTime}`,
      items: newsItems
    };

    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const outputPath = path.join(dataDir, 'news.json');
    fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2), 'utf-8');
    console.log(`✓ Success: Wrote ${newsItems.length} verified news items to ${outputPath}`);

  } catch (error) {
    console.error("Execution failed:", error.message);
    process.exit(1);
  }
}

fetchDailyNews();
