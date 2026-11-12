import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api';

const SENSITIVE_CATEGORIES = [
  'Criminal Law',
  'Cyber Law',
  'Taxation Law',
  'Civil Litigation',
  'Consumer Law',
  'Divorce / Family Law'
];

export default function LegalSectionsAssistant({
  categoryName,
  documentTypeName,
  formData,
  selectedSections,
  onAddSection,
  onRemoveSection,
  onAddAllSections
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [suggestionsVisible, setSuggestionsVisible] = useState(false);

  const searchDropdownRef = useRef(null);
  const isRelevantCategory = SENSITIVE_CATEGORIES.includes(categoryName);

  // Close search dropdown on outside click
  useEffect(() => {
    const handleOutside = (e) => {
      if (searchDropdownRef.current && !searchDropdownRef.current.contains(e.target)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Search with debounce
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await api.searchLegalSections(searchQuery, []);
        setSearchResults(res.data.sections || []);
        setShowSearchDropdown(true);
      } catch (err) {
        console.error('Search error:', err);
      }
      setIsSearching(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load AI suggestions — completely fresh each time
  const loadAiSuggestions = async () => {
    const caseDesc =
      formData.grounds ||
      formData.incident_description ||
      formData.grievance ||
      formData.dispute_details ||
      formData.cause_of_action ||
      formData.statement ||
      Object.values(formData).find(
        v => typeof v === 'string' && v.length > 20
      ) || '';

    if (!caseDesc || caseDesc.length < 10) {
      alert('Please fill in the case description or grounds field first.');
      return;
    }

    // Clear everything first
    setAiSuggestions([]);
    setIsLoadingSuggestions(true);
    setSuggestionsVisible(true);

    try {
      const res = await api.getAISuggestedSections(
        caseDesc,
        categoryName,
        documentTypeName
      );
      // Store ALL suggestions — never filter by selectedSections here
      // The UI will show "Added" badge but still allow interaction
      const allSuggestions = res.data.suggestions || [];
      setAiSuggestions(allSuggestions);
    } catch (err) {
      console.error('Suggestion error:', err);
      setAiSuggestions([]);
    }
    setIsLoadingSuggestions(false);
  };

  // Check if a section is already in selectedSections
  // Uses the prop directly — always fresh from parent
  const isAlreadySelected = (sectionNumber) => {
    if (!selectedSections || selectedSections.length === 0) return false;
    return !!selectedSections.find(
      s => String(s.section_number) === String(sectionNumber)
    );
  };

  // Add from AI suggestions
  const handleAddAiSection = (section) => {
    if (isAlreadySelected(section.section_number)) return;
    onAddSection(section);
  };

  const handleAddAllAiSections = () => {
    const notYetAdded = aiSuggestions.filter(
      s => !isAlreadySelected(s.section_number)
    );
    if (notYetAdded.length > 0) {
      onAddAllSections(notYetAdded);
    }
  };

  if (!isRelevantCategory) return null;

  // Count how many AI suggestions are not yet added
  const unadded = aiSuggestions.filter(
    s => !isAlreadySelected(s.section_number)
  );
  return (
    <div className="lsa-container">

      {/* Header */}
      <div className="lsa-header">
        <div className="lsa-title-wrap">
          <span style={{fontSize:'22px'}}>⚖️</span>
          <div>
            <h3 className="lsa-title">Applicable Legal Sections / Articles</h3>
            <p className="lsa-subtitle">
              Optional — Search and add relevant legal sections
            </p>
          </div>
        </div>
        <span className="lsa-badge">{categoryName}</span>
      </div>

      {/* Search Box */}
      <div className="lsa-search-wrap" ref={searchDropdownRef}>
        <div className="lsa-search-box">
          <span>🔍</span>
          <input
            type="text"
            placeholder="Type section or keyword... e.g. '420', 'cheating', 'Article 21'"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="lsa-search-input"
          />
          {isSearching && <span>⏳</span>}
          {searchQuery && (
            <button
              type="button"
              className="lsa-clear-btn"
              onClick={() => {
                setSearchQuery('');
                setSearchResults([]);
                setShowSearchDropdown(false);
              }}>
              ✕
            </button>
          )}
        </div>

        {/* Search Results Dropdown */}
        {showSearchDropdown && (
          <div className="lsa-dropdown">
            {searchResults.length === 0 ? (
              <div className="lsa-no-results">
                No results for "{searchQuery}"
              </div>
            ) : (
              <>
                <div className="lsa-dropdown-hint">
                  Click any section to add it instantly
                </div>
                {searchResults.map(section => {
                  const added = isAlreadySelected(section.section_number);
                  return (
                    <div
                      key={section.section_number}
                      className={`lsa-result-item ${added ? 'lsa-result-added' : ''}`}
                      onClick={() => {
                        if (!added) onAddSection(section);
                      }}>
                      <div className="lsa-result-top">
                        <span className="lsa-section-num">
                          {section.section_number}
                        </span>
                        <span className="lsa-act-tag">{section.act_short}</span>
                        {added && (
                          <span className="lsa-added-tag">✓ Added</span>
                        )}
                      </div>
                      <p className="lsa-result-desc">{section.description}</p>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}
      </div>

      {/* Selected Chips — from parent state */}
      {selectedSections.length > 0 && (
        <div className="lsa-selected-wrap">
          <p className="lsa-selected-label">
            ✅ {selectedSections.length} Section(s) Added to Document:
          </p>
          <div className="lsa-chips">
            {selectedSections.map(section => (
              <div key={section.section_number} className="lsa-chip">
                <span className="lsa-chip-num">{section.section_number}</span>
                <span className="lsa-chip-act">{section.act_short}</span>
                <button
                  type="button"
                  className="lsa-chip-remove"
                  onClick={() => onRemoveSection(section.section_number)}
                  title="Remove">
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Suggestions Button */}
      <div className="lsa-ai-section">
        <button
          type="button"
          className="lsa-suggest-btn"
          onClick={loadAiSuggestions}
          disabled={isLoadingSuggestions}>
          {isLoadingSuggestions
            ? '⏳ Analyzing your case details...'
            : suggestionsVisible
            ? '🔄 Refresh AI Suggestions'
            : '💡 Get AI Section Suggestions'}
        </button>

        {/* AI Suggestions List */}
        {suggestionsVisible && (
          <div className="lsa-suggestions-wrap">
            {isLoadingSuggestions ? (
              <div className="lsa-loading">
                <div className="lsa-spinner"></div>
                <p>Analyzing case and finding relevant sections...</p>
              </div>
            ) : aiSuggestions.length === 0 ? (
              <div className="lsa-no-suggestions">
                <p>✅ All suggestions have been added or none found.</p>
              </div>
            ) : (
              <>
                <div className="lsa-suggestions-header">
                  <p className="lsa-suggestions-title">
                    💡 {aiSuggestions.length} section(s) found
                    {unadded.length < aiSuggestions.length
                      ? ` (${aiSuggestions.length - unadded.length} already added)`
                      : ''
                    } — click <strong>+ Add</strong>:
                  </p>
                  {unadded.length > 0 && (
                    <button
                      type="button"
                      className="lsa-add-all-btn"
                      onClick={handleAddAllAiSections}>
                      Add All ({unadded.length})
                    </button>
                  )}
                </div>

                {aiSuggestions.map((section, index) => {
                  const added = isAlreadySelected(section.section_number);
                  return (
                    <div
                      key={section.section_number || index}
                      className={`lsa-suggestion-row ${added ? 'lsa-suggestion-added' : ''}`}
                      style={{ opacity: added ? 0.8 : 1 }}>
                      <div className="lsa-suggestion-info">
                        <div className="lsa-suggestion-top">
                          <span className="lsa-section-num">
                            {section.section_number}
                          </span>
                          <span className="lsa-act-tag">
                            {section.act_short}
                          </span>
                          {added && (
                            <span className="lsa-added-tag">✓ Added</span>
                          )}
                        </div>
                        <p className="lsa-result-desc">{section.description}</p>
                      </div>
                      <button
                        type="button"
                        className={`lsa-add-one-btn ${added ? 'lsa-add-one-btn-added' : ''}`}
                        onClick={() => handleAddAiSection(section)}
                        disabled={added}>
                        {added ? '✓' : '+ Add'}
                      </button>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}
      </div>

      {/* Disclaimer */}
      <p className="lsa-disclaimer">
        ⚠️ AI suggestions are recommendations only. Always verify before use.
      </p>
    </div>
  );
}