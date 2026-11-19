import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import toast from 'react-hot-toast';
import Layout from '../components/Layout';
import Icon from '../components/Icon';

const SUGGESTIONS = [
  'What replaced Section 420 IPC, and what is the punishment now?',
  'When can the police arrest without a warrant under the BNSS?',
  'Is a WhatsApp chat admissible without a certificate under the BSA?',
  'The offence was committed in March 2024. Does the IPC or the BNS apply?'
];

// Replies end with an automatic verification note when a citation could not be checked
const splitVerificationNote = (content = '') => {
  const i = content.indexOf('\n\nVerification note:');
  return i < 0 ? [content, null] : [content.slice(0, i), content.slice(i).replace(/^\s*Verification note:\s*/, '')];
};

export default function LawGPT() {
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
      const { reply, cited_sections, verification, title } = res.data;

      const aiMsg = {
        role: 'assistant',
        content: reply,
        timestamp: new Date().toISOString(),
        cited_sections: cited_sections || [],
        verification
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
      toast.success(`${file_name} uploaded and ready`);
      // Add a system message in chat to show PDF was attached
      const systemMsg = {
        role: 'assistant',
        content: `**${file_name}** has been uploaded and attached to this session (${pages} pages). You can now ask me anything about this document — summarize it, explain clauses, identify risks, find relevant legal sections, and more.`,
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
        content: `**Document analysis: ${activePdfName}**\n\n${res.data.analysis}`,
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
    // Basic markdown-like formatting — escape HTML first since this is rendered as HTML
    return content
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/^#{3,} (.*$)/gm, '<strong>$1</strong>')
      .replace(/^#{1,2} (.*$)/gm, '<strong style="font-size:1.1em">$1</strong>')
      .replace(/^(\s*)[*-] /gm, '$1• ')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]/g, '<span class="am-inline-cite">$1</span>')
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
    <Layout>
      <div className="am-research">
        {/* Sessions */}
        <aside className="am-sessions">
          <button className="am-btn am-btn-primary" style={{ width: '100%' }} onClick={handleNewChat}>
            <Icon name="plus" size={16} /> New Research Session
          </button>
          <div className="am-search" style={{ width: '100%', margin: '14px 0 6px' }}>
            <Icon name="search" size={15} />
            <input placeholder="Search sessions…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
          <div className="am-session-list">
            {isSidebarLoading ? (
              <div className="am-session-empty">Loading sessions…</div>
            ) : filteredChats.length === 0 ? (
              <div className="am-session-empty">No research sessions yet.</div>
            ) : (
              Object.entries(groupedChats).map(([group, groupChats]) =>
                groupChats.length > 0 && (
                  <div key={group}>
                    <div className="am-nav-label" style={{ padding: '16px 10px 6px' }}>{group}</div>
                    {groupChats.map(chat => (
                      <div
                        key={chat.id}
                        className={`am-session ${activeChatId === chat.id ? 'active' : ''}`}
                        onClick={() => handleSelectChat(chat.id)}
                      >
                        <Icon name={chat.pdf_name ? 'file' : 'message'} size={15} />
                        {editingTitleId === chat.id ? (
                          <input
                            className="am-session-rename"
                            value={editingTitleValue}
                            onChange={e => setEditingTitleValue(e.target.value)}
                            onBlur={() => handleRenameChat(chat.id)}
                            onKeyDown={e => e.key === 'Enter' && handleRenameChat(chat.id)}
                            autoFocus
                            onClick={e => e.stopPropagation()}
                          />
                        ) : (
                          <span
                            className="am-session-title"
                            title="Double-click to rename"
                            onDoubleClick={e => { e.stopPropagation(); setEditingTitleId(chat.id); setEditingTitleValue(chat.title); }}
                          >
                            {chat.title}
                          </span>
                        )}
                        <button className="am-session-delete" onClick={e => handleDeleteChat(e, chat.id)} title="Delete session">
                          <Icon name="x" size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )
              )
            )}
          </div>
        </aside>

        {/* Conversation */}
        <section className="am-conversation">
          <header className="am-research-head">
            <div>
              <div className="am-eyebrow">Legal Research</div>
              <h1 className="am-studio-title" style={{ margin: '2px 0 0' }}>Statutory Research Desk</h1>
            </div>
            <div className="am-page-actions" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
              {activePdfName && (
                <span className="am-doc-chip">
                  <Icon name="file" size={14} /> {activePdfName}
                  <button onClick={handleRemovePdf} title="Remove document"><Icon name="x" size={13} /></button>
                </span>
              )}
              {activePdfName && (
                <button className="am-btn" onClick={handleAnalyseDocument} disabled={isAnalysing}>
                  {isAnalysing ? 'Analysing…' : 'Analyse Document'}
                </button>
              )}
              <button
                className="am-btn"
                onClick={() => {
                  if (!activeChatId) { toast.error('Start a research session first'); return; }
                  fileInputRef.current?.click();
                }}
                disabled={isUploadingPdf}
              >
                <Icon name="upload" size={15} /> {isUploadingPdf ? 'Uploading…' : 'Attach Document'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.gif,.tiff"
                style={{ display: 'none' }}
                onChange={handlePdfUpload}
              />
            </div>
          </header>

          <div className="am-thread">
            {!activeChatId || messages.length === 0 ? (
              <div className="am-research-welcome">
                <div className="am-workflow-icon" style={{ background: 'var(--am-navy-tint)', color: 'var(--am-navy)' }}><Icon name="book" size={20} /></div>
                <h2 className="am-instruments-title" style={{ marginTop: 14 }}>Ask about the BNS, BNSS or BSA</h2>
                <p className="am-subtitle" style={{ maxWidth: 560 }}>
                  Answers are drawn from the official Gazette text of the new criminal codes. Every section cited is checked
                  against that text, old IPC/CrPC equivalents are noted, and no case law is invented.
                </p>
                <div className="am-suggestions">
                  {SUGGESTIONS.map(s => (
                    <button key={s} className="am-suggestion" onClick={async () => {
                      if (!activeChatId) await handleNewChat();
                      setInputMessage(s);
                    }}>
                      {s}<Icon name="arrowRight" size={15} />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((msg, index) => {
                  const [body, note] = msg.role === 'assistant' ? splitVerificationNote(msg.content) : [msg.content, null];
                  return (
                    <div key={index} className={`am-msg ${msg.role}`}>
                      {msg.role === 'user' ? (
                        <div className="am-msg-question">{msg.content}</div>
                      ) : (
                        <div className="am-msg-answer">
                          <div className="am-msg-content" dangerouslySetInnerHTML={{ __html: formatMessageContent(body) }} />
                          {note && (
                            <div className="am-callout">
                              <Icon name="alert" size={16} />
                              <div>{note}</div>
                            </div>
                          )}
                          {msg.cited_sections && msg.cited_sections.length > 0 && (
                            <div className="am-citations">
                              <span className="am-citations-label">
                                <Icon name="checkCircle" size={14} /> Verified against the official text
                              </span>
                              {msg.cited_sections.map((s, i) => (
                                <span key={i} className="am-citation-chip" title={s.title || ''}>
                                  {s.act_short} {String(s.section_number).replace(/^Section\s+/, '')}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="am-msg-time">{formatTime(msg.timestamp)}</div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {isLoading && (
                  <div className="am-msg assistant">
                    <div className="am-msg-answer am-msg-pending">Reading the statutes and checking citations…</div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {activeChatId && (
            <div className="am-composer-wrap">
              <div className="am-composer">
                <textarea
                  placeholder="Ask a research question — include the offence date if old or new law may apply"
                  value={inputMessage}
                  onChange={e => setInputMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={2}
                  disabled={isLoading}
                />
                <button className="am-btn am-btn-primary" onClick={handleSendMessage} disabled={isLoading || !inputMessage.trim()} aria-label="Send">
                  <Icon name="send" size={16} />
                </button>
              </div>
              <div className="am-composer-note">Research aid for advocates — verify before filing. Enter to send, Shift+Enter for a new line.</div>
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
}
