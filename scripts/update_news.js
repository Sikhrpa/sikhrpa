const fs = require('fs');
const path = require('path');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error("Error: GEMINI_API_KEY environment variable is missing.");
  process.exit(1);
}

// Using the fast, cost-free Flash model endpoint
const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

async function fetchDailyNews() {
  console.log("Querying Gemini with Google Search Grounding for California firearms legal updates...");

  const prompt = `
You are an authoritative legal research editor for the Sikh Rifle and Pistol Association (SikhRPA), a California 501(c)(3) nonprofit public charity.

Task:
Perform a targeted search for verified, recent California firearm legislation, California Department of Justice (CA DOJ) Bureau of Firearms regulatory bulletins, and federal 9th Circuit or district court rulings affecting California firearm owners (e.g., safe storage mandates, vehicle transport laws, DROS waiting periods, sensitive locations, handgun roster, or ammunition excise taxes).

Identify 3 distinct, verified public legal updates.

Requirements:
- Return ONLY valid JSON (no markdown formatting, no backticks, no wrapping text).
- Each update item must follow this exact JSON schema:
[
  {
    "id": "unique-slug-id",
    "date": "YYYY-MM-DD",
    "category": "Legislation" | "Court Ruling" | "CA DOJ Notice" | "Community Safety",
    "badge_status": "In Effect" | "Stayed / Enjoined" | "Pending Review" | "Regulatory Notice",
    "badge_color": "emerald" | "amber" | "blue" | "purple",
    "headline": "Clear, informative headline",
    "statute_or_case": "e.g., CA Penal Code § 25100 or Boland v. Bonta",
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
      googleSearch: {} // Enables real-time Google Search Grounding
    }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json"
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
      throw new Error(`API Error HTTP ${response.status}: ${errText}`);
    }

    const result = await response.json();
    const rawContent = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawContent) {
      throw new Error("Empty response received from Gemini.");
    }

    // Clean any accidental markdown codeblock wrappers
    const cleanJsonText = rawContent
      .replace(/^
```json\s*/i, '')
      .replace(/^
```\s*/i, '')
      .replace(/\s*
```$/, '')
      .trim();

    const newsItems = JSON.parse(cleanJsonText);

    if (!Array.isArray(newsItems) || newsItems.length === 0) {
      throw new Error("Response was not a valid array of news items.");
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
    console.log(`Successfully written ${newsItems.length} news items to ${outputPath}`);

  } catch (error) {
    console.error("Failed to fetch or process news updates:", error);
    process.exit(1);
  }
}

fetchDailyNews();
