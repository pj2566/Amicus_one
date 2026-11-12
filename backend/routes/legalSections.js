const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { verifyToken } = require('./auth');
const llm = require('../lib/llm');

// Search legal sections
router.get('/search', verifyToken, async (req, res) => {
  try {
    const { query, tags } = req.query;

    if (!query || query.length < 2) {
      return res.json({ sections: [] });
    }

    let supabaseQuery = supabase
      .from('legal_sections')
      .select('*')
      .limit(50);

    // Filter by category tags if provided
    if (tags) {
      const tagArray = tags.split(',');
      supabaseQuery = supabaseQuery.overlaps('category_tags', tagArray);
    }

    // Search by section number, act name, or description
    supabaseQuery = supabaseQuery.or(
      `section_number.ilike.%${query}%,description.ilike.%${query}%,act_name.ilike.%${query}%,act_short.ilike.%${query}%`
    );

    // Also search keywords
    const keywordQuery = supabase
      .from('legal_sections')
      .select('*')
      .overlaps('keywords', [query.toLowerCase()])
      .limit(20);

    const [mainResult, keywordResult] = await Promise.all([
      supabaseQuery,
      keywordQuery
    ]);

    // Combine and deduplicate results
    const allSections = [
      ...(mainResult.data || []),
      ...(keywordResult.data || [])
    ];

    const seen = new Set();
    const uniqueSections = allSections.filter(s => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });

    res.json({ sections: uniqueSections });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Search failed', sections: [] });
  }
});

// AI suggest sections based on case description
router.post('/suggest', verifyToken, async (req, res) => {
  try {
    const { caseDescription, categoryName, documentTypeName } = req.body;

    if (!caseDescription || caseDescription.length < 10) {
      return res.json({ suggestions: [] });
    }

    // Get all sections for this category
    const categoryTagMap = {
      'Criminal Law': 'criminal',
      'Cyber Law': 'cyber',
      'Taxation Law': 'taxation',
      'Civil Litigation': 'civil',
      'Consumer Law': 'consumer',
      'Divorce / Family Law': 'family'
    };

    const tag = categoryTagMap[categoryName] || 'criminal';

    const { data: sections } = await supabase
      .from('legal_sections')
      .select('section_number, act_name, act_short, description')
      .overlaps('category_tags', [tag])
      .limit(200);

    if (!sections || sections.length === 0) {
      return res.json({ suggestions: [] });
    }

    // Ask AI to suggest relevant sections
    const sectionsText = sections.map(s =>
      `${s.section_number} ${s.act_short}: ${s.description}`
    ).join('\n');

    const prompt = `You are an expert Indian lawyer. Based on the case description below, suggest ALL relevant legal sections from the provided list.

CASE DESCRIPTION: ${caseDescription}
CATEGORY: ${categoryName}
DOCUMENT TYPE: ${documentTypeName}

AVAILABLE SECTIONS:
${sectionsText}

INSTRUCTIONS:
- Select ALL sections that are relevant to this case — NO limit on number
- Return ONLY a JSON array of section numbers exactly as they appear
- Example: ["Section 420 IPC", "Section 66C IT Act", "Section 406 IPC"]
- Do NOT suggest sections that are not in the list above
- Do NOT add any explanation outside the JSON array

Return JSON array only:`;

    const reply = await llm.chat({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 200,
      temperature: 0.1
    });

    let suggestedNumbers = [];
    try {
      const text = reply.trim();
      // Extract JSON array from response
      const match = text.match(/\[.*\]/s);
      if (match) {
        suggestedNumbers = JSON.parse(match[0]);
      }
    } catch (parseErr) {
      console.error('Parse error:', parseErr);
    }

    // Get full section details for suggested sections
    const suggestedSections = sections.filter(s =>
      suggestedNumbers.some(num =>
        s.section_number.toLowerCase().includes(num.toLowerCase()) ||
        num.toLowerCase().includes(s.section_number.toLowerCase())
      )
    );

    res.json({ suggestions: suggestedSections });
  } catch (err) {
    console.error('Suggest error:', err);
    res.status(500).json({ error: 'Suggestion failed', suggestions: [] });
  }
});

module.exports = router;