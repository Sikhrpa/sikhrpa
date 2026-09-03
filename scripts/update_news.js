const fs = require('fs');
const path = require('path');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error("CRITICAL ERROR: GEMINI_API_KEY environment variable is missing or empty.");
  process.exit(1);
}

// Flash model endpoint recommended by Google GenAI API
const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${GEMINI_API_KEY}`;

// Helper: Normalize URL to prevent tracking query duplicate bypass
function cleanUrl(rawUrl) {
  if (!rawUrl) return '';
  try {
    const u = new URL(rawUrl);
    // Strip common tracking and session parameters
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'].forEach(param => {
      u.searchParams.delete(param);
    });
    // Remove trailing slash
    return (u.origin + u.pathname + u.search).replace(/\/$/, '').toLowerCase();
  } catch (e) {
    return rawUrl.trim().toLowerCase().replace(/\/$/, '');
  }
}

// Helper: Extract significant words for fuzzy comparison
function getSignificantWords(text) {
  if (!text) return new Set();
  const stopWords = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'california', 'state', 'bill', 'court', 'news', 'update']);
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
  return new Set(words);
}

// Helper: Check if two headlines are essentially the same story (>60% word overlap)
function isFuzzyDuplicate(headlineA, headlineB) {
  const setA = getSignificantWords(headlineA);
  const setB = getSignificantWords(headlineB);
  if (setA.size === 0 || setB.size === 0) return false;

  let intersection = 0;
  setA.forEach(w => {
    if (setB.has(w)) intersection++;
  });

  const overlapA = intersection / setA.size;
  const overlapB = intersection / setB.size;
  return overlapA >= 0.60 || overlapB >= 0.60;
}

async function fetchDailyNews() {
  console.log("Starting intelligent balanced daily sweep (Legal & News) with anti-duplication...");

  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const outputPath = path.join(dataDir, 'news.json');

  // Load existing archive
  let existingItems = [];
  if (fs.existsSync(outputPath)) {
    try {
      const rawExisting = fs.readFileSync(outputPath, 'utf-8');
      const parsedExisting = JSON.parse(rawExisting);
      if (Array.isArray(parsedExisting.items)) {
        existingItems = parsedExisting.items;
      }
    } catch (readErr) {
      console.warn("Notice: Initializing fresh archive.");
    }
  }

  // Build exclusion list from the last 25 entries to give Gemini prompt-level memory
  const recentHeadlines = existingItems
    .slice(0, 25)
    .map((item, idx) => `${idx + 1}. "${item.headline}" (Docket/Statute: ${item.statute_or_case || 'N/A'})`)
    .join('\n');

  const prompt = `
You are an authoritative legal research editor and public safety analyst for the Sikh Rifle and Pistol Association (SikhRPA), a California 501(c)(3) nonprofit public educational charity.

Task:
Perform a fresh search for California firearm-related developments and return a balanced collection of 4 to 6 total items:
1. Exactly 2 to 3 Primary Legal / Regulatory updates:
   - Newly chaptered legislation or active legislative movement (California Legislature / LegInfo)
   - Federal 9th Circuit or District Court orders, stays, or rulings affecting CA gun owners
   - Official California Department of Justice (CA DOJ) Bureau of Firearms regulatory notices, DROS alerts, or safe storage bulletins
2. Exactly 2 to 3 Authoritative News / Investigative reports:
   - Reputable reporting from major news outlets: Associated Press (AP), Reuters, Los Angeles Times, San Francisco Chronicle, Sacramento Bee, or CalMatters
   - Articles covering retail impacts, community safety, safe storage initiatives, enforcement trends, or legal challenges

CRITICAL ANTI-DUPLICATION RULE:
We already have the following stories in our archive. Do NOT select, rewrite, or repeat these stories unless there has been a major, new verified development today:
${recentHeadlines || 'None yet (first run)'}

Strict Requirements:
- Strictly Nonpartisan & Educational: No op-eds, endorsements, political campaign commentary, or editorial rants. Focus purely on factual developments affecting firearm owners, families, and community safety.
- For news articles, use the publication name as "source_name" (e.g., "Los Angeles Times", "CalMatters", "Associated Press") and the specific article link as "source_url".
- Return ONLY a valid JSON array of objects following this exact schema:
[
  {
    "id": "unique-slug-id",
    "date": "YYYY-MM-DD",
    "category": "Legislation" | "Court Ruling" | "CA DOJ Notice" | "State News" | "Community Safety",
    "badge_status": "In Effect" | "Court Injunction" | "Regulatory Notice" | "News Report" | "Statutory Update",
    "badge_color": "emerald" | "amber" | "blue" | "purple",
    "headline": "Clear, objective, informative headline",
    "statute_or_case": "Associated CA Penal Code, court docket, or reporting agency",
    "summary": "2-3 sentences in plain English summarizing the factual event or findings.",
    "community_takeaway": "Actionable takeaway or practical context for California owners, buyers, and families.",
    "source_name": "Entity or news outlet name",
    "source_url": "Direct verified URL to official docket or news article"
  }
]
`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    tools: [{ googleSearch: {} }],
    generationConfig: { temperature: 0.2 }
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
      throw new Error("Empty text response received from Gemini.");
    }

    // Extract JSON array
    let cleanJson = rawContent.trim();
    const firstBracket = cleanJson.indexOf('[');
    const lastBracket = cleanJson.lastIndexOf(']');

    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      cleanJson = cleanJson.substring(firstBracket, lastBracket + 1);
    }

    const incomingItems = JSON.parse(cleanJson);

    if (!Array.isArray(incomingItems) || incomingItems.length === 0) {
      throw new Error("Parsed response was not a non-empty array of items.");
    }

    // Build index of existing items for code-level deduplication
    const existingUrls = new Set(existingItems.map(i => cleanUrl(i.source_url)).filter(Boolean));
    const existingIds = new Set(existingItems.map(i => (i.id || '').toLowerCase()).filter(Boolean));

    const novelItems = [];

    for (const newItem of incomingItems) {
      const newCleanUrl = cleanUrl(newItem.source_url);
      const newId = (newItem.id || '').toLowerCase();

      // Check 1: Exact URL match
      if (newCleanUrl && existingUrls.has(newCleanUrl)) {
        console.log(`[Duplicate skipped by URL]: ${newItem.headline}`);
        continue;
      }

      // Check 2: Exact ID match
      if (newId && existingIds.has(newId)) {
        console.log(`[Duplicate skipped by ID]: ${newItem.headline}`);
        continue;
      }

      // Check 3: Fuzzy headline comparison against existing items
      const isFuzzyDupe = existingItems.some(existing => isFuzzyDuplicate(newItem.headline, existing.headline));
      if (isFuzzyDupe) {
        console.log(`[Duplicate skipped by Fuzzy Headline Match]: ${newItem.headline}`);
        continue;
      }

      // Check 4: Fuzzy comparison against items within this same batch
      const isBatchDupe = novelItems.some(accepted => isFuzzyDuplicate(newItem.headline, accepted.headline));
      if (isBatchDupe) {
        console.log(`[Duplicate skipped within current batch]: ${newItem.headline}`);
        continue;
      }

      // Passed all checks!
      if (newCleanUrl) existingUrls.add(newCleanUrl);
      if (newId) existingIds.add(newId);
      novelItems.push(newItem);
    }

    if (novelItems.length === 0) {
      console.log("No new unique stories detected today. Existing archive remains intact.");
      return;
    }

    // Prepend novel items ahead of the existing archive
    const mergedList = [...novelItems, ...existingItems];

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

    fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2), 'utf-8');
    console.log(`✓ Success: Added ${novelItems.length} novel dispatches. Archive now contains ${mergedList.length} total historical records.`);

  } catch (error) {
    console.error("Execution failed:", error.message);
    process.exit(1);
  }
}

fetchDailyNews();
