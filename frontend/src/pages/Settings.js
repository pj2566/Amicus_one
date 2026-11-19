import React, { useState, useEffect } from 'react';
import Icon from '../components/Icon';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import Layout from '../components/Layout';
import toast from 'react-hot-toast';

export default function Settings() {
  const { userProfile, refreshProfile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');

  const [profileForm, setProfileForm] = useState({
    name: '',
    phone: '',
    law_firm: '',
    specialization: ''
  });

  useEffect(() => {
    if (userProfile) {
      setProfileForm({
        name: userProfile.name || '',
        phone: userProfile.phone || '',
        law_firm: userProfile.law_firm || '',
        specialization: userProfile.specialization || ''
      });
    }
  }, [userProfile]);

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateProfile(profileForm);
      await refreshProfile();
      toast.success('Profile updated successfully');
    } catch (err) {
      toast.error('Failed to update profile');
    }
    setSaving(false);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric'
    });
  };

  const getInitials = (name) => {
    return name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || 'LA';
  };

  const tabs = [
    { id: 'profile', label: 'Profile', },
    { id: 'account', label: 'Account' },
    { id: 'preferences', label: 'Preferences' }
  ];

  return (
    <Layout>
      <div className="page-container">

        {/* Page Header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">Settings</h1>
            <p className="page-subtitle">Manage your account and preferences</p>
          </div>
        </div>

        {/* Settings Layout */}
        <div className="settings-layout">

          {/* Tabs */}
          <div className="settings-tabs">
            {tabs.map(tab => (
              <button
                key={tab.id}
                className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="settings-content">

            {/* Profile Tab */}
            {activeTab === 'profile' && (
              <div className="settings-section">
                {/* Avatar */}
                <div className="profile-avatar-section">
                  <div className="profile-avatar-large">
                    {getInitials(userProfile?.name)}
                  </div>
                  <div>
                    <div className="profile-avatar-name">
                      {userProfile?.name || 'Advocate'}
                    </div>
                    <div className="profile-avatar-email">
                      {userProfile?.email}
                    </div>
                    {userProfile?.role === 'admin' && (
                      <span className="admin-badge">Admin</span>
                    )}
                  </div>
                </div>

                <div className="settings-divider" />

                {/* Profile Form */}
                <form onSubmit={handleProfileSave} className="settings-form">
                  <h3 className="settings-form-title">Personal Information</h3>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Full Name</label>
                      <input
                        type="text"
                        value={profileForm.name}
                        onChange={e => setProfileForm(p => ({ ...p, name: e.target.value }))}
                        placeholder="Your full name"
                      />
                    </div>
                    <div className="form-group">
                      <label>Phone Number</label>
                      <input
                        type="tel"
                        value={profileForm.phone}
                        onChange={e => setProfileForm(p => ({ ...p, phone: e.target.value }))}
                        placeholder="+91 XXXXX XXXXX"
                      />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Law Firm Name</label>
                      <input
                        type="text"
                        value={profileForm.law_firm}
                        onChange={e => setProfileForm(p => ({ ...p, law_firm: e.target.value }))}
                        placeholder="Your law firm or chamber"
                      />
                    </div>
                    <div className="form-group">
                      <label>Specialization</label>
                      <select
                        value={profileForm.specialization}
                        onChange={e => setProfileForm(p => ({ ...p, specialization: e.target.value }))}
                      >
                        <option value="">Select specialization</option>
                        <option value="Criminal Law">Criminal Law</option>
                        <option value="Civil Law">Civil Law</option>
                        <option value="Corporate Law">Corporate Law</option>
                        <option value="Family Law">Family Law</option>
                        <option value="Property Law">Property Law</option>
                        <option value="Tax Law">Tax Law</option>
                        <option value="Cyber Law">Cyber Law</option>
                        <option value="Constitutional Law">Constitutional Law</option>
                        <option value="Labour Law">Labour Law</option>
                        <option value="Intellectual Property">Intellectual Property</option>
                        <option value="General Practice">General Practice</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-actions">
                    <button
                      type="submit"
                      className="dash-action-btn primary"
                      disabled={saving}
                    >
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Account Tab */}
            {activeTab === 'account' && (
              <div className="settings-section">
                <h3 className="settings-form-title">Account Information</h3>

                <div className="account-info-grid">
                  <div className="account-info-item">
                    <span className="aii-label">Email Address</span>
                    <span className="aii-value">{userProfile?.email || 'N/A'}</span>
                  </div>
                  <div className="account-info-item">
                    <span className="aii-label">Account Role</span>
                    <span className="aii-value">
                      {userProfile?.role === 'admin' ? 'Administrator' : 'Lawyer'}
                    </span>
                  </div>
                  <div className="account-info-item">
                    <span className="aii-label">Member Since</span>
                    <span className="aii-value">
                      {formatDate(userProfile?.created_at)}
                    </span>
                  </div>
                  <div className="account-info-item">
                    <span className="aii-label">Credits Remaining</span>
                    <span className="aii-value">
                      {userProfile?.credits ?? 0} Credits
                    </span>
                  </div>
                  <div className="account-info-item">
                    <span className="aii-label">Documents Generated</span>
                    <span className="aii-value">
                      {userProfile?.documents_generated ?? 0} Documents
                    </span>
                  </div>
                  <div className="account-info-item">
                    <span className="aii-label">Specialization</span>
                    <span className="aii-value">
                      {userProfile?.specialization || 'Not set'}
                    </span>
                  </div>
                  <div className="account-info-item">
                    <span className="aii-label">Law Firm</span>
                    <span className="aii-value">
                      {userProfile?.law_firm || 'Not set'}
                    </span>
                  </div>
                </div>

                <div className="settings-divider" />

                <div className="account-security">
                  <h3 className="settings-form-title">Security</h3>
                  <div className="security-note">
                    Password and authentication are managed through your
                    email provider. To change your password, use the
                    forgot password option on the login page.
                  </div>
                </div>
              </div>
            )}

            {/* Preferences Tab */}
            {activeTab === 'preferences' && (
              <div className="settings-section">
                <h3 className="settings-form-title">Workspace Preferences</h3>

                <div className="preference-item">
                  <div className="pref-info">
                    <div className="pref-label">Default Language</div>
                    <div className="pref-desc">
                      Default language for document generation
                    </div>
                  </div>
                  <select className="filter-select">
                    <option>English</option>
                    <option>Hindi</option>
                    <option>Marathi</option>
                    <option>Bengali</option>
                    <option>Tamil</option>
                    <option>Kannada</option>
                    <option>Telugu</option>
                  </select>
                </div>

                <div className="preference-item">
                  <div className="pref-info">
                    <div className="pref-label">Default Document Length</div>
                    <div className="pref-desc">
                      Default length when generating documents
                    </div>
                  </div>
                  <select className="filter-select">
                    <option>Medium (3-4 pages)</option>
                    <option>Short (1-2 pages)</option>
                    <option>Detailed (5-6 pages)</option>
                    <option>Comprehensive (8-10 pages)</option>
                  </select>
                </div>

                <div className="preference-item">
                  <div className="pref-info">
                    <div className="pref-label">Notifications</div>
                    <div className="pref-desc">
                      Email notifications for usage and credits
                    </div>
                  </div>
                  <select className="filter-select">
                    <option>Enabled</option>
                    <option>Disabled</option>
                  </select>
                </div>

                <div className="settings-divider" />

                <div className="pref-coming-soon">
                  <span>
                    Preference saving will be available in the next update.
                    These settings are placeholders for upcoming features.
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}