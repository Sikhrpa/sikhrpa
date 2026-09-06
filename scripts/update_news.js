const fs = require('fs');
const path = require('path');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error("Error: GEMINI_API_KEY environment variable is missing.");
  process.exit(1);
}

// Generative Language API endpoint (Gemini 3.8 Flash)
const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${GEMINI_API_KEY}`;

async function fetchDailyNews() {
  console.log("Querying Gemini with Google Search Grounding for recent California firearms legal updates...");

  const currentDateIso = new Date().toISOString().split('T')[0];

  // Prompt engineered for balanced official regulatory notices and verified media reports
  const prompt = `
You are an authoritative legal research editor for the Sikh Rifle and Pistol Association (SikhRPA), a California 501(c)(3) nonprofit public charity.

Task:
Perform a targeted search for RECENT California firearm developments and return two balanced categories of verified updates (4 to 6 items in total):

1. Official Government & Judicial Dispatches (2 to 3 items):
   - Federal court orders, 9th Circuit rulings, or District Court preliminary injunctions/stays.
   - California Department of Justice (CA DOJ) Bureau of Firearms bulletins, regulatory advisories, or information notices.
   - Official California State Legislature chaptered bill developments.
   - "source_name" must be the official government body or court docket (e.g., "U.S. Court of Appeals for the Ninth Circuit", "CA DOJ Bureau of Firearms", "California State Legislature").
   - "category" should be "Court Ruling", "CA DOJ Notice", or "Legislation".

2. Reputable News & Investigative Media Coverage (2 to 3 items):
   - In-depth news reports, investigative reporting, or local California coverage of firearm regulations, retail impacts, community safe storage initiatives, or municipal legal disputes.
   - "source_name" must be a verified news organization (e.g., "CalMatters", "Los Angeles Times", "Associated Press", "San Francisco Chronicle", "The Reload", "CBS News Bay Area / Sacramento").
   - "category" should be "State News" or "Community Safety".

CRITICAL DATE & RECENCY RULES:
- Focus on recent news and legal actions from the LAST 30 TO 60 DAYS relative to ${currentDateIso}.
- The "date" field MUST reflect the ACTUAL DATE OF PUBLICATION OR COURT FILING (format: YYYY-MM-DD).
- NEVER use a future statutory effective date (e.g., DO NOT use "January 1" or "July 1" when a law goes into effect). The date must represent when the news or decision occurred.
- DO NOT return generic annual roundups (e.g. "Laws taking effect Jan 1").
- The date MUST NOT be in the future (it cannot be later than ${currentDateIso}).

Output Format:
Return ONLY valid JSON (no markdown ticks, no surrounding codeblock markers, no conversation text).
Follow this exact schema:
[
  {
    "id": "unique-kebab-slug",
    "date": "YYYY-MM-DD",
    "category": "Legislation" | "Court Ruling" | "CA DOJ Notice" | "State News" | "Community Safety",
    "badge_status": "Active" | "Stayed / Enjoined" | "Pending Review" | "In Effect" | "Regulatory Notice",
    "badge_color": "emerald" | "amber" | "blue" | "purple",
    "headline": "Concise, factual headline describing the recent event",
    "statute_or_case": "e.g., Boland v. Bonta, SB 2, or CA Penal Code § 25100",
    "summary": "2 concise sentences explaining what happened and what the legal requirement or status is.",
    "community_takeaway": "Actionable advice for first-time owners and families (what to do or verify).",
    "source_name": "Official entity or major news outlet (e.g., 9th Circuit, CA DOJ, CalMatters)",
    "source_url": "Direct URL to official court docket, CA legislature site, or verified article"
  }
]
`;

  const payload = {
    contents: [{
      parts: [{ text: prompt }]
    }],
    tools: [{
      googleSearch: {} // Live Google Search Grounding
    }],
    generationConfig: {
      temperature: 0.1 // Low temperature for factual precision (no responseMimeType tool conflict)
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
    const candidate = result.candidates?.[0];

    if (!candidate) {
      console.error("Full Gemini API response:", JSON.stringify(result, null, 2));
      throw new Error("No candidate returned from Gemini API.");
    }

    // Concatenate all text parts (grounding sometimes spans multiple parts)
    const parts = candidate.content?.parts || [];
    const rawContent = parts.map(p => p.text || '').join('').trim();

    if (!rawContent) {
      console.error("Empty candidate received:", JSON.stringify(candidate, null, 2));
      throw new Error(`Empty response received from Gemini (finishReason: ${candidate.finishReason || 'UNKNOWN'}).`);
    }

    // Extract JSON array cleanly (handles markdown codeblocks or surrounding commentary)
    let cleanJsonText = rawContent;
    const jsonMatch = rawContent.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (jsonMatch) {
      cleanJsonText = jsonMatch[0];
    } else {
      cleanJsonText = cleanJsonText
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
    }

    const incomingItems = JSON.parse(cleanJsonText);

    if (!Array.isArray(incomingItems) || incomingItems.length === 0) {
      throw new Error("Response was not a valid non-empty array of news items.");
    }

    const dataDir = path.join(__dirname, '..', 'data');
    const newsFilePath = path.join(dataDir, 'news.json');

    let existingArchive = { items: [] };
    if (fs.existsSync(newsFilePath)) {
      try {
        existingArchive = JSON.parse(fs.readFileSync(newsFilePath, 'utf-8'));
      } catch (e) {
        console.warn("Existing news.json could not be parsed. Starting fresh.");
        existingArchive = { items: [] };
      }
    }

    const existingItems = Array.isArray(existingArchive.items) ? existingArchive.items : [];
    const nowMs = Date.now();
    const todayStr = new Date().toISOString().split('T')[0];

    // Sanitize incoming dates: reject or clamp future dates
    const sanitizedIncoming = incomingItems.map(item => {
      let itemDate = item.date || todayStr;
      const itemTime = new Date(itemDate).getTime();
      // If the model generated a future date, clamp it to today
      if (itemTime > nowMs) {
        console.warn(`Clamping future date "${itemDate}" for "${item.headline}" to today: ${todayStr}`);
        itemDate = todayStr;
      }
      return {
        ...item,
        date: itemDate
      };
    });

    // Filter out duplicates based on id or close headline match
    const novelItems = sanitizedIncoming.filter(newItem => {
      const isDuplicate = existingItems.some(oldItem => {
        if (oldItem.id && newItem.id && oldItem.id === newItem.id) return true;
        if (oldItem.headline && newItem.headline) {
          const normOld = oldItem.headline.toLowerCase().replace(/[^a-z0-9]/g, '');
          const normNew = newItem.headline.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (normOld === normNew) return true;
        }
        return false;
      });
      return !isDuplicate;
    });

    console.log(`Found ${novelItems.length} novel legal dispatches.`);

    // Merge novel items ahead of the archive
    const mergedList = [...novelItems, ...existingItems];

    // Sort descending by publication date. Clamp any older item with a future date so it can't hijack index 0.
    mergedList.sort((a, b) => {
      const timeA = Math.min(a.date ? new Date(a.date).getTime() : 0, nowMs);
      const timeB = Math.min(b.date ? new Date(b.date).getTime() : 0, nowMs);
      return timeB - timeA;
    });

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
      items: mergedList
    };

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    fs.writeFileSync(newsFilePath, JSON.stringify(outputData, null, 2), 'utf-8');
    console.log(`Successfully updated ${newsFilePath} with ${mergedList.length} total entries.`);

  } catch (error) {
    console.error("Failed to fetch or process news updates:", error);
    process.exit(1);
  }
}

fetchDailyNews();
