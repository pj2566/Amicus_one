const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { verifyToken } = require('./auth');
const { suggestSections } = require('../lib/research');

// Search legal sections
router.get('/search', verifyToken, async (req, res) => {
  try {
    const { tags } = req.query;
    // Characters with meaning in PostgREST filter syntax are stripped before building .or()
    const query = String(req.query.query || '').replace(/[,()%*\\:"']/g, ' ').trim();

    if (!query || query.length < 2) {
      return res.json({ sections: [] });
    }

    // Verified official text (BNS/BNSS/BSA): match "318", "BNS 318" or words in the title
    const numberMatch = query.match(/^(?:(BNSS|BNS|BSA)\s*)?(?:s(?:ection|ec)?\.?\s*)?(\d+[A-Z]?)$/i);
    let statuteQuery = supabase.from('statute_sections').select('id, act, act_name, section, title').limit(20);
    statuteQuery = numberMatch
      ? statuteQuery.eq('section', numberMatch[2].toUpperCase()).in('act', numberMatch[1] ? [numberMatch[1].toUpperCase()] : ['BNS', 'BNSS', 'BSA'])
      : statuteQuery.ilike('title', `%${query}%`);

    let supabaseQuery = supabase
      .from('legal_sections')
      .select('*')
      .not('act_short', 'in', '(BNS,BNSS,BSA)')
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

    const [statuteResult, mainResult, keywordResult] = await Promise.all([
      statuteQuery,
      supabaseQuery,
      keywordQuery
    ]);

    // Verified sections first, in the same shape as legal_sections rows
    const verified = (statuteResult.data || []).map(s => ({
      id: s.id, section_number: `Section ${s.section}`, act_short: s.act, act_name: s.act_name,
      description: s.title, verified_text: true
    }));

    // Combine and deduplicate results
    const allSections = [
      ...verified,
      ...(mainResult.data || []),
      ...(keywordResult.data || []).filter(s => !['BNS', 'BNSS', 'BSA'].includes(s.act_short))
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

    const { suggestions, regime } = await suggestSections({ caseDescription, categoryName, documentTypeName });
    res.json({ suggestions, regime });
  } catch (err) {
    console.error('Suggest error:', err);
    res.status(500).json({ error: 'Suggestion failed', suggestions: [] });
  }
});

module.exports = router;