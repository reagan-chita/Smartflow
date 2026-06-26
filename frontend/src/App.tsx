import { useState, useEffect, useRef } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './App.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL 
  ? (import.meta.env.VITE_API_BASE_URL.endsWith('/api') 
      ? import.meta.env.VITE_API_BASE_URL 
      : `${import.meta.env.VITE_API_BASE_URL}/api`)
  : 'http://localhost:8080/api';

const dataURLtoBlob = (dataurl) => {
  try {
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  } catch (e) {
    console.error('Failed to convert data URL to Blob:', e);
    return null;
  }
};

// Pure JS Base32 Decoder and TOTP Generator (Web Crypto API)
const base32Decode = (str) => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  str = str.replace(/=+$/, '').toUpperCase();
  let val = 0;
  let count = 0;
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    const idx = alphabet.indexOf(str[i]);
    if (idx === -1) continue;
    val = (val << 5) | idx;
    count += 5;
    if (count >= 8) {
      bytes.push((val >>> (count - 8)) & 0xff);
      count -= 8;
    }
  }
  return new Uint8Array(bytes);
};

const generateTOTP = async (secret, timeStep = 30) => {
  try {
    const keyBytes = base32Decode(secret);
    const epoch = Math.round(new Date().getTime() / 1000);
    const counter = Math.floor(epoch / timeStep);
    
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    view.setUint32(0, 0);
    view.setUint32(4, counter);
    
    const cryptoKey = await window.crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "HMAC", hash: { name: "SHA-1" } },
      false,
      ["sign"]
    );
    
    const signature = await window.crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      buffer
    );
    
    const sigBytes = new Uint8Array(signature);
    const offset = sigBytes[sigBytes.length - 1] & 0x0f;
    const binary = ((sigBytes[offset] & 0x7f) << 24) |
                   ((sigBytes[offset + 1] & 0xff) << 16) |
                   ((sigBytes[offset + 2] & 0xff) << 8) |
                   (sigBytes[offset + 3] & 0xff);
    
    const otp = binary % 1000000;
    return String(otp).padStart(6, '0');
  } catch (e) {
    console.error('Failed to generate TOTP client-side:', e);
    return '';
  }
};

const formatRelativeTime = (dateStr) => {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (isNaN(diffMs)) return '';
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch (e) {
    return '';
  }
};

const THEMES = {
  indigo: {
    'theme-300': '#8c7eff',
    'theme-400': '#6a57ff',
    'theme-500': '#4e3ae4',
    'theme-600': '#3b25d8',
    'theme-700': '#312783',
    'theme-bg-start': '#312783',
    'theme-bg-end': '#060913',
  },
  emerald: {
    'theme-300': '#6ee7b7',
    'theme-400': '#34d399',
    'theme-500': '#10b981',
    'theme-600': '#059669',
    'theme-700': '#047857',
    'theme-bg-start': '#047857',
    'theme-bg-end': '#022c22',
  },
  rose: {
    'theme-300': '#fda4af',
    'theme-400': '#fb7185',
    'theme-500': '#f43f5e',
    'theme-600': '#e11d48',
    'theme-700': '#be123c',
    'theme-bg-start': '#be123c',
    'theme-bg-end': '#4c0519',
  },
  slate: {
    'theme-300': '#cbd5e1',
    'theme-400': '#94a3b8',
    'theme-500': '#64748b',
    'theme-600': '#475569',
    'theme-700': '#334155',
    'theme-bg-start': '#334155',
    'theme-bg-end': '#0f172a',
  }
};

const SignaturePad = ({ onSign }) => {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = canvas.offsetWidth;
      canvas.height = 120;
      const ctx = canvas.getContext('2d');
      ctx.lineCap = 'round';
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#312783';
    }
  }, []);

  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    if (canvas.width !== canvas.offsetWidth) {
      const currentData = canvas.toDataURL();
      canvas.width = canvas.offsetWidth;
      const ctx = canvas.getContext('2d');
      ctx.lineCap = 'round';
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#312783';
      const img = new Image();
      img.src = currentData;
      img.onload = () => ctx.drawImage(img, 0, 0);
    }
    const { offsetX, offsetY } = e.nativeEvent;
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(offsetX, offsetY);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const { offsetX, offsetY } = e.nativeEvent;
    const ctx = canvasRef.current.getContext('2d');
    ctx.lineTo(offsetX, offsetY);
    ctx.stroke();
  };

  const endDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    onSign(canvasRef.current.toDataURL('image/png'));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onSign('');
  };

  return (
    <div className="space-y-2 mt-4 pb-2">
      <div className="flex justify-between items-center">
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Authorized Signature <span className="text-emerald-400">(Required for Approval)</span></label>
        <button type="button" onClick={clear} className="text-xs text-rose-400 hover:text-rose-300 transition-colors">Clear</button>
      </div>
      <canvas
        ref={canvasRef}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={endDrawing}
        onMouseLeave={endDrawing}
        className="w-full bg-slate-100 border border-white/20 rounded-lg cursor-crosshair touch-none"
      />
      <p className="text-[10px] text-slate-500 italic">Please draw your official signature above.</p>
    </div>
  );
};

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user')) || null);
  const [currentView, setCurrentView] = useState(
    (localStorage.getItem('token') && localStorage.getItem('user')) ? 'dashboard' : 'login'
  );

  const appFetch = async (url, options = {}) => {
    const isLogin = url.endsWith('/login');
    const headers = {
      ...(options as any).headers,
    };
    if (!isLogin && token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(url, {
      ...options,
      headers,
    });

    if (res.status === 401 && !isLogin) {
      let msg = 'You must log in';
      try {
        const cloned = res.clone();
        const data = await cloned.json();
        if (data.error) msg = data.error;
      } catch (e) {}
      handleLogout();
      setErrorMsg(msg);
      throw new Error('Unauthorized');
    }

    return res;
  };

  // Global action loading state — tracks which action is pending
  const [actionLoading, setActionLoading] = useState(''); // e.g. 'login', 'save', 'submit-123', 'approve', etc.

  // App state
  const [applications, setApplications] = useState([]);
  const [selectedApp, setSelectedApp] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editAppId, setEditAppId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Filter for reviewer
  const [reviewerFilter, setReviewerFilter] = useState('all'); // 'all', 'submitted', 'under_review', 'approved', 'rejected', 'returned'

  // Form fields
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');

  // Reviewer comment
  const [comment, setComment] = useState('');
  const [actionSignature, setActionSignature] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Premium Portal States
  const [toasts, setToasts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [exportState, setExportState] = useState('idle');

  // User Management state
  const [usersList, setUsersList] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState('applicant');
  const [newUserPerms, setNewUserPerms] = useState([]);

  // Extra features states
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [warningCountdown, setWarningCountdown] = useState(30);
  const [notifications, setNotifications] = useState([]);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [attachmentName, setAttachmentName] = useState('');
  const [attachmentData, setAttachmentData] = useState('');

  // Pagination states
  const [appsPage, setAppsPage] = useState(1);
  const [queuePage, setQueuePage] = useState(1);
  const [queueSearch, setQueueSearch] = useState('');
  const [totalReviewerApps, setTotalReviewerApps] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [usersPage, setUsersPage] = useState(1);
  const [loginAuditPage, setLoginAuditPage] = useState(1);
  const ITEMS_PER_PAGE = 8;

  // Profile Dropdown state
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);

  // Theme state
  const [themeColor, setThemeColor] = useState(() => {
    return localStorage.getItem('smartflow_theme') || 'indigo';
  });

  useEffect(() => {
    const theme = THEMES[themeColor] || THEMES['indigo'];
    const root = document.documentElement;
    Object.keys(theme).forEach(key => {
      root.style.setProperty(`--${key}`, theme[key]);
    });
    localStorage.setItem('smartflow_theme', themeColor);
  }, [themeColor]);

  // Welcome Message states
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeVisible, setWelcomeVisible] = useState(false);

  // Audit Logs state
  const [auditLogsList, setAuditLogsList] = useState([]);
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(false);
  const [auditSearchQuery, setAuditSearchQuery] = useState('');
  const [auditStartDate, setAuditStartDate] = useState('');
  const [auditEndDate, setAuditEndDate] = useState('');

  // Login Audit Logs state
  const [loginAuditLogs, setLoginAuditLogs] = useState([]);
  const [loadingLoginAudit, setLoadingLoginAudit] = useState(false);
  const [loginAuditSearch, setLoginAuditSearch] = useState('');
  const [loginAuditStartDate, setLoginAuditStartDate] = useState('');
  const [loginAuditEndDate, setLoginAuditEndDate] = useState('');
  const [isAuditDropdownOpen, setIsAuditDropdownOpen] = useState(false);

  // 2FA Setup & Login states
  const [tfaSecret, setTfaSecret] = useState('');
  const [tfaQRCodeURL, setTfaQRCodeURL] = useState('');
  const [tfaVerifyCode, setTfaVerifyCode] = useState('');
  const [isTfaModalOpen, setIsTfaModalOpen] = useState(false);
  const [loading2FA, setLoading2FA] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaTicket, setMfaTicket] = useState('');
  const [mfaCode, setMfaCode] = useState('');

  const [modalTotpCode, setModalTotpCode] = useState('');
  const [modalSecondsLeft, setModalSecondsLeft] = useState(null);
  const [loginTotpCode, setLoginTotpCode] = useState('');
  const [loginSecondsLeft, setLoginSecondsLeft] = useState(null);

  // Effect for 2FA Setup Modal OTP display
  useEffect(() => {
    if (!isTfaModalOpen || !tfaSecret) {
      setModalTotpCode('');
      setModalSecondsLeft(null);
      return;
    }

    const updateModalOTP = async () => {
      const otp = await generateTOTP(tfaSecret);
      setModalTotpCode(otp);
      setModalSecondsLeft(30 - (Math.round(new Date().getTime() / 1000) % 30));
    };

    updateModalOTP();
    const interval = setInterval(updateModalOTP, 1000);
    return () => clearInterval(interval);
  }, [isTfaModalOpen, tfaSecret]);

  // Effect for Dev-Helper login code display
  useEffect(() => {
    if (!mfaRequired || !mfaTicket) {
      setLoginTotpCode('');
      setLoginSecondsLeft(null);
      return;
    }

    const fetchDevCode = async () => {
      try {
        const res = await fetch(`${API_BASE}/2fa/dev-code?ticket=${mfaTicket}`);
        if (res.ok) {
          const data = await res.json();
          setLoginTotpCode(data.code);
          setLoginSecondsLeft(data.seconds_remaining);
        }
      } catch (e) {
        console.error('Failed to fetch dev 2FA code:', e);
      }
    };

    fetchDevCode();
    // Poll the dev code endpoint every 5 seconds to keep it fresh
    const interval = setInterval(fetchDevCode, 5000);
    return () => clearInterval(interval);
  }, [mfaRequired, mfaTicket]);

  const filteredAuditLogs = auditLogsList.filter(log => {
    const query = auditSearchQuery.toLowerCase();
    
    // Search query check
    const matchesQuery = (
      log.id.toString().includes(query) ||
      (log.application_title || '').toLowerCase().includes(query) ||
      log.application_id.toString().includes(query) ||
      (log.user_name || '').toLowerCase().includes(query) ||
      log.user_id.toString().includes(query) ||
      (log.old_status || '').toLowerCase().includes(query) ||
      (log.new_status || '').toLowerCase().includes(query) ||
      (log.comment || '').toLowerCase().includes(query)
    );

    if (!matchesQuery) return false;

    // Date range filter
    const logDate = new Date(log.created_at);
    if (auditStartDate) {
      const [yr, mo, dy] = auditStartDate.split('-').map(Number);
      const startObj = new Date(yr, mo - 1, dy, 0, 0, 0, 0);
      if (logDate < startObj) return false;
    }
    if (auditEndDate) {
      const [yr, mo, dy] = auditEndDate.split('-').map(Number);
      const endObj = new Date(yr, mo - 1, dy, 23, 59, 59, 999);
      if (logDate > endObj) return false;
    }

    return true;
  });

  const handleExportCSV = () => {
    setExportState('gathering');
    setTimeout(() => {
      setExportState('formatting');
      setTimeout(() => {
        setExportState('downloading');
        
        try {
          const headers = ['Log ID', 'Application Title', 'Application ID', 'Operator Name', 'Operator ID', 'Old Status', 'New Status', 'Comment', 'Timestamp'];
          const rows = filteredAuditLogs.map(log => [
            log.id,
            log.application_title || '',
            log.application_id,
            log.user_name || '',
            log.user_id,
            log.old_status || '',
            log.new_status || '',
            log.comment || '',
            new Date(log.created_at).toLocaleString()
          ]);
          const csvContent = "data:text/csv;charset=utf-8,\uFEFF"
            + [headers.join(','), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n');
          const encodedUri = encodeURI(csvContent);
          const link = document.createElement("a");
          link.setAttribute("href", encodedUri);
          link.setAttribute("download", `audit_log_report_${Date.now()}.csv`);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } catch (e) {
          console.error('CSV Export error:', e);
        }

        setTimeout(() => {
          setExportState('success');
          setTimeout(() => {
            setExportState('idle');
          }, 2000);
        }, 1000);
      }, 1000);
    }, 1000);
  };

  const handleExportPDF = () => {
    const printWindow = window.open('', '_blank');
    const logsHtml = filteredAuditLogs.map(log => `
      <tr>
        <td>#${log.id}</td>
        <td>${log.application_title || `App ID: ${log.application_id}`}</td>
        <td>${log.user_name || `User ID: ${log.user_id}`}</td>
        <td>${log.old_status || '(NEW)'} &rarr; ${log.new_status}</td>
        <td>${log.comment || 'No comment'}</td>
        <td>${new Date(log.created_at).toLocaleString()}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>System Audit Log Report</title>
          <style>
            body { font-family: sans-serif; padding: 20px; color: #333; }
            h1 { font-size: 24px; color: #1e3a8a; margin-bottom: 5px; }
            p { font-size: 13px; color: #666; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 10px; text-align: left; font-size: 11px; }
            th { background-color: #f3f4f6; font-weight: bold; }
            tr:nth-child(even) { background-color: #f9fafb; }
          </style>
        </head>
        <body>
          <h1>System Audit Log Report</h1>
          <p>Generated on: ${new Date().toLocaleString()} | Filtered Entries: ${filteredAuditLogs.length}</p>
          <table>
            <thead>
              <tr>
                <th>Log ID</th>
                <th>Application</th>
                <th>Operator</th>
                <th>Transition</th>
                <th>Comment</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              ${logsHtml}
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
              window.close();
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const fetchAuditLogsList = async () => {
    if (!token) return;
    setLoadingAuditLogs(true);
    setErrorMsg('');
    try {
      const res = await appFetch(`${API_BASE}/audit-logs`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch audit logs');
      }
      setAuditLogsList(data);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoadingAuditLogs(false);
    }
  };

  // Permission Helper
  const hasPermission = (perm) => {
    if (!user || !user.permissions) return false;
    return user.permissions.split(',').includes(perm);
  };

  const fetchUsers = async () => {
    if (!token) return;
    setLoadingUsers(true);
    setErrorMsg('');
    try {
      const res = await appFetch(`${API_BASE}/users`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch users');
      }
      setUsersList(data);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleUpdateUserPermissions = async (userId, targetRole, targetPermissions) => {
    setErrorMsg('');
    try {
      const res = await appFetch(`${API_BASE}/users/${userId}/permissions`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          role: targetRole,
          permissions: targetPermissions
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update permissions');
      }
      setSuccessMsg('User role and permissions updated successfully!');
      setTimeout(() => setSuccessMsg(''), 3000);

      // Update list
      setUsersList(prev => prev.map(u => u.id === userId ? data : u));

      // Update self if updated own profile
      if (user && user.id === userId) {
        localStorage.setItem('user', JSON.stringify(data));
        setUser(data);
      }
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!newUserName.trim() || !newUserEmail.trim() || !newUserPassword.trim()) {
      setErrorMsg('Name, email, and password are required fields.');
      return;
    }

    const payload = {
      name: newUserName,
      email: newUserEmail,
      password: newUserPassword,
      role: newUserRole,
      permissions: newUserPerms.join(',')
    };

    try {
      const res = await appFetch(`${API_BASE}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create user');
      }

      setSuccessMsg('User created successfully!');
      setTimeout(() => setSuccessMsg(''), 3000);

      // Reset form fields
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserRole('applicant');
      setNewUserPerms([]);
      setIsUserModalOpen(false);

      // Refresh list
      await fetchUsers();
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  // Auto-preset permissions based on selected role
  useEffect(() => {
    if (newUserRole === 'applicant') {
      setNewUserPerms(['applications:create', 'applications:edit', 'applications:submit']);
    } else if (newUserRole === 'reviewer') {
      setNewUserPerms(['applications:review']);
    } else if (newUserRole === 'superuser') {
      setNewUserPerms(['applications:create', 'applications:edit', 'applications:submit', 'applications:review', 'users:manage']);
    }
  }, [newUserRole]);

  // Fetch users when view changes
  useEffect(() => {
    if (currentView === 'users' && hasPermission('users:manage')) {
      Promise.resolve().then(() => fetchUsers());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentView]);

  // Fetch audit logs when view changes
  useEffect(() => {
    if (currentView === 'audit-logs' || currentView === 'dashboard') {
      Promise.resolve().then(() => fetchAuditLogsList());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentView]);

  // Trigger welcome message on login or reload
  useEffect(() => {
    if (user) {
      setShowWelcome(true);
      setWelcomeVisible(true);
      const fadeTimer = setTimeout(() => {
        setWelcomeVisible(false);
      }, 4500);
      const removeTimer = setTimeout(() => {
        setShowWelcome(false);
      }, 5000);
      return () => {
        clearTimeout(fadeTimer);
        clearTimeout(removeTimer);
      };
    } else {
      setShowWelcome(false);
      setWelcomeVisible(false);
    }
  }, [user?.id]);

  // Reset pages on search/filter/view changes
  useEffect(() => {
    setAppsPage(1);
    setQueuePage(1);
  }, [searchQuery, reviewerFilter]);

  useEffect(() => {
    setAuditPage(1);
  }, [auditSearchQuery, auditStartDate, auditEndDate]);

  useEffect(() => {
    setLoginAuditPage(1);
  }, [loginAuditSearch, loginAuditStartDate, loginAuditEndDate]);

  useEffect(() => {
    setAppsPage(1);
    setQueuePage(1);
    setAuditPage(1);
    setUsersPage(1);
    setLoginAuditPage(1);
    setAuditStartDate('');
    setAuditEndDate('');
    setLoginAuditStartDate('');
    setLoginAuditEndDate('');
  }, [currentView]);

  // Extend session by dispatching dummy event
  const handleExtendSession = () => {
    setShowWarningModal(false);
    window.dispatchEvent(new Event('click'));
  };

  // Warning countdown ticker
  useEffect(() => {
    if (!showWarningModal) return;

    const intervalId = setInterval(() => {
      setWarningCountdown(prev => {
        if (prev <= 1) {
          clearInterval(intervalId);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(intervalId);
  }, [showWarningModal]);

  // Notifications API actions
  const fetchNotifications = async () => {
    if (!token) return;
    try {
      const res = await appFetch(`${API_BASE}/notifications`);
      const data = await res.json();
      if (res.ok) {
        setNotifications(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleReadNotif = async (id) => {
    try {
      const res = await appFetch(`${API_BASE}/notifications/${id}/read`, {
        method: 'PUT'
      });
      if (res.ok) {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleReadAllNotifs = async () => {
    try {
      const res = await appFetch(`${API_BASE}/notifications/read-all`, {
        method: 'POST'
      });
      if (res.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Poll notifications
  useEffect(() => {
    if (!token) return;
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 10000); // 10 seconds polling
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Idle timeout auto-logout mechanism (2.5 minutes warning, 3 minutes logout)
  useEffect(() => {
    if (!token) {
      setShowWarningModal(false);
      return;
    }

    let warningTimerId;
    let logoutTimerId;

    const performLogout = () => {
      handleLogout();
      setErrorMsg('You must log in');
      setShowWarningModal(false);
    };

    const resetTimer = () => {
      setShowWarningModal(false);
      if (warningTimerId) clearTimeout(warningTimerId);
      if (logoutTimerId) clearTimeout(logoutTimerId);

      // Warning shows up at 2.5 minutes (150,000 ms)
      warningTimerId = setTimeout(() => {
        setShowWarningModal(true);
        setWarningCountdown(30);

        // Final logout executes 30 seconds later (180,000 ms total)
        logoutTimerId = setTimeout(() => {
          performLogout();
        }, 30 * 1000);
      }, 150000);
    };

    const events = ['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart', 'click'];
    
    resetTimer();

    events.forEach(event => {
      window.addEventListener(event, resetTimer);
    });

    return () => {
      if (warningTimerId) clearTimeout(warningTimerId);
      if (logoutTimerId) clearTimeout(logoutTimerId);
      events.forEach(event => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [token]);

  // Declared above hooks to satisfy ESLint
  const addToast = (message, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // Intercept feedback messages and route to Toast notifications asynchronously
  useEffect(() => {
    if (errorMsg) {
      Promise.resolve().then(() => {
        addToast(errorMsg, 'error');
        setErrorMsg('');
      });
    }
  }, [errorMsg]);

  useEffect(() => {
    if (successMsg) {
      Promise.resolve().then(() => {
        addToast(successMsg, 'success');
        setSuccessMsg('');
      });
    }
  }, [successMsg]);

  // Helper for rendering premium SVG progress circular gauges
  const renderProgressCircle = (count, total, colorClass = 'stroke-indigo-500') => {
    const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
    const radius = 16;
    const circumference = 2 * Math.PI * radius; // ~100.53
    const offset = circumference - (percentage / 100) * circumference;

    return (
      <div className="relative flex items-center justify-center w-12 h-12 flex-shrink-0">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 40 40">
          <circle
            cx="20"
            cy="20"
            r={radius}
            className="stroke-white/5"
            strokeWidth="3.5"
            fill="transparent"
          />
          <circle
            cx="20"
            cy="20"
            r={radius}
            className={`transition-all duration-700 ease-out ${colorClass}`}
            strokeWidth="3.5"
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute text-[10px] font-bold text-slate-200">{percentage}%</span>
      </div>
    );
  };

  // Color mapping for dynamic status timelines and glows
  const getStatusColorInfo = (status) => {
    switch (status) {
      case 'APPROVED':
        return {
          dotClass: 'bg-emerald-500 border-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.7)]',
          textClass: 'text-emerald-400 font-bold',
          bgClass: 'bg-emerald-500/10 border-emerald-500/30'
        };
      case 'REJECTED':
        return {
          dotClass: 'bg-rose-500 border-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.7)]',
          textClass: 'text-rose-400 font-bold',
          bgClass: 'bg-rose-500/10 border-rose-500/30'
        };
      case 'RETURNED':
        return {
          dotClass: 'bg-purple-500 border-purple-400 shadow-[0_0_12px_rgba(168,85,247,0.7)]',
          textClass: 'text-purple-400 font-bold',
          bgClass: 'bg-purple-500/10 border-purple-500/30'
        };
      case 'UNDER_REVIEW':
        return {
          dotClass: 'bg-orange-500 border-orange-400 shadow-[0_0_12px_rgba(249,115,22,0.7)]',
          textClass: 'text-orange-400 font-bold',
          bgClass: 'bg-orange-500/10 border-orange-500/30'
        };
      case 'SUBMITTED':
        return {
          dotClass: 'bg-blue-500 border-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.7)]',
          textClass: 'text-blue-400 font-bold',
          bgClass: 'bg-blue-500/10 border-blue-500/30'
        };
      case 'DRAFT':
        return {
          dotClass: 'bg-slate-500 border-slate-400 shadow-[0_0_12px_rgba(148,163,184,0.7)]',
          textClass: 'text-slate-400 font-bold',
          bgClass: 'bg-slate-500/10 border-slate-500/30'
        };
      default:
        return {
          dotClass: 'bg-indigo-500 border-indigo-400 shadow-[0_0_12px_rgba(99,102,241,0.7)]',
          textClass: 'text-indigo-400 font-bold',
          bgClass: 'bg-indigo-500/10 border-indigo-500/30'
        };
    }
  };

  // Sorting handlers
  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const renderSortHeader = (field, label) => {
    const isActive = sortField === field;
    return (
      <th
        className="px-4 py-3 cursor-pointer select-none hover:text-white transition-colors"
        onClick={() => handleSort(field)}
      >
        <div className="flex items-center gap-1.5">
          <span>{label}</span>
          <span className={`transition-opacity duration-200 ${isActive ? 'opacity-100' : 'opacity-20 hover:opacity-50'}`}>
            {isActive && sortOrder === 'asc' ? (
              <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <polyline points="18 15 12 9 6 15" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            )}
          </span>
        </div>
      </th>
    );
  };

  // Client-side filtering and sorting for directories
  const getProcessedApps = (apps) => {
    return apps
      .filter(app => {
        if (categoryFilter && app.category !== categoryFilter) {
          return false;
        }
        const query = searchQuery.toLowerCase();
        return (
          app.title.toLowerCase().includes(query) ||
          app.category.toLowerCase().includes(query) ||
          app.status.toLowerCase().includes(query) ||
          (app.owner_name && app.owner_name.toLowerCase().includes(query))
        );
      })
      .sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];

        if (sortField === 'amount') {
          valA = Number(valA || 0);
          valB = Number(valB || 0);
        } else if (sortField === 'created_at') {
          valA = new Date(valA).getTime();
          valB = new Date(valB).getTime();
        } else {
          valA = String(valA || '').toLowerCase();
          valB = String(valB || '').toLowerCase();
        }

        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      });
  };

  const ownApps = user && (hasPermission('applications:review') && hasPermission('applications:create'))
    ? applications.filter(a => a.owner_id === user.id)
    : applications;

  const processedApps = getProcessedApps(
    currentView === 'applications' ? ownApps : applications
  );

  const paginatedApps = processedApps.slice((appsPage - 1) * ITEMS_PER_PAGE, appsPage * ITEMS_PER_PAGE);
  const totalAppsPages = Math.ceil(processedApps.length / ITEMS_PER_PAGE);

  const paginatedQueue = hasPermission('applications:review') ? processedApps : processedApps.slice((queuePage - 1) * ITEMS_PER_PAGE, queuePage * ITEMS_PER_PAGE);
  const totalQueuePages = hasPermission('applications:review') ? Math.ceil(totalReviewerApps / ITEMS_PER_PAGE) : Math.ceil(processedApps.length / ITEMS_PER_PAGE);

  const paginatedAuditLogs = filteredAuditLogs.slice((auditPage - 1) * ITEMS_PER_PAGE, auditPage * ITEMS_PER_PAGE);
  const totalAuditPages = Math.ceil(filteredAuditLogs.length / ITEMS_PER_PAGE);

  const paginatedUsers = usersList.slice((usersPage - 1) * ITEMS_PER_PAGE, usersPage * ITEMS_PER_PAGE);
  const totalUsersPages = Math.ceil(usersList.length / ITEMS_PER_PAGE);

  const renderPagination = (currentPage, totalPages, totalItems, setPage) => {
    if (totalPages <= 1) return null;
    
    const pages = [];
    const maxVisible = 5;
    
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }
    
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = Math.min(currentPage * ITEMS_PER_PAGE, totalItems);

    return (
      <div className="px-5 py-4 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-950/40 text-xs">
        <div className="text-slate-400">
          Showing <span className="font-semibold text-white">{startIndex + 1}</span> to <span className="font-semibold text-white">{endIndex}</span> of <span className="font-semibold text-white">{totalItems}</span> entries
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setPage(1)}
            disabled={currentPage === 1}
            className="px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer text-slate-300 font-semibold"
            title="First Page"
          >
            &laquo;
          </button>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer text-slate-300 font-semibold"
          >
            Previous
          </button>
          {pages.map(pageNum => (
            <button
              key={pageNum}
              onClick={() => setPage(pageNum)}
              className={`px-3 py-1.5 rounded-lg border font-semibold transition-all cursor-pointer ${currentPage === pageNum
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                }`}
            >
              {pageNum}
            </button>
          ))}
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer text-slate-300 font-semibold"
          >
            Next
          </button>
          <button
            onClick={() => setPage(totalPages)}
            disabled={currentPage === totalPages}
            className="px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer text-slate-300 font-semibold"
            title="Last Page"
          >
            &raquo;
          </button>
        </div>
      </div>
    );
  };

  // Fetch applications based on permissions
  const fetchApplications = async () => {
    if (!token || !user) return;
    setErrorMsg('');
    try {
      let url = `${API_BASE}/applications`;
      if (hasPermission('applications:review')) {
        url = `${API_BASE}/reviewer/applications?status=${reviewerFilter}&page=${queuePage}&limit=${ITEMS_PER_PAGE}&search=${encodeURIComponent(queueSearch)}`;
      }

      const res = await appFetch(url);

      if (!res.ok) {
        throw new Error('Failed to fetch applications');
      }

      const resData = await res.json();
      
      if (hasPermission('applications:review')) {
        setApplications(resData.data || []);
        setTotalReviewerApps(resData.total || 0);
      } else {
        setApplications(resData || []);
      }
      
      if (token && user) {
        fetchAuditLogsList();
      }
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const [analyticsData, setAnalyticsData] = useState(null);

  const fetchAnalytics = async () => {
    if (!token || !user) return;
    if (user.role !== 'reviewer' && user.role !== 'superuser') return;
    try {
      const res = await appFetch(`${API_BASE}/analytics`);
      if (res.ok) {
        const data = await res.json();
        setAnalyticsData(data);
      }
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
    }
  };

  const handleSelectCategory = (cat) => {
    if (categoryFilter === cat) {
      setCategoryFilter('');
    } else {
      setCategoryFilter(cat);
    }
  };

  const handleCardMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    e.currentTarget.style.setProperty('--mouse-x', `${x}px`);
    e.currentTarget.style.setProperty('--mouse-y', `${y}px`);
  };

  // Initial routing / load data when logged in
  useEffect(() => {
    if (token && user) {
      Promise.resolve().then(() => {
        fetchApplications();
        fetchAnalytics();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user]);

  // Re-fetch when filter changes for reviewer
  useEffect(() => {
    if (user && hasPermission('applications:review')) {
      Promise.resolve().then(() => fetchApplications());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewerFilter, queuePage, queueSearch]);

  // Auth operations
  const handleLogin = async (email, password) => {
    setErrorMsg('');
    setActionLoading('login');
    try {
      const res = await appFetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }

      if (data.mfa_required) {
        setMfaTicket(data.ticket);
        setMfaRequired(true);
        setMfaCode('');
        return;
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      setCurrentView('dashboard');
      setSuccessMsg('Logged in successfully!');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setActionLoading('');
    }
  };

  const handleMfaSubmit = async (e) => {
    e.preventDefault();
    if (mfaCode.length !== 6) {
      setErrorMsg('Please enter a 6-digit code.');
      return;
    }

    setErrorMsg('');
    setActionLoading('login-mfa');
    try {
      const res = await appFetch(`${API_BASE}/login/mfa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ticket: mfaTicket, code: mfaCode })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'MFA validation failed');
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      setMfaRequired(false);
      setMfaTicket('');
      setMfaCode('');
      setCurrentView('dashboard');
      setSuccessMsg('Logged in successfully with 2FA!');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setActionLoading('');
    }
  };

  const handleOpen2FASetup = async () => {
    if (user.tfa_enabled) {
      // Disable 2FA
      if (confirm('Are you sure you want to disable Two-Factor Authentication? This will make your account less secure.')) {
        try {
          setActionLoading('2fa-disable');
          const res = await appFetch(`${API_BASE}/2fa/disable`, { method: 'POST' });
          const data = await res.json();
          if (res.ok) {
            const updatedUser = { ...user, tfa_enabled: false, tfa_secret: null };
            setUser(updatedUser);
            localStorage.setItem('user', JSON.stringify(updatedUser));
            setSuccessMsg('Two-Factor Authentication disabled successfully.');
          } else {
            setErrorMsg(data.error || 'Failed to disable 2FA');
          }
        } catch (e) {
          setErrorMsg('An error occurred while disabling 2FA.');
        } finally {
          setActionLoading('');
        }
      }
    } else {
      // Setup 2FA (fetch secret and QR code)
      try {
        setLoading2FA(true);
        const res = await appFetch(`${API_BASE}/2fa/setup`, { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
          setTfaSecret(data.secret);
          setTfaQRCodeURL(data.qr_code_url);
          setTfaVerifyCode('');
          setIsTfaModalOpen(true);
        } else {
          setErrorMsg(data.error || 'Failed to initialize 2FA setup');
        }
      } catch (e) {
        setErrorMsg('An error occurred during 2FA setup.');
      } finally {
        setLoading2FA(false);
      }
    }
  };

  const handleConfirm2FA = async (e) => {
    e.preventDefault();
    if (tfaVerifyCode.length !== 6) {
      setErrorMsg('Please enter a 6-digit verification code.');
      return;
    }
    try {
      setActionLoading('2fa-enable');
      const res = await appFetch(`${API_BASE}/2fa/enable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: tfaVerifyCode })
      });
      const data = await res.json();
      if (res.ok) {
        const updatedUser = { ...user, tfa_enabled: true, tfa_secret: tfaSecret };
        setUser(updatedUser);
        localStorage.setItem('user', JSON.stringify(updatedUser));
        setIsTfaModalOpen(false);
        setSuccessMsg('Two-Factor Authentication enabled successfully!');
      } else {
        setErrorMsg(data.error || 'Invalid verification code');
      }
    } catch (e) {
      setErrorMsg('An error occurred while enabling 2FA.');
    } finally {
      setActionLoading('');
    }
  };

  const handleLogout = () => {
    // Fire-and-forget logout audit call before clearing state
    const tok = localStorage.getItem('token');
    if (tok) {
      appFetch(`${API_BASE}/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tok}` },
        body: JSON.stringify({ user_agent: navigator.userAgent })
      }).catch(() => {});
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken('');
    setUser(null);
    setApplications([]);
    setSelectedApp(null);
    setAuditLogs([]);
    setLoginAuditLogs([]);
    setCurrentView('login');
  };

  // Load detail / selection
  const handleSelectApp = async (appId) => {
    setErrorMsg('');
    setActionLoading(`open-${appId}`);
    try {
      const res = await appFetch(`${API_BASE}/applications/${appId}`);

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch application details');
      }

      setSelectedApp(data.application);
      setAuditLogs(data.audit_logs);
      setComment('');
      if (user && user.role === 'reviewer') {
        setCurrentView('review-details');
      } else {
        setCurrentView('details');
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setActionLoading('');
    }
  };

  // Create or Update Application
  const handleSaveApplication = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!title.trim() || !category.trim() || !amount) {
      setErrorMsg('Title, Category, and Amount are required fields.');
      return;
    }

    const payload = {
      title,
      category,
      description,
      amount: parseFloat(amount),
      attachment_name: attachmentName,
      attachment_data: attachmentData
    };

    setActionLoading('save');
    try {
      let url = `${API_BASE}/applications`;
      let method = 'POST';

      if (isEditing) {
        url = `${API_BASE}/applications/${editAppId}`;
        method = 'PUT';
      }

      const res = await appFetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save application');
      }

      setSuccessMsg(isEditing ? 'Application updated successfully!' : 'Application created as draft!');
      setTimeout(() => setSuccessMsg(''), 3000);

      // Clean form and reload
      setTitle('');
      setCategory('');
      setDescription('');
      setAmount('');
      setAttachmentName('');
      setAttachmentData('');
      setIsEditing(false);
      setEditAppId(null);
      setIsModalOpen(false);

      await fetchApplications();
      setCurrentView('applications');
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setActionLoading('');
    }
  };

  // Delete Application
  const handleDeleteApplication = async (appId) => {
    if (!window.confirm("Are you sure you want to delete this application?")) return;
    setErrorMsg('');
    setActionLoading(`delete-${appId}`);
    try {
      const res = await appFetch(`${API_BASE}/applications/${appId}`, {
        method: 'DELETE'
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete application');
      }

      setSuccessMsg('Application deleted successfully!');
      setTimeout(() => setSuccessMsg(''), 3000);

      if (selectedApp && selectedApp.id === appId) {
        setSelectedApp(null);
      }

      await fetchApplications();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setActionLoading('');
    }
  };

  // Open creation form
  const handleOpenCreateForm = () => {
    setTitle('');
    setCategory('');
    setDescription('');
    setAmount('');
    setAttachmentName('');
    setAttachmentData('');
    setIsEditing(false);
    setEditAppId(null);
    setErrorMsg('');
    setCurrentView('applications');
    setIsModalOpen(true);
    setSelectedApp(null);
  };

  // Open edit form
  const handleOpenEditForm = (app) => {
    setTitle(app.title);
    setCategory(app.category);
    setDescription(app.description);
    setAmount(app.amount.toString());
    setAttachmentName(app.attachment_name || '');
    setAttachmentData(app.attachment_data || '');
    setIsEditing(true);
    setEditAppId(app.id);
    setErrorMsg('');
    setCurrentView('applications');
    setIsModalOpen(true);
    setSelectedApp(null);
  };

  const handleNewAppClick = () => {
    handleOpenCreateForm();
  };

  const handleRowClick = (app) => {
    handleSelectApp(app.id);
  };

  // Actions transitions
  const generatePDFCertificate = (app) => {
    const doc = new jsPDF('p', 'mm', 'a4');
    
    // Premium Border
    doc.setDrawColor(49, 39, 131); // theme-700 #312783
    doc.setLineWidth(1.5);
    doc.rect(15, 15, 180, 267);
    doc.setDrawColor(200, 180, 100); // Gold-ish inner border
    doc.setLineWidth(0.5);
    doc.rect(17, 17, 176, 263);

    // Header Text
    doc.setTextColor(49, 39, 131);
    doc.setFont("times", "bold");
    doc.setFontSize(36);
    doc.text("Certificate of Approval", 105, 45, { align: 'center' });
    
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(12);
    doc.setFont("times", "italic");
    doc.text("Awarded by the Smartflow Evaluation Committee", 105, 55, { align: 'center' });

    // Main Body
    doc.setTextColor(40, 40, 40);
    doc.setFont("times", "normal");
    doc.setFontSize(16);
    doc.text("This document certifies that the following application has been", 105, 75, { align: 'center' });
    doc.text("formally reviewed and APPROVED.", 105, 83, { align: 'center' });

    doc.setFont("times", "bold");
    doc.setFontSize(22);
    doc.setTextColor(0, 0, 0);
    doc.text(app.title.toUpperCase(), 105, 105, { align: 'center' });

    // Details Table using autoTable
    autoTable(doc, {
      startY: 120,
      margin: { left: 30, right: 30 },
      theme: 'grid',
      headStyles: { fillColor: [49, 39, 131], textColor: 255, fontStyle: 'bold', halign: 'center' },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 60, fillColor: [248, 248, 250] },
        1: { cellWidth: 90 }
      },
      body: [
        ['Category', app.category],
        ['Amount Approved', `ZMW ${app.amount.toLocaleString()}`],
        ['Applicant Name', app.owner_name || user.name],
        ['Approval Date', new Date().toLocaleDateString()],
        ['Application ID', `#APP-${app.id.toString().padStart(5, '0')}`]
      ],
    });

    // Description section
    let finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY : 170;
    
    doc.setFont("times", "bold");
    doc.setFontSize(12);
    doc.setTextColor(40, 40, 40);
    doc.text("Project Description:", 30, finalY + 15);
    doc.setFont("times", "normal");
    doc.setFontSize(11);
    doc.setTextColor(80, 80, 80);
    const splitDesc = doc.splitTextToSize(app.description || 'No description provided.', 150);
    doc.text(splitDesc, 30, finalY + 22);

    // Footer Signatures
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.5);
    doc.line(40, 250, 90, 250);
    doc.line(120, 250, 170, 250);
    
    if (app.digital_signature) {
      doc.addImage(app.digital_signature, 'PNG', 50, 230, 30, 18);
    }
    
    doc.setFont("times", "bold");
    doc.setFontSize(11);
    doc.setTextColor(40, 40, 40);
    doc.text("Authorized Signature", 65, 256, { align: 'center' });
    doc.text("Date", 145, 256, { align: 'center' });
    
    const approvalDateStr = app.approval_date ? new Date(app.approval_date).toLocaleDateString() : new Date().toLocaleDateString();
    doc.setFont("times", "italic");
    doc.text(approvalDateStr, 145, 245, { align: 'center' });

    doc.setFontSize(9);
    doc.setFont("times", "normal");
    doc.setTextColor(150, 150, 150);
    doc.text("Generated securely by Smartflow Enterprise", 105, 275, { align: 'center' });

    doc.save(`Approved_${app.title.replace(/\s+/g, '_')}.pdf`);
    showToast(`Premium Certificate downloaded for ${app.title}`, 'success');
  };

  const handleTransition = async (appId, actionPath, payload = {}) => {
    setErrorMsg('');
    setActionLoading(actionPath);
    try {
      const res = await appFetch(`${API_BASE}/applications/${appId}/${actionPath}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Transition failed');
      }

      setSuccessMsg(`Action executed successfully!`);
      setTimeout(() => setSuccessMsg(''), 3000);

      // Refresh list & current selected details
      await fetchApplications();
      if (selectedApp && selectedApp.id === appId) {
        await handleSelectApp(appId);
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setActionLoading('');
    }
  };

  // Format currency
  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-ZM', {
      style: 'currency',
      currency: 'ZMW'
    }).format(val);
  };

  // Status Badge Colors (DRAFT -> Gray, SUBMITTED -> Blue, UNDER_REVIEW -> Orange, APPROVED -> Green, REJECTED -> Red, RETURNED -> Purple)
  const renderStatusBadge = (status) => {
    switch (status) {
      case 'DRAFT':
        return (
          <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border bg-slate-500/10 text-slate-400 border-slate-500/30">
            DRAFT
          </span>
        );
      case 'SUBMITTED':
        return (
          <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border bg-blue-500/10 text-blue-300 border-blue-500/30">
            SUBMITTED
          </span>
        );
      case 'UNDER_REVIEW':
        return (
          <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border bg-orange-500/10 text-orange-300 border-orange-500/30">
            UNDER REVIEW
          </span>
        );
      case 'APPROVED':
        return (
          <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-300 border-emerald-500/30">
            APPROVED
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border bg-rose-500/10 text-rose-300 border-rose-500/30">
            REJECTED
          </span>
        );
      case 'RETURNED':
        return (
          <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border bg-purple-500/10 text-purple-300 border-purple-500/30">
            RETURNED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border bg-slate-500/10 text-slate-400 border-slate-500/30">
            {status}
          </span>
        );
    }
  };

  // Data helpers for building CSS-based charts
  const getStatusCount = (status, list = applications) => {
    if (list === applications && hasPermission('applications:review') && analyticsData) {
      return analyticsData.status_counts?.find(c => c.status === status)?.count || 0;
    }
    return list.filter(a => a.status === status).length;
  };

  const getStatusAmount = (status, list = applications) => {
    return list.filter(a => a.status === status).reduce((sum, a) => sum + a.amount, 0);
  };

  const getMaxCount = (list) => Math.max(
    getStatusCount('DRAFT', list),
    getStatusCount('SUBMITTED', list),
    getStatusCount('UNDER_REVIEW', list),
    getStatusCount('APPROVED', list),
    getStatusCount('REJECTED', list),
    getStatusCount('RETURNED', list),
    1
  );

  const getBudgetByCategoryData = (list) => {
    if (list === applications && hasPermission('applications:review') && analyticsData) {
      return analyticsData.category_counts?.map(c => ({
        name: c.category || 'Uncategorized',
        value: c.total_amount || 0
      })) || [];
    }
    const categoriesMap = {};
    list.forEach(app => {
      const cat = app.category ? app.category.trim() : 'Uncategorized';
      categoriesMap[cat] = (categoriesMap[cat] || 0) + Number(app.amount || 0);
    });

    const colors = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6'];
    return Object.keys(categoriesMap).map((cat, idx) => ({
      label: cat,
      value: categoriesMap[cat],
      color: colors[idx % colors.length],
      formattedValue: formatCurrency(categoriesMap[cat])
    })).filter(item => item.value > 0);
  };

  const getStatusDistributionData = (list) => {
    const statuses = list === ownApps 
      ? ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'RETURNED']
      : ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'RETURNED'];
      
    const colorsMap = {
      'DRAFT': '#94a3b8',
      'SUBMITTED': '#3b82f6',
      'UNDER_REVIEW': '#f97316',
      'APPROVED': '#10b981',
      'REJECTED': '#f43f5e',
      'RETURNED': '#a855f7'
    };

    return statuses.map(status => ({
      label: status === 'UNDER_REVIEW' ? 'REVIEW' : status,
      value: getStatusCount(status, list),
      color: colorsMap[status] || '#cbd5e1'
    }));
  };

  const calculateBottleneckMetrics = () => {
    if (hasPermission('applications:review') && analyticsData) {
      return { 
        avgQueueTime: 0, 
        avgDecisionTime: 0, 
        avgTotalTime: (analyticsData.average_review_time_hours || 0) * 3600 * 1000, 
        queueCount: analyticsData.total_applications || 0, 
        decisionCount: analyticsData.total_applications || 0
      };
    }

    if (!auditLogsList || auditLogsList.length === 0) {
      return { avgQueueTime: 0, avgDecisionTime: 0, avgTotalTime: 0, queueCount: 0, decisionCount: 0 };
    }

    const appLogs = {};
    auditLogsList.forEach(log => {
      if (!appLogs[log.application_id]) {
        appLogs[log.application_id] = [];
      }
      appLogs[log.application_id].push(log);
    });

    let totalQueueTime = 0;
    let totalDecisionTime = 0;
    let queueCount = 0;
    let decisionCount = 0;

    Object.keys(appLogs).forEach(appId => {
      const logs = appLogs[appId].sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      
      let tSubmitted = null;
      let tUnderReview = null;
      let tDecision = null;

      logs.forEach(log => {
        const time = new Date(log.created_at).getTime();
        if (log.new_status === 'SUBMITTED' && !tSubmitted) {
          tSubmitted = time;
        }
        if (log.new_status === 'UNDER_REVIEW' && !tUnderReview) {
          tUnderReview = time;
        }
        if (['APPROVED', 'REJECTED', 'RETURNED'].includes(log.new_status) && !tDecision) {
          tDecision = time;
        }
      });

      if (tSubmitted && tUnderReview) {
        totalQueueTime += (tUnderReview - tSubmitted);
        queueCount++;
      }
      if (tUnderReview && tDecision) {
        totalDecisionTime += (tDecision - tUnderReview);
        decisionCount++;
      }
    });

    const avgQueueTime = queueCount > 0 ? totalQueueTime / queueCount : 0;
    const avgDecisionTime = decisionCount > 0 ? totalDecisionTime / decisionCount : 0;
    const avgTotalTime = avgQueueTime + avgDecisionTime;

    return {
      avgQueueTime,
      avgDecisionTime,
      avgTotalTime,
      queueCount,
      decisionCount
    };
  };

  const formatDuration = (ms) => {
    if (ms <= 0) return '—';
    const totalSecs = Math.floor(ms / 1000);
    const totalMins = Math.floor(totalSecs / 60);
    const totalHours = Math.floor(totalMins / 60);
    const days = Math.floor(totalHours / 24);

    if (days > 0) {
      return `${days}d ${totalHours % 24}h`;
    }
    if (totalHours > 0) {
      return `${totalHours}h ${totalMins % 60}m`;
    }
    if (totalMins > 0) {
      return `${totalMins}m ${totalSecs % 60}s`;
    }
    return `${totalSecs}s`;
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="min-h-screen flex flex-col font-sans">
      {/* Global Action Loading Overlay */}
      {actionLoading && (
        <div className="fixed inset-0 z-[9999] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-3 bg-slate-900/90 border border-white/10 rounded-2xl px-8 py-6 shadow-2xl">
            <svg className="animate-spin w-8 h-8 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">
              {actionLoading === 'login' ? 'Signing In...' :
               actionLoading === 'save' ? 'Saving...' :
               actionLoading === 'submit' ? 'Submitting...' :
               actionLoading === 'approve' ? 'Approving...' :
               actionLoading === 'reject' ? 'Rejecting...' :
               actionLoading === 'return' ? 'Returning...' :
               actionLoading === 'start-review' ? 'Starting Review...' :
               actionLoading.startsWith('delete-') ? 'Deleting...' :
               actionLoading.startsWith('open-') ? 'Loading...' :
               'Processing...'}
            </span>
          </div>
        </div>
      )}
      {/* Toast Notification Stack */}
      <div className="fixed top-5 right-5 z-50 flex flex-col gap-3 pointer-events-none w-full max-w-sm">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl border glass-panel shadow-2xl animate-slide-in ${t.type === 'error'
              ? 'border-rose-500/30 bg-rose-950/40 text-rose-200 shadow-rose-950/20'
              : 'border-emerald-500/30 bg-emerald-950/40 text-emerald-200 shadow-emerald-950/20'
              }`}
          >
            {t.type === 'error' ? (
              <svg className="w-5 h-5 flex-shrink-0 text-rose-400 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            ) : (
              <svg className="w-5 h-5 flex-shrink-0 text-emerald-400 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            )}
            <div className="flex-1 text-xs font-semibold leading-normal">{t.message}</div>
            <button
              onClick={() => setToasts(prev => prev.filter(item => item.id !== t.id))}
              className="text-white/40 hover:text-white transition-colors cursor-pointer p-0.5 hover:bg-white/5 rounded"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* Top Navbar */}
      {user && (
        <header className="border-b border-white/5 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex flex-col sm:flex-row items-center gap-4 md:gap-6 w-full md:w-auto">
              <div
                className="flex items-center gap-2 font-bold text-lg text-indigo-400 cursor-pointer flex-shrink-0 justify-center sm:justify-start w-full sm:w-auto"
                onClick={() => {
                  if (user && user.role === 'reviewer') {
                    if (reviewerFilter !== 'all') {
                      setReviewerFilter('all');
                    } else {
                      fetchApplications();
                    }
                  } else {
                    fetchApplications();
                  }
                  setCurrentView('dashboard');
                  setSelectedApp(null);
                }}
              >
                <div className="bg-white/5 p-1 rounded-lg border border-white/10 hover:border-indigo-500/30 transition-all flex items-center justify-center">
                  <OpenOwnershipLogo className="h-6 w-auto text-white" />
                </div>
                <span className="text-sm font-bold tracking-tight text-slate-200">Dashboard</span>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2">
                {hasPermission('applications:create') && (
                  <div
                    onClick={() => {
                      setSelectedApp(null);
                      setCurrentView('applications');
                    }}
                    className="text-indigo-400 hover:text-indigo-300 font-semibold text-xs py-1.5 px-3 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-colors flex items-center gap-1.5 cursor-pointer animate-fade-in"
                  >
                    <svg className="w-3.5 h-3.5 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" />
                    </svg>
                    Applications
                  </div>
                )}
                {hasPermission('applications:review') && (
                  <div
                    onClick={() => {
                      if (reviewerFilter !== 'all') {
                        setReviewerFilter('all');
                      } else {
                        fetchApplications();
                      }
                      setSelectedApp(null);
                      setCurrentView('queue');
                    }}
                    className="text-indigo-400 hover:text-indigo-300 font-semibold text-xs py-1.5 px-3 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-colors flex items-center gap-1.5 cursor-pointer animate-fade-in"
                  >
                    <svg className="w-3.5 h-3.5 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
                    </svg>
                    Reviewer Queue
                  </div>
                )}
                {hasPermission('users:manage') && (
                  <div
                    onClick={() => {
                      setSelectedApp(null);
                      setCurrentView('users');
                    }}
                    className="text-indigo-400 hover:text-indigo-300 font-semibold text-xs py-1.5 px-3 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-colors flex items-center gap-1.5 cursor-pointer animate-fade-in"
                  >
                    <svg className="w-3.5 h-3.5 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    User Management
                  </div>
                )}
                {user && (
                  <div className="relative">
                    <div
                      onClick={() => setIsAuditDropdownOpen(prev => !prev)}
                      className="text-indigo-400 hover:text-indigo-300 font-semibold text-xs py-1.5 px-3 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-colors flex items-center gap-1.5 cursor-pointer animate-fade-in"
                    >
                      <svg className="w-3.5 h-3.5 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      Audit Log
                      <svg className={`w-3 h-3 transition-transform ${isAuditDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </div>
                    {isAuditDropdownOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setIsAuditDropdownOpen(false)} />
                        <div className="absolute left-0 mt-1 w-52 rounded-xl border border-white/10 bg-slate-950/95 backdrop-blur-lg shadow-2xl p-1.5 z-20 animate-fade-in">
                          <button
                            onClick={() => {
                              setIsAuditDropdownOpen(false);
                              setSelectedApp(null);
                              setLoginAuditSearch('');
                              setLoginAuditStartDate('');
                              setLoginAuditEndDate('');
                              setLoginAuditPage(1);
                              setLoadingLoginAudit(true);
                              appFetch(`${API_BASE}/login-audit-logs`)
                                .then(r => r.json())
                                .then(d => { setLoginAuditLogs(Array.isArray(d) ? d : []); })
                                .catch(() => {})
                                .finally(() => setLoadingLoginAudit(false));
                              setCurrentView('audit-logs-login');
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-300 hover:bg-white/5 hover:text-white transition-colors cursor-pointer"
                          >
                            <svg className="w-4 h-4 text-indigo-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            Login Activity
                          </button>
                          <button
                            onClick={() => {
                              setIsAuditDropdownOpen(false);
                              setSelectedApp(null);
                              setCurrentView('audit-logs');
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-300 hover:bg-white/5 hover:text-white transition-colors cursor-pointer"
                          >
                            <svg className="w-4 h-4 text-indigo-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                            </svg>
                            System Audit
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center md:justify-end gap-3 md:gap-4 relative w-full md:w-auto">
              {showWelcome && (
                <span className={`text-sm font-medium text-slate-300 transition-opacity duration-500 ease-in-out text-center sm:text-left ${welcomeVisible ? 'opacity-100' : 'opacity-0'}`}>
                  Welcome, <span className="font-bold text-white">{user.name}</span> <span className="text-xs text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20 uppercase font-mono">{user.role}</span>
                </span>
              )}

              {/* Notification Center Bell */}
              <div className="relative">
                <button
                  onClick={() => setIsNotifOpen(prev => !prev)}
                  className="relative flex items-center justify-center w-9 h-9 rounded-full bg-slate-900 border border-white/10 hover:bg-white/20 transition-all text-slate-300 hover:text-white cursor-pointer"
                  aria-label="Notifications"
                >
                  <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                  </svg>
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-black text-white ring-2 ring-slate-950 animate-pulse">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {isNotifOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setIsNotifOpen(false)}></div>
                    <div className="absolute right-0 mt-2 w-80 rounded-xl border border-white/10 bg-slate-950/95 backdrop-blur-lg shadow-2xl p-4 z-20 space-y-3 animate-fade-in text-xs">
                      <div className="flex justify-between items-center border-b border-white/5 pb-2">
                        <span className="font-bold text-white text-sm">Notifications</span>
                        {unreadCount > 0 && (
                          <button
                            onClick={handleReadAllNotifs}
                            className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold transition-colors cursor-pointer"
                          >
                            Mark all as read
                          </button>
                        )}
                      </div>
                      <div className="max-h-60 overflow-y-auto space-y-2 divide-y divide-white/5 pr-1">
                        {notifications.length > 0 ? (
                          notifications.map(n => (
                            <div key={n.id} className={`pt-2 first:pt-0 flex items-start gap-2 group transition-colors ${n.is_read ? 'opacity-60' : ''}`}>
                              <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${n.is_read ? 'bg-transparent' : 'bg-indigo-500'}`}></span>
                              <div className="flex-1 space-y-0.5">
                                <div className="font-bold text-slate-200">{n.title}</div>
                                <div className="text-slate-400 text-[10px] leading-relaxed">{n.message}</div>
                                <div className="text-slate-500 text-[8px] font-mono">{new Date(n.created_at).toLocaleString()}</div>
                              </div>
                              {!n.is_read && (
                                <button
                                  onClick={() => handleReadNotif(n.id)}
                                  className="text-slate-500 hover:text-indigo-400 transition-colors cursor-pointer"
                                  title="Mark as read"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          ))
                        ) : (
                          <div className="text-slate-500 text-center py-6">No notifications yet.</div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
              
              <div className="relative">
                <button
                  onClick={() => setIsProfileDropdownOpen(prev => !prev)}
                  className="flex items-center justify-center w-9 h-9 rounded-full bg-indigo-500/10 border border-indigo-500/30 hover:bg-indigo-500/20 transition-all text-indigo-400 cursor-pointer"
                  aria-label="User Profile"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </button>

                {isProfileDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setIsProfileDropdownOpen(false)}></div>
                    <div className="absolute right-0 mt-2 w-56 rounded-xl border border-white/10 bg-slate-950/90 backdrop-blur-lg shadow-2xl p-4 z-20 space-y-3 animate-fade-in text-xs">
                      <div className="border-b border-white/5 pb-2">
                        <div className="font-bold text-white text-sm">{user.name}</div>
                        <div className="text-slate-400 text-[10px] truncate">{user.email}</div>
                        <div className="mt-1.5">
                          <span className="text-[9px] text-indigo-300 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20 uppercase font-mono font-bold">
                            {user.role}
                          </span>
                        </div>
                      </div>
                      <div className="py-1 border-b border-white/5 space-y-1">
                        <div className="p-2">
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Theme Color</div>
                          <div className="flex items-center gap-3">
                            {Object.keys(THEMES).map(themeName => (
                              <button
                                key={themeName}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setThemeColor(themeName);
                                }}
                                className={`w-5 h-5 rounded-full border-2 transition-transform cursor-pointer ${themeColor === themeName ? 'scale-125 border-white shadow-[0_0_8px_rgba(255,255,255,0.5)]' : 'border-transparent hover:scale-110 shadow-md'}`}
                                style={{ backgroundColor: THEMES[themeName]['theme-500'] }}
                                title={`Theme: ${themeName}`}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="py-1 border-b border-white/5 space-y-1">
                        <button
                          onClick={() => {
                            setIsProfileDropdownOpen(false);
                            handleOpen2FASetup();
                          }}
                          className="w-full text-left font-semibold text-slate-300 hover:text-white hover:bg-white/5 p-2 rounded-lg transition-colors cursor-pointer flex items-center gap-2 text-xs text-indigo-400"
                        >
                          <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                          </svg>
                          {user.tfa_enabled ? "Disable 2FA" : "Enable 2FA"}
                        </button>
                      </div>
                      <div>
                        <button
                          onClick={() => {
                            setIsProfileDropdownOpen(false);
                            handleLogout();
                          }}
                          className="w-full text-left font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 p-2 rounded-lg transition-colors cursor-pointer flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
                          </svg>
                          Logout
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>
      )}

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 md:px-6 py-8 flex-1 w-full">

        {/* View 1: Login Form */}
        {currentView === 'login' && (
          <>
            {/* Full-screen Open Ownership branded background image */}
            <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
              <div 
                className="absolute inset-0 bg-cover bg-center"
                style={{ 
                  backgroundImage: `url('https://oo.hacdn.io/media/images/Ownership_complexity_Credit_Photo_.2e16d0ba.fill-415x300_9wMsess.jpg')`,
                  filter: 'brightness(0.18) contrast(1.15) saturate(1.1) blur(3px)',
                  transform: 'scale(1.05)'
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-b from-[#312783]/20 via-[#060913]/90 to-[#060913]" />
              <ParticleBackground />
            </div>

            <div className="min-h-[80vh] flex items-center justify-center animate-fade-in relative z-10">
              <div className="glass-panel rounded-2xl shadow-2xl p-6 md:p-8 w-full max-w-md border border-white/5 bg-slate-950/80 backdrop-blur-md">
              <div className="flex flex-col items-center justify-center mb-8">
                <OpenOwnershipLogo className="h-10 w-auto text-white mb-2" />
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-1">Submission & Approval Portal</p>
              </div>
              
              {!mfaRequired ? (
                <LoginForm onLogin={handleLogin} />
              ) : (
                <form onSubmit={handleMfaSubmit} className="space-y-6 animate-fade-in">
                  <div className="space-y-2 text-center">
                    <h2 className="text-base font-bold text-white uppercase tracking-wider">Two-Factor Authentication</h2>
                    <p className="text-slate-400 text-xs leading-relaxed">
                      Enter the 6-digit verification code from your authenticator app (Google Authenticator / Authy) to complete your login.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="login-mfa-code" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider text-center">Verification Code</label>
                    <input
                      id="login-mfa-code"
                      type="text"
                      maxLength={6}
                      pattern="\d{6}"
                      placeholder="e.g. 123456"
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                      className="w-full text-center tracking-[1em] pl-[1em] py-3 bg-slate-950 border border-white/10 rounded-xl text-white font-mono text-xl focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all"
                      required
                      autoFocus
                    />
                  </div>

                  {loginTotpCode && (
                    <div className="bg-emerald-950/30 border border-emerald-500/20 rounded-xl p-3 text-center space-y-2">
                      <div className="flex justify-between items-center text-[10px] font-bold text-emerald-400">
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span>
                          DEV ASSISTANT ACTIVE
                        </span>
                        <span>Expires in {loginSecondsLeft !== null ? `${loginSecondsLeft}s` : '--'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xl font-mono text-emerald-300 font-black tracking-widest">{loginTotpCode}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setMfaCode(loginTotpCode);
                            setSuccessMsg('Code auto-filled!');
                            setTimeout(() => setSuccessMsg(''), 1500);
                          }}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-[10px] font-extrabold uppercase py-1.5 px-3 rounded-lg transition-colors cursor-pointer"
                        >
                          Auto-fill
                        </button>
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm py-2.5 px-4 rounded-xl shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    Verify Code
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMfaRequired(false);
                      setMfaCode('');
                      setMfaTicket('');
                    }}
                    className="w-full bg-transparent text-slate-400 hover:text-white transition-colors cursor-pointer text-xs font-semibold py-1 text-center font-mono"
                  >
                    Back to Login
                  </button>
                </form>
              )}
            </div>
          </div>
          </>
        )}

        {/* View 2: Dashboards */}
        {currentView === 'dashboard' && user && (
          <div className="flex flex-col gap-8 animate-fade-in">
            {/* Main Dashboards (Applicant / Reviewer) */}
            <div className="w-full space-y-8">

            {/* 1. APPLICANT DASHBOARD LAYOUT */}
            {hasPermission('applications:create') && (
              <div className="space-y-6">
                {user.role === 'superuser' && (
                  <h3 className="text-sm font-bold text-indigo-400 uppercase tracking-widest border-b border-white/5 pb-2">Applicant Dashboard View</h3>
                )}

                {/* Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-7 gap-4">
                  <div className="glass-panel spotlight-card rounded-xl p-4 flex items-center justify-between gap-4" onMouseMove={handleCardMouseMove}>
                    <div>
                      <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Total Applications</div>
                      <div className="text-2xl font-black text-white mt-1">{ownApps.length}</div>
                    </div>
                    {renderProgressCircle(ownApps.length, ownApps.length, 'stroke-indigo-500')}
                  </div>
                  <div className="glass-panel spotlight-card rounded-xl p-4 flex items-center justify-between gap-4" onMouseMove={handleCardMouseMove}>
                    <div>
                      <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider font-mono">DRAFT</div>
                      <div className="text-2xl font-black text-slate-400 mt-1">{getStatusCount('DRAFT', ownApps)}</div>
                    </div>
                    {renderProgressCircle(getStatusCount('DRAFT', ownApps), ownApps.length, 'stroke-slate-400')}
                  </div>
                  <div className="glass-panel spotlight-card rounded-xl p-4 flex items-center justify-between gap-4" onMouseMove={handleCardMouseMove}>
                    <div>
                      <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider font-mono">SUBMITTED</div>
                      <div className="text-2xl font-black text-blue-400 mt-1">{getStatusCount('SUBMITTED', ownApps)}</div>
                    </div>
                    {renderProgressCircle(getStatusCount('SUBMITTED', ownApps), ownApps.length, 'stroke-blue-400')}
                  </div>
                  <div className="glass-panel spotlight-card rounded-xl p-4 flex items-center justify-between gap-4" onMouseMove={handleCardMouseMove}>
                    <div>
                      <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider font-mono">UNDER REVIEW</div>
                      <div className="text-2xl font-black text-orange-400 mt-1">{getStatusCount('UNDER_REVIEW', ownApps)}</div>
                    </div>
                    {renderProgressCircle(getStatusCount('UNDER_REVIEW', ownApps), ownApps.length, 'stroke-orange-400')}
                  </div>
                  <div className="glass-panel spotlight-card rounded-xl p-4 flex items-center justify-between gap-4" onMouseMove={handleCardMouseMove}>
                    <div>
                      <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider font-mono">APPROVED</div>
                      <div className="text-2xl font-black text-emerald-400 mt-1">{getStatusCount('APPROVED', ownApps)}</div>
                    </div>
                    {renderProgressCircle(getStatusCount('APPROVED', ownApps), ownApps.length, 'stroke-emerald-400')}
                  </div>
                  <div className="glass-panel spotlight-card rounded-xl p-4 flex items-center justify-between gap-4" onMouseMove={handleCardMouseMove}>
                    <div>
                      <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider font-mono">REJECTED</div>
                      <div className="text-2xl font-black text-rose-400 mt-1">{getStatusCount('REJECTED', ownApps)}</div>
                    </div>
                    {renderProgressCircle(getStatusCount('REJECTED', ownApps), ownApps.length, 'stroke-rose-400')}
                  </div>
                  <div className="glass-panel spotlight-card rounded-xl p-4 flex items-center justify-between gap-4" onMouseMove={handleCardMouseMove}>
                    <div>
                      <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider font-mono">RETURNED</div>
                      <div className="text-2xl font-black text-purple-400 mt-1">{getStatusCount('RETURNED', ownApps)}</div>
                    </div>
                    {renderProgressCircle(getStatusCount('RETURNED', ownApps), ownApps.length, 'stroke-purple-400')}
                  </div>
                </div>

                {/* Analytics Graphs Section - Added below cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                  {/* Status Bar Breakdown */}
                  <div className="glass-panel rounded-xl p-5 space-y-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-white/5 pb-2">Application Status Distribution</h3>
                    <InteractiveBarChart data={getStatusDistributionData(ownApps)} />
                  </div>

                  {/* Amount Breakdown chart */}
                  <div className="glass-panel rounded-xl p-5 space-y-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-white/5 pb-2">Funding requested by Category</h3>
                    <InteractiveDonutChart data={getBudgetByCategoryData(ownApps)} title="Funding" onSelectCategory={handleSelectCategory} selectedCategory={categoryFilter} />
                  </div>

                </div>

              </div>
            )}

            {/* 2. REVIEWER DASHBOARD LAYOUT */}
            {hasPermission('applications:review') && (
              <div className="space-y-6 pt-8 border-t border-white/5">
                {user.role === 'superuser' && (
                  <h3 className="text-sm font-bold text-indigo-400 uppercase tracking-widest border-b border-white/5 pb-2">Reviewer Dashboard View</h3>
                )}

                {/* Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-6 gap-4">
                  <div className="glass-panel spotlight-card rounded-xl p-4 flex items-center justify-between gap-4" onMouseMove={handleCardMouseMove}>
                    <div>
                      <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Queue Total</div>
                      <div className="text-2xl font-black text-white mt-1">{hasPermission('applications:review') && analyticsData ? analyticsData.total_applications : applications.length}</div>
                    </div>
                    {renderProgressCircle(hasPermission('applications:review') && analyticsData ? analyticsData.total_applications : applications.length, hasPermission('applications:review') && analyticsData ? analyticsData.total_applications : applications.length, 'stroke-indigo-500')}
                  </div>
                  <div className="glass-panel spotlight-card rounded-xl p-4 flex items-center justify-between gap-4" onMouseMove={handleCardMouseMove}>
                    <div>
                      <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider font-mono">SUBMITTED</div>
                      <div className="text-2xl font-black text-blue-400 mt-1">{getStatusCount('SUBMITTED')}</div>
                    </div>
                    {renderProgressCircle(getStatusCount('SUBMITTED'), hasPermission('applications:review') && analyticsData ? analyticsData.total_applications : applications.length, 'stroke-blue-400')}
                  </div>
                  <div className="glass-panel spotlight-card rounded-xl p-4 flex items-center justify-between gap-4" onMouseMove={handleCardMouseMove}>
                    <div>
                      <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider font-mono">UNDER REVIEW</div>
                      <div className="text-2xl font-black text-orange-400 mt-1">{getStatusCount('UNDER_REVIEW')}</div>
                    </div>
                    {renderProgressCircle(getStatusCount('UNDER_REVIEW'), hasPermission('applications:review') && analyticsData ? analyticsData.total_applications : applications.length, 'stroke-orange-400')}
                  </div>
                  <div className="glass-panel spotlight-card rounded-xl p-4 flex items-center justify-between gap-4" onMouseMove={handleCardMouseMove}>
                    <div>
                      <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider font-mono">APPROVED</div>
                      <div className="text-2xl font-black text-emerald-400 mt-1">{getStatusCount('APPROVED')}</div>
                    </div>
                    {renderProgressCircle(getStatusCount('APPROVED'), hasPermission('applications:review') && analyticsData ? analyticsData.total_applications : applications.length, 'stroke-emerald-400')}
                  </div>
                  <div className="glass-panel spotlight-card rounded-xl p-4 flex items-center justify-between gap-4" onMouseMove={handleCardMouseMove}>
                    <div>
                      <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider font-mono">REJECTED</div>
                      <div className="text-2xl font-black text-rose-400 mt-1">{getStatusCount('REJECTED')}</div>
                    </div>
                    {renderProgressCircle(getStatusCount('REJECTED'), hasPermission('applications:review') && analyticsData ? analyticsData.total_applications : applications.length, 'stroke-rose-400')}
                  </div>
                  <div className="glass-panel spotlight-card rounded-xl p-4 flex items-center justify-between gap-4" onMouseMove={handleCardMouseMove}>
                    <div>
                      <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider font-mono">RETURNED</div>
                      <div className="text-2xl font-black text-purple-400 mt-1">{getStatusCount('RETURNED')}</div>
                    </div>
                    {renderProgressCircle(getStatusCount('RETURNED'), hasPermission('applications:review') && analyticsData ? analyticsData.total_applications : applications.length, 'stroke-purple-400')}
                  </div>
                </div>

                {/* Analytics Graphs Section - Added below cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                  {/* Status counts distribution */}
                  <div className="glass-panel rounded-xl p-5 space-y-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-white/5 pb-2">Application Status Distribution</h3>
                    <InteractiveBarChart data={getStatusDistributionData(applications)} />
                  </div>

                  {/* Amount Breakdown chart */}
                  <div className="glass-panel rounded-xl p-5 space-y-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-white/5 pb-2">Funding request by Category</h3>
                    <InteractiveDonutChart data={getBudgetByCategoryData(applications)} title="Funding" onSelectCategory={handleSelectCategory} selectedCategory={categoryFilter} />
                  </div>

                  {/* Bottlenecks Timeline */}
                  {(() => {
                    const metrics = calculateBottleneckMetrics();
                    return (
                      <div className="glass-panel rounded-xl p-5 space-y-5 col-span-1 md:col-span-2">
                        <div className="flex justify-between items-center border-b border-white/5 pb-2">
                          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Review Bottlenecks (Average Durations)</h3>
                          <span className="text-[10px] text-slate-500 font-semibold bg-white/5 border border-white/5 px-2 py-0.5 rounded">
                            Based on {metrics.queueCount + metrics.decisionCount} transitions
                          </span>
                        </div>
                        
                        {metrics.queueCount === 0 && metrics.decisionCount === 0 ? (
                          <div className="text-center py-6 text-xs text-slate-500">
                            No review transition logs recorded yet to analyze bottlenecks.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-2">
                            {/* Step 1: In Queue */}
                            <div className="glass-panel rounded-xl p-4 bg-white/1 border-white/5 flex flex-col justify-between">
                              <div className="space-y-1">
                                <span className="text-[9px] text-indigo-400 font-extrabold uppercase tracking-widest">Step 1: Queue Duration</span>
                                <p className="text-slate-400 text-xs leading-relaxed">Time elapsed from initial submission until a reviewer starts review.</p>
                              </div>
                              <div className="mt-4">
                                <span className="text-2xl font-black text-white font-mono">{formatDuration(metrics.avgQueueTime)}</span>
                                <div className="text-[9px] text-slate-500 mt-1 font-medium">Average across {metrics.queueCount} app(s)</div>
                              </div>
                            </div>

                            {/* Step 2: Under Review */}
                            <div className="glass-panel rounded-xl p-4 bg-white/1 border-white/5 flex flex-col justify-between">
                              <div className="space-y-1">
                                <span className="text-[9px] text-orange-400 font-extrabold uppercase tracking-widest">Step 2: Decision Duration</span>
                                <p className="text-slate-400 text-xs leading-relaxed">Time elapsed from starting active review to final decision (Approve/Reject/Return).</p>
                              </div>
                              <div className="mt-4">
                                <span className="text-2xl font-black text-white font-mono">{formatDuration(metrics.avgDecisionTime)}</span>
                                <div className="text-[9px] text-slate-500 mt-1 font-medium">Average across {metrics.decisionCount} app(s)</div>
                              </div>
                            </div>

                            {/* Step 3: Total Process Time */}
                            <div className="glass-panel rounded-xl p-4 bg-white/1 border-white/5 flex flex-col justify-between">
                              <div className="space-y-1">
                                <span className="text-[9px] text-emerald-400 font-extrabold uppercase tracking-widest">Total Processing Loop</span>
                                <p className="text-slate-400 text-xs leading-relaxed">Sum total of queue time and decision time (end-to-end processing loop).</p>
                              </div>
                              <div className="mt-4">
                                <span className="text-2xl font-black text-emerald-400 font-mono">{formatDuration(metrics.avgTotalTime)}</span>
                                <div className="text-[9px] text-slate-500 mt-1 font-medium">Combined average process cycle</div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                </div>

              </div>
            )}
            </div>

            {/* Recent Activity Sidebar removed as requested */}

          </div>
        )}

        {/* View 3: Applications Page with Modal Form */}
        {currentView === 'applications' && user && (
          <div className="max-w-6xl mx-auto animate-fade-in space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => { setCurrentView('dashboard'); fetchApplications(); }}
                  className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
                  </svg>
                  Back to Dashboard
                </button>
                <h2 className="text-xl font-bold text-white">My Applications</h2>
              </div>
              <button
                onClick={() => {
                  setTitle('');
                  setCategory('');
                  setDescription('');
                  setAmount('');
                  setIsEditing(false);
                  setEditAppId(null);
                  setErrorMsg('');
                  setIsModalOpen(true);
                }}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs py-2 px-4 rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer self-start md:self-auto"
              >
                <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Create Application
              </button>
            </div>

            {/* Search Controls */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-slate-950/20 p-4 rounded-xl border border-white/5 shadow-md">
              <div className="flex flex-wrap gap-3 items-center w-full md:max-w-xl">
                <div className="relative w-full md:max-w-sm">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                  </span>
                  <input
                    type="text"
                    placeholder="Search by Title, Category, Status..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-9 py-2.5 bg-slate-950/60 border border-white/10 rounded-xl text-slate-200 placeholder-slate-500 text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-white cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>
                {categoryFilter && (
                  <div className="flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs px-3 py-1.5 rounded-full animate-fade-in">
                    <span>Category: <strong>{categoryFilter}</strong></span>
                    <button
                      onClick={() => setCategoryFilter('')}
                      className="text-indigo-400 hover:text-indigo-200 focus:outline-none cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 self-end md:self-auto text-xs text-slate-400">
                <span>Tip: Click column headers to sort applications.</span>
              </div>
            </div>

            <div className="glass-panel rounded-xl overflow-hidden border border-white/5 shadow-xl">
              <div className="px-5 py-4 border-b border-white/5 flex justify-between items-center bg-slate-950/40">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Applications Directory</h3>
                <span className="text-xs text-slate-400 bg-white/5 px-2 py-0.5 rounded border border-white/5">{processedApps.length} matched</span>
              </div>

              {processedApps.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-white/5 text-slate-400 bg-white/1 uppercase tracking-wider text-[10px] font-bold">
                        {renderSortHeader('title', 'Title')}
                        {renderSortHeader('category', 'Category')}
                        {renderSortHeader('amount', 'Amount')}
                        {renderSortHeader('status', 'Status')}
                        {renderSortHeader('created_at', 'Created Date')}
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {paginatedApps.map(app => (
                        <tr
                          key={app.id}
                          className="hover:bg-white/2 transition-colors cursor-pointer"
                          onClick={() => handleRowClick(app)}
                        >
                          <td className="px-4 py-3.5 font-semibold text-slate-200">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate max-w-[200px]" >{app.title}</span>
                              {app.attachment_name && (
                                <svg className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" >
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.414a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                </svg>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-slate-300">{app.category}</td>
                          <td className="px-4 py-3.5 font-mono font-bold text-indigo-300">{formatCurrency(app.amount)}</td>
                          <td className="px-4 py-3.5">{renderStatusBadge(app.status)}</td>
                          <td className="px-4 py-3.5 text-slate-400">{new Date(app.created_at).toLocaleDateString()}</td>
                          <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1.5 flex-nowrap">
                              {(app.status === 'DRAFT' || app.status === 'RETURNED') ? (
                                <>
                                  {/* Edit */}
                                  <button
                                    title="Edit Application"
                                    className="inline-flex items-center gap-1 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-all cursor-pointer whitespace-nowrap"
                                    onClick={() => handleOpenEditForm(app)}
                                  >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                    </svg>
                                    Edit
                                  </button>

                                  {/* Submit */}
                                  <button
                                    title="Submit Application"
                                    className="inline-flex items-center gap-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap"
                                    onClick={() => handleTransition(app.id, 'submit')}
                                    disabled={actionLoading === 'submit'}
                                  >
                                    {actionLoading === 'submit' ? (
                                      <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                                    ) : (
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                        <polyline points="22 2 11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                                      </svg>
                                    )}
                                    Submit
                                  </button>

                                  {/* Delete */}
                                  <button
                                    title="Delete Application"
                                    className="inline-flex items-center gap-1 bg-rose-500/10 hover:bg-rose-600 border border-rose-500/20 text-rose-400 hover:text-white rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap"
                                    onClick={() => handleDeleteApplication(app.id)}
                                    disabled={actionLoading === `delete-${app.id}`}
                                  >
                                    {actionLoading === `delete-${app.id}` ? (
                                      <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                                    ) : (
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                                      </svg>
                                    )}
                                    Delete
                                  </button>
                                </>
                              ) : (
                                /* View — for submitted/under-review/approved/rejected/returned */
                                <button
                                  title="View Details"
                                  className="inline-flex items-center gap-1 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all cursor-pointer whitespace-nowrap"
                                  onClick={() => handleSelectApp(app.id)}
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                                  </svg>
                                  View
                                </button>
                              )}
                            </div>
                          </td>

                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-12 text-center text-slate-400 border border-dashed border-white/10">
                  {searchQuery ? "No matching applications found." : "No applications created yet. Click 'Create Application' to get started."}
                </div>
              )}
              {renderPagination(appsPage, totalAppsPages, processedApps.length, setAppsPage)}
            </div>

            {/* Modal Dialog Form */}
            {isModalOpen && (
              <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
                <div className="glass-panel rounded-2xl p-6 md:p-8 shadow-2xl border border-white/10 w-full max-w-xl animate-fade-in space-y-6 bg-slate-950/90">
                  <div className="flex items-center justify-between border-b border-white/5 pb-4">
                    <div>
                      <h2 className="text-lg font-bold text-white">{isEditing ? 'Edit Application' : 'Create New Application'}</h2>
                      <p className="text-xs text-slate-400 mt-1">Fill in the fields below to save your application.</p>
                    </div>
                    <button
                      onClick={() => setIsModalOpen(false)}
                      className="text-slate-400 hover:text-white transition-colors cursor-pointer p-1 hover:bg-white/5 rounded-lg"
                    >
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>

                  <form onSubmit={handleSaveApplication} className="space-y-4">
                    <div className="space-y-1.5">
                      <label htmlFor="modal-title" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Application Title</label>
                      <input
                        id="modal-title"
                        type="text"
                        className="w-full px-4 py-2.5 bg-slate-950 border border-white/10 rounded-lg text-slate-100 placeholder-slate-600 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all"
                        placeholder="e.g. School Grant, Project Funding"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        required
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label htmlFor="modal-category" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Category</label>
                        <select
                          id="modal-category"
                          className="w-full px-4 py-2.5 bg-slate-950 border border-white/10 rounded-lg text-slate-100 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all"
                          value={category}
                          onChange={(e) => setCategory(e.target.value)}
                          required
                        >
                          <option value="" disabled>Select a category</option>
                          <option value="Software">Software</option>
                          <option value="Hardware">Hardware</option>
                          <option value="Marketing">Marketing</option>
                          <option value="IT">IT</option>
                          <option value="Education">Education</option>
                          <option value="Finance">Finance</option>
                          <option value="Operations">Operations</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor="modal-amount" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Amount (ZMW)</label>
                        <input
                          id="modal-amount"
                          type="number"
                          min="1"
                          step="any"
                          className="w-full px-4 py-2.5 bg-slate-950 border border-white/10 rounded-lg text-slate-100 placeholder-slate-600 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all"
                          placeholder="e.g. 5000"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="modal-desc" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Description</label>
                      <textarea
                        id="modal-desc"
                        rows={4}
                        className="w-full px-4 py-2.5 bg-slate-950 border border-white/10 rounded-lg text-slate-100 placeholder-slate-600 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all resize-none"
                        placeholder="Provide a detailed description of this request..."
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Supporting Attachment (PDF or Image, max 2MB)</label>
                      <div className="flex items-center gap-3">
                        <label className="flex-1 flex flex-col items-center justify-center border border-dashed border-white/10 hover:border-indigo-500/50 bg-slate-950 px-4 py-3 rounded-lg cursor-pointer transition-all">
                          <div className="flex items-center gap-2 text-slate-400 hover:text-indigo-400">
                            <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                            </svg>
                            <span className="text-xs font-semibold">{attachmentName ? 'Change File' : 'Choose File'}</span>
                          </div>
                          <input
                            type="file"
                            accept="image/*,application/pdf"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files[0];
                              if (!file) return;
                              if (file.size > 2 * 1024 * 1024) {
                                setErrorMsg("File is too large. Maximum size is 2MB.");
                                return;
                              }
                              const reader = new FileReader();
                              reader.onload = () => {
                                setAttachmentName(file.name);
                                setAttachmentData(reader.result as string);
                                setSuccessMsg(`File "${file.name}" ready to upload.`);
                                setTimeout(() => setSuccessMsg(''), 2000);
                              };
                              reader.readAsDataURL(file);
                            }}
                          />
                        </label>
                        {attachmentName && (
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 px-3 py-2 rounded-lg text-xs font-semibold text-indigo-300">
                              <span className="truncate max-w-[120px]" title={attachmentName}>{attachmentName}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setAttachmentName('');
                                  setAttachmentData('');
                                }}
                                className="text-indigo-400 hover:text-indigo-200 cursor-pointer"
                              >
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                              </button>
                            </div>
                            {attachmentData && (
                              <button
                                type="button"
                                onClick={() => {
                                  const blob = dataURLtoBlob(attachmentData);
                                  if (blob) {
                                    const blobUrl = URL.createObjectURL(blob);
                                    window.open(blobUrl, '_blank');
                                  }
                                }}
                                className="bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white font-semibold text-xs py-1.5 px-3 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
                              >
                                View File
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Inline Preview in modal form */}
                      {attachmentName && attachmentData && (
                        <div className="space-y-1.5 mt-2">
                          {attachmentData.startsWith('data:image/') && (
                            <div className="flex justify-center p-3 border border-white/5 bg-slate-950/40 rounded-lg max-h-40 overflow-hidden">
                              <img
                                src={attachmentData}
                                className="max-h-32 rounded object-contain border border-white/10"
                                alt="Modal Attachment Preview"
                              />
                            </div>
                          )}
                          {attachmentData.startsWith('data:application/pdf') && (
                            <div className="border border-white/5 bg-slate-950/40 rounded-lg p-1.5 h-44 overflow-hidden">
                              <iframe
                                src={attachmentData}
                                className="w-full h-full rounded border-0"
                                title="Modal PDF Preview"
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="pt-4 flex justify-end gap-3 border-t border-white/5">
                      <button
                        type="button"
                        onClick={() => setIsModalOpen(false)}
                        className="bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5 rounded-xl text-xs font-semibold py-2.5 px-4 transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={actionLoading === 'save'}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs py-2.5 px-5 rounded-xl shadow-lg transition-all cursor-pointer disabled:opacity-60 flex items-center gap-2"
                      >
                        {actionLoading === 'save' && (
                          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                        )}
                        {actionLoading === 'save' ? 'Saving...' : (isEditing ? 'Save Changes' : 'Create Draft')}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* View 6: Reviewer Queue Page */}
        {currentView === 'queue' && user && (
          <div className="max-w-6xl mx-auto animate-fade-in space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => { setCurrentView('dashboard'); fetchApplications(); }}
                  className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
                  </svg>
                  Back to Dashboard
                </button>
                <h2 className="text-xl font-bold text-white">Evaluation Queue</h2>
              </div>
            </div>

            {/* Filters & Search */}
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between bg-slate-950/20 p-4 rounded-xl border border-white/5 shadow-md">
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'submitted', label: 'Submitted' },
                  { id: 'under_review', label: 'Under Review' },
                  { id: 'approved', label: 'Approved' },
                  { id: 'rejected', label: 'Rejected' },
                  { id: 'returned', label: 'Returned' }
                ].map(f => (
                  <button
                    key={f.id}
                    className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all border cursor-pointer ${reviewerFilter === f.id
                      ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                      : 'bg-white/5 border-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10'
                      }`}
                    onClick={() => { setReviewerFilter(f.id); setSelectedApp(null); setQueuePage(1); }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="relative w-64">
                <svg className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                <input
                  type="text"
                  placeholder="Search queue..."
                  value={queueSearch}
                  onChange={(e) => { setQueueSearch(e.target.value); setQueuePage(1); }}
                  className="w-full bg-slate-900/50 border border-white/10 rounded-lg pl-9 pr-4 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-white placeholder-slate-500"
                />
              </div>
            </div>

            {categoryFilter && (
              <div className="flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs px-3 py-1 rounded-full animate-fade-in mt-2">
                <span>Category: <strong>{categoryFilter}</strong></span>
                <button
                  onClick={() => setCategoryFilter('')}
                  className="text-indigo-400 hover:text-indigo-200 focus:outline-none cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            )}

            {/* Main Queue Section */}
            <div className="glass-panel rounded-xl overflow-hidden border border-white/5 shadow-xl">
              <div className="px-5 py-4 border-b border-white/5 flex justify-between items-center bg-slate-950/40">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Queue List</h3>
                <span className="text-xs text-slate-400 bg-white/5 px-2 py-0.5 rounded border border-white/5">{processedApps.length} matched</span>
              </div>

              {processedApps.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-white/5 text-slate-400 bg-white/1 uppercase tracking-wider text-[10px] font-bold">
                        {renderSortHeader('title', 'Title')}
                        {renderSortHeader('owner_name', 'Applicant')}
                        {renderSortHeader('category', 'Category')}
                        {renderSortHeader('amount', 'Amount')}
                        {renderSortHeader('status', 'Status')}
                        {renderSortHeader('created_at', 'Created Date')}
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {paginatedQueue.map(app => (
                        <tr
                          key={app.id}
                          className="hover:bg-white/2 transition-colors cursor-pointer"
                          onClick={() => handleSelectApp(app.id)}
                        >
                          <td className="px-4 py-3.5 font-semibold text-slate-200">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate max-w-[200px]" >{app.title}</span>
                              {app.attachment_name && (
                                <svg className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" >
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.414a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                </svg>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-slate-300 font-medium">{app.owner_name}</td>
                          <td className="px-4 py-3.5 text-slate-300">{app.category}</td>
                          <td className="px-4 py-3.5 font-mono font-bold text-indigo-300">{formatCurrency(app.amount)}</td>
                          <td className="px-4 py-3.5">{renderStatusBadge(app.status)}</td>
                          <td className="px-4 py-3.5 text-slate-400">{new Date(app.created_at).toLocaleDateString()}</td>
                          <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                            <button
                              className="bg-indigo-600 hover:bg-indigo-500 text-white rounded px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer"
                              onClick={() => handleSelectApp(app.id)}
                            >
                              Open
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-12 text-center text-slate-400 border border-dashed border-white/10">
                  {searchQuery ? "No matching applications found." : "No applications currently in queue for this filter."}
                </div>
              )}
              {renderPagination(queuePage, totalQueuePages, hasPermission('applications:review') ? totalReviewerApps : processedApps.length, setQueuePage)}
            </div>
          </div>
        )}

        {/* View 7: User Management Page */}
        {currentView === 'users' && user && hasPermission('users:manage') && (
          <div className="max-w-6xl mx-auto animate-fade-in space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => { setCurrentView('dashboard'); fetchApplications(); }}
                  className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
                  </svg>
                  Back to Dashboard
                </button>
                <h2 className="text-xl font-bold text-white">User Management & Permissions</h2>
              </div>
              <button
                onClick={() => {
                  setNewUserName('');
                  setNewUserEmail('');
                  setNewUserPassword('');
                  setNewUserRole('applicant');
                  setNewUserPerms(['applications:create', 'applications:edit', 'applications:submit']);
                  setErrorMsg('');
                  setIsUserModalOpen(true);
                }}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs py-2.5 px-4 rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer self-start md:self-auto"
              >
                <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Create User
              </button>
            </div>

            <div className="glass-panel rounded-xl overflow-hidden border border-white/5 shadow-xl">
              <div className="px-5 py-4 border-b border-white/5 flex justify-between items-center bg-slate-950/40">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">System Users</h3>
                <span className="text-xs text-slate-400 bg-white/5 px-2 py-0.5 rounded border border-white/5">{usersList.length} total</span>
              </div>

              {loadingUsers ? (
                <div className="p-12 text-center text-slate-400">Loading users list...</div>
              ) : usersList.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-white/5 text-slate-400 bg-white/1 uppercase tracking-wider text-[10px] font-bold">
                        <th className="px-4 py-3">User Details</th>
                        <th className="px-4 py-3">Role</th>
                        <th className="px-4 py-3">Permissions Matrix</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {paginatedUsers.map(u => (
                        <UserRow
                          key={u.id}
                          user={u}
                          onSave={handleUpdateUserPermissions}
                          isSelf={user.id === u.id}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-12 text-center text-slate-400">No users found.</div>
              )}
              {renderPagination(usersPage, totalUsersPages, usersList.length, setUsersPage)}
            </div>

            {/* Create User Modal Dialog */}
            {isUserModalOpen && (
              <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
                <div className="glass-panel rounded-2xl p-6 md:p-8 shadow-2xl border border-white/10 w-full max-w-xl animate-fade-in space-y-6 bg-slate-950/90">
                  <div className="flex items-center justify-between border-b border-white/5 pb-4">
                    <div>
                      <h2 className="text-lg font-bold text-white">Create New User</h2>
                      <p className="text-xs text-slate-400 mt-1">Configure credentials, roles, and permissions.</p>
                    </div>
                    <button
                      onClick={() => setIsUserModalOpen(false)}
                      className="text-slate-400 hover:text-white transition-colors cursor-pointer p-1 hover:bg-white/5 rounded-lg"
                    >
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>

                  <form onSubmit={handleCreateUser} className="space-y-4 text-xs">
                    <div className="space-y-1.5">
                      <label htmlFor="user-name" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Full Name</label>
                      <input
                        id="user-name"
                        type="text"
                        required
                        className="w-full px-4 py-2.5 bg-slate-950 border border-white/10 rounded-lg text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all font-semibold"
                        placeholder="e.g. John Doe"
                        value={newUserName}
                        onChange={(e) => setNewUserName(e.target.value)}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label htmlFor="user-email" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Email Address</label>
                        <input
                          id="user-email"
                          type="email"
                          required
                          className="w-full px-4 py-2.5 bg-slate-950 border border-white/10 rounded-lg text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all font-semibold"
                          placeholder="e.g. user@test.com"
                          value={newUserEmail}
                          onChange={(e) => setNewUserEmail(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor="user-password" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Password</label>
                        <input
                          id="user-password"
                          type="password"
                          required
                          className="w-full px-4 py-2.5 bg-slate-950 border border-white/10 rounded-lg text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all font-semibold"
                          placeholder="••••••••"
                          value={newUserPassword}
                          onChange={(e) => setNewUserPassword(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="user-role" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">System Role</label>
                      <select
                        id="user-role"
                        value={newUserRole}
                        onChange={(e) => setNewUserRole(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-950 border border-white/10 rounded-lg text-slate-100 focus:outline-none focus:border-indigo-500 transition-all cursor-pointer font-semibold uppercase tracking-wider"
                      >
                        <option value="applicant">Applicant</option>
                        <option value="reviewer">Reviewer</option>
                        <option value="superuser">Super User</option>
                      </select>
                    </div>

                    <div className="space-y-2 border-t border-white/5 pt-3">
                      <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Permissions Matrix</span>
                      <div className="flex flex-wrap gap-x-4 gap-y-2.5">
                        {[
                          { id: 'applications:create', label: 'Create App' },
                          { id: 'applications:edit', label: 'Edit/Delete' },
                          { id: 'applications:submit', label: 'Submit App' },
                          { id: 'applications:review', label: 'Review Queue' },
                          { id: 'users:manage', label: 'Manage Users' }
                        ].map(p => {
                          const isChecked = newUserPerms.includes(p.id);
                          return (
                            <label key={p.id} className="inline-flex items-center gap-1.5 text-slate-300 select-none cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  if (newUserPerms.includes(p.id)) {
                                    setNewUserPerms(prev => prev.filter(x => x !== p.id));
                                  } else {
                                    setNewUserPerms(prev => [...prev, p.id]);
                                  }
                                }}
                                className="rounded border-white/10 bg-slate-950 text-indigo-600 focus:ring-indigo-500/30 w-4 h-4 cursor-pointer accent-indigo-600"
                              />
                              <span className={`text-[11px] font-medium transition-colors ${isChecked ? 'text-indigo-400 font-bold' : 'text-slate-500'}`}>{p.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <div className="pt-4 flex justify-end gap-3 border-t border-white/5">
                      <button
                        type="button"
                        onClick={() => setIsUserModalOpen(false)}
                        className="bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5 rounded-xl text-xs font-semibold py-2.5 px-4 transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs py-2.5 px-5 rounded-xl shadow-lg transition-all cursor-pointer"
                      >
                        Create User
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* View 8: General Audit Logs Page */}
        {currentView === 'audit-logs' && user && (
          <div className="max-w-6xl mx-auto animate-fade-in space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => { setCurrentView('dashboard'); fetchApplications(); }}
                  className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
                  </svg>
                  Back to Dashboard
                </button>
                <h2 className="text-xl font-bold text-white">System Audit Log</h2>
              </div>
            </div>

            {/* Search and Exports Control Panel */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-slate-950/20 p-4 rounded-xl border border-white/5 shadow-md">
              <div className="relative w-full md:max-w-xs">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </span>
                <input
                  type="text"
                  placeholder="Search audit logs by title, user, status..."
                  value={auditSearchQuery}
                  onChange={(e) => setAuditSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-9 py-2.5 bg-slate-950/60 border border-white/10 rounded-xl text-slate-200 placeholder-slate-500 text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                />
                {auditSearchQuery && (
                  <button
                    onClick={() => setAuditSearchQuery('')}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-white cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-start md:justify-center">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Start Date:</span>
                  <input
                    type="date"
                    value={auditStartDate}
                    onChange={(e) => setAuditStartDate(e.target.value)}
                    className="bg-slate-950/60 border border-white/10 rounded-xl text-slate-200 text-xs px-3 py-2 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all cursor-pointer font-semibold"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">End Date:</span>
                  <input
                    type="date"
                    value={auditEndDate}
                    onChange={(e) => setAuditEndDate(e.target.value)}
                    className="bg-slate-950/60 border border-white/10 rounded-xl text-slate-200 text-xs px-3 py-2 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all cursor-pointer font-semibold"
                  />
                </div>
                {(auditStartDate || auditEndDate) && (
                  <button
                    onClick={() => { setAuditStartDate(''); setAuditEndDate(''); }}
                    className="text-[10px] text-rose-300 hover:text-white font-bold uppercase tracking-wider transition-colors cursor-pointer px-2.5 py-2 bg-rose-500/10 hover:bg-rose-600 border border-rose-500/20 hover:border-rose-500/40 rounded-xl"
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3 w-full md:w-auto self-end md:self-auto">
                <button
                  onClick={handleExportCSV}
                  disabled={exportState !== 'idle'}
                  className={`flex-1 md:flex-initial text-white font-semibold text-xs py-2.5 px-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    exportState === 'success' ? 'bg-emerald-500 border border-emerald-400' : 'bg-emerald-600 hover:bg-emerald-500 disabled:opacity-90'
                  }`}
                >
                  {exportState === 'idle' && (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                      </svg>
                      Export CSV
                    </>
                  )}
                  {exportState === 'gathering' && (
                    <>
                      <svg className="animate-spin w-4 h-4 text-emerald-200" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                      Gathering records...
                    </>
                  )}
                  {exportState === 'formatting' && (
                    <>
                      <svg className="animate-spin w-4 h-4 text-emerald-200" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                      Compiling spreadsheet...
                    </>
                  )}
                  {exportState === 'downloading' && (
                    <>
                      <svg className="animate-bounce w-4 h-4 text-emerald-200" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                      </svg>
                      Downloading report...
                    </>
                  )}
                  {exportState === 'success' && (
                    <span className="flex items-center gap-1.5 text-white scale-105 transition-all duration-300 font-bold">
                      <svg className="w-4.5 h-4.5 animate-scale" fill="none" stroke="currentColor" strokeWidth="3.5" viewBox="0 0 24 24">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Export Success!
                    </span>
                  )}
                </button>
                <button
                  onClick={handleExportPDF}
                  className="flex-1 md:flex-initial bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs py-2.5 px-4 rounded-xl shadow-md transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <rect x="6" y="14" width="12" height="8" />
                  </svg>
                  Export PDF
                </button>
              </div>
            </div>

            <div className="glass-panel rounded-xl overflow-hidden border border-white/5 shadow-xl">
              <div className="px-5 py-4 border-b border-white/5 flex justify-between items-center bg-slate-950/40">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Audit Log History</h3>
                <span className="text-xs text-slate-400 bg-white/5 px-2 py-0.5 rounded border border-white/5">{filteredAuditLogs.length} matched</span>
              </div>

              {loadingAuditLogs ? (
                <div className="p-12 text-center text-slate-400">Loading audit logs list...</div>
              ) : filteredAuditLogs.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-white/5 text-slate-400 bg-white/1 uppercase tracking-wider text-[10px] font-bold">
                        <th className="px-4 py-3">Log ID</th>
                        <th className="px-4 py-3">Application</th>
                        <th className="px-4 py-3">User</th>
                        <th className="px-4 py-3">Transition</th>
                        <th className="px-4 py-3">Comment / Reason</th>
                        <th className="px-4 py-3">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {paginatedAuditLogs.map(log => {
                        const statusInfo = getStatusColorInfo(log.new_status);
                        return (
                          <tr key={log.id} className="hover:bg-white/2 transition-colors">
                            <td className="px-4 py-3.5 font-mono text-indigo-300 font-semibold">#{log.id}</td>
                            <td className="px-4 py-3.5">
                              <div className="font-semibold text-slate-200">{log.application_title || `App ID: ${log.application_id}`}</div>
                              <div className="text-[10px] text-slate-500">ID: {log.application_id}</div>
                            </td>
                            <td className="px-4 py-3.5">
                              <div className="font-semibold text-slate-200">{log.user_name || `User ID: ${log.user_id}`}</div>
                              <div className="text-[10px] text-slate-500">ID: {log.user_id}</div>
                            </td>
                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {log.old_status ? (
                                  <span className="text-slate-500 text-[10px] line-through font-medium">{log.old_status}</span>
                                ) : (
                                  <span className="text-slate-600 text-[9px] italic font-semibold">(NEW)</span>
                                )}
                                <span className="text-slate-400 font-bold">&rarr;</span>
                                <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded border ${statusInfo.textClass} ${statusInfo.bgClass}`}>
                                  {log.new_status || 'CREATED'}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3.5 text-slate-300 font-medium italic">
                              {log.comment ? `"${log.comment}"` : 'No comment provided.'}
                            </td>
                            <td className="px-4 py-3.5 text-slate-400 font-mono">
                              {new Date(log.created_at).toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-12 text-center text-slate-400">No matching audit logs found.</div>
              )}
              {renderPagination(auditPage, totalAuditPages, filteredAuditLogs.length, setAuditPage)}
            </div>
          </div>
        )}

        {/* View 4: Applicant Application Details Page */}
        {currentView === 'details' && user && selectedApp && (
          <div className="max-w-4xl mx-auto animate-fade-in space-y-6">
            <div className="flex items-center justify-between">
              <button
                onClick={() => { setCurrentView('applications'); fetchApplications(); setSelectedApp(null); }}
                className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
                </svg>
                Back to Dashboard
              </button>

              {(selectedApp.status === 'DRAFT' || selectedApp.status === 'RETURNED') && (
                <div className="flex gap-2">
                  <button
                    className="bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer"
                    onClick={() => handleOpenEditForm(selectedApp)}
                  >
                    Edit
                  </button>
                  <button
                    className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer"
                    onClick={async () => {
                      await handleTransition(selectedApp.id, 'submit');
                    }}
                  >
                    Submit Application
                  </button>
                </div>
              )}
              {selectedApp.status === 'APPROVED' && (
                <button
                  className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer flex items-center gap-2"
                  onClick={() => generatePDFCertificate(selectedApp)}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                  Download PDF Certificate
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Details Card */}
              <div className="md:col-span-2 space-y-6">
                <div className="glass-panel rounded-2xl p-6 md:p-8 shadow-xl border border-white/5 space-y-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className="text-xs text-indigo-400 font-bold uppercase tracking-wider font-mono">{selectedApp.category}</span>
                      <h2 className="text-2xl font-bold text-white mt-1">{selectedApp.title}</h2>
                    </div>
                    {renderStatusBadge(selectedApp.status)}
                  </div>

                  <div className="grid grid-cols-2 gap-4 border-y border-white/5 py-4">
                    <div>
                      <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Amount Requested</span>
                      <div className="text-lg font-mono font-bold text-indigo-300 mt-1">{formatCurrency(selectedApp.amount)}</div>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Submission Date</span>
                      <div className="text-sm font-semibold text-slate-200 mt-1">{new Date(selectedApp.created_at).toLocaleDateString()}</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Description</span>
                    <p className="text-slate-300 text-sm whitespace-pre-line bg-slate-950/40 p-4 rounded-lg border border-white/5 leading-relaxed">
                      {selectedApp.description || 'No description provided.'}
                    </p>
                  </div>

                  {/* Revision History Thread */}
                  {auditLogs && auditLogs.filter(log => log.new_status === 'RETURNED').length > 0 && (
                    <div className="mt-8 border-t border-white/5 pt-6 space-y-4 animate-fade-in">
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                        <svg className="w-4 h-4 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 15v-1a4 4 0 00-4-4H8m0 0l3 3m-3-3l3-3m9 14V5a2 2 0 00-2-2H6a2 2 0 00-2 2v16l4-2 4 2 4-2 4 2z"></path></svg>
                        Revision History Thread
                      </h3>
                      <div className="space-y-4">
                        {[...auditLogs].reverse().filter(log => log.new_status === 'RETURNED' || log.new_status === 'SUBMITTED' || log.old_status === 'RETURNED').map(log => (
                          <div key={`rev-${log.id}`} className={`p-4 rounded-lg border ${log.new_status === 'RETURNED' ? 'bg-rose-950/20 border-rose-500/20' : 'bg-indigo-950/20 border-indigo-500/20'}`}>
                            <div className="flex justify-between items-start mb-2">
                              <span className="text-xs font-semibold text-slate-200">{log.user_name || `User ${log.user_id}`} <span className="text-slate-500 font-normal ml-1">changed to {log.new_status}</span></span>
                              <span className="text-[10px] text-slate-500">{new Date(log.created_at).toLocaleString()}</span>
                            </div>
                            <p className="text-sm text-slate-300 italic">"{log.comment}"</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedApp.attachment_name && selectedApp.attachment_data && (
                    <div className="space-y-3 border-t border-white/5 pt-4">
                      <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block">Attachment</span>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950/40 p-3.5 rounded-lg border border-white/5">
                        <div className="flex items-center gap-2 text-xs text-slate-300">
                          <svg className="w-4 h-4 text-indigo-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                          </svg>
                          <span className="truncate max-w-[200px] font-semibold" title={selectedApp.attachment_name}>{selectedApp.attachment_name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const blob = dataURLtoBlob(selectedApp.attachment_data);
                              if (blob) {
                                const blobUrl = URL.createObjectURL(blob);
                                window.open(blobUrl, '_blank');
                              }
                            }}
                            className="bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white font-semibold text-xs py-1.5 px-3 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                            View Inline/Tab
                          </button>
                          <a
                            href={selectedApp.attachment_data}
                            download={selectedApp.attachment_name}
                            className="bg-indigo-600/10 hover:bg-indigo-600 border border-indigo-500/30 hover:border-indigo-500 text-indigo-300 hover:text-white font-semibold text-xs py-1.5 px-3 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                            </svg>
                            Download
                          </a>
                        </div>
                      </div>

                      {/* Preview rendering */}
                      {selectedApp.attachment_data.startsWith('data:image/') && (
                        <div className="flex justify-center p-3 border border-white/5 bg-slate-950/40 rounded-lg overflow-hidden max-w-full">
                          <img
                            src={selectedApp.attachment_data}
                            className="max-h-64 rounded border border-white/10 hover:scale-[1.01] transition-transform object-contain"
                            alt="Attachment Preview"
                          />
                        </div>
                      )}
                      {selectedApp.attachment_data.startsWith('data:application/pdf') && (
                        <div className="border border-white/5 bg-slate-950/40 rounded-lg p-2 h-96 overflow-hidden">
                          <iframe
                            src={selectedApp.attachment_data}
                            className="w-full h-full rounded border-0"
                            title="PDF Preview"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Audit Log / Timeline */}
              <div className="space-y-6">
                <div className="glass-panel rounded-2xl p-5 shadow-xl border border-white/5 space-y-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-white/5 pb-2">Audit History</h3>

                  {auditLogs && auditLogs.length > 0 ? (
                    <div className="relative border-l border-white/10 ml-2 pl-4 space-y-6">
                      {auditLogs.map((log) => {
                        const statusInfo = getStatusColorInfo(log.new_status);
                        return (
                          <div key={log.id} className="relative pl-1">
                            {/* Timeline Dot with Color glow */}
                            <span className={`absolute -left-[22px] top-1.5 w-3 h-3 rounded-full z-10 border border-slate-950/80 ${statusInfo.dotClass}`}></span>

                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded border ${statusInfo.textClass} ${statusInfo.bgClass}`}>
                                  {log.new_status || 'CREATED'}
                                </span>
                                <span className="text-[9px] text-slate-500 font-semibold">{new Date(log.created_at).toLocaleString()}</span>
                              </div>
                              {log.comment && (
                                <p className="text-xs text-slate-300 font-medium italic bg-white/5 p-2 rounded border border-white/5 animate-fade-in">
                                  "{log.comment}"
                                </p>
                              )}
                              <div className="text-[9px] text-slate-500">
                                Action by: <span className="text-slate-300 font-semibold">{log.user_name || `User ${log.user_id}`}</span> <span className="text-[8px] text-slate-600">(ID: {log.user_id})</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-slate-500 text-xs text-center py-4">No logs recorded.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* View 5: Reviewer Inspection Page */}
        {currentView === 'review-details' && user && selectedApp && (
          <div className="max-w-5xl mx-auto animate-fade-in space-y-6">
            <div className="flex items-center justify-between">
              <button
                onClick={() => { setCurrentView('queue'); fetchApplications(); setSelectedApp(null); }}
                className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
                </svg>
                Back to Queue
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Detail information */}
              <div className="md:col-span-2 space-y-6">

                {/* Core details */}
                <div className="glass-panel rounded-2xl p-6 md:p-8 shadow-xl border border-white/5 space-y-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className="text-xs text-indigo-400 font-bold uppercase tracking-wider font-mono">{selectedApp.category}</span>
                      <h2 className="text-2xl font-bold text-white mt-1">{selectedApp.title}</h2>
                      <p className="text-xs text-slate-400 mt-1">Submitted by Applicant ID: <span className="text-slate-300 font-bold">{selectedApp.owner_id}</span></p>
                    </div>
                    {renderStatusBadge(selectedApp.status)}
                  </div>

                  <div className="grid grid-cols-2 gap-4 border-y border-white/5 py-4">
                    <div>
                      <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Amount Requested</span>
                      <div className="text-lg font-mono font-bold text-indigo-300 mt-1">{formatCurrency(selectedApp.amount)}</div>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Created Date</span>
                      <div className="text-sm font-semibold text-slate-200 mt-1">{new Date(selectedApp.created_at).toLocaleDateString()}</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Description</span>
                    <p className="text-slate-300 text-sm whitespace-pre-line bg-slate-950/40 p-4 rounded-lg border border-white/5 leading-relaxed">
                      {selectedApp.description || 'No description provided.'}
                    </p>
                  </div>

                  {/* Revision History Thread */}
                  {auditLogs && auditLogs.filter(log => log.new_status === 'RETURNED').length > 0 && (
                    <div className="mt-8 border-t border-white/5 pt-6 space-y-4 animate-fade-in">
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                        <svg className="w-4 h-4 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 15v-1a4 4 0 00-4-4H8m0 0l3 3m-3-3l3-3m9 14V5a2 2 0 00-2-2H6a2 2 0 00-2 2v16l4-2 4 2 4-2 4 2z"></path></svg>
                        Revision History Thread
                      </h3>
                      <div className="space-y-4">
                        {[...auditLogs].reverse().filter(log => log.new_status === 'RETURNED' || log.new_status === 'SUBMITTED' || log.old_status === 'RETURNED').map(log => (
                          <div key={`rev-${log.id}`} className={`p-4 rounded-lg border ${log.new_status === 'RETURNED' ? 'bg-rose-950/20 border-rose-500/20' : 'bg-indigo-950/20 border-indigo-500/20'}`}>
                            <div className="flex justify-between items-start mb-2">
                              <span className="text-xs font-semibold text-slate-200">{log.user_name || `User ${log.user_id}`} <span className="text-slate-500 font-normal ml-1">changed to {log.new_status}</span></span>
                              <span className="text-[10px] text-slate-500">{new Date(log.created_at).toLocaleString()}</span>
                            </div>
                            <p className="text-sm text-slate-300 italic">"{log.comment}"</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedApp.attachment_name && selectedApp.attachment_data && (
                    <div className="space-y-3 border-t border-white/5 pt-4">
                      <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block">Attachment</span>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950/40 p-3.5 rounded-lg border border-white/5">
                        <div className="flex items-center gap-2 text-xs text-slate-300">
                          <svg className="w-4 h-4 text-indigo-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                          </svg>
                          <span className="truncate max-w-[200px] font-semibold" title={selectedApp.attachment_name}>{selectedApp.attachment_name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const blob = dataURLtoBlob(selectedApp.attachment_data);
                              if (blob) {
                                const blobUrl = URL.createObjectURL(blob);
                                window.open(blobUrl, '_blank');
                              }
                            }}
                            className="bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white font-semibold text-xs py-1.5 px-3 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                            View Inline/Tab
                          </button>
                          <a
                            href={selectedApp.attachment_data}
                            download={selectedApp.attachment_name}
                            className="bg-indigo-600/10 hover:bg-indigo-600 border border-indigo-500/30 hover:border-indigo-500 text-indigo-300 hover:text-white font-semibold text-xs py-1.5 px-3 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                            </svg>
                            Download
                          </a>
                        </div>
                      </div>

                      {/* Preview rendering */}
                      {selectedApp.attachment_data.startsWith('data:image/') && (
                        <div className="flex justify-center p-3 border border-white/5 bg-slate-950/40 rounded-lg overflow-hidden max-w-full">
                          <img
                            src={selectedApp.attachment_data}
                            className="max-h-64 rounded border border-white/10 hover:scale-[1.01] transition-transform object-contain"
                            alt="Attachment Preview"
                          />
                        </div>
                      )}
                      {selectedApp.attachment_data.startsWith('data:application/pdf') && (
                        <div className="border border-white/5 bg-slate-950/40 rounded-lg p-2 h-96 overflow-hidden">
                          <iframe
                            src={selectedApp.attachment_data}
                            className="w-full h-full rounded border-0"
                            title="PDF Preview"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Reviewer Action Panel */}
                <div className="glass-panel rounded-2xl p-6 md:p-8 shadow-xl border border-white/5 space-y-6 bg-slate-950/20">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider border-b border-white/5 pb-3">Evaluation Control Panel</h3>

                  {selectedApp.status === 'SUBMITTED' && (
                    <div className="space-y-4">
                      <p className="text-xs text-slate-400">
                        This application has been submitted and is currently in the queue. You must start the review process before making an evaluation.
                      </p>
                      <button
                        className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs py-2.5 px-5 rounded-xl shadow-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-60"
                        onClick={() => handleTransition(selectedApp.id, 'start-review')}
                        disabled={actionLoading === 'start-review'}
                      >
                        {actionLoading === 'start-review' ? (
                          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                        ) : (
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polygon points="5 3 19 12 5 21 5 3" />
                          </svg>
                        )}
                        {actionLoading === 'start-review' ? 'Starting...' : 'Start Evaluation Review'}
                      </button>
                    </div>
                  )}

                  {selectedApp.status === 'UNDER_REVIEW' && (
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label htmlFor="review-comment" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                          Evaluation Comment <span className="text-indigo-400">(Required for Reject / Return)</span>
                        </label>
                        <textarea
                          id="review-comment"
                          rows={3}
                          className="w-full px-4 py-2.5 bg-slate-950 border border-white/10 rounded-lg text-slate-100 placeholder-slate-600 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all resize-none"
                          placeholder="Provide feedback on your decision..."
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                        />
                      </div>

                      <SignaturePad onSign={setActionSignature} />

                      <div className="flex flex-wrap gap-3 pt-4 border-t border-white/5">
                        <button
                          onClick={async () => {
                            if (!actionSignature) {
                              setErrorMsg("Digital signature is required to approve an application.");
                              return;
                            }
                            await handleTransition(selectedApp.id, 'approve', { comment, signature: actionSignature });
                          }}
                          disabled={!!actionLoading}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs py-2.5 px-5 rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-60 flex items-center gap-2"
                        >
                          {actionLoading === 'approve' && (
                            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                          )}
                          {actionLoading === 'approve' ? 'Approving...' : 'Approve Application'}
                        </button>
                        <button
                          onClick={async () => {
                            if (!comment.trim()) {
                              setErrorMsg("Comment is required to return an application to the applicant.");
                              return;
                            }
                            await handleTransition(selectedApp.id, 'return', { comment });
                          }}
                          disabled={!!actionLoading}
                          className="bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs py-2.5 px-5 rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-60 flex items-center gap-2"
                        >
                          {actionLoading === 'return' && (
                            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                          )}
                          {actionLoading === 'return' ? 'Returning...' : 'Return Application'}
                        </button>
                        <button
                          onClick={async () => {
                            if (!comment.trim()) {
                              setErrorMsg("Comment is required to reject an application.");
                              return;
                            }
                            await handleTransition(selectedApp.id, 'reject', { comment });
                          }}
                          disabled={!!actionLoading}
                          className="bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs py-2.5 px-5 rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-60 flex items-center gap-2"
                        >
                          {actionLoading === 'reject' && (
                            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                          )}
                          {actionLoading === 'reject' ? 'Rejecting...' : 'Reject Application'}
                        </button>
                      </div>
                    </div>
                  )}

                  {['APPROVED', 'REJECTED', 'RETURNED'].includes(selectedApp.status) && (
                    <div className="p-4 rounded-xl border bg-white/5 border-white/5 text-slate-300 text-xs">
                      This application has been processed. The final status is <span className="font-bold text-white">{selectedApp.status}</span>. No further actions can be taken.
                    </div>
                  )}
                </div>

              </div>

              {/* Side timeline panel */}
              <div className="space-y-6">
                <div className="glass-panel rounded-2xl p-5 shadow-xl border border-white/5 space-y-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-white/5 pb-2">Audit History</h3>

                  {auditLogs && auditLogs.length > 0 ? (
                    <div className="relative border-l border-white/10 ml-2 pl-4 space-y-6">
                      {auditLogs.map((log) => {
                        const statusInfo = getStatusColorInfo(log.new_status);
                        return (
                          <div key={log.id} className="relative pl-1">
                            {/* Timeline Dot with Color glow */}
                            <span className={`absolute -left-[22px] top-1.5 w-3 h-3 rounded-full z-10 border border-slate-950/80 ${statusInfo.dotClass}`}></span>

                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded border ${statusInfo.textClass} ${statusInfo.bgClass}`}>
                                  {log.new_status || 'CREATED'}
                                </span>
                                <span className="text-[9px] text-slate-500 font-semibold">{new Date(log.created_at).toLocaleString()}</span>
                              </div>
                              {log.comment && (
                                <p className="text-xs text-slate-300 font-medium italic bg-white/5 p-2 rounded border border-white/5 animate-fade-in">
                                  "{log.comment}"
                                </p>
                              )}
                              <div className="text-[9px] text-slate-500">
                                Action by: <span className="text-slate-300 font-semibold">{log.user_name || `User ${log.user_id}`}</span> <span className="text-[8px] text-slate-600">(ID: {log.user_id})</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-slate-500 text-xs text-center py-4">No logs recorded.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        {/* View: Login Activity Audit */}
        {currentView === 'audit-logs-login' && user && (() => {
          const filteredLoginLogs = loginAuditLogs.filter(l => {
            const q = loginAuditSearch.toLowerCase();
            const matchesSearch = (
              (l.user_name || '').toLowerCase().includes(q) ||
              (l.user_email || '').toLowerCase().includes(q) ||
              (l.user_role || '').toLowerCase().includes(q) ||
              (l.activity || '').toLowerCase().includes(q) ||
              (l.ip_address || '').toLowerCase().includes(q) ||
              (l.location || '').toLowerCase().includes(q) ||
              (l.user_agent || '').toLowerCase().includes(q)
            );
            if (!matchesSearch) return false;

            if (loginAuditStartDate) {
              const start = new Date(loginAuditStartDate).getTime();
              const itemDate = new Date(l.created_at).getTime();
              if (itemDate < start) return false;
            }
            if (loginAuditEndDate) {
              const end = new Date(loginAuditEndDate).getTime() + 86400000;
              const itemDate = new Date(l.created_at).getTime();
              if (itemDate > end) return false;
            }
            return true;
          });

          const paginatedLoginLogs = filteredLoginLogs.slice((loginAuditPage - 1) * ITEMS_PER_PAGE, loginAuditPage * ITEMS_PER_PAGE);
          const totalLoginPages = Math.ceil(filteredLoginLogs.length / ITEMS_PER_PAGE);

          const parseUA = (ua = '') => {
            if (!ua) return { browser: '—', os: '—' };
            let browser = 'Unknown';
            if (ua.includes('Edg/') || ua.includes('Edge/')) browser = 'Edge';
            else if (ua.includes('Chrome/') && !ua.includes('Chromium')) browser = 'Chrome';
            else if (ua.includes('Firefox/')) browser = 'Firefox';
            else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Safari';
            else if (ua.includes('Opera') || ua.includes('OPR/')) browser = 'Opera';
            let os = 'Unknown';
            if (ua.includes('Windows NT')) os = 'Windows';
            else if (ua.includes('Mac OS X')) os = 'macOS';
            else if (ua.includes('Linux') && !ua.includes('Android')) os = 'Linux';
            else if (ua.includes('Android')) os = 'Android';
            else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
            return { browser, os };
          };

          const handleExportLoginCSV = () => {
            const headers = ['ID', 'User', 'Email', 'Role', 'Activity', 'IP Address', 'Location', 'Browser', 'OS', 'Timestamp'];
            const rows = filteredLoginLogs.map(l => {
              const { browser, os } = parseUA(l.user_agent);
              return [l.id, l.user_name, l.user_email, l.user_role, l.activity, l.ip_address, l.location, browser, os, new Date(l.created_at).toLocaleString()].map(v => `"${v || ''}"`).join(',');
            });
            const csv = [headers.join(','), ...rows].join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'login_activity.csv';
            link.click();
          };

          const handleExportLoginPDF = () => {
            const doc = new jsPDF();
            doc.text("Login Activity Audit Report", 14, 15);
            doc.setFontSize(10);
            doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 22);
            
            const tableData = filteredLoginLogs.map(l => {
              const { browser } = parseUA(l.user_agent);
              return [l.id, l.user_name, l.user_role, l.activity, l.ip_address, l.location || 'Unknown', browser, new Date(l.created_at).toLocaleString()];
            });

            autoTable(doc, {
              startY: 28,
              head: [['ID', 'User', 'Role', 'Activity', 'IP', 'Location', 'Browser', 'Time']],
              body: tableData,
              theme: 'grid',
              styles: { fontSize: 8 },
              headStyles: { fillColor: [49, 39, 131] }
            });

            doc.save('login_activity.pdf');
          };

          const loginCount = filteredLoginLogs.filter(l => l.activity === 'LOGIN').length;
          const logoutCount = filteredLoginLogs.filter(l => l.activity === 'LOGOUT').length;
          const uniqueUsers = new Set(filteredLoginLogs.map(l => l.user_id)).size;

          return (
            <div className="max-w-6xl mx-auto animate-fade-in space-y-6">
              {/* Header */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => { setCurrentView('dashboard'); fetchApplications(); }}
                    className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
                    </svg>
                    Back to Dashboard
                  </button>
                  <div>
                    <h2 className="text-xl font-bold text-white">Login Activity</h2>
                    <p className="text-xs text-slate-400 mt-0.5">Authentication events — logins, logouts, IPs &amp; devices</p>
                  </div>
                </div>
              </div>

              {/* Summary Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="glass-panel rounded-xl p-4 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Total Events</div>
                    <div className="text-2xl font-black text-white mt-1">{filteredLoginLogs.length}</div>
                  </div>
                  <div className="w-9 h-9 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                    <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                  </div>
                </div>
                <div className="glass-panel rounded-xl p-4 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Logins</div>
                    <div className="text-2xl font-black text-emerald-400 mt-1">{loginCount}</div>
                  </div>
                  <div className="w-9 h-9 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3" /></svg>
                  </div>
                </div>
                <div className="glass-panel rounded-xl p-4 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Logouts / Users</div>
                    <div className="text-2xl font-black text-rose-400 mt-1">{logoutCount} <span className="text-sm text-slate-400">/ {uniqueUsers}</span></div>
                  </div>
                  <div className="w-9 h-9 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                    <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" /></svg>
                  </div>
                </div>
              </div>

              {/* Filter & Export Toolbar */}
              <div className="flex flex-col lg:flex-row gap-4 mb-4 justify-between items-start lg:items-center">
                <div className="relative w-full lg:max-w-sm">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500 pointer-events-none">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                  </span>
                  <input
                    type="text"
                    placeholder="Search by name, email, IP, location..."
                    value={loginAuditSearch}
                    onChange={e => setLoginAuditSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-950/60 border border-white/10 rounded-xl text-slate-200 placeholder-slate-500 text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                  />
                </div>
                
                <div className="flex flex-wrap gap-3 items-center w-full lg:w-auto">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">From:</span>
                    <input type="date" value={loginAuditStartDate} onChange={e => setLoginAuditStartDate(e.target.value)} className="bg-slate-950/60 border border-white/10 rounded-lg text-slate-200 text-xs px-2 py-1.5 focus:border-indigo-500 outline-none" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">To:</span>
                    <input type="date" value={loginAuditEndDate} onChange={e => setLoginAuditEndDate(e.target.value)} className="bg-slate-950/60 border border-white/10 rounded-lg text-slate-200 text-xs px-2 py-1.5 focus:border-indigo-500 outline-none" />
                  </div>
                  
                  <div className="h-6 w-px bg-white/10 mx-1 hidden sm:block"></div>
                  
                  <button onClick={handleExportLoginCSV} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors text-xs font-semibold">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    CSV
                  </button>
                  <button onClick={handleExportLoginPDF} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 transition-colors text-xs font-semibold">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    PDF
                  </button>
                </div>
              </div>

              {/* Table */}
              <div className="glass-panel rounded-xl overflow-hidden border border-white/5 shadow-xl">
                <div className="px-5 py-4 border-b border-white/5 flex justify-between items-center bg-slate-950/40">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Auth Events</h3>
                  <span className="text-xs text-slate-400 bg-white/5 px-2 py-0.5 rounded border border-white/5">{filteredLoginLogs.length} events</span>
                </div>

                {loadingLoginAudit ? (
                  <div className="p-12 flex items-center justify-center gap-3 text-slate-400 text-xs">
                    <svg className="animate-spin w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    Loading activity...
                  </div>
                ) : filteredLoginLogs.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-white/5 text-slate-400 bg-white/1 uppercase tracking-wider text-[10px] font-bold">
                          <th className="px-4 py-3">#</th>
                          <th className="px-4 py-3">User</th>
                          <th className="px-4 py-3">Role</th>
                          <th className="px-4 py-3">Activity</th>
                          <th className="px-4 py-3">IP Address</th>
                          <th className="px-4 py-3">Location</th>
                          <th className="px-4 py-3">Browser / OS</th>
                          <th className="px-4 py-3">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {paginatedLoginLogs.map((l, i) => {
                          const { browser, os } = parseUA(l.user_agent);
                          return (
                            <tr key={l.id} className="hover:bg-white/2 transition-colors">
                              <td className="px-4 py-3 text-slate-500 font-mono text-[10px]">{l.id}</td>
                              <td className="px-4 py-3">
                                <div className="font-semibold text-slate-200">{l.user_name}</div>
                                <div className="text-slate-500 text-[10px] mt-0.5">{l.user_email}</div>
                                <div className="text-slate-600 text-[9px] font-mono">UID: {l.user_id}</div>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                                  l.user_role === 'superuser' ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30' :
                                  l.user_role === 'reviewer'  ? 'bg-orange-500/10 text-orange-300 border-orange-500/30' :
                                  'bg-slate-500/10 text-slate-400 border-slate-500/30'
                                }`}>{l.user_role}</span>
                              </td>
                              <td className="px-4 py-3">
                                {l.activity === 'LOGIN' ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-300 border-emerald-500/30">
                                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3" /></svg>
                                    LOGIN
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border bg-rose-500/10 text-rose-300 border-rose-500/30">
                                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" /></svg>
                                    LOGOUT
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 font-mono text-indigo-300 text-xs">{l.ip_address || '—'}</td>
                              <td className="px-4 py-3">
                                <div className="text-slate-300 text-[11px] font-semibold flex items-center gap-1.5">
                                  <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.242-4.243a8 8 0 1111.314 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                  </svg>
                                  {l.location || 'Unknown'}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="text-slate-300 font-semibold">{browser}</div>
                                <div className="text-slate-500 text-[10px]">{os}</div>
                              </td>
                              <td className="px-4 py-3 text-slate-400 text-[11px] whitespace-nowrap">
                                {new Date(l.created_at).toLocaleString()}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-12 text-center text-slate-400 border border-dashed border-white/10">
                    {loginAuditSearch ? 'No matching events found.' : 'No login activity recorded yet.'}
                  </div>
                )}
                {renderPagination(loginAuditPage, totalLoginPages, filteredLoginLogs.length, setLoginAuditPage)}
              </div>
            </div>
          );
        })()}

        {/* Session Expiry Warning Modal */}
        {showWarningModal && (

          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="glass-panel rounded-2xl p-6 md:p-8 shadow-2xl border border-white/10 w-full max-w-sm animate-fade-in space-y-6 bg-slate-950/90 text-center">
              <div className="flex justify-center">
                <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 animate-pulse">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
              </div>
              <div className="space-y-2">
                <h2 className="text-base font-bold text-white uppercase tracking-wider">Session Inactivity Warning</h2>
                <p className="text-slate-300 text-xs">
                  You have been inactive. You will be logged out in <span className="font-extrabold text-rose-400 font-mono text-sm">{warningCountdown}</span> seconds due to security.
                </p>
              </div>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={handleExtendSession}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs py-2 px-4 rounded-xl shadow-lg transition-all cursor-pointer"
                >
                  Stay Logged In
                </button>
                <button
                  onClick={() => {
                    handleLogout();
                    setErrorMsg('You must log in');
                    setShowWarningModal(false);
                  }}
                  className="bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5 rounded-xl text-xs font-semibold py-2 px-4 transition-colors cursor-pointer"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Two-Factor Authentication Setup Modal */}
        {isTfaModalOpen && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="glass-panel rounded-2xl p-6 md:p-8 shadow-2xl border border-white/10 w-full max-w-sm animate-fade-in space-y-6 bg-slate-950/90 text-center">
              <div className="flex justify-between items-center border-b border-white/5 pb-4 text-left">
                <div>
                  <h2 className="text-base font-bold text-white uppercase tracking-wider">Configure Two-Factor Auth</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Secure your SmartFlow portal account</p>
                </div>
                <button
                  onClick={() => setIsTfaModalOpen(false)}
                  className="text-slate-500 hover:text-white transition-colors cursor-pointer"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* QR Code and Secret */}
              <div className="space-y-4 flex flex-col items-center">
                <p className="text-slate-300 text-xs text-left leading-relaxed">
                  1. Scan the QR code below using your mobile authenticator app (Google Authenticator, Authy, or 1Password):
                </p>
                
                {tfaQRCodeURL && (
                  <div className="bg-white p-3 rounded-xl border border-white/10 shadow-lg">
                    <img src={tfaQRCodeURL} className="w-44 h-44 object-contain" alt="2FA Setup QR Code" />
                  </div>
                )}

                <div className="w-full space-y-1.5 text-left">
                  <p className="text-slate-300 text-xs leading-relaxed">
                    Or copy this secret key manually:
                  </p>
                  <div className="flex items-center gap-2 bg-slate-950 p-2.5 rounded-lg border border-white/10 font-mono text-[11px] text-indigo-300 select-all justify-between">
                    <span className="truncate">{tfaSecret}</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(tfaSecret);
                        setSuccessMsg('Secret key copied!');
                        setTimeout(() => setSuccessMsg(''), 2000);
                      }}
                      className="text-slate-400 hover:text-white transition-colors text-[10px] uppercase font-bold flex-shrink-0 cursor-pointer"
                    >
                      Copy
                    </button>
                  </div>
                </div>

                {/* Web-based dynamic TOTP helper */}
                {tfaSecret && (
                  <div className="w-full space-y-1.5 text-left pt-2">
                    <p className="text-emerald-400 text-xs font-semibold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span>
                      Auto-Generated Verification Code:
                    </p>
                    <div className="flex items-center justify-between bg-emerald-950/40 p-2.5 rounded-lg border border-emerald-500/20 font-mono text-sm text-emerald-300">
                      <span className="font-extrabold tracking-widest">{modalTotpCode || 'Generating...'}</span>
                      <div className="flex items-center gap-2">
                        {modalSecondsLeft !== null && (
                          <span className="text-[10px] text-emerald-500 font-bold font-mono bg-emerald-950 px-1.5 py-0.5 rounded">
                            {modalSecondsLeft}s
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setTfaVerifyCode(modalTotpCode);
                            setSuccessMsg('Code auto-filled!');
                            setTimeout(() => setSuccessMsg(''), 1500);
                          }}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] uppercase font-extrabold px-2 py-1 rounded transition-colors cursor-pointer"
                        >
                          Auto-fill
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Verify OTP Input */}
              <form onSubmit={handleConfirm2FA} className="space-y-4 border-t border-white/5 pt-4 text-left">
                <div className="space-y-1.5">
                  <label htmlFor="setup-mfa-code" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    2. Enter Code to verify:
                  </label>
                  <input
                    id="setup-mfa-code"
                    type="text"
                    maxLength={6}
                    pattern="\d{6}"
                    placeholder="e.g. 123456"
                    value={tfaVerifyCode}
                    onChange={(e) => setTfaVerifyCode(e.target.value.replace(/\D/g, ''))}
                    className="w-full text-center tracking-[0.5em] pl-[0.5em] py-2 bg-slate-950 border border-white/10 rounded-lg text-white font-mono text-base focus:outline-none focus:border-indigo-500 transition-all"
                    required
                  />
                </div>

                <div className="flex gap-3 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setIsTfaModalOpen(false)}
                    className="bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5 rounded-xl text-xs font-semibold py-2 px-4 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs py-2 px-4 rounded-xl shadow-lg transition-all cursor-pointer"
                  >
                    Confirm &amp; Enable
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

// Subcomponent: LoginForm
function LoginForm({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockActive, setCapsLockActive] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    await onLogin(email, password);
    setLoading(false);
  };

  const checkCapsLock = (e) => {
    if (e.getModifierState) {
      setCapsLockActive(e.getModifierState('CapsLock'));
    }
  };

  const getPasswordStrength = (pass) => {
    let score = 0;
    if (pass.length >= 8) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;
    return score;
  };

  const strength = getPasswordStrength(password);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="login-email" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Email Address</label>
        <input
          id="login-email"
          type="email"
          className="w-full px-4 py-2.5 bg-slate-950 border border-white/10 rounded-lg text-slate-100 placeholder-slate-600 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all"
          placeholder="name@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="login-pass" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Password</label>
        <div className="relative">
          <input
            id="login-pass"
            type={showPassword ? "text" : "password"}
            className="w-full pl-4 pr-10 py-2.5 bg-slate-950 border border-white/10 rounded-lg text-slate-100 placeholder-slate-600 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={checkCapsLock}
            onKeyUp={checkCapsLock}
            onFocus={checkCapsLock}
            onBlur={() => setCapsLockActive(false)}
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
          >
            {showPassword ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.822 7.822L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            )}
          </button>
        </div>

        {capsLockActive && (
          <div className="bg-amber-950/40 border border-amber-500/20 text-amber-300 text-[10px] font-bold py-1.5 px-3 rounded-lg flex items-center gap-1.5 mt-2 animate-fade-in">
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Caps Lock is active!
          </div>
        )}

        {password.length > 0 && (
          <div className="space-y-1.5 mt-2.5 animate-fade-in">
            <div className="flex justify-between items-center text-[10px] font-bold">
              <span className="text-slate-400">PASSWORD STRENGTH</span>
              <span style={{
                color: strength === 0 || strength === 1 ? '#ef4444' : strength === 2 || strength === 3 ? '#f59e0b' : '#10b981'
              }}>
                {strength === 0 || strength === 1 ? 'WEAK' : strength === 2 || strength === 3 ? 'MEDIUM' : 'STRONG'}
              </span>
            </div>
            <div className="h-1 w-full bg-slate-900 rounded-full overflow-hidden flex gap-0.5">
              <div className="h-full flex-1 transition-all duration-300" style={{
                backgroundColor: strength >= 1 ? (strength === 1 ? '#ef4444' : strength <= 3 ? '#f59e0b' : '#10b981') : 'transparent'
              }} />
              <div className="h-full flex-1 transition-all duration-300" style={{
                backgroundColor: strength >= 2 ? (strength <= 3 ? '#f59e0b' : '#10b981') : 'transparent'
              }} />
              <div className="h-full flex-1 transition-all duration-300" style={{
                backgroundColor: strength >= 3 ? (strength === 3 ? '#f59e0b' : '#10b981') : 'transparent'
              }} />
              <div className="h-full flex-1 transition-all duration-300" style={{
                backgroundColor: strength >= 4 ? '#10b981' : 'transparent'
              }} />
            </div>
            
            <div className="grid grid-cols-2 gap-1 text-[9px] font-bold text-slate-500 pt-1">
              <div className="flex items-center gap-1">
                <span className={`w-1 h-1 rounded-full ${password.length >= 8 ? 'bg-emerald-500' : 'bg-slate-700'}`}></span>
                <span className={password.length >= 8 ? 'text-slate-300' : ''}>8+ Characters</span>
              </div>
              <div className="flex items-center gap-1">
                <span className={`w-1 h-1 rounded-full ${/[A-Z]/.test(password) ? 'bg-emerald-500' : 'bg-slate-700'}`}></span>
                <span className={/[A-Z]/.test(password) ? 'text-slate-300' : ''}>Upper Case</span>
              </div>
              <div className="flex items-center gap-1">
                <span className={`w-1 h-1 rounded-full ${/[0-9]/.test(password) ? 'bg-emerald-500' : 'bg-slate-700'}`}></span>
                <span className={/[0-9]/.test(password) ? 'text-slate-300' : ''}>Numbers</span>
              </div>
              <div className="flex items-center gap-1">
                <span className={`w-1 h-1 rounded-full ${/[^A-Za-z0-9]/.test(password) ? 'bg-emerald-500' : 'bg-slate-700'}`}></span>
                <span className={/[^A-Za-z0-9]/.test(password) ? 'text-slate-300' : ''}>Special Symbol</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <button
        type="submit"
        id="login-submit-btn"
        className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm py-2.5 px-4 rounded-xl shadow-lg transition-all cursor-pointer disabled:opacity-70 flex items-center justify-center gap-2"
        disabled={loading}
      >
        {loading ? (
          <>
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            Signing In...
          </>
        ) : 'Sign In'}
      </button>
    </form>
  );
}

function UserRow({ user, onSave, isSelf }) {
  const [role, setRole] = useState(user.role);
  const [perms, setPerms] = useState(user.permissions ? user.permissions.split(',') : []);

  const availablePermissions = [
    { id: 'applications:create', label: 'Create App' },
    { id: 'applications:edit', label: 'Edit/Delete' },
    { id: 'applications:submit', label: 'Submit App' },
    { id: 'applications:review', label: 'Review Queue' },
    { id: 'users:manage', label: 'Manage Users' }
  ];

  const handleCheckboxChange = (permId) => {
    if (perms.includes(permId)) {
      setPerms(prev => prev.filter(p => p !== permId));
    } else {
      setPerms(prev => [...prev, permId]);
    }
  };

  const isDirty = role !== user.role || perms.join(',') !== user.permissions;

  return (
    <tr className="hover:bg-white/2 transition-colors">
      <td className="px-4 py-4">
        <div className="font-semibold text-slate-200">
          {user.name}
          {isSelf && (
            <span className="text-[9px] text-indigo-400 font-mono bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded ml-1.5 uppercase font-bold">
              You
            </span>
          )}
        </div>
        <div className="text-slate-400 text-[11px] mt-0.5">{user.email}</div>
      </td>
      <td className="px-4 py-4">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="bg-slate-950 border border-white/10 rounded-lg text-slate-200 text-xs px-2.5 py-1.5 focus:outline-none focus:border-indigo-500 transition-all cursor-pointer font-semibold uppercase tracking-wider"
        >
          <option value="applicant">Applicant</option>
          <option value="reviewer">Reviewer</option>
          <option value="superuser">Super User</option>
        </select>
      </td>
      <td className="px-4 py-4">
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {availablePermissions.map(p => {
            const isChecked = perms.includes(p.id);
            return (
              <label key={p.id} className="inline-flex items-center gap-1.5 text-slate-300 select-none cursor-pointer">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => handleCheckboxChange(p.id)}
                  className="rounded border-white/10 bg-slate-950 text-indigo-600 focus:ring-indigo-500/30 w-3.5 h-3.5 cursor-pointer accent-indigo-600"
                />
                <span className={`text-[11px] font-medium transition-colors ${isChecked ? 'text-indigo-400 font-bold' : 'text-slate-500'}`}>{p.label}</span>
              </label>
            );
          })}
        </div>
      </td>
      <td className="px-4 py-4 text-right">
        <button
          onClick={() => onSave(user.id, role, perms.join(','))}
          disabled={!isDirty}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${isDirty
            ? 'bg-indigo-600 border-indigo-500 text-white shadow-md hover:bg-indigo-500'
            : 'bg-white/5 border-white/5 text-slate-500 cursor-not-allowed'
            }`}
        >
          Save
        </button>
      </td>
    </tr>
  );
}

// Subcomponent: InteractiveDonutChart
function InteractiveDonutChart({ data, title, onSelectCategory, selectedCategory }) {
  const [hoveredIdx, setHoveredIdx] = useState(null);
  
  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-slate-500 text-xs">
        No budget data recorded in this category.
      </div>
    );
  }

  const radius = 50;
  const strokeWidth = 12;
  const circumference = 2 * Math.PI * radius; // ~314.16
  
  let accumulatedPercent = 0;

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-ZM', {
      style: 'currency',
      currency: 'ZMW',
      maximumFractionDigits: 0
    }).format(val);
  };

  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-6 p-2">
      {/* Chart SVG */}
      <div className="relative w-44 h-44 flex-shrink-0">
        <svg viewBox="0 0 120 120" className="w-full h-full transform -rotate-90">
          {/* Background circle */}
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="transparent"
            stroke="rgba(255, 255, 255, 0.03)"
            strokeWidth={strokeWidth}
          />
          {data.map((item, idx) => {
            const percentage = (item.value / total) * 100;
            const strokeLength = (item.value / total) * circumference;
            const strokeOffset = circumference - (accumulatedPercent / 100) * circumference;
            accumulatedPercent += percentage;

            const isHovered = hoveredIdx === idx;
            const isSelected = selectedCategory === item.label;
            const currentStrokeWidth = isSelected ? strokeWidth + 4 : (isHovered ? strokeWidth + 2.5 : strokeWidth);
            const opacity = (!selectedCategory || isSelected) ? 1 : 0.45;

            return (
              <circle
                key={item.label}
                cx="60"
                cy="60"
                r={radius}
                fill="transparent"
                stroke={item.color}
                strokeWidth={currentStrokeWidth}
                strokeDasharray={`${strokeLength} ${circumference}`}
                strokeDashoffset={strokeOffset}
                strokeLinecap="round"
                className="transition-all duration-300 cursor-pointer"
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                onClick={() => onSelectCategory && onSelectCategory(item.label)}
                style={{
                  filter: isHovered ? `drop-shadow(0 0 6px ${item.color}80)` : 'none',
                  opacity: opacity,
                  transition: 'all 0.3s ease'
                }}
              />
            );
          })}
        </svg>

        {/* Center Text (Interactive Tooltip) */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 pointer-events-none">
          {hoveredIdx !== null ? (
            <>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider line-clamp-1">
                {data[hoveredIdx].label}
              </span>
              <span className="text-sm font-black text-white mt-0.5">
                {data[hoveredIdx].formattedValue || data[hoveredIdx].value}
              </span>
              <span className="text-[10px] font-bold text-indigo-400 mt-0.5">
                {((data[hoveredIdx].value / total) * 100).toFixed(1)}%
              </span>
            </>
          ) : selectedCategory ? (
            <>
              <span className="text-[9px] text-indigo-400 font-extrabold uppercase tracking-widest line-clamp-1">
                Filtered By
              </span>
              <span className="text-xs font-black text-white mt-0.5 truncate max-w-[100px]">
                {selectedCategory}
              </span>
            </>
          ) : (
            <>
              <span className="text-[9px] text-slate-500 font-extrabold uppercase tracking-widest">
                Total
              </span>
              <span className="text-base font-black text-white mt-0.5">
                {title === 'Funding' ? formatCurrency(total) : total}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex-1 space-y-2 text-xs w-full max-h-48 overflow-y-auto pr-1">
        {data.map((item, idx) => {
          const pct = ((item.value / total) * 100).toFixed(1);
          const isHovered = hoveredIdx === idx;
          const isSelected = selectedCategory === item.label;
          return (
            <div
              key={item.label}
              className={`flex items-center justify-between p-1.5 rounded-lg border transition-all cursor-pointer ${
                isSelected ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300 font-semibold' : (isHovered ? 'bg-white/5 border-white/10 text-white' : 'bg-transparent border-transparent text-slate-400')
              }`}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              onClick={() => onSelectCategory && onSelectCategory(item.label)}
            >
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                <span className={`font-semibold transition-colors truncate max-w-[100px] ${isSelected || isHovered ? 'text-white' : 'text-slate-400'}`}>
                  {item.label}
                </span>
              </div>
              <div className="text-right font-mono">
                <span className="text-slate-200 font-bold">{item.formattedValue || item.value}</span>
                <span className="text-slate-500 text-[10px] ml-1.5">({pct}%)</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Subcomponent: InteractiveBarChart
function InteractiveBarChart({ data }) {
  const [hoveredIdx, setHoveredIdx] = useState(null);

  const maxVal = Math.max(...data.map(d => d.value), 0);
  
  return (
    <div className="space-y-4 p-2">
      <div className="relative h-44 flex items-end justify-between gap-2 pt-6">
        {data.map((item, idx) => {
          const pct = maxVal > 0 ? (item.value / maxVal) * 100 : 0;
          const isHovered = hoveredIdx === idx;
          return (
            <div
              key={item.label}
              className="flex-1 flex flex-col items-center gap-2 group cursor-pointer"
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {/* Tooltip on top */}
              <div className={`absolute top-0 bg-slate-950 border border-white/10 text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-lg transition-all duration-300 pointer-events-none ${
                isHovered ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-1 scale-95'
              }`}>
                {item.label}: <span className="text-indigo-300 font-extrabold">{item.value}</span>
              </div>

              {/* Bar container */}
              <div className="w-full flex items-end justify-center h-28 relative">
                <div
                  className={`w-4 sm:w-6 rounded-t-md transition-all duration-500 origin-bottom`}
                  style={{
                    height: `${pct}%`,
                    backgroundColor: item.color,
                    boxShadow: isHovered ? `0 0 12px ${item.color}80` : 'none',
                    filter: isHovered ? 'brightness(1.1)' : 'none',
                  }}
                />
              </div>

              {/* Label below */}
              <span className={`text-[9px] font-bold uppercase tracking-wider text-center truncate w-full transition-colors ${
                isHovered ? 'text-white' : 'text-slate-500'
              }`}>
                {item.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Subcomponent: OpenOwnershipLogo
function OpenOwnershipLogo({ className = "h-12 w-auto" }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 669 198">
      <defs>
        <style>{`.cls-emblem{fill:#3b25d8;}`}</style>
      </defs>
      <g id="Wordmark" fill="currentColor">
        <path d="M0,37.43q.29-18,9.45-27.69T34.12,0Q50.19.09,59.17,9.64t9.07,27.79Q68.06,55.39,59,65T34.12,74.86Q17.77,74.77,9,65.12T0,37.43M34.12,63.52A14.69,14.69,0,0,0,47,56.9q4.44-6.52,4.53-19.47-.09-12.94-4.82-19.66a14.87,14.87,0,0,0-12.57-6.62,14.45,14.45,0,0,0-12.76,6.62q-4.44,6.53-4.54,19.66T21.27,57q4.35,6.51,12.85,6.52"/>
        <path d="M76.8,22.68H91.26v8.23h.19a17.71,17.71,0,0,1,5.76-6.43,19,19,0,0,1,10.21-2.93A18.33,18.33,0,0,1,122,27.69q5.56,6.24,5.76,20.14-.09,12.75-5.95,19.75t-15.79,7a16.89,16.89,0,0,1-8.88-2.27,13,13,0,0,1-5-5.3h-.29V91.12h-15ZM91.64,50.76a17.26,17.26,0,0,0,2.55,9.83,9.09,9.09,0,0,0,7.84,4,8.55,8.55,0,0,0,7.66-4.16q2.75-4.26,2.74-12.38t-2.55-12.1q-2.55-4.07-7.94-4.07a9.33,9.33,0,0,0-7.37,3.59Q91.74,39,91.64,45.27Z"/>
        <path d="M181.69,58.6a17,17,0,0,1-7.47,11.72q-6.15,4.26-16.54,4.35-12.28-.19-18.62-7.28t-6.43-19.47q.09-11.81,6.62-19.09t18.62-7.37q12.75.28,18.52,7.46t5.77,18.62v4H147.75q.48,6.81,3.12,9.93a8.87,8.87,0,0,0,7.28,3.12q4.35-.09,6.24-1.89a7.65,7.65,0,0,0,2.55-4.07ZM166.85,42.25a16.29,16.29,0,0,0-2.56-8.41,7.4,7.4,0,0,0-6.42-3,8.48,8.48,0,0,0-7.09,3.12c-1.64,2.08-2.65,5.08-3,9h19.1Z"/>
        <path d="M222.93,43.76a36.09,36.09,0,0,0-.28-4.82,8.37,8.37,0,0,0-1.23-3.59,5.79,5.79,0,0,0-2.74-2.17,8.7,8.7,0,0,0-3.78-.76q-5,0-7.66,3t-2.55,8.6v29.3h-15V22.69h14.46V31h.19a17.11,17.11,0,0,1,6-6.61q4-2.66,10.49-2.74,9.08,0,13.14,4.72T238,40.45v32.9h-15Z"/>
        <path d="M0,138.92q.29-18,9.48-27.76t24.73-9.77q16.11.1,25.12,9.67t9.1,27.86q-.2,18-9.29,27.68t-24.93,9.86Q17.82,176.35,9,166.69T0,138.92m34.21,26.16a14.72,14.72,0,0,0,12.89-6.63q4.45-6.54,4.55-19.53-.09-13-4.83-19.71a14.92,14.92,0,0,0-12.61-6.63,14.48,14.48,0,0,0-12.79,6.63q-4.46,6.54-4.55,19.71t4.45,19.62q4.37,6.54,12.89,6.54"/>
        <path d="M72.35,124.14h14.5l6.73,25.59c.63,2.72,1.11,5.15,1.42,7.3s.48,3.28.48,3.41h.28c0-.13.25-1.26.76-3.41s1-4.55,1.8-7.21l7.58-25.68h12.23l7.58,25.68q1.14,4,1.8,7.21c.44,2.15.66,3.28.66,3.41h.38c0-.13.19-1.26.57-3.41s.92-4.55,1.61-7.21l6.64-25.68h13.17l-14.69,50.8h-14.5l-6.16-20.19q-1.43-5-2.46-9.95t-1-5.4h-.19q-.09.38-1.13,5.4t-2.66,9.95l-6.25,20.19H87.14Z"/>
        <path d="M189,145.27a36.15,36.15,0,0,0-.28-4.83,8.42,8.42,0,0,0-1.23-3.6,5.84,5.84,0,0,0-2.75-2.18,8.78,8.78,0,0,0-3.79-.76q-5,0-7.68,3c-1.7,2-2.56,4.9-2.56,8.63v29.38H155.59v-50.8h14.5v8.34h.19a17.19,17.19,0,0,1,6-6.63q4-2.66,10.52-2.75,9.1,0,13.18,4.74T204,142v33H189Z"/>
        <path d="M260.11,160.15a17,17,0,0,1-7.49,11.76q-6.15,4.26-16.58,4.36-12.33-.2-18.67-7.3t-6.45-19.53q.09-11.83,6.64-19.14t18.67-7.39q12.79.28,18.57,7.48t5.79,18.68v4h-34.5q.47,6.82,3.12,9.95a8.92,8.92,0,0,0,7.3,3.13c2.91-.07,5-.7,6.26-1.9a7.7,7.7,0,0,0,2.56-4.08Zm-14.88-16.39a16.22,16.22,0,0,0-2.56-8.44,7.42,7.42,0,0,0-6.44-3,8.5,8.5,0,0,0-7.11,3.13c-1.64,2.08-2.66,5.08-3,9h19.14Z"/>
        <path d="M268.11,124.14h14.22v10.71h.19a17.05,17.05,0,0,1,6.91-8.63,18.23,18.23,0,0,1,9.86-2.93h.85v13.64h-2.65q-6.92-.09-10.61,2.75t-3.79,10.14v25.12h-15Z"/>
        <path d="M332.62,138.26a5.87,5.87,0,0,0-2-4.07A9.52,9.52,0,0,0,320,134a4.57,4.57,0,0,0-1.8,3.79,4.62,4.62,0,0,0,1.32,3.41,8.61,8.61,0,0,0,4.55,1.71l8.63,1.13q7,.86,10.8,4.46T347.41,159q-.2,8.52-6.16,12.89t-15.93,4.45q-11.28-.2-16.58-4.74a15.43,15.43,0,0,1-5.69-11.46h13.84A6.49,6.49,0,0,0,319,164.8q2,1.8,6.45,1.89a10.66,10.66,0,0,0,5.88-1.42,5,5,0,0,0,2.18-4.17,4.28,4.28,0,0,0-1.24-3.5q-1.32-1.23-4.83-1.71l-8.15-1.14q-7.11-.94-11-4.64t-3.89-10.52a15.43,15.43,0,0,1,5.12-11.66q5.12-4.83,15.92-5,9.94.09,15,4.36a15,15,0,0,1,5.5,11Z"/>
        <path d="M388,145.18a36.15,36.15,0,0,0-.28-4.83,8.3,8.3,0,0,0-1.23-3.51,5.84,5.84,0,0,0-2.75-2.18,8.78,8.78,0,0,0-3.79-.76q-5,0-7.68,3c-1.71,2-2.56,4.9-2.56,8.63v29.38H354.59V100.26h15.07v32h.19a16.26,16.26,0,0,1,5.69-6.35,18.1,18.1,0,0,1,10.23-2.84q9.11,0,13.18,4.74T403,142v33H388Z"/>
        <path d="M412.47,101.68h15.26v13.65H412.47Zm.09,22.46h15.07v50.8H412.56Z"/>
        <path d="M437.58,124.14h14.5v8.25h.19a17.74,17.74,0,1,1,5.78-6.45A19,19,0,0,1,468.28,123a18.39,18.39,0,0,1,14.6,6.16q5.6,6.26,5.78,20.19-.09,12.79-6,19.81t-15.83,7A16.91,16.91,0,0,1,458,173.9a13,13,0,0,1-5-5.31h-.28v24.17H437.58Zm14.88,28.15a17.29,17.29,0,0,0,2.56,9.86,9.12,9.12,0,0,0,7.86,4,8.56,8.56,0,0,0,7.68-4.17c1.83-2.85,2.75-7,2.75-12.42s-.86-9.41-2.56-12.13-4.36-4.08-8-4.08a9.39,9.39,0,0,0-7.4,3.6q-2.83,3.51-2.93,9.86Z"/>
      </g>
      <path id="Emblem" className="cls-emblem" d="M647.5,80.77V48.23a24.19,24.19,0,1,0-5.37,0V75.66a23.71,23.71,0,0,0-7.29-8.32c-7.9-5.53-18.3-5.53-30.34-5.53-11.13,0-20.75,0-27.25-4.55a20.27,20.27,0,0,1-7.08-9.63,24.23,24.23,0,1,0-6,.74h.52c2.07,5.94,5.17,10.28,9.45,13.28,7.9,5.53,18.3,5.53,30.34,5.53,11.13,0,20.75,0,27.25,4.55a20.34,20.34,0,0,1,7.09,9.63,24.19,24.19,0,1,0,8.66-.6M545.38,24.19A18.81,18.81,0,1,1,564.19,43a18.83,18.83,0,0,1-18.81-18.81m80.62,0A18.82,18.82,0,1,1,644.81,43,18.84,0,0,1,626,24.19"/>
    </svg>
  );
}

// Subcomponent: ParticleBackground (Canvas point network animation)
function ParticleBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    let animationFrameId;
    let width = (canvas.width = canvas.offsetWidth);
    let height = (canvas.height = canvas.offsetHeight);

    const particles = [];
    const particleCount = 45;
    const connectionDist = 110;
    
    const mouse = { x: null, y: null, radius: 120 };

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.offsetWidth;
      height = canvas.height = canvas.offsetHeight;
    };
    window.addEventListener('resize', handleResize);

    const handleMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };
    const handleMouseLeave = () => {
      mouse.x = null;
      mouse.y = null;
    };
    
    const parent = canvas.parentElement;
    if (parent) {
      parent.addEventListener('mousemove', handleMouseMove);
      parent.addEventListener('mouseleave', handleMouseLeave);
    }

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
        radius: Math.random() * 2 + 1,
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0 || p.x > width) p.vx = -p.vx;
        if (p.y < 0 || p.y > height) p.vy = -p.vy;

        if (mouse.x !== null && mouse.y !== null) {
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < mouse.radius) {
            const force = (mouse.radius - dist) / mouse.radius;
            const angle = Math.atan2(dy, dx);
            p.x += Math.cos(angle) * force * 1.5;
            p.y += Math.sin(angle) * force * 1.5;
          }
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(140, 126, 255, 0.45)';
        ctx.fill();
      });

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const pi = particles[i];
          const pj = particles[j];
          const dx = pi.x - pj.x;
          const dy = pi.y - pj.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < connectionDist) {
            const alpha = (1 - dist / connectionDist) * 0.15;
            ctx.beginPath();
            ctx.moveTo(pi.x, pi.y);
            ctx.lineTo(pj.x, pj.y);
            ctx.strokeStyle = `rgba(99, 102, 241, ${alpha})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }
      }

      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      if (parent) {
        parent.removeEventListener('mousemove', handleMouseMove);
        parent.removeEventListener('mouseleave', handleMouseLeave);
      }
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />;
}

