/**
 * SkyVault — Cloud File Storage and Resource Monitoring
 * Frontend Application Logic & Supabase Integration
 * 
 * Strict compliance with:
 * - database/main.sql (profiles, file_metadata, file_activity, storage_usage, activity_summary)
 * - database/bucket.sql ('cloudvault-files' private bucket with RLS)
 */

(function () {
  'use strict';

  // --- Configuration Constants ---
  // Live Supabase project ref extracted from credentials: ivhhznqsjprnhycxypbj
  const SUPABASE_URL = 'https://ivhhznqsjprnhycxypbj.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml2aGh6bnFzanBybmh5Y3h5cGJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwODAxOTMsImV4cCI6MjEwODY1NjE5M30.pbFceS4N6DW0TC625FhXBWJD_7jTDFmQjIquyy2WHkQ';
  const BUCKET_NAME = 'cloudvault-files';

  // --- Application State ---
  const state = {
    supabase: null,
    currentUser: null,
    userProfile: null,
    files: [], // file_metadata records
    activities: [], // file_activity records
    storageUsage: null, // from public.storage_usage or computed
    activitySummary: [], // from public.activity_summary or computed
    currentView: 'dashboard',
    viewMode: 'grid', // 'grid' | 'table'
    fileFilters: {
      search: '',
      category: 'all',
      sort: 'newest'
    },
    activityFilter: 'all',
    uploadQueue: [],
    selectedFileForPreview: null,
    filePendingDuplicate: null,
    charts: {
      doughnut: null,
      operations: null,
      growth: null
    },
    config: {
      storageThresholdMB: parseFloat(localStorage.getItem('skyvault_threshold_mb')) || 500,
      storageRatePerGB: parseFloat(localStorage.getItem('skyvault_rate_gb')) || 0.021,
      requestRatePer1k: parseFloat(localStorage.getItem('skyvault_rate_req')) || 0.005
    },
    isSimulatedMode: false,
    networkErrorCount: 0
  };

  // --- Initialize Supabase Client ---
  function initSupabase() {
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      try {
        state.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
          }
        });
        updateConnectionBadge('connected', 'Supabase Ready');
      } catch (err) {
        console.error('[SkyVault] Error initializing Supabase client:', err);
        updateConnectionBadge('offline', 'Init Error');
        showToast('Supabase Client Error', err.message, 'error');
      }
    } else {
      console.warn('[SkyVault] Supabase JS SDK not loaded yet. Retrying...');
      setTimeout(initSupabase, 500);
    }
  }

  // --- UI Elements Cache ---
  const UI = {
    // Auth elements
    authScreen: document.getElementById('authScreen'),
    appShell: document.getElementById('appShell'),
    authForm: document.getElementById('authForm'),
    tabSignIn: document.getElementById('tabSignIn'),
    tabSignUp: document.getElementById('tabSignUp'),
    fullNameGroup: document.getElementById('fullNameGroup'),
    fullNameInput: document.getElementById('fullNameInput'),
    emailInput: document.getElementById('emailInput'),
    passwordInput: document.getElementById('passwordInput'),
    togglePasswordBtn: document.getElementById('togglePasswordBtn'),
    authSubmitBtn: document.getElementById('authSubmitBtn'),
    authAlert: document.getElementById('authAlert'),
    authDiagnosticBtn: document.getElementById('authDiagnosticBtn'),

    // Shell & Navigation
    sidebar: document.getElementById('sidebar'),
    sidebarBackdrop: document.getElementById('sidebarBackdrop'),
    mobileMenuBtn: document.getElementById('mobileMenuBtn'),
    closeSidebarBtn: document.getElementById('closeSidebarBtn'),
    currentViewTitle: document.getElementById('currentViewTitle'),
    connectionStatusBadge: document.getElementById('connectionStatusBadge'),
    connectionStatusText: document.getElementById('connectionStatusText'),
    topThresholdWarning: document.getElementById('topThresholdWarning'),
    openSettingsModalBtn: document.getElementById('openSettingsModalBtn'),
    topUploadBtn: document.getElementById('topUploadBtn'),
    sidebarUploadBtn: document.getElementById('sidebarUploadBtn'),
    signOutBtn: document.getElementById('signOutBtn'),
    userAvatar: document.getElementById('userAvatar'),
    userDisplayName: document.getElementById('userDisplayName'),
    userEmailDisplay: document.getElementById('userEmailDisplay'),
    sidebarFileBadge: document.getElementById('sidebarFileBadge'),
    sidebarStoragePercent: document.getElementById('sidebarStoragePercent'),
    sidebarProgressBar: document.getElementById('sidebarProgressBar'),
    sidebarStorageUsed: document.getElementById('sidebarStorageUsed'),
    sidebarStorageLimit: document.getElementById('sidebarStorageLimit'),

    // Banners
    storageThresholdAlert: document.getElementById('storageThresholdAlert'),
    alertUsageText: document.getElementById('alertUsageText'),
    alertThresholdText: document.getElementById('alertThresholdText'),
    bannerConfigThresholdBtn: document.getElementById('bannerConfigThresholdBtn'),
    networkDiagnosticBanner: document.getElementById('networkDiagnosticBanner'),
    networkDiagnosticMsg: document.getElementById('networkDiagnosticMsg'),
    networkRetryBtn: document.getElementById('networkRetryBtn'),

    // Views
    views: {
      dashboard: document.getElementById('viewDashboard'),
      files: document.getElementById('viewFiles'),
      monitoring: document.getElementById('viewMonitoring'),
      activity: document.getElementById('viewActivity')
    },
    navLinks: {
      dashboard: document.getElementById('navDashboard'),
      files: document.getElementById('navFiles'),
      monitoring: document.getElementById('navMonitoring'),
      activity: document.getElementById('navActivity')
    },

    // Dashboard View Elements
    dashTotalStorageMB: document.getElementById('dashTotalStorageMB'),
    dashTotalStorageGB: document.getElementById('dashTotalStorageGB'),
    dashStorageProgress: document.getElementById('dashStorageProgress'),
    dashThresholdPercent: document.getElementById('dashThresholdPercent'),
    dashThresholdLimit: document.getElementById('dashThresholdLimit'),
    dashTotalFiles: document.getElementById('dashTotalFiles'),
    dashSuccessRate: document.getElementById('dashSuccessRate'),
    dashOpsCount: document.getElementById('dashOpsCount'),
    dashSuccessOps: document.getElementById('dashSuccessOps'),
    dashFailedOps: document.getElementById('dashFailedOps'),
    dashAvgDuration: document.getElementById('dashAvgDuration'),
    dashAvgUploadDuration: document.getElementById('dashAvgUploadDuration'),
    dashAvgDownloadDuration: document.getElementById('dashAvgDownloadDuration'),
    dashCostEstimate: document.getElementById('dashCostEstimate'),
    dashboardDropzone: document.getElementById('dashboardDropzone'),
    dashFileInput: document.getElementById('dashFileInput'),
    dashBrowseBtn: document.getElementById('dashBrowseBtn'),
    dashUploadActionBtn: document.getElementById('dashUploadActionBtn'),
    dashRecentFilesList: document.getElementById('dashRecentFilesList'),
    dashActivityFeed: document.getElementById('dashActivityFeed'),
    dashViewAllFilesBtn: document.getElementById('dashViewAllFilesBtn'),
    dashViewAllActivityBtn: document.getElementById('dashViewAllActivityBtn'),
    dashViewRatesBtn: document.getElementById('dashViewRatesBtn'),
    refreshDashBtn: document.getElementById('refreshDashBtn'),
    storageTypeLegend: document.getElementById('storageTypeLegend'),

    // Files View Elements
    fileSearchInput: document.getElementById('fileSearchInput'),
    clearSearchBtn: document.getElementById('clearSearchBtn'),
    fileSortSelect: document.getElementById('fileSortSelect'),
    toggleGridViewBtn: document.getElementById('toggleGridViewBtn'),
    toggleTableViewBtn: document.getElementById('toggleTableViewBtn'),
    filesDropzone: document.getElementById('filesDropzone'),
    filesViewFileInput: document.getElementById('filesViewFileInput'),
    filesBrowseLink: document.getElementById('filesBrowseLink'),
    filesGridContainer: document.getElementById('filesGridContainer'),
    filesTableContainer: document.getElementById('filesTableContainer'),
    filesTableBody: document.getElementById('filesTableBody'),
    filesEmptyState: document.getElementById('filesEmptyState'),
    emptyStateTitle: document.getElementById('emptyStateTitle'),
    emptyStateDesc: document.getElementById('emptyStateDesc'),
    emptyStateUploadBtn: document.getElementById('emptyStateUploadBtn'),
    filesUploadBtn: document.getElementById('filesUploadBtn'),

    // Monitoring View Elements
    refreshMonitoringBtn: document.getElementById('refreshMonitoringBtn'),
    monUsagePercent: document.getElementById('monUsagePercent'),
    monUsageMB: document.getElementById('monUsageMB'),
    monThresholdMB: document.getElementById('monThresholdMB'),
    monProgressBar: document.getElementById('monProgressBar'),
    monAvgUpload: document.getElementById('monAvgUpload'),
    monUploadCount: document.getElementById('monUploadCount'),
    monAvgDownload: document.getElementById('monAvgDownload'),
    monDownloadCount: document.getElementById('monDownloadCount'),
    monProjectedCost: document.getElementById('monProjectedCost'),
    monConfigRatesLink: document.getElementById('monConfigRatesLink'),
    costStorageUsageCell: document.getElementById('costStorageUsageCell'),
    costStorageRateCell: document.getElementById('costStorageRateCell'),
    costStorageSubtotalCell: document.getElementById('costStorageSubtotalCell'),
    costRequestsUsageCell: document.getElementById('costRequestsUsageCell'),
    costRequestsRateCell: document.getElementById('costRequestsRateCell'),
    costRequestsSubtotalCell: document.getElementById('costRequestsSubtotalCell'),
    costTotalCell: document.getElementById('costTotalCell'),
    thresholdInput: document.getElementById('thresholdInput'),
    costRateInput: document.getElementById('costRateInput'),
    requestRateInput: document.getElementById('requestRateInput'),
    saveThresholdBtn: document.getElementById('saveThresholdBtn'),
    saveAllRatesBtn: document.getElementById('saveAllRatesBtn'),

    // Activity View Elements
    refreshActivityBtn: document.getElementById('refreshActivityBtn'),
    activityCountDisplay: document.getElementById('activityCountDisplay'),
    activityTableBody: document.getElementById('activityTableBody'),
    activityEmptyState: document.getElementById('activityEmptyState'),

    // Modals
    uploadModal: document.getElementById('uploadModal'),
    closeUploadModalBtn: document.getElementById('closeUploadModalBtn'),
    modalDropzone: document.getElementById('modalDropzone'),
    modalFileInput: document.getElementById('modalFileInput'),
    modalBrowseBtn: document.getElementById('modalBrowseBtn'),
    uploadQueueSection: document.getElementById('uploadQueueSection'),
    queueCount: document.getElementById('queueCount'),
    clearQueueBtn: document.getElementById('clearQueueBtn'),
    uploadQueueList: document.getElementById('uploadQueueList'),
    uploadProgressSection: document.getElementById('uploadProgressSection'),
    uploadProgressStatusText: document.getElementById('uploadProgressStatusText'),
    uploadProgressPercent: document.getElementById('uploadProgressPercent'),
    uploadProgressBar: document.getElementById('uploadProgressBar'),
    cancelUploadBtn: document.getElementById('cancelUploadBtn'),
    startUploadBtn: document.getElementById('startUploadBtn'),

    duplicateModal: document.getElementById('duplicateModal'),
    duplicateFileName: document.getElementById('duplicateFileName'),
    duplicateRenamedExample: document.getElementById('duplicateRenamedExample'),
    dupReplaceBtn: document.getElementById('dupReplaceBtn'),
    dupKeepBothBtn: document.getElementById('dupKeepBothBtn'),
    dupCancelBtn: document.getElementById('dupCancelBtn'),

    previewModal: document.getElementById('previewModal'),
    closePreviewModalBtn: document.getElementById('closePreviewModalBtn'),
    closePreviewBtn: document.getElementById('closePreviewBtn'),
    previewModalTitle: document.getElementById('previewModalTitle'),
    previewStoragePath: document.getElementById('previewStoragePath'),
    previewMediaContainer: document.getElementById('previewMediaContainer'),
    previewSize: document.getElementById('previewSize'),
    previewMime: document.getElementById('previewMime'),
    previewCreated: document.getElementById('previewCreated'),
    previewDbId: document.getElementById('previewDbId'),
    previewDeleteBtn: document.getElementById('previewDeleteBtn'),
    previewDownloadBtn: document.getElementById('previewDownloadBtn'),

    deleteModal: document.getElementById('deleteModal'),
    deleteTargetFileName: document.getElementById('deleteTargetFileName'),
    deleteTargetFileSize: document.getElementById('deleteTargetFileSize'),
    cancelDeleteBtn: document.getElementById('cancelDeleteBtn'),
    confirmDeleteBtn: document.getElementById('confirmDeleteBtn'),

    settingsModal: document.getElementById('settingsModal'),
    closeSettingsModalBtn: document.getElementById('closeSettingsModalBtn'),
    cancelSettingsBtn: document.getElementById('cancelSettingsBtn'),
    saveSettingsModalBtn: document.getElementById('saveSettingsModalBtn'),
    modalThresholdInput: document.getElementById('modalThresholdInput'),
    modalStorageRateInput: document.getElementById('modalStorageRateInput'),
    modalRequestRateInput: document.getElementById('modalRequestRateInput'),
    diagSessionStatus: document.getElementById('diagSessionStatus'),

    // Toast & Drop Overlay
    toastContainer: document.getElementById('toastContainer'),
    globalDropOverlay: document.getElementById('globalDropOverlay')
  };

  // ==========================================================================
  // UTILITY FUNCTIONS
  // ==========================================================================

  function formatBytes(bytes, decimals = 2) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  function bytesToMB(bytes) {
    if (!bytes || bytes === 0) return 0;
    return parseFloat((bytes / (1024 * 1024)).toFixed(2));
  }

  function bytesToGB(bytes) {
    if (!bytes || bytes === 0) return 0;
    return parseFloat((bytes / (1024 * 1024 * 1024)).toFixed(4));
  }

  function formatDate(isoString) {
    if (!isoString) return 'Just now';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoString;
    }
  }

  function formatRelativeTime(isoString) {
    if (!isoString) return 'Just now';
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffSecs = Math.round((now - date) / 1000);
      if (diffSecs < 10) return 'Just now';
      if (diffSecs < 60) return `${diffSecs}s ago`;
      const diffMins = Math.round(diffSecs / 60);
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.round(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.round(diffHours / 24);
      if (diffDays < 30) return `${diffDays}d ago`;
      return formatDate(isoString);
    } catch {
      return isoString;
    }
  }

  function getFileCategory(mimeType, fileName) {
    const ext = fileName ? fileName.split('.').pop().toLowerCase() : '';
    const mime = (mimeType || '').toLowerCase();

    if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(ext)) {
      return 'image';
    }
    if (mime.startsWith('video/') || mime.startsWith('audio/') || ['mp4', 'mkv', 'avi', 'mov', 'mp3', 'wav', 'flac', 'ogg'].includes(ext)) {
      return 'media';
    }
    if (mime.includes('pdf') || mime.includes('document') || mime.includes('word') || mime.includes('sheet') || mime.includes('presentation') || ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf'].includes(ext)) {
      return 'document';
    }
    if (mime.includes('zip') || mime.includes('compressed') || mime.includes('tar') || mime.includes('archive') || ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)) {
      return 'archive';
    }
    if (mime.includes('json') || mime.includes('javascript') || mime.includes('html') || mime.includes('css') || ['js', 'ts', 'jsx', 'tsx', 'html', 'css', 'json', 'py', 'java', 'c', 'cpp', 'rs', 'go', 'sql', 'sh', 'md'].includes(ext)) {
      return 'code';
    }
    return 'other';
  }

  function getFileIconSVG(category) {
    switch (category) {
      case 'image':
        return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`;
      case 'media':
        return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg>`;
      case 'document':
        return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`;
      case 'archive':
        return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line></svg>`;
      case 'code':
        return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>`;
      default:
        return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`;
    }
  }

  function getCategoryColorClass(category) {
    switch (category) {
      case 'image': return 'icon-cyan';
      case 'media': return 'icon-indigo';
      case 'document': return 'icon-emerald';
      case 'archive': return 'icon-amber';
      case 'code': return 'icon-cyan';
      default: return 'icon-indigo';
    }
  }

  // --- Toast Notification System ---
  function showToast(title, message, type = 'info', duration = 4000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'alert');

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
    } else if (type === 'error') {
      iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
    } else if (type === 'warning') {
      iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
    } else {
      iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }

    toast.innerHTML = `
      <div class="toast-icon">${iconSvg}</div>
      <div class="toast-content">
        <div class="toast-title">${escapeHTML(title)}</div>
        <div class="toast-msg">${escapeHTML(message)}</div>
      </div>
      <button class="toast-close" aria-label="Close notification">&times;</button>
    `;

    toast.querySelector('.toast-close').addEventListener('click', () => {
      dismissToast(toast);
    });

    UI.toastContainer.appendChild(toast);

    if (duration > 0) {
      setTimeout(() => {
        dismissToast(toast);
      }, duration);
    }
  }

  function dismissToast(toast) {
    if (!toast || toast.classList.contains('toast-exit')) return;
    toast.classList.add('toast-exit');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }

  function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function updateConnectionBadge(status, text) {
    UI.connectionStatusBadge.className = 'connection-pill';
    if (status === 'connected') {
      UI.connectionStatusBadge.classList.add('status-connected');
    } else if (status === 'connecting') {
      UI.connectionStatusBadge.classList.add('status-connecting');
    } else {
      UI.connectionStatusBadge.classList.add('status-offline');
    }
    UI.connectionStatusText.textContent = text || (status === 'connected' ? 'Supabase Online' : 'Connecting...');
  }

  // ==========================================================================
  // AUTHENTICATION CONTROLLER
  // ==========================================================================

  let isSignUpMode = false;

  function setAuthMode(signUp) {
    isSignUpMode = signUp;
    if (signUp) {
      UI.tabSignUp.classList.add('active');
      UI.tabSignUp.setAttribute('aria-selected', 'true');
      UI.tabSignIn.classList.remove('active');
      UI.tabSignIn.setAttribute('aria-selected', 'false');
      UI.fullNameGroup.classList.remove('hidden');
      UI.authSubmitBtn.querySelector('.btn-text').textContent = 'Create Account';
      UI.authAlert.classList.add('hidden');
    } else {
      UI.tabSignIn.classList.add('active');
      UI.tabSignIn.setAttribute('aria-selected', 'true');
      UI.tabSignUp.classList.remove('active');
      UI.tabSignUp.setAttribute('aria-selected', 'false');
      UI.fullNameGroup.classList.add('hidden');
      UI.authSubmitBtn.querySelector('.btn-text').textContent = 'Sign In';
      UI.authAlert.classList.add('hidden');
    }
  }

  async function handleAuthSubmit(e) {
    e.preventDefault();
    const email = UI.emailInput.value.trim();
    const password = UI.passwordInput.value;
    const fullName = UI.fullNameInput.value.trim();

    if (!email || !password) {
      showAuthAlert('Please enter both your email address and password.', 'error');
      return;
    }

    if (password.length < 6) {
      showAuthAlert('Password must be at least 6 characters long.', 'error');
      return;
    }

    setButtonLoading(UI.authSubmitBtn, true);
    UI.authAlert.classList.add('hidden');

    try {
      if (isSignUpMode) {
        // Sign Up with Supabase Auth
        const { data, error } = await state.supabase.auth.signUp({
          email: email,
          password: password,
          options: {
            data: { full_name: fullName || 'User' }
          }
        });

        if (error) throw error;

        if (data?.user) {
          // Attempt profile upsert into public.profiles
          if (fullName) {
            try {
              await state.supabase.from('profiles').upsert({
                id: data.user.id,
                full_name: fullName
              });
            } catch (profErr) {
              console.warn('[SkyVault] Profile insert note:', profErr);
            }
          }

          if (data.session) {
            showToast('Account Created', 'Welcome to SkyVault!', 'success');
            onUserAuthenticated(data.user);
          } else {
            showAuthAlert('Account created successfully! Please check your email to confirm registration or sign in.', 'success');
          }
        }
      } else {
        // Sign In with Supabase Auth
        const { data, error } = await state.supabase.auth.signInWithPassword({
          email: email,
          password: password
        });

        if (error) throw error;

        if (data?.user) {
          showToast('Signed In', `Welcome back, ${data.user.email}!`, 'success');
          onUserAuthenticated(data.user);
        }
      }
    } catch (err) {
      console.error('[SkyVault] Authentication error:', err);
      state.networkErrorCount++;
      handleNetworkOrAuthError(err);
    } finally {
      setButtonLoading(UI.authSubmitBtn, false);
    }
  }

  function showAuthAlert(msg, type = 'error') {
    UI.authAlert.className = `auth-alert alert-${type}`;
    UI.authAlert.innerHTML = `<span>${escapeHTML(msg)}</span>`;
    UI.authAlert.classList.remove('hidden');
  }

  async function handleSignOut() {
    try {
      if (state.supabase) {
        await state.supabase.auth.signOut();
      }
    } catch (err) {
      console.warn('[SkyVault] Sign out notice:', err);
    }
    state.currentUser = null;
    state.userProfile = null;
    state.files = [];
    state.activities = [];
    destroyCharts();
    UI.appShell.classList.add('hidden');
    UI.authScreen.classList.remove('hidden');
    showToast('Signed Out', 'You have been safely signed out.', 'info');
  }

  function onUserAuthenticated(user) {
    state.currentUser = user;
    UI.authScreen.classList.add('hidden');
    UI.appShell.classList.remove('hidden');

    // Update user display
    const userEmail = user.email || 'user@vault.local';
    UI.userEmailDisplay.textContent = userEmail;
    const initial = userEmail.charAt(0).toUpperCase();
    UI.userAvatar.textContent = initial;

    // Load user profile from public.profiles
    loadUserProfile(user.id, userEmail);

    // Initial data fetch
    fetchUserData();
  }

  async function loadUserProfile(userId, fallbackEmail) {
    try {
      const { data, error } = await state.supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (data && data.full_name) {
        state.userProfile = data;
        UI.userDisplayName.textContent = data.full_name;
        UI.userAvatar.textContent = data.full_name.charAt(0).toUpperCase();
      } else {
        const username = fallbackEmail.split('@')[0];
        UI.userDisplayName.textContent = username;
      }
    } catch (err) {
      UI.userDisplayName.textContent = fallbackEmail.split('@')[0];
    }
  }

  // --- Network Resilience & Diagnostic Fallback ---
  function handleNetworkOrAuthError(err) {
    let msg = err.message || 'An unexpected error occurred.';
    
    // Check for host resolution, network offline, or failed to fetch
    const isNetworkFailure = msg.includes('Failed to fetch') ||
      msg.includes('NetworkError') ||
      msg.includes('Load failed') ||
      msg.includes('ERR_NAME_NOT_RESOLVED') ||
      !window.navigator.onLine;

    if (isNetworkFailure) {
      msg = `Unable to reach Supabase project (${SUPABASE_URL}). Please verify your network or check if the project is active.`;
      updateConnectionBadge('offline', 'Network Offline');
      showNetworkDiagnostic(msg);
      
      // Also provide fallback demo access option on auth screen if network fails
      showAuthAlert(
        `${msg} Would you like to enter in Offline Preview Mode to inspect the dashboard?`,
        'error'
      );
      addOfflinePreviewButtonToAuth();
    } else {
      showAuthAlert(msg, 'error');
    }
  }

  function addOfflinePreviewButtonToAuth() {
    if (document.getElementById('offlinePreviewBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'offlinePreviewBtn';
    btn.type = 'button';
    btn.className = 'btn btn-secondary btn-block';
    btn.style.marginTop = '12px';
    btn.innerHTML = `<span>Explore with Demo Sandbox</span>`;
    btn.addEventListener('click', () => {
      enableSimulatedMode();
    });
    UI.authAlert.appendChild(btn);
  }

  function showNetworkDiagnostic(msg) {
    UI.networkDiagnosticMsg.innerHTML = `<strong>Network Notice:</strong> ${escapeHTML(msg)}`;
    UI.networkDiagnosticBanner.classList.remove('hidden');
  }

  function enableSimulatedMode() {
    state.isSimulatedMode = true;
    const demoUser = {
      id: '00000000-0000-4000-a000-000000000001',
      email: 'demo@skyvault.io'
    };
    showToast('Sandbox Active', 'Running with client sandbox for testing and UI demonstration.', 'warning');
    populateSampleData(demoUser.id);
    onUserAuthenticated(demoUser);
  }

  function populateSampleData(userId) {
    const now = Date.now();
    state.files = [
      {
        id: 1,
        user_id: userId,
        file_name: 'Quarterly_Financial_Report.pdf',
        storage_path: `${userId}/1729001000_Quarterly_Financial_Report.pdf`,
        file_size: 4250000,
        mime_type: 'application/pdf',
        created_at: new Date(now - 86400000 * 2).toISOString()
      },
      {
        id: 2,
        user_id: userId,
        file_name: 'Architecture_Blueprint_v2.png',
        storage_path: `${userId}/1729002000_Architecture_Blueprint_v2.png`,
        file_size: 8900000,
        mime_type: 'image/png',
        created_at: new Date(now - 86400000 * 1).toISOString()
      },
      {
        id: 3,
        user_id: userId,
        file_name: 'Database_Backup_2026.zip',
        storage_path: `${userId}/1729003000_Database_Backup_2026.zip`,
        file_size: 45600000,
        mime_type: 'application/zip',
        created_at: new Date(now - 3600000 * 5).toISOString()
      },
      {
        id: 4,
        user_id: userId,
        file_name: 'CloudVault_Schema.sql',
        storage_path: `${userId}/1729004000_CloudVault_Schema.sql`,
        file_size: 45000,
        mime_type: 'text/plain',
        created_at: new Date(now - 3600000 * 2).toISOString()
      }
    ];

    state.activities = [
      {
        id: 101,
        user_id: userId,
        file_id: 1,
        action: 'upload',
        file_size: 4250000,
        duration_ms: 320,
        success: true,
        created_at: new Date(now - 86400000 * 2).toISOString()
      },
      {
        id: 102,
        user_id: userId,
        file_id: 2,
        action: 'upload',
        file_size: 8900000,
        duration_ms: 540,
        success: true,
        created_at: new Date(now - 86400000 * 1).toISOString()
      },
      {
        id: 103,
        user_id: userId,
        file_id: 1,
        action: 'download',
        file_size: 4250000,
        duration_ms: 180,
        success: true,
        created_at: new Date(now - 86400000 * 1 + 3600000).toISOString()
      },
      {
        id: 104,
        user_id: userId,
        file_id: 3,
        action: 'upload',
        file_size: 45600000,
        duration_ms: 1450,
        success: true,
        created_at: new Date(now - 3600000 * 5).toISOString()
      },
      {
        id: 105,
        user_id: userId,
        file_id: 4,
        action: 'upload',
        file_size: 45000,
        duration_ms: 85,
        success: true,
        created_at: new Date(now - 3600000 * 2).toISOString()
      }
    ];
  }

  // ==========================================================================
  // DATA CONTROLLER (SUPABASE QUERIES & RLS SYNC)
  // ==========================================================================

  async function fetchUserData() {
    if (!state.currentUser) return;
    updateConnectionBadge('connecting', 'Syncing Data...');

    if (state.isSimulatedMode) {
      renderAllViews();
      updateConnectionBadge('connected', 'Sandbox Mode');
      return;
    }

    try {
      // 1. Fetch file_metadata (RLS: user_id = auth.uid())
      const { data: filesData, error: filesError } = await state.supabase
        .from('file_metadata')
        .select('*')
        .order('created_at', { ascending: false });

      if (filesError) throw filesError;
      state.files = filesData || [];

      // 2. Fetch file_activity (RLS: user_id = auth.uid())
      const { data: activityData, error: activityError } = await state.supabase
        .from('file_activity')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (activityError) {
        console.warn('[SkyVault] Activity log fetch notice:', activityError);
        state.activities = [];
      } else {
        state.activities = activityData || [];
      }

      // 3. Query security_invoker views: storage_usage & activity_summary
      await fetchViewsData();

      updateConnectionBadge('connected', 'Supabase Online');
      UI.networkDiagnosticBanner.classList.add('hidden');
    } catch (err) {
      console.error('[SkyVault] Fetch user data error:', err);
      state.networkErrorCount++;
      handleNetworkOrAuthError(err);
    } finally {
      renderAllViews();
    }
  }

  async function fetchViewsData() {
    try {
      // View 1: public.storage_usage
      const { data: usageData, error: usageErr } = await state.supabase
        .from('storage_usage')
        .select('*')
        .maybeSingle();

      if (!usageErr && usageData) {
        state.storageUsage = usageData;
      } else {
        // Fallback: compute from state.files
        computeStorageUsageFallback();
      }

      // View 2: public.activity_summary
      const { data: summaryData, error: summaryErr } = await state.supabase
        .from('activity_summary')
        .select('*');

      if (!summaryErr && summaryData) {
        state.activitySummary = summaryData;
      } else {
        computeActivitySummaryFallback();
      }
    } catch (viewErr) {
      console.warn('[SkyVault] Views computation notice:', viewErr);
      computeStorageUsageFallback();
      computeActivitySummaryFallback();
    }
  }

  function computeStorageUsageFallback() {
    const totalFiles = state.files.length;
    const totalBytes = state.files.reduce((sum, f) => sum + (Number(f.file_size) || 0), 0);
    const totalMB = bytesToMB(totalBytes);
    state.storageUsage = {
      user_id: state.currentUser ? state.currentUser.id : null,
      total_files: totalFiles,
      total_bytes: totalBytes,
      total_mb: totalMB
    };
  }

  function computeActivitySummaryFallback() {
    const actions = ['upload', 'download', 'delete'];
    state.activitySummary = actions.map(act => {
      const filtered = state.activities.filter(a => a.action === act);
      const totalOps = filtered.length;
      const successOps = filtered.filter(a => a.success).length;
      const failedOps = totalOps - successOps;
      const totalDuration = filtered.reduce((sum, a) => sum + (Number(a.duration_ms) || 0), 0);
      const avgDuration = totalOps > 0 ? parseFloat((totalDuration / totalOps).toFixed(2)) : 0;
      const totalBytes = filtered.filter(a => a.success).reduce((sum, a) => sum + (Number(a.file_size) || 0), 0);

      return {
        action: act,
        total_operations: totalOps,
        successful_operations: successOps,
        failed_operations: failedOps,
        avg_duration_ms: avgDuration,
        total_bytes_processed: totalBytes
      };
    });
  }

  // ==========================================================================
  // STORAGE & FILE OPERATIONS (BUCKET & RLS POLICIES)
  // ==========================================================================

  /**
   * Helper: Sanitizes filename and enforces the exact path pattern:
   * (storage.foldername(name))[1] = auth.uid()::TEXT
   */
  function buildStoragePath(fileName) {
    if (!state.currentUser) throw new Error('Unauthenticated user');
    const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${state.currentUser.id}/${Date.now()}_${sanitized}`;
  }

  /**
   * Log file activity directly into public.file_activity table
   */
  async function logActivity(action, fileId, fileSize, durationMs, success) {
    if (!state.currentUser) return;
    const record = {
      user_id: state.currentUser.id,
      file_id: fileId || null,
      action: action, // 'upload' | 'download' | 'delete'
      file_size: fileSize || 0,
      duration_ms: Math.round(durationMs || 0),
      success: !!success
    };

    if (state.isSimulatedMode) {
      record.id = Date.now();
      record.created_at = new Date().toISOString();
      state.activities.unshift(record);
      return;
    }

    try {
      const { data, error } = await state.supabase
        .from('file_activity')
        .insert(record)
        .select()
        .single();

      if (!error && data) {
        state.activities.unshift(data);
      }
    } catch (logErr) {
      console.warn('[SkyVault] Failed to log activity to public.file_activity:', logErr);
    }
  }

  /**
   * Handles file upload with timing, metadata insertion, and activity logging
   */
  async function uploadSingleFile(file, customFileName = null) {
    const originalName = customFileName || file.name;
    const storagePath = buildStoragePath(originalName);
    const startTime = performance.now();

    if (state.isSimulatedMode) {
      // Sandbox simulation
      await new Promise(r => setTimeout(r, 600));
      const durationMs = performance.now() - startTime;
      const simulatedFile = {
        id: Date.now(),
        user_id: state.currentUser.id,
        file_name: originalName,
        storage_path: storagePath,
        file_size: file.size,
        mime_type: file.type || 'application/octet-stream',
        created_at: new Date().toISOString()
      };
      state.files.unshift(simulatedFile);
      await logActivity('upload', simulatedFile.id, file.size, durationMs, true);
      return simulatedFile;
    }

    try {
      // 1. Upload to Supabase Storage bucket 'cloudvault-files'
      const { data: storageData, error: storageError } = await state.supabase.storage
        .from(BUCKET_NAME)
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (storageError) throw storageError;

      const durationMs = performance.now() - startTime;

      // 2. Insert record into public.file_metadata table
      const { data: metaData, error: metaError } = await state.supabase
        .from('file_metadata')
        .insert({
          user_id: state.currentUser.id,
          file_name: originalName,
          storage_path: storagePath,
          file_size: file.size,
          mime_type: file.type || 'application/octet-stream'
        })
        .select()
        .single();

      if (metaError) throw metaError;

      // 3. Log activity to public.file_activity table
      await logActivity('upload', metaData.id, file.size, durationMs, true);

      // Add to local state
      state.files.unshift(metaData);
      return metaData;
    } catch (err) {
      const durationMs = performance.now() - startTime;
      console.error('[SkyVault] Upload failed:', err);
      await logActivity('upload', null, file.size, durationMs, false);
      throw err;
    }
  }

  /**
   * Download a file securely with duration timing and activity logging
   */
  async function downloadFile(file) {
    const startTime = performance.now();
    showToast('Download Initiated', `Fetching ${file.file_name}...`, 'info');

    if (state.isSimulatedMode) {
      await new Promise(r => setTimeout(r, 300));
      const durationMs = performance.now() - startTime;
      // Trigger dummy download
      const dummyBlob = new Blob([`SkyVault simulated content for ${file.file_name}`], { type: file.mime_type || 'text/plain' });
      triggerBrowserDownload(dummyBlob, file.file_name);
      await logActivity('download', file.id, file.file_size, durationMs, true);
      showToast('Download Complete', `${file.file_name} downloaded successfully (${Math.round(durationMs)} ms).`, 'success');
      renderAllViews();
      return;
    }

    try {
      // Download via Supabase Storage
      const { data: blob, error } = await state.supabase.storage
        .from(BUCKET_NAME)
        .download(file.storage_path);

      if (error) throw error;

      const durationMs = performance.now() - startTime;
      triggerBrowserDownload(blob, file.file_name);

      await logActivity('download', file.id, file.file_size, durationMs, true);
      showToast('Download Complete', `${file.file_name} downloaded in ${Math.round(durationMs)} ms`, 'success');
      fetchUserData();
    } catch (err) {
      const durationMs = performance.now() - startTime;
      console.error('[SkyVault] Download error:', err);
      await logActivity('download', file.id, file.file_size, durationMs, false);
      showToast('Download Failed', err.message || 'Could not download file.', 'error');
    }
  }

  function triggerBrowserDownload(blob, fileName) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      window.URL.revokeObjectURL(url);
      if (a.parentNode) a.parentNode.removeChild(a);
    }, 100);
  }

  /**
   * Delete a file with confirmation, storage removal, and activity logging
   */
  async function deleteFile(file) {
    const startTime = performance.now();

    if (state.isSimulatedMode) {
      await new Promise(r => setTimeout(r, 300));
      const durationMs = performance.now() - startTime;
      state.files = state.files.filter(f => f.id !== file.id);
      await logActivity('delete', file.id, file.file_size, durationMs, true);
      showToast('File Deleted', `${file.file_name} has been permanently deleted.`, 'info');
      renderAllViews();
      return;
    }

    try {
      // 1. Remove from Supabase Storage
      const { error: storageError } = await state.supabase.storage
        .from(BUCKET_NAME)
        .remove([file.storage_path]);

      if (storageError) {
        console.warn('[SkyVault] Storage delete warning:', storageError);
      }

      // 2. Delete metadata from public.file_metadata
      const { error: metaError } = await state.supabase
        .from('file_metadata')
        .delete()
        .eq('id', file.id);

      if (metaError) throw metaError;

      const durationMs = performance.now() - startTime;
      // 3. Log delete action to public.file_activity
      await logActivity('delete', file.id, file.file_size, durationMs, true);

      state.files = state.files.filter(f => f.id !== file.id);
      showToast('File Deleted', `${file.file_name} was deleted successfully.`, 'info');
      fetchUserData();
    } catch (err) {
      const durationMs = performance.now() - startTime;
      console.error('[SkyVault] Delete failed:', err);
      await logActivity('delete', file.id, file.file_size, durationMs, false);
      showToast('Delete Failed', err.message || 'Unable to delete file.', 'error');
    }
  }

  // ==========================================================================
  // UPLOAD QUEUE & DUPLICATE RESOLUTION
  // ==========================================================================

  function addFilesToQueue(fileList) {
    if (!fileList || fileList.length === 0) return;
    const filesArray = Array.from(fileList);

    filesArray.forEach(file => {
      state.uploadQueue.push(file);
    });

    renderUploadQueue();
    openUploadModal();
  }

  function renderUploadQueue() {
    UI.uploadQueueList.innerHTML = '';
    const count = state.uploadQueue.length;
    UI.queueCount.textContent = count;

    if (count > 0) {
      UI.uploadQueueSection.classList.remove('hidden');
      UI.startUploadBtn.disabled = false;

      state.uploadQueue.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'queue-item';
        item.innerHTML = `
          <div class="queue-item-meta">
            <span class="text-cyan">${getFileIconSVG(getFileCategory(file.type, file.name))}</span>
            <div>
              <div class="queue-item-name">${escapeHTML(file.name)}</div>
              <div class="queue-item-size">${formatBytes(file.size)} &bull; ${file.type || 'file'}</div>
            </div>
          </div>
          <button type="button" class="icon-btn-ghost queue-remove-btn" data-index="${index}" title="Remove file">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        `;
        UI.uploadQueueList.appendChild(item);
      });

      UI.uploadQueueList.querySelectorAll('.queue-remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const idx = parseInt(e.currentTarget.getAttribute('data-index'), 10);
          state.uploadQueue.splice(idx, 1);
          renderUploadQueue();
        });
      });
    } else {
      UI.uploadQueueSection.classList.add('hidden');
      UI.startUploadBtn.disabled = true;
    }
  }

  async function processUploadQueue() {
    if (state.uploadQueue.length === 0) return;

    setButtonLoading(UI.startUploadBtn, true);
    UI.uploadProgressSection.classList.remove('hidden');
    UI.uploadProgressBar.style.width = '0%';
    UI.uploadProgressPercent.textContent = '0%';

    const total = state.uploadQueue.length;
    let completed = 0;
    let successful = 0;

    for (let i = 0; i < state.uploadQueue.length; i++) {
      const file = state.uploadQueue[i];
      UI.uploadProgressStatusText.textContent = `Uploading (${i + 1}/${total}): ${file.name}...`;

      // Check for duplicate filename in existing vault
      const duplicate = state.files.find(f => f.file_name.toLowerCase() === file.name.toLowerCase());
      if (duplicate) {
        // Pause and prompt user
        const resolution = await promptDuplicateResolution(file);
        if (resolution === 'cancel') {
          completed++;
          continue;
        } else if (resolution === 'replace') {
          // Delete old file first
          await deleteFile(duplicate);
        } else if (resolution === 'rename') {
          // Auto-rename: append (1), (2), etc.
          const extIndex = file.name.lastIndexOf('.');
          let baseName = extIndex !== -1 ? file.name.substring(0, extIndex) : file.name;
          let ext = extIndex !== -1 ? file.name.substring(extIndex) : '';
          let newName = `${baseName} (1)${ext}`;
          let counter = 1;
          while (state.files.some(f => f.file_name.toLowerCase() === newName.toLowerCase())) {
            counter++;
            newName = `${baseName} (${counter})${ext}`;
          }
          file._customName = newName;
        }
      }

      try {
        await uploadSingleFile(file, file._customName || null);
        successful++;
      } catch (uploadErr) {
        console.error('[SkyVault] File upload failed:', file.name, uploadErr);
        showToast('Upload Error', `Failed to upload ${file.name}: ${uploadErr.message}`, 'error');
      }

      completed++;
      const percent = Math.round((completed / total) * 100);
      UI.uploadProgressBar.style.width = `${percent}%`;
      UI.uploadProgressPercent.textContent = `${percent}%`;
    }

    setButtonLoading(UI.startUploadBtn, false);
    state.uploadQueue = [];
    renderUploadQueue();

    setTimeout(() => {
      UI.uploadProgressSection.classList.add('hidden');
      closeUploadModal();
      showToast('Upload Complete', `Successfully uploaded ${successful} of ${total} files.`, 'success');
      fetchUserData();
    }, 600);
  }

  function promptDuplicateResolution(file) {
    return new Promise((resolve) => {
      state.filePendingDuplicate = { file, resolve };
      UI.duplicateFileName.textContent = file.name;

      const extIndex = file.name.lastIndexOf('.');
      const base = extIndex !== -1 ? file.name.substring(0, extIndex) : file.name;
      const ext = extIndex !== -1 ? file.name.substring(extIndex) : '';
      UI.duplicateRenamedExample.textContent = `${base} (1)${ext}`;

      if (typeof UI.duplicateModal.showModal === 'function') {
        UI.duplicateModal.showModal();
      } else {
        UI.duplicateModal.setAttribute('open', '');
      }
    });
  }

  function resolveDuplicateModal(action) {
    if (state.filePendingDuplicate && state.filePendingDuplicate.resolve) {
      state.filePendingDuplicate.resolve(action);
      state.filePendingDuplicate = null;
    }
    if (typeof UI.duplicateModal.close === 'function') {
      UI.duplicateModal.close();
    } else {
      UI.duplicateModal.removeAttribute('open');
    }
  }

  // ==========================================================================
  // RENDERING CONTROLLERS
  // ==========================================================================

  function renderAllViews() {
    renderDashboardView();
    renderFilesView();
    renderMonitoringView();
    renderActivityView();
    renderSidebarStats();
    checkThresholdAlerts();
  }

  // --- 1. Dashboard View ---
  function renderDashboardView() {
    // Extracted directly from Supabase public.storage_usage view (with fallback to file_metadata)
    const totalBytes = (state.storageUsage && state.storageUsage.total_bytes != null)
      ? Number(state.storageUsage.total_bytes)
      : state.files.reduce((sum, f) => sum + (Number(f.file_size) || 0), 0);
    const totalMB = (state.storageUsage && state.storageUsage.total_mb != null)
      ? Number(state.storageUsage.total_mb)
      : bytesToMB(totalBytes);
    const totalGB = bytesToGB(totalBytes);
    const totalFiles = (state.storageUsage && state.storageUsage.total_files != null)
      ? Number(state.storageUsage.total_files)
      : state.files.length;
    const thresholdMB = state.config.storageThresholdMB;
    const percentUsed = Math.min(100, Math.round((totalMB / thresholdMB) * 100));

    UI.dashTotalStorageMB.textContent = totalMB.toFixed(2);
    UI.dashTotalStorageGB.textContent = `${totalGB.toFixed(3)} GB`;
    UI.dashStorageProgress.style.width = `${percentUsed}%`;
    UI.dashThresholdPercent.textContent = `${percentUsed}% of threshold`;
    UI.dashThresholdLimit.textContent = `${thresholdMB} MB`;

    if (percentUsed >= 80) {
      UI.dashStorageProgress.classList.add('bar-warning');
    } else {
      UI.dashStorageProgress.classList.remove('bar-warning');
    }

    UI.dashTotalFiles.textContent = totalFiles;

    // Extracted directly from Supabase public.activity_summary view (with fallback to file_activity)
    let totalOps = 0;
    let successOps = 0;
    let failedOps = 0;

    if (state.activitySummary && state.activitySummary.length > 0) {
      state.activitySummary.forEach(item => {
        totalOps += Number(item.total_operations || 0);
        successOps += Number(item.successful_operations || 0);
        failedOps += Number(item.failed_operations || 0);
      });
    } else {
      totalOps = state.activities.length;
      successOps = state.activities.filter(a => a.success).length;
      failedOps = totalOps - successOps;
    }
    const successRate = totalOps > 0 ? Math.round((successOps / totalOps) * 100) : 100;

    UI.dashSuccessRate.textContent = successRate;
    UI.dashOpsCount.textContent = totalOps;
    UI.dashSuccessOps.textContent = successOps;
    UI.dashFailedOps.textContent = failedOps;

    // Durations from Supabase activity_summary or file_activity
    const uploadSummary = state.activitySummary.find(s => s.action === 'upload');
    const downloadSummary = state.activitySummary.find(s => s.action === 'download');
    const uploads = state.activities.filter(a => a.action === 'upload' && a.duration_ms > 0);
    const downloads = state.activities.filter(a => a.action === 'download' && a.duration_ms > 0);

    const avgUp = (uploadSummary && uploadSummary.avg_duration_ms != null && uploadSummary.total_operations > 0)
      ? Math.round(Number(uploadSummary.avg_duration_ms))
      : (uploads.length > 0 ? Math.round(uploads.reduce((s, a) => s + a.duration_ms, 0) / uploads.length) : 0);
    UI.dashAvgUploadDuration.textContent = `${avgUp} ms`;

    const avgDown = (downloadSummary && downloadSummary.avg_duration_ms != null && downloadSummary.total_operations > 0)
      ? Math.round(Number(downloadSummary.avg_duration_ms))
      : (downloads.length > 0 ? Math.round(downloads.reduce((s, a) => s + a.duration_ms, 0) / downloads.length) : 0);
    UI.dashAvgDownloadDuration.textContent = `${avgDown} ms`;

    const allDurations = state.activities.filter(a => a.duration_ms > 0);
    const avgDuration = (avgUp > 0 && avgDown > 0)
      ? Math.round((avgUp + avgDown) / 2)
      : (allDurations.length > 0 ? Math.round(allDurations.reduce((sum, a) => sum + a.duration_ms, 0) / allDurations.length) : (avgUp || avgDown || 0));
    UI.dashAvgDuration.textContent = avgDuration;

    // Monthly cost estimate
    const monthlyCost = calculateEstimatedCost(totalBytes, totalOps);
    UI.dashCostEstimate.textContent = `$${monthlyCost.toFixed(3)} / mo`;

    // Render Recent Files List (Top 5)
    renderRecentFilesList();

    // Render Recent Activity Feed (Top 5)
    renderRecentActivityFeed();

    // Render Doughnut Chart
    renderStorageDoughnutChart();
  }

  function renderRecentFilesList() {
    UI.dashRecentFilesList.innerHTML = '';
    const recent = state.files.slice(0, 5);

    if (recent.length === 0) {
      UI.dashRecentFilesList.innerHTML = `
        <div class="empty-state-compact">
          <p>No files uploaded yet. Drag and drop your first file above!</p>
        </div>
      `;
      return;
    }

    recent.forEach(file => {
      const cat = getFileCategory(file.mime_type, file.file_name);
      const item = document.createElement('div');
      item.className = 'recent-file-item';
      item.innerHTML = `
        <div class="file-type-icon-box ${getCategoryColorClass(cat)}">
          ${getFileIconSVG(cat)}
        </div>
        <div class="file-meta-info">
          <div class="file-name-row">
            <span class="file-name-text" title="${escapeHTML(file.file_name)}">${escapeHTML(file.file_name)}</span>
          </div>
          <div class="file-sub-row">
            <span>${formatBytes(file.file_size)}</span>
            <span>&bull;</span>
            <span>${formatRelativeTime(file.created_at)}</span>
          </div>
        </div>
        <div class="file-actions-row">
          <button class="icon-btn-ghost action-download-btn" title="Download file" aria-label="Download">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </button>
          <button class="icon-btn-ghost action-preview-btn" title="Inspect details" aria-label="Details">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="1"></circle>
              <circle cx="19" cy="12" r="1"></circle>
              <circle cx="5" cy="12" r="1"></circle>
            </svg>
          </button>
        </div>
      `;

      item.querySelector('.action-download-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        downloadFile(file);
      });
      item.querySelector('.action-preview-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        openPreviewModal(file);
      });
      item.addEventListener('click', () => {
        openPreviewModal(file);
      });

      UI.dashRecentFilesList.appendChild(item);
    });
  }

  function renderRecentActivityFeed() {
    UI.dashActivityFeed.innerHTML = '';
    const recent = state.activities.slice(0, 5);

    if (recent.length === 0) {
      UI.dashActivityFeed.innerHTML = `
        <div class="empty-state-compact">
          <p>No operations logged yet.</p>
        </div>
      `;
      return;
    }

    recent.forEach(act => {
      const item = document.createElement('div');
      item.className = 'activity-item-compact';
      const badgeClass = act.action === 'upload' ? 'badge-upload' : act.action === 'download' ? 'badge-download' : 'badge-delete';
      const statusIcon = act.success
        ? `<span class="text-success" title="Success">&bull;</span>`
        : `<span class="text-danger" title="Failed">&times;</span>`;

      // Find file name if available
      let fileLabel = `File #${act.file_id || 'Object'}`;
      const foundFile = state.files.find(f => f.id === act.file_id);
      if (foundFile) {
        fileLabel = foundFile.file_name;
      }

      item.innerHTML = `
        <span class="activity-action-badge ${badgeClass}">${act.action}</span>
        <div class="activity-details-text" title="${escapeHTML(fileLabel)}">
          ${statusIcon} ${escapeHTML(fileLabel)} (${formatBytes(act.file_size)})
        </div>
        <span class="activity-time-text">${formatRelativeTime(act.created_at)}</span>
      `;
      UI.dashActivityFeed.appendChild(item);
    });
  }

  // --- 2. My Files View ---
  function renderFilesView() {
    const query = state.fileFilters.search.toLowerCase().trim();
    const category = state.fileFilters.category;
    const sort = state.fileFilters.sort;

    let filtered = state.files.filter(file => {
      const matchesSearch = !query || file.file_name.toLowerCase().includes(query);
      const fileCat = getFileCategory(file.mime_type, file.file_name);
      const matchesCategory = category === 'all' || fileCat === category;
      return matchesSearch && matchesCategory;
    });

    // Sorting
    filtered.sort((a, b) => {
      if (sort === 'newest') return new Date(b.created_at) - new Date(a.created_at);
      if (sort === 'oldest') return new Date(a.created_at) - new Date(b.created_at);
      if (sort === 'name_asc') return a.file_name.localeCompare(b.file_name);
      if (sort === 'name_desc') return b.file_name.localeCompare(a.file_name);
      if (sort === 'size_desc') return (Number(b.file_size) || 0) - (Number(a.file_size) || 0);
      if (sort === 'size_asc') return (Number(a.file_size) || 0) - (Number(b.file_size) || 0);
      return 0;
    });

    // Update empty state
    if (filtered.length === 0) {
      UI.filesGridContainer.classList.add('hidden');
      UI.filesTableContainer.classList.add('hidden');
      UI.filesEmptyState.classList.remove('hidden');

      if (query || category !== 'all') {
        UI.emptyStateTitle.textContent = 'No matching files';
        UI.emptyStateDesc.textContent = 'Try adjusting your search query or category filters.';
      } else {
        UI.emptyStateTitle.textContent = 'No files stored yet';
        UI.emptyStateDesc.textContent = 'Upload files to your encrypted private vault to get started.';
      }
      return;
    }

    UI.filesEmptyState.classList.add('hidden');

    if (state.viewMode === 'grid') {
      UI.filesGridContainer.classList.remove('hidden');
      UI.filesTableContainer.classList.add('hidden');
      renderFilesGrid(filtered);
    } else {
      UI.filesGridContainer.classList.add('hidden');
      UI.filesTableContainer.classList.remove('hidden');
      renderFilesTable(filtered);
    }
  }

  function renderFilesGrid(files) {
    UI.filesGridContainer.innerHTML = '';
    files.forEach(file => {
      const cat = getFileCategory(file.mime_type, file.file_name);
      const card = document.createElement('div');
      card.className = 'file-card glass-panel';
      card.innerHTML = `
        <div class="file-card-preview-thumb">
          <div class="file-type-icon-box ${getCategoryColorClass(cat)}">
            ${getFileIconSVG(cat)}
          </div>
        </div>
        <div class="file-card-info">
          <span class="file-card-name" title="${escapeHTML(file.file_name)}">${escapeHTML(file.file_name)}</span>
          <div class="file-card-meta">
            <span>${formatBytes(file.file_size)}</span>
            <span>${formatRelativeTime(file.created_at)}</span>
          </div>
        </div>
        <div class="file-card-actions">
          <button class="icon-btn-ghost action-download-btn" title="Download file" aria-label="Download">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </button>
          <button class="icon-btn-ghost text-danger action-delete-btn" title="Delete file" aria-label="Delete">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      `;

      card.querySelector('.action-download-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        downloadFile(file);
      });
      card.querySelector('.action-delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        openDeleteModal(file);
      });
      card.addEventListener('click', () => {
        openPreviewModal(file);
      });

      UI.filesGridContainer.appendChild(card);
    });
  }

  function renderFilesTable(files) {
    UI.filesTableBody.innerHTML = '';
    files.forEach(file => {
      const cat = getFileCategory(file.mime_type, file.file_name);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div class="table-file-name-cell">
            <span class="${getCategoryColorClass(cat)}">${getFileIconSVG(cat)}</span>
            <span title="${escapeHTML(file.file_name)}">${escapeHTML(file.file_name)}</span>
          </div>
        </td>
        <td><span class="badge-subtle">${cat}</span></td>
        <td>${formatBytes(file.file_size)}</td>
        <td>${formatDate(file.created_at)}</td>
        <td class="text-right">
          <button class="icon-btn-ghost action-download-btn" title="Download" aria-label="Download">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </button>
          <button class="icon-btn-ghost text-danger action-delete-btn" title="Delete" aria-label="Delete">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </td>
      `;

      tr.querySelector('.action-download-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        downloadFile(file);
      });
      tr.querySelector('.action-delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        openDeleteModal(file);
      });
      tr.addEventListener('click', () => {
        openPreviewModal(file);
      });

      UI.filesTableBody.appendChild(tr);
    });
  }

  // --- 3. Resource Monitoring View ---
  function renderMonitoringView() {
    // Extracted directly from Supabase public.storage_usage view
    const totalBytes = (state.storageUsage && state.storageUsage.total_bytes != null)
      ? Number(state.storageUsage.total_bytes)
      : state.files.reduce((sum, f) => sum + (Number(f.file_size) || 0), 0);
    const totalMB = (state.storageUsage && state.storageUsage.total_mb != null)
      ? Number(state.storageUsage.total_mb)
      : bytesToMB(totalBytes);
    const totalGB = bytesToGB(totalBytes);
    const thresholdMB = state.config.storageThresholdMB;
    const percentUsed = Math.min(100, Math.round((totalMB / thresholdMB) * 100));

    UI.monUsagePercent.textContent = `${percentUsed}%`;
    UI.monUsageMB.textContent = `${totalMB.toFixed(2)} MB`;
    UI.monThresholdMB.textContent = `${thresholdMB} MB`;
    UI.monProgressBar.style.width = `${percentUsed}%`;

    // Latency & counts from Supabase public.activity_summary view
    const uploadSummary = state.activitySummary.find(s => s.action === 'upload');
    const downloadSummary = state.activitySummary.find(s => s.action === 'download');
    const uploads = state.activities.filter(a => a.action === 'upload');
    const downloads = state.activities.filter(a => a.action === 'download');

    const avgUp = (uploadSummary && uploadSummary.avg_duration_ms != null && uploadSummary.total_operations > 0)
      ? Math.round(Number(uploadSummary.avg_duration_ms))
      : (uploads.length > 0 ? Math.round(uploads.reduce((s, a) => s + (a.duration_ms || 0), 0) / uploads.length) : 0);
    const countUp = (uploadSummary && uploadSummary.total_operations != null)
      ? uploadSummary.total_operations
      : uploads.length;

    const avgDown = (downloadSummary && downloadSummary.avg_duration_ms != null && downloadSummary.total_operations > 0)
      ? Math.round(Number(downloadSummary.avg_duration_ms))
      : (downloads.length > 0 ? Math.round(downloads.reduce((s, a) => s + (a.duration_ms || 0), 0) / downloads.length) : 0);
    const countDown = (downloadSummary && downloadSummary.total_operations != null)
      ? downloadSummary.total_operations
      : downloads.length;

    UI.monAvgUpload.textContent = avgUp;
    UI.monUploadCount.textContent = countUp;
    UI.monAvgDownload.textContent = avgDown;
    UI.monDownloadCount.textContent = countDown;

    // Projected Cost breakdown from actual Supabase operation counts & storage bytes
    const totalOps = (state.activitySummary && state.activitySummary.length > 0)
      ? state.activitySummary.reduce((sum, item) => sum + Number(item.total_operations || 0), 0)
      : state.activities.length;
    const storageCost = totalGB * state.config.storageRatePerGB;
    const requestCost = (totalOps / 1000) * state.config.requestRatePer1k;
    const totalMonthlyBill = storageCost + requestCost;

    UI.monProjectedCost.textContent = `$${totalMonthlyBill.toFixed(3)}`;

    // Fill Cost table
    UI.costStorageUsageCell.textContent = `${totalGB.toFixed(4)} GB`;
    UI.costStorageRateCell.textContent = `$${state.config.storageRatePerGB.toFixed(3)} / GB`;
    UI.costStorageSubtotalCell.textContent = `$${storageCost.toFixed(4)}`;

    UI.costRequestsUsageCell.textContent = `${totalOps} operations`;
    UI.costRequestsRateCell.textContent = `$${state.config.requestRatePer1k.toFixed(4)} / 1k`;
    UI.costRequestsSubtotalCell.textContent = `$${requestCost.toFixed(4)}`;

    UI.costTotalCell.textContent = `$${totalMonthlyBill.toFixed(4)} / mo`;

    // Render Monitoring Charts
    renderOperationsBarChart();
    renderStorageGrowthLineChart();
  }

  // --- 4. Activity Audit Log View ---
  function renderActivityView() {
    const filter = state.activityFilter;
    let filtered = state.activities.filter(act => {
      if (filter === 'all') return true;
      if (filter === 'failed') return !act.success;
      return act.action === filter;
    });

    UI.activityCountDisplay.textContent = filtered.length;

    if (filtered.length === 0) {
      UI.activityTableBody.innerHTML = '';
      UI.activityEmptyState.classList.remove('hidden');
      return;
    }

    UI.activityEmptyState.classList.add('hidden');
    UI.activityTableBody.innerHTML = '';

    filtered.forEach(act => {
      const tr = document.createElement('tr');
      const badgeClass = act.action === 'upload' ? 'badge-upload' : act.action === 'download' ? 'badge-download' : 'badge-delete';

      let fileRef = '—';
      const file = state.files.find(f => f.id === act.file_id);
      if (file) {
        fileRef = file.file_name;
      } else if (act.file_id) {
        fileRef = `#${act.file_id}`;
      }

      const statusBadge = act.success
        ? `<span class="badge-result-success"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg> Success</span>`
        : `<span class="badge-result-failure"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg> Failed</span>`;

      tr.innerHTML = `
        <td>${formatDate(act.created_at)}</td>
        <td><span class="activity-action-badge ${badgeClass}">${act.action}</span></td>
        <td class="file-title-truncate" title="${escapeHTML(fileRef)}">${escapeHTML(fileRef)}</td>
        <td>${formatBytes(act.file_size)}</td>
        <td>${act.duration_ms ? `${act.duration_ms} ms` : '—'}</td>
        <td>${statusBadge}</td>
      `;
      UI.activityTableBody.appendChild(tr);
    });
  }

  // --- Sidebar Stats Sync ---
  function renderSidebarStats() {
    const totalBytes = state.files.reduce((sum, f) => sum + (Number(f.file_size) || 0), 0);
    const totalMB = bytesToMB(totalBytes);
    const thresholdMB = state.config.storageThresholdMB;
    const percent = Math.min(100, Math.round((totalMB / thresholdMB) * 100));

    UI.sidebarFileBadge.textContent = state.files.length;
    UI.sidebarStoragePercent.textContent = `${percent}%`;
    UI.sidebarProgressBar.style.width = `${percent}%`;
    UI.sidebarStorageUsed.textContent = `${totalMB.toFixed(2)} MB`;
    UI.sidebarStorageLimit.textContent = `of ${thresholdMB} MB`;

    if (percent >= 80) {
      UI.sidebarProgressBar.classList.add('bar-warning');
    } else {
      UI.sidebarProgressBar.classList.remove('bar-warning');
    }
  }

  // --- Storage Threshold Alerts ---
  function checkThresholdAlerts() {
    const totalBytes = state.files.reduce((sum, f) => sum + (Number(f.file_size) || 0), 0);
    const totalMB = bytesToMB(totalBytes);
    const thresholdMB = state.config.storageThresholdMB;
    const percent = (totalMB / thresholdMB) * 100;

    if (percent >= 80) {
      UI.storageThresholdAlert.classList.remove('hidden');
      UI.topThresholdWarning.classList.remove('hidden');
      UI.alertUsageText.textContent = `${totalMB.toFixed(2)} MB`;
      UI.alertThresholdText.textContent = `${thresholdMB} MB (${Math.round(percent)}%)`;
    } else {
      UI.storageThresholdAlert.classList.add('hidden');
      UI.topThresholdWarning.classList.add('hidden');
    }
  }

  function calculateEstimatedCost(totalBytes, totalOps) {
    const totalGB = bytesToGB(totalBytes);
    const storageCost = totalGB * state.config.storageRatePerGB;
    const requestCost = (totalOps / 1000) * state.config.requestRatePer1k;
    return storageCost + requestCost;
  }

  // ==========================================================================
  // CHART.JS INTEGRATION (DOUGHNUT, BAR, LINE)
  // ==========================================================================

  function renderStorageDoughnutChart() {
    const canvas = document.getElementById('storageDoughnutChart');
    if (!canvas || typeof Chart === 'undefined') return;

    // Aggregate bytes by category
    const categories = {
      image: { label: 'Images', bytes: 0, color: '#06b6d4' },
      document: { label: 'Documents', bytes: 0, color: '#10b981' },
      media: { label: 'Media', bytes: 0, color: '#6366f1' },
      archive: { label: 'Archives', bytes: 0, color: '#f59e0b' },
      code: { label: 'Code', bytes: 0, color: '#38bdf8' },
      other: { label: 'Other', bytes: 0, color: '#94a3b8' }
    };

    state.files.forEach(f => {
      const cat = getFileCategory(f.mime_type, f.file_name);
      if (categories[cat]) {
        categories[cat].bytes += Number(f.file_size) || 0;
      } else {
        categories.other.bytes += Number(f.file_size) || 0;
      }
    });

    const labels = [];
    const data = [];
    const bgColors = [];

    Object.keys(categories).forEach(key => {
      const item = categories[key];
      if (item.bytes > 0 || state.files.length === 0) {
        labels.push(item.label);
        data.push(bytesToMB(item.bytes));
        bgColors.push(item.color);
      }
    });

    // If empty, display subtle placeholder ring
    const isZero = data.every(v => v === 0);
    const chartData = isZero ? [1] : data;
    const chartColors = isZero ? ['rgba(255, 255, 255, 0.08)'] : bgColors;
    const chartLabels = isZero ? ['No files'] : labels;

    if (state.charts.doughnut) {
      state.charts.doughnut.destroy();
    }

    state.charts.doughnut = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: chartLabels,
        datasets: [{
          data: chartData,
          backgroundColor: chartColors,
          borderWidth: 2,
          borderColor: '#0b111c',
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: !isZero,
            callbacks: {
              label: (ctx) => ` ${ctx.label}: ${ctx.raw.toFixed(2)} MB`
            }
          }
        },
        cutout: '72%'
      }
    });

    // Custom HTML legend
    UI.storageTypeLegend.innerHTML = '';
    if (!isZero) {
      labels.forEach((label, i) => {
        const pill = document.createElement('div');
        pill.className = 'legend-pill';
        pill.innerHTML = `
          <span class="legend-color-dot" style="background: ${bgColors[i]}"></span>
          <span>${label} (${data[i].toFixed(1)} MB)</span>
        `;
        UI.storageTypeLegend.appendChild(pill);
      });
    }
  }

  function renderOperationsBarChart() {
    const canvas = document.getElementById('operationsBarChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const actions = ['upload', 'download', 'delete'];
    const successData = [];
    const failedData = [];

    actions.forEach(action => {
      const ops = state.activities.filter(a => a.action === action);
      const succ = ops.filter(a => a.success).length;
      const fail = ops.length - succ;
      successData.push(succ);
      failedData.push(fail);
    });

    if (state.charts.operations) {
      state.charts.operations.destroy();
    }

    state.charts.operations = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: ['Uploads', 'Downloads', 'Deletions'],
        datasets: [
          {
            label: 'Succeeded',
            data: successData,
            backgroundColor: '#10b981',
            borderRadius: 6
          },
          {
            label: 'Failed',
            data: failedData,
            backgroundColor: '#ef4444',
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#94a3b8', font: { family: 'Plus Jakarta Sans', size: 12 } }
          },
          y: {
            beginAtZero: true,
            ticks: {
              precision: 0,
              color: '#94a3b8',
              font: { family: 'JetBrains Mono', size: 11 }
            },
            grid: { color: 'rgba(255, 255, 255, 0.06)' }
          }
        },
        plugins: {
          legend: {
            labels: {
              color: '#f8fafc',
              font: { family: 'Plus Jakarta Sans', size: 12 }
            }
          }
        }
      }
    });
  }

  function renderStorageGrowthLineChart() {
    const canvas = document.getElementById('storageGrowthLineChart');
    if (!canvas || typeof Chart === 'undefined') return;

    // Sort files chronologically
    const sorted = [...state.files].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    const labels = [];
    const cumulativeMB = [];
    let runningBytes = 0;

    if (sorted.length === 0) {
      labels.push('Today');
      cumulativeMB.push(0);
    } else {
      sorted.forEach(file => {
        runningBytes += Number(file.file_size) || 0;
        const d = new Date(file.created_at);
        labels.push(d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
        cumulativeMB.push(bytesToMB(runningBytes));
      });
    }

    if (state.charts.growth) {
      state.charts.growth.destroy();
    }

    state.charts.growth = new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Total Stored (MB)',
          data: cumulativeMB,
          borderColor: '#06b6d4',
          backgroundColor: 'rgba(6, 182, 212, 0.12)',
          fill: true,
          tension: 0.35,
          borderWidth: 2,
          pointBackgroundColor: '#6366f1',
          pointBorderColor: '#ffffff',
          pointRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#94a3b8', font: { family: 'Plus Jakarta Sans', size: 11 } }
          },
          y: {
            beginAtZero: true,
            ticks: {
              color: '#94a3b8',
              font: { family: 'JetBrains Mono', size: 11 },
              callback: (val) => `${val} MB`
            },
            grid: { color: 'rgba(255, 255, 255, 0.06)' }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` Cumulative: ${ctx.raw} MB`
            }
          }
        }
      }
    });
  }

  function destroyCharts() {
    if (state.charts.doughnut) state.charts.doughnut.destroy();
    if (state.charts.operations) state.charts.operations.destroy();
    if (state.charts.growth) state.charts.growth.destroy();
    state.charts = { doughnut: null, operations: null, growth: null };
  }

  // ==========================================================================
  // MODAL CONTROLLERS & FILE PREVIEW
  // ==========================================================================

  function openUploadModal() {
    if (typeof UI.uploadModal.showModal === 'function') {
      UI.uploadModal.showModal();
    } else {
      UI.uploadModal.setAttribute('open', '');
    }
  }

  function closeUploadModal() {
    if (typeof UI.uploadModal.close === 'function') {
      UI.uploadModal.close();
    } else {
      UI.uploadModal.removeAttribute('open');
    }
  }

  async function openPreviewModal(file) {
    state.selectedFileForPreview = file;
    UI.previewModalTitle.textContent = file.file_name;
    UI.previewStoragePath.textContent = file.storage_path;
    UI.previewSize.textContent = formatBytes(file.file_size);
    UI.previewMime.textContent = file.mime_type || 'application/octet-stream';
    UI.previewCreated.textContent = formatDate(file.created_at);
    UI.previewDbId.textContent = `#${file.id}`;

    const cat = getFileCategory(file.mime_type, file.file_name);
    UI.previewMediaContainer.innerHTML = `
      <div class="preview-media-fallback">
        <span class="btn-spinner"></span>
        <span>Loading preview...</span>
      </div>
    `;

    if (typeof UI.previewModal.showModal === 'function') {
      UI.previewModal.showModal();
    } else {
      UI.previewModal.setAttribute('open', '');
    }

    // Load preview content
    try {
      if (cat === 'image') {
        if (state.isSimulatedMode) {
          UI.previewMediaContainer.innerHTML = `
            <div class="preview-media-fallback">
              <span class="icon-cyan">${getFileIconSVG('image')}</span>
              <strong>Image Preview</strong>
              <span>${escapeHTML(file.file_name)}</span>
            </div>
          `;
        } else {
          // Create signed URL for private bucket
          const { data: signedData, error } = await state.supabase.storage
            .from(BUCKET_NAME)
            .createSignedUrl(file.storage_path, 60);

          if (!error && signedData?.signedUrl) {
            UI.previewMediaContainer.innerHTML = `<img src="${signedData.signedUrl}" alt="${escapeHTML(file.file_name)}">`;
          } else {
            throw error || new Error('Signed URL failed');
          }
        }
      } else if (cat === 'code' || (file.mime_type && file.mime_type.startsWith('text/'))) {
        if (state.isSimulatedMode) {
          UI.previewMediaContainer.innerHTML = `<pre>-- SkyVault Sandbox Preview\nSELECT * FROM file_metadata WHERE id = ${file.id};</pre>`;
        } else {
          const { data: blob, error } = await state.supabase.storage
            .from(BUCKET_NAME)
            .download(file.storage_path);

          if (!error && blob) {
            const text = await blob.text();
            UI.previewMediaContainer.innerHTML = `<pre>${escapeHTML(text.slice(0, 5000))}${text.length > 5000 ? '\n... [Preview truncated]' : ''}</pre>`;
          } else {
            throw error || new Error('Text preview failed');
          }
        }
      } else {
        UI.previewMediaContainer.innerHTML = `
          <div class="preview-media-fallback">
            <span class="${getCategoryColorClass(cat)}">${getFileIconSVG(cat)}</span>
            <strong>${cat.toUpperCase()} Document</strong>
            <span>Direct in-browser preview not supported for binary file. Click Download below to view.</span>
          </div>
        `;
      }
    } catch (err) {
      UI.previewMediaContainer.innerHTML = `
        <div class="preview-media-fallback">
          <span class="${getCategoryColorClass(cat)}">${getFileIconSVG(cat)}</span>
          <strong>${escapeHTML(file.file_name)}</strong>
          <span>File ready for secure download.</span>
        </div>
      `;
    }
  }

  function closePreviewModal() {
    state.selectedFileForPreview = null;
    if (typeof UI.previewModal.close === 'function') {
      UI.previewModal.close();
    } else {
      UI.previewModal.removeAttribute('open');
    }
  }

  function openDeleteModal(file) {
    state.selectedFileForPreview = file;
    UI.deleteTargetFileName.textContent = file.file_name;
    UI.deleteTargetFileSize.textContent = formatBytes(file.file_size);

    if (typeof UI.deleteModal.showModal === 'function') {
      UI.deleteModal.showModal();
    } else {
      UI.deleteModal.setAttribute('open', '');
    }
  }

  function closeDeleteModal() {
    if (typeof UI.deleteModal.close === 'function') {
      UI.deleteModal.close();
    } else {
      UI.deleteModal.removeAttribute('open');
    }
  }

  function openSettingsModal() {
    UI.modalThresholdInput.value = state.config.storageThresholdMB;
    UI.modalStorageRateInput.value = state.config.storageRatePerGB;
    UI.modalRequestRateInput.value = state.config.requestRatePer1k;
    UI.diagSessionStatus.textContent = state.currentUser ? `Authenticated (${state.currentUser.email})` : 'Unauthenticated';

    if (typeof UI.settingsModal.showModal === 'function') {
      UI.settingsModal.showModal();
    } else {
      UI.settingsModal.setAttribute('open', '');
    }
  }

  function closeSettingsModal() {
    if (typeof UI.settingsModal.close === 'function') {
      UI.settingsModal.close();
    } else {
      UI.settingsModal.removeAttribute('open');
    }
  }

  function setButtonLoading(btn, isLoading) {
    if (!btn) return;
    const spinner = btn.querySelector('.btn-spinner');
    const text = btn.querySelector('.btn-text');
    if (isLoading) {
      btn.disabled = true;
      if (spinner) spinner.classList.remove('hidden');
    } else {
      btn.disabled = false;
      if (spinner) spinner.classList.add('hidden');
    }
  }

  // ==========================================================================
  // NAVIGATION & VIEW SWITCHING
  // ==========================================================================

  function switchView(viewName) {
    if (!UI.views[viewName]) return;
    state.currentView = viewName;

    // Update nav links
    Object.keys(UI.navLinks).forEach(k => {
      if (k === viewName) {
        UI.navLinks[k].classList.add('active');
      } else {
        UI.navLinks[k].classList.remove('active');
      }
    });

    // Update view panels
    Object.keys(UI.views).forEach(k => {
      if (k === viewName) {
        UI.views[k].classList.remove('hidden');
        UI.views[k].classList.add('active');
      } else {
        UI.views[k].classList.add('hidden');
        UI.views[k].classList.remove('active');
      }
    });

    // Update Title
    const titles = {
      dashboard: 'Dashboard',
      files: 'My Files',
      monitoring: 'Resource Monitor',
      activity: 'Activity Audit'
    };
    UI.currentViewTitle.textContent = titles[viewName] || 'Dashboard';

    // Close mobile sidebar if open
    closeMobileSidebar();

    // Trigger chart resize / re-render
    if (viewName === 'dashboard') {
      setTimeout(renderStorageDoughnutChart, 100);
    } else if (viewName === 'monitoring') {
      setTimeout(() => {
        renderOperationsBarChart();
        renderStorageGrowthLineChart();
      }, 100);
    }
  }

  function toggleMobileSidebar(open) {
    if (open) {
      UI.sidebar.classList.add('mobile-open');
      UI.sidebarBackdrop.classList.add('active');
    } else {
      UI.sidebar.classList.remove('mobile-open');
      UI.sidebarBackdrop.classList.remove('active');
    }
  }

  function closeMobileSidebar() {
    toggleMobileSidebar(false);
  }

  // ==========================================================================
  // EVENT LISTENERS INITIALIZATION
  // ==========================================================================

  function setupEventListeners() {
    // Auth Tabs & Form
    UI.tabSignIn.addEventListener('click', () => setAuthMode(false));
    UI.tabSignUp.addEventListener('click', () => setAuthMode(true));
    UI.authForm.addEventListener('submit', handleAuthSubmit);

    // Toggle Password Visibility
    UI.togglePasswordBtn.addEventListener('click', () => {
      const type = UI.passwordInput.type === 'password' ? 'text' : 'password';
      UI.passwordInput.type = type;
    });

    // Sign Out
    UI.signOutBtn.addEventListener('click', handleSignOut);

    // Auth Diagnostics Button
    UI.authDiagnosticBtn.addEventListener('click', () => {
      showToast(
        'Supabase Target',
        `Endpoint: ${SUPABASE_URL}\nBucket: ${BUCKET_NAME}`,
        'info',
        6000
      );
    });

    // Sidebar Mobile Menu
    UI.mobileMenuBtn.addEventListener('click', () => toggleMobileSidebar(true));
    UI.closeSidebarBtn.addEventListener('click', () => toggleMobileSidebar(false));
    UI.sidebarBackdrop.addEventListener('click', () => toggleMobileSidebar(false));

    // Nav Links
    Object.keys(UI.navLinks).forEach(name => {
      UI.navLinks[name].addEventListener('click', () => switchView(name));
    });

    // Top Actions
    UI.topUploadBtn.addEventListener('click', openUploadModal);
    UI.sidebarUploadBtn.addEventListener('click', openUploadModal);
    UI.filesUploadBtn.addEventListener('click', openUploadModal);
    UI.emptyStateUploadBtn.addEventListener('click', openUploadModal);
    UI.openSettingsModalBtn.addEventListener('click', openSettingsModal);

    // Dashboard Actions
    UI.refreshDashBtn.addEventListener('click', fetchUserData);
    UI.dashBrowseBtn.addEventListener('click', () => UI.dashFileInput.click());
    UI.dashUploadActionBtn.addEventListener('click', () => UI.dashFileInput.click());
    UI.dashFileInput.addEventListener('change', (e) => {
      addFilesToQueue(e.target.files);
      e.target.value = '';
    });
    UI.dashViewAllFilesBtn.addEventListener('click', () => switchView('files'));
    UI.dashViewAllActivityBtn.addEventListener('click', () => switchView('activity'));
    UI.dashViewRatesBtn.addEventListener('click', () => switchView('monitoring'));

    // Threshold & Rates Banners
    UI.bannerConfigThresholdBtn.addEventListener('click', openSettingsModal);
    UI.networkRetryBtn.addEventListener('click', fetchUserData);

    // Files View Controls
    UI.fileSearchInput.addEventListener('input', (e) => {
      state.fileFilters.search = e.target.value;
      if (e.target.value) {
        UI.clearSearchBtn.classList.remove('hidden');
      } else {
        UI.clearSearchBtn.classList.add('hidden');
      }
      renderFilesView();
    });
    UI.clearSearchBtn.addEventListener('click', () => {
      UI.fileSearchInput.value = '';
      state.fileFilters.search = '';
      UI.clearSearchBtn.classList.add('hidden');
      renderFilesView();
    });

    // Category Filter Chips
    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        e.currentTarget.classList.add('active');
        state.fileFilters.category = e.currentTarget.getAttribute('data-category');
        renderFilesView();
      });
    });

    // File Sort Select
    UI.fileSortSelect.addEventListener('change', (e) => {
      state.fileFilters.sort = e.target.value;
      renderFilesView();
    });

    // View Toggle (Grid / Table)
    UI.toggleGridViewBtn.addEventListener('click', () => {
      state.viewMode = 'grid';
      UI.toggleGridViewBtn.classList.add('active');
      UI.toggleTableViewBtn.classList.remove('active');
      renderFilesView();
    });
    UI.toggleTableViewBtn.addEventListener('click', () => {
      state.viewMode = 'table';
      UI.toggleTableViewBtn.classList.add('active');
      UI.toggleGridViewBtn.classList.remove('active');
      renderFilesView();
    });

    // Files Dropzone inside My Files
    UI.filesBrowseLink.addEventListener('click', () => UI.filesViewFileInput.click());
    UI.filesViewFileInput.addEventListener('change', (e) => {
      addFilesToQueue(e.target.files);
      e.target.value = '';
    });

    // Monitoring Controls
    UI.refreshMonitoringBtn.addEventListener('click', fetchUserData);
    UI.monConfigRatesLink.addEventListener('click', openSettingsModal);

    UI.saveThresholdBtn.addEventListener('click', () => {
      const val = parseFloat(UI.thresholdInput.value);
      if (val > 0) {
        state.config.storageThresholdMB = val;
        localStorage.setItem('skyvault_threshold_mb', val);
        showToast('Threshold Saved', `Storage warning threshold set to ${val} MB.`, 'success');
        renderAllViews();
      }
    });

    UI.saveAllRatesBtn.addEventListener('click', () => {
      const thresh = parseFloat(UI.thresholdInput.value);
      const stRate = parseFloat(UI.costRateInput.value);
      const reqRate = parseFloat(UI.requestRateInput.value);

      if (thresh > 0) {
        state.config.storageThresholdMB = thresh;
        localStorage.setItem('skyvault_threshold_mb', thresh);
      }
      if (stRate > 0) {
        state.config.storageRatePerGB = stRate;
        localStorage.setItem('skyvault_rate_gb', stRate);
      }
      if (reqRate > 0) {
        state.config.requestRatePer1k = reqRate;
        localStorage.setItem('skyvault_rate_req', reqRate);
      }

      showToast('Settings Updated', 'Pricing model and storage limits saved.', 'success');
      renderAllViews();
    });

    // Activity View Controls
    UI.refreshActivityBtn.addEventListener('click', fetchUserData);
    document.querySelectorAll('.activity-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        document.querySelectorAll('.activity-chip').forEach(c => c.classList.remove('active'));
        e.currentTarget.classList.add('active');
        state.activityFilter = e.currentTarget.getAttribute('data-action');
        renderActivityView();
      });
    });

    // Upload Modal Controls
    UI.closeUploadModalBtn.addEventListener('click', closeUploadModal);
    UI.cancelUploadBtn.addEventListener('click', closeUploadModal);
    UI.modalBrowseBtn.addEventListener('click', () => UI.modalFileInput.click());
    UI.modalFileInput.addEventListener('change', (e) => {
      addFilesToQueue(e.target.files);
      e.target.value = '';
    });
    UI.clearQueueBtn.addEventListener('click', () => {
      state.uploadQueue = [];
      renderUploadQueue();
    });
    UI.startUploadBtn.addEventListener('click', processUploadQueue);

    // Duplicate Modal Buttons
    UI.dupReplaceBtn.addEventListener('click', () => resolveDuplicateModal('replace'));
    UI.dupKeepBothBtn.addEventListener('click', () => resolveDuplicateModal('rename'));
    UI.dupCancelBtn.addEventListener('click', () => resolveDuplicateModal('cancel'));

    // Preview Modal Controls
    UI.closePreviewModalBtn.addEventListener('click', closePreviewModal);
    UI.closePreviewBtn.addEventListener('click', closePreviewModal);
    UI.previewDownloadBtn.addEventListener('click', () => {
      if (state.selectedFileForPreview) {
        downloadFile(state.selectedFileForPreview);
      }
    });
    UI.previewDeleteBtn.addEventListener('click', () => {
      if (state.selectedFileForPreview) {
        const file = state.selectedFileForPreview;
        closePreviewModal();
        openDeleteModal(file);
      }
    });

    // Delete Modal Controls
    UI.cancelDeleteBtn.addEventListener('click', closeDeleteModal);
    UI.confirmDeleteBtn.addEventListener('click', async () => {
      if (state.selectedFileForPreview) {
        setButtonLoading(UI.confirmDeleteBtn, true);
        const file = state.selectedFileForPreview;
        await deleteFile(file);
        setButtonLoading(UI.confirmDeleteBtn, false);
        closeDeleteModal();
      }
    });

    // Settings Modal Controls
    UI.closeSettingsModalBtn.addEventListener('click', closeSettingsModal);
    UI.cancelSettingsBtn.addEventListener('click', closeSettingsModal);
    UI.saveSettingsModalBtn.addEventListener('click', () => {
      const th = parseFloat(UI.modalThresholdInput.value);
      const st = parseFloat(UI.modalStorageRateInput.value);
      const req = parseFloat(UI.modalRequestRateInput.value);

      if (th > 0) {
        state.config.storageThresholdMB = th;
        localStorage.setItem('skyvault_threshold_mb', th);
        UI.thresholdInput.value = th;
      }
      if (st > 0) {
        state.config.storageRatePerGB = st;
        localStorage.setItem('skyvault_rate_gb', st);
        UI.costRateInput.value = st;
      }
      if (req > 0) {
        state.config.requestRatePer1k = req;
        localStorage.setItem('skyvault_rate_req', req);
        UI.requestRateInput.value = req;
      }

      showToast('Settings Saved', 'Monitoring thresholds and cost rates updated.', 'success');
      closeSettingsModal();
      renderAllViews();
    });

    // Global Drag & Drop Handlers
    setupDragAndDrop();
  }

  function setupDragAndDrop() {
    let dragCounter = 0;

    window.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCounter++;
      if (state.currentUser && e.dataTransfer.types.includes('Files')) {
        UI.globalDropOverlay.classList.add('active');
      }
    });

    window.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        UI.globalDropOverlay.classList.remove('active');
      }
    });

    window.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    window.addEventListener('drop', (e) => {
      e.preventDefault();
      dragCounter = 0;
      UI.globalDropOverlay.classList.remove('active');

      if (state.currentUser && e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        addFilesToQueue(e.dataTransfer.files);
      }
    });

    // Local Dropzone highlight helpers
    [UI.dashboardDropzone, UI.filesDropzone, UI.modalDropzone].forEach(dropzone => {
      if (!dropzone) return;
      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('drag-over');
      });
      dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('drag-over');
      });
      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('drag-over');
        if (e.dataTransfer && e.dataTransfer.files) {
          addFilesToQueue(e.dataTransfer.files);
        }
      });
    });
  }

  // ==========================================================================
  // APP LIFECYCLE & STARTUP
  // ==========================================================================

  async function checkInitialSession() {
    if (!state.supabase) return;
    try {
      const { data, error } = await state.supabase.auth.getSession();
      if (!error && data?.session?.user) {
        onUserAuthenticated(data.session.user);
      } else {
        UI.appShell.classList.add('hidden');
        UI.authScreen.classList.remove('hidden');
      }
    } catch (err) {
      console.warn('[SkyVault] Session restoration notice:', err);
      UI.appShell.classList.add('hidden');
      UI.authScreen.classList.remove('hidden');
    }

    // Subscribe to auth state changes
    state.supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        onUserAuthenticated(session.user);
      } else if (event === 'SIGNED_OUT') {
        state.currentUser = null;
        UI.appShell.classList.add('hidden');
        UI.authScreen.classList.remove('hidden');
      }
    });
  }

  function startApp() {
    initSupabase();
    setupEventListeners();
    checkInitialSession();
  }

  // Launch when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp);
  } else {
    startApp();
  }

})();
