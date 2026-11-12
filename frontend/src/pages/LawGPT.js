import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import toast from 'react-hot-toast';

export default function LawGPT() {
  const navigate = useNavigate();
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarLoading, setIsSidebarLoading] = useState(true);
  const [activePdfName, setActivePdfName] = useState(null);
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingTitleId, setEditingTitleId] = useState(null);
  const [editingTitleValue, setEditingTitleValue] = useState('');
  const [isAnalysing, setIsAnalysing] = useState(false);

  // ── Load all chats on mount ──────────────────────────────────────────────────
  useEffect(() => {
    loadChats();
  }, []);

  // ── Auto scroll to bottom on new message ────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadChats = async () => {
    try {
      setIsSidebarLoading(true);
      const res = await api.lawgptGetChats();
      setChats(res.data.chats || []);
    } catch (err) {
      toast.error('Failed to load chats');
    } finally {
      setIsSidebarLoading(false);
    }
  };

  const handleNewChat = async () => {
    try {
      const res = await api.lawgptCreateChat();
      const newChat = res.data.chat;
      setChats(prev => [newChat, ...prev]);
      setActiveChatId(newChat.id);
      setMessages([]);
      setActivePdfName(null);
    } catch (err) {
      toast.error('Failed to create new chat');
    }
  };

  const handleSelectChat = async (chatId) => {
    if (chatId === activeChatId) return;
    try {
      setIsLoading(true);
      const res = await api.lawgptGetChat(chatId);
      const chat = res.data.chat;
      setActiveChatId(chatId);
      setMessages(chat.messages || []);
      setActivePdfName(chat.pdf_name || null);
    } catch (err) {
      toast.error('Failed to load chat');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteChat = async (e, chatId) => {
    e.stopPropagation();
    if (!window.confirm('Delete this chat?')) return;
    try {
      await api.lawgptDeleteChat(chatId);
      setChats(prev => prev.filter(c => c.id !== chatId));
      if (activeChatId === chatId) {
        setActiveChatId(null);
        setMessages([]);
        setActivePdfName(null);
      }
      toast.success('Chat deleted');
    } catch (err) {
      toast.error('Failed to delete chat');
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;
    if (!activeChatId) {
      toast.error('Please start a new chat first');
      return;
    }

    const userMsg = { role: 'user', content: inputMessage.trim(), timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const res = await api.lawgptSendMessage(activeChatId, userMsg.content);
      const { reply, cited_sections, title } = res.data;

      const aiMsg = {
        role: 'assistant',
        content: reply,
        timestamp: new Date().toISOString(),
        cited_sections: cited_sections || []
      };
      setMessages(prev => [...prev, aiMsg]);

      // Update chat title in sidebar if it was auto-titled
      setChats(prev => prev.map(c =>
        c.id === activeChatId ? { ...c, title, updated_at: new Date().toISOString() } : c
      ));
    } catch (err) {
      toast.error('Failed to get response');
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handlePdfUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!activeChatId) {
      toast.error('Please start a new chat first');
      return;
    }
    const supportedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/tiff'
    ];
    if (!supportedTypes.includes(file.type)) {
      toast.error('Unsupported file type. Use PDF, Word, PPT, Excel, or images.');
      return;
    }

    setIsUploadingPdf(true);
    try {
      const res = await api.lawgptUploadPDF(activeChatId, file);
      const { file_name, pages } = res.data;
      setActivePdfName(file_name);
      setChats(prev => prev.map(c =>
        c.id === activeChatId ? { ...c, pdf_name: file_name } : c
      ));
      toast.success(`📄 ${file_name} uploaded and ready`);
      // Add a system message in chat to show PDF was attached
      const systemMsg = {
        role: 'assistant',
        content: `📄 **${file_name}** has been uploaded and attached to this session (${pages} pages). You can now ask me anything about this document — summarize it, explain clauses, identify risks, find relevant legal sections, and more.`,
        timestamp: new Date().toISOString(),
        cited_sections: []
      };
      setMessages(prev => [...prev, systemMsg]);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to upload PDF');
    } finally {
      setIsUploadingPdf(false);
      e.target.value = '';
    }
  };
  const handleAnalyseDocument = async () => {
    if (!activeChatId) return;
    if (!activePdfName) {
      toast.error('Please upload a document first');
      return;
    }
    setIsAnalysing(true);
    const userMsg = {
      role: 'user',
      content: `Analyse this document: ${activePdfName}`,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, userMsg]);
    try {
      const res = await api.lawgptAnalyseDocument(activeChatId);
      const aiMsg = {
        role: 'assistant',
        content: `📊 **DOCUMENT ANALYSIS: ${activePdfName}**\n\n${res.data.analysis}`,
        timestamp: new Date().toISOString(),
        cited_sections: [],
        is_analysis: true
      };
      setMessages(prev => [...prev, aiMsg]);
      setChats(prev => prev.map(c =>
        c.id === activeChatId
          ? { ...c, title: `Analysis: ${activePdfName.slice(0, 40)}` }
          : c
      ));
      toast.success('Document analysis complete!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Analysis failed');
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setIsAnalysing(false);
    }
  };

  const handleRemovePdf = async () => {
    if (!activeChatId) return;
    try {
      await api.lawgptRemovePDF(activeChatId);
      setActivePdfName(null);
      setChats(prev => prev.map(c =>
        c.id === activeChatId ? { ...c, pdf_name: null } : c
      ));
      toast.success('PDF removed from session');
    } catch (err) {
      toast.error('Failed to remove PDF');
    }
  };

  const handleRenameChat = async (chatId) => {
    if (!editingTitleValue.trim()) return;
    try {
      await api.lawgptRenameChat(chatId, editingTitleValue.trim());
      setChats(prev => prev.map(c =>
        c.id === chatId ? { ...c, title: editingTitleValue.trim() } : c
      ));
      setEditingTitleId(null);
    } catch (err) {
      toast.error('Failed to rename chat');
    }
  };

  const filteredChats = chats.filter(c =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  const formatMessageContent = (content) => {
    // Basic markdown-like formatting
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]/g, '<span class="lawgpt-citation">$1</span>')
      .replace(/\n/g, '<br/>');
  };

  // ── Group chats by date ──────────────────────────────────────────────────────
  const groupChatsByDate = (chats) => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const groups = { Today: [], Yesterday: [], Earlier: [] };
    chats.forEach(chat => {
      const d = new Date(chat.updated_at || chat.created_at);
      if (d.toDateString() === today.toDateString()) groups.Today.push(chat);
      else if (d.toDateString() === yesterday.toDateString()) groups.Yesterday.push(chat);
      else groups.Earlier.push(chat);
    });
    return groups;
  };

  const groupedChats = groupChatsByDate(filteredChats);

  return (
    <div className="lawgpt-container">

      {/* ── SIDEBAR ─────────────────────────────────────────────────────────── */}
      <div className="lawgpt-sidebar">

        {/* Back to Dashboard */}
        <div className="lawgpt-sidebar-top">
          <button className="lawgpt-back-btn" onClick={() => navigate('/dashboard')}>
            ← Dashboard
          </button>
          <button className="lawgpt-new-chat-btn" onClick={handleNewChat}>
            + New Chat
          </button>
        </div>

        {/* Search */}
        <div className="lawgpt-search-wrap">
          <input
            type="text"
            placeholder="Search chats..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="lawgpt-search-input"
          />
        </div>

        {/* Chat List */}
        <div className="lawgpt-chat-list">
          {isSidebarLoading ? (
            <div className="lawgpt-sidebar-loading">Loading chats...</div>
          ) : filteredChats.length === 0 ? (
            <div className="lawgpt-sidebar-empty">
              No chats yet.<br />Click "+ New Chat" to begin.
            </div>
          ) : (
            Object.entries(groupedChats).map(([group, groupChats]) =>
              groupChats.length > 0 && (
                <div key={group}>
                  <div className="lawgpt-chat-group-label">{group}</div>
                  {groupChats.map(chat => (
                    <div
                      key={chat.id}
                      className={`lawgpt-chat-item ${activeChatId === chat.id ? 'active' : ''}`}
                      onClick={() => handleSelectChat(chat.id)}
                    >
                      {editingTitleId === chat.id ? (
                        <input
                          className="lawgpt-rename-input"
                          value={editingTitleValue}
                          onChange={e => setEditingTitleValue(e.target.value)}
                          onBlur={() => handleRenameChat(chat.id)}
                          onKeyDown={e => e.key === 'Enter' && handleRenameChat(chat.id)}
                          autoFocus
                          onClick={e => e.stopPropagation()}
                        />
                      ) : (
                        <span
                          className="lawgpt-chat-title"
                          onDoubleClick={e => {
                            e.stopPropagation();
                            setEditingTitleId(chat.id);
                            setEditingTitleValue(chat.title);
                          }}
                        >
                          {chat.pdf_name ? '📄 ' : '💬 '}
                          {chat.title}
                        </span>
                      )}
                      <button
                        className="lawgpt-delete-btn"
                        onClick={e => handleDeleteChat(e, chat.id)}
                        title="Delete chat"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )
            )
          )}
        </div>
      </div>

      {/* ── MAIN CHAT AREA ──────────────────────────────────────────────────── */}
      <div className="lawgpt-main">

        {/* Chat Header */}
        <div className="lawgpt-header">
          <div className="lawgpt-header-left">
            <h2 className="lawgpt-title">⚖️ LawGPT Workspace</h2>
            <span className="lawgpt-subtitle">AI Legal Research Assistant for Indian Advocates</span>
          </div>
          <div className="lawgpt-header-right">
            {activePdfName && (
              <div className="lawgpt-pdf-badge">
                📄 {activePdfName}
                <button onClick={handleRemovePdf} className="lawgpt-pdf-remove">×</button>
              </div>
            )}
            {activePdfName && (
              <button
                className="lawgpt-analyse-btn"
                onClick={handleAnalyseDocument}
                disabled={isAnalysing}
              >
                {isAnalysing ? '⏳ Analysing...' : '📊 Analyse Document'}
              </button>
            )}
            <button
              className="lawgpt-upload-btn"
              onClick={() => {
                if (!activeChatId) { toast.error('Start a new chat first'); return; }
                fileInputRef.current?.click();
              }}
              disabled={isUploadingPdf}
            >
              {isUploadingPdf ? 'Uploading...' : '📎 Upload Document'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.gif,.tiff"
              style={{ display: 'none' }}
              onChange={handlePdfUpload}
            />
          </div>
        </div>

        {/* Messages Area */}
        <div className="lawgpt-messages">
          {!activeChatId ? (
            <div className="lawgpt-welcome">
              <div className="lawgpt-welcome-icon">⚖️</div>
              <h3>Welcome to LawGPT Workspace</h3>
              <p>Your AI-powered legal research assistant for Indian law.</p>
              <ul className="lawgpt-welcome-features">
                <li>💬 Ask legal research questions</li>
                <li>📄 Upload judgments, agreements, petitions</li>
                <li>🔍 Get relevant IPC / BNS / CrPC sections</li>
                <li>📝 Analyze clauses and identify risks</li>
                <li>💾 All sessions saved automatically</li>
              </ul>
              <button className="lawgpt-start-btn" onClick={handleNewChat}>
                + Start New Research Session
              </button>
            </div>
          ) : messages.length === 0 ? (
            <div className="lawgpt-welcome">
              <div className="lawgpt-welcome-icon">💬</div>
              <h3>New Research Session</h3>
              <p>Ask a legal question or upload a PDF to begin.</p>
              <div className="lawgpt-suggestions">
                {[
                  'Explain Section 138 of the Negotiable Instruments Act',
                  'What are the grounds for divorce under Hindu Marriage Act?',
                  'Summarize the IT Act provisions on cybercrime',
                  'What is the procedure for filing a writ petition?'
                ].map((suggestion, i) => (
                  <button
                    key={i}
                    className="lawgpt-suggestion-chip"
                    onClick={() => { setInputMessage(suggestion); }}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, index) => (
                <div key={index} className={`lawgpt-message ${msg.role}`}>
                  <div className="lawgpt-message-avatar">
                    {msg.role === 'user' ? '👤' : '⚖️'}
                  </div>
                  <div className="lawgpt-message-body">
                    <div
                      className="lawgpt-message-content"
                      dangerouslySetInnerHTML={{ __html: formatMessageContent(msg.content) }}
                    />
                    {msg.cited_sections && msg.cited_sections.length > 0 && (
                      <div className="lawgpt-cited-sections">
                        <span className="lawgpt-cited-label">Referenced Sections:</span>
                        {msg.cited_sections.map((s, i) => (
                          <span key={i} className="lawgpt-cited-tag">
                            {s.section_number} — {s.act_short}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="lawgpt-message-time">{formatTime(msg.timestamp)}</div>
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="lawgpt-message assistant">
                  <div className="lawgpt-message-avatar">⚖️</div>
                  <div className="lawgpt-message-body">
                    <div className="lawgpt-typing">
                      <span></span><span></span><span></span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input Area */}
        {activeChatId && (
          <div className="lawgpt-input-area">
            <textarea
              className="lawgpt-input"
              placeholder="Ask a legal question... (Shift+Enter for new line)"
              value={inputMessage}
              onChange={e => setInputMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              disabled={isLoading}
            />
            <button
              className="lawgpt-send-btn"
              onClick={handleSendMessage}
              disabled={isLoading || !inputMessage.trim()}
            >
              {isLoading ? '...' : '→'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}