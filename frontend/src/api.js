import axios from 'axios';
import { supabase } from './supabase';

const API_BASE = process.env.REACT_APP_API_URL || 'https://lexora-backend-ztrkilmp5q-el.a.run.app/api';

const getToken = async () => {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token;
};

export const api = {
  async getProfile() {
    const token = await getToken();
    return axios.get(`${API_BASE}/auth/profile`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },
  async registerUser(name) {
    const token = await getToken();
    return axios.post(`${API_BASE}/auth/register`, { name }, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },
  async getCategories() {
    const token = await getToken();
    return axios.get(`${API_BASE}/categories`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },
  async generateDocument(data) {
    const token = await getToken();
    return axios.post(`${API_BASE}/documents/generate`, data, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 600000 // 10 minutes for large documents
    });
  },
  async getHistory() {
    const token = await getToken();
    return axios.get(`${API_BASE}/documents/history`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },
  async getAdminUsers() {
    const token = await getToken();
    return axios.get(`${API_BASE}/admin/users`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },
  async addCredits(userId, credits) {
    const token = await getToken();
    return axios.post(`${API_BASE}/admin/add-credits`, { userId, credits }, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  async getAdminStats() {
    const token = await getToken();
    return axios.get(`${API_BASE}/admin/stats`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  async getAdminFirms() {
    const token = await getToken();
    return axios.get(`${API_BASE}/admin/firms`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  async getAdminFirmMembers(firmId) {
    const token = await getToken();
    return axios.get(`${API_BASE}/admin/firms/${firmId}/members`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  async adminAddFirmCredits(firmId, credits) {
    const token = await getToken();
    return axios.post(`${API_BASE}/admin/add-firm-credits`, { firmId, credits }, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  async adminResetPassword(userId, newPassword) {
    const token = await getToken();
    return axios.post(`${API_BASE}/admin/reset-password`, { userId, newPassword }, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  async adminBanUser(userId) {
    const token = await getToken();
    return axios.post(`${API_BASE}/admin/suspend-user`, { userId }, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  async adminUnbanUser(userId) {
    const token = await getToken();
    return axios.post(`${API_BASE}/admin/unsuspend-user`, { userId }, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  async adminSuspendUser(userId) {
    const token = await getToken();
    return axios.post(`${API_BASE}/admin/suspend-user`, { userId }, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  async adminUnsuspendUser(userId) {
    const token = await getToken();
    return axios.post(`${API_BASE}/admin/unsuspend-user`, { userId }, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  async adminDeleteUser(userId) {
    const token = await getToken();
    return axios.delete(`${API_BASE}/admin/delete-user/${userId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

 async adminDeleteFirm(firmId) {
    const token = await getToken();
    return axios.delete(`${API_BASE}/admin/delete-firm/${firmId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  async adminGetUserDocuments(userId) {
    const token = await getToken();
    return axios.get(`${API_BASE}/admin/user-documents/${userId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  async searchLegalSections(query, categoryTags) {
    const token = await getToken();
    return axios.get(`${API_BASE}/legal-sections/search`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { query, tags: categoryTags?.join(',') }
    });
  },

  async getAISuggestedSections(caseDescription, categoryName, documentTypeName) {
    const token = await getToken();
    return axios.post(`${API_BASE}/legal-sections/suggest`, {
      caseDescription,
      categoryName,
      documentTypeName
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  // ─────────────────────────────────────────────
  // LAWGPT API FUNCTIONS
  // ─────────────────────────────────────────────

  async lawgptGetChats() {
    const token = await getToken();
    return axios.get(`${API_BASE}/lawgpt/chats`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  async lawgptCreateChat() {
    const token = await getToken();
    return axios.post(`${API_BASE}/lawgpt/chats`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  async lawgptGetChat(chatId) {
    const token = await getToken();
    return axios.get(`${API_BASE}/lawgpt/chats/${chatId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  async lawgptDeleteChat(chatId) {
    const token = await getToken();
    return axios.delete(`${API_BASE}/lawgpt/chats/${chatId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  async lawgptRenameChat(chatId, title) {
    const token = await getToken();
    return axios.patch(`${API_BASE}/lawgpt/chats/${chatId}/title`, { title }, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  async lawgptSendMessage(chatId, message) {
    const token = await getToken();
    return axios.post(`${API_BASE}/lawgpt/chats/${chatId}/message`, { message }, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  async lawgptUploadPDF(chatId, file) {
    const token = await getToken();
    const formData = new FormData();
    formData.append('pdf', file);
    return axios.post(`${API_BASE}/lawgpt/chats/${chatId}/upload-pdf`, formData, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'multipart/form-data'
      }
    });
  },

  async lawgptRemovePDF(chatId) {
    const token = await getToken();
    return axios.delete(`${API_BASE}/lawgpt/chats/${chatId}/remove-pdf`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  async lawgptAnalyseDocument(chatId) {
    const token = await getToken();
    return axios.post(`${API_BASE}/lawgpt/chats/${chatId}/analyse`, {}, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 120000 // 2 minutes for analysis
    });
  },

  // ─────────────────────────────────────────────
  // CLIENTS API
  // ─────────────────────────────────────────────

  async getClients() {
    const token = await getToken();
    return axios.get(`${API_BASE}/clients`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  async createClient(data) {
    const token = await getToken();
    return axios.post(`${API_BASE}/clients`, data, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  async updateClient(id, data) {
    const token = await getToken();
    return axios.put(`${API_BASE}/clients/${id}`, data, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  async deleteClient(id) {
    const token = await getToken();
    return axios.delete(`${API_BASE}/clients/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  // ─────────────────────────────────────────────
  // BILLING API
  // ─────────────────────────────────────────────

  async getBillingStats() {
    const token = await getToken();
    return axios.get(`${API_BASE}/billing/stats`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  async getUsageLogs() {
    const token = await getToken();
    return axios.get(`${API_BASE}/billing/usage`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  async logUsage(action_type, action_label, credits_used = 0, metadata = {}) {
    const token = await getToken();
    return axios.post(`${API_BASE}/billing/log`, {
      action_type, action_label, credits_used, metadata
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  // ─────────────────────────────────────────────
  // SETTINGS API
  // ─────────────────────────────────────────────

  async updateProfile(data) {
    const token = await getToken();
    return axios.put(`${API_BASE}/auth/profile`, data, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  async linkDocumentToClient(documentId, clientId) {
    const token = await getToken();
    return axios.patch(`${API_BASE}/documents/link-client`, {
      documentId, clientId
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  async getDocumentsByClient(clientId) {
    const token = await getToken();
    return axios.get(`${API_BASE}/documents/by-client/${clientId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  async freeformGenerate(prompt, language, documentLength, customPages, files) {
    const token = await getToken();
    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('language', language);
    formData.append('documentLength', documentLength);
    formData.append('customPages', customPages);
    if (files && files.length > 0) {
      files.forEach(file => formData.append('files', file));
    }
    return axios.post(`${API_BASE}/documents/freeform`, formData, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'multipart/form-data'
      },
      timeout: 600000
    });
  },

  
  async shareDocumentWithFirm(documentId) {
    const token = await getToken();
    return axios.patch(`${API_BASE}/documents/share-firm`, { documentId }, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  // ─────────────────────────────────────────────
  // TRANSLATE API
  // ─────────────────────────────────────────────

  async translateDocument(file, sourceLanguage) {
    const token = await getToken();
    const formData = new FormData();
    formData.append('file', file);
    formData.append('sourceLanguage', sourceLanguage);
    return axios.post(`${API_BASE}/translate/document`, formData, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'multipart/form-data'
      },
      timeout: 600000 // 10 minutes for large documents
    });
  },

  async getTranslationHistory() {
    const token = await getToken();
    return axios.get(`${API_BASE}/translate/history`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },
async getTranslationById(id) {
    const token = await getToken();
    return axios.get(`${API_BASE}/translate/history/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  // ─────────────────────────────────────────────
  // FIRM API───────────────────────────────────────────

  async firmSignup(data) {
    return axios.post(`${API_BASE}/firm/signup`, data);
  },

  async firmGetProfile() {
    const token = await getToken();
    return axios.get(`${API_BASE}/firm/profile`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  async firmGetStats() {
    const token = await getToken();
    return axios.get(`${API_BASE}/firm/stats`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  async firmGetMembers() {
    const token = await getToken();
    return axios.get(`${API_BASE}/firm/members`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  async firmInviteEmail(email) {
    const token = await getToken();
    return axios.post(`${API_BASE}/firm/invite-email`, { email }, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  async firmAddMember(data) {
    const token = await getToken();
    return axios.post(`${API_BASE}/firm/add-member`, data, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  async firmJoinWithCode(data) {
    return axios.post(`${API_BASE}/firm/join-with-code`, data);
  },

  async firmRemoveMember(memberId) {
    const token = await getToken();
    return axios.delete(`${API_BASE}/firm/remove-member/${memberId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  async firmResetPassword(memberId, newPassword) {
    const token = await getToken();
    return axios.post(`${API_BASE}/firm/reset-password/${memberId}`, { newPassword }, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  async firmGetDocuments() {
    const token = await getToken();
    return axios.get(`${API_BASE}/firm/documents`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  async firmGetChats() {
    const token = await getToken();
    return axios.get(`${API_BASE}/firm/chats`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  async firmAddCredits(credits) {
    const token = await getToken();
    return axios.post(`${API_BASE}/firm/add-credits`, { credits }, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  async firmDistributeCredits(memberId, credits) {
    const token = await getToken();
    return axios.post(`${API_BASE}/firm/distribute-credits`, { memberId, credits }, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  async firmGetInvites() {
    const token = await getToken();
    return axios.get(`${API_BASE}/firm/invites`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

// ─────────────────────────────────────────────
  // DRAFT REVIEW API
  // ─────────────────────────────────────────────

  async analyseDrafts(files) {
    const token = await getToken();
    const formData = new FormData();
    files.forEach(file => formData.append('drafts', file));
    return axios.post(`${API_BASE}/draft-review/analyse`, formData, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'multipart/form-data'
      },
      timeout: 120000
    });
  },

};

