import { useState, useEffect } from 'react';
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

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user')) || null);
  const [currentView, setCurrentView] = useState(
    (localStorage.getItem('token') && localStorage.getItem('user')) ? 'dashboard' : 'login'
  );

  const appFetch = async (url, options = {}) => {
    const isLogin = url.endsWith('/login');
    const headers = {
      ...options.headers,
    };
    if (!isLogin && token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(url, {
      ...options,
      headers,
    });

    if (res.status === 401 && !isLogin) {
      handleLogout();
      setErrorMsg('You must log in');
      throw new Error('Unauthorized');
    }

    return res;
  };

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

  // Feedback states
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Premium Portal States
  const [toasts, setToasts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');

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
  const [auditPage, setAuditPage] = useState(1);
  const [usersPage, setUsersPage] = useState(1);
  const ITEMS_PER_PAGE = 8;

  // Profile Dropdown state
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);

  // Welcome Message states
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeVisible, setWelcomeVisible] = useState(false);

  // Audit Logs state
  const [auditLogsList, setAuditLogsList] = useState([]);
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(false);
  const [auditSearchQuery, setAuditSearchQuery] = useState('');
  const [auditStartDate, setAuditStartDate] = useState('');
  const [auditEndDate, setAuditEndDate] = useState('');

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
    if (currentView === 'audit-logs') {
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
    setAppsPage(1);
    setQueuePage(1);
    setAuditPage(1);
    setUsersPage(1);
    setAuditStartDate('');
    setAuditEndDate('');
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

  const paginatedQueue = processedApps.slice((queuePage - 1) * ITEMS_PER_PAGE, queuePage * ITEMS_PER_PAGE);
  const totalQueuePages = Math.ceil(processedApps.length / ITEMS_PER_PAGE);

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
        url = `${API_BASE}/reviewer/applications?status=${reviewerFilter}`;
      }

      const res = await appFetch(url);

      if (!res.ok) {
        throw new Error('Failed to fetch applications');
      }

      const data = await res.json();
      setApplications(data);
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  // Initial routing / load data when logged in
  useEffect(() => {
    if (token && user) {
      Promise.resolve().then(() => fetchApplications());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Re-fetch when filter changes for reviewer
  useEffect(() => {
    if (user && hasPermission('applications:review')) {
      Promise.resolve().then(() => fetchApplications());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewerFilter]);

  // Auth operations
  const handleLogin = async (email, password) => {
    setErrorMsg('');
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

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      setCurrentView('dashboard');
      setSuccessMsg('Logged in successfully!');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken('');
    setUser(null);
    setApplications([]);
    setSelectedApp(null);
    setAuditLogs([]);
    setCurrentView('login');
  };

  // Load detail / selection
  const handleSelectApp = async (appId) => {
    setErrorMsg('');
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
    }
  };

  // Delete Application
  const handleDeleteApplication = async (appId) => {
    if (!window.confirm("Are you sure you want to delete this application?")) return;
    setErrorMsg('');
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
    if (app.status === 'DRAFT' || app.status === 'RETURNED') {
      handleOpenEditForm(app);
    } else {
      handleSelectApp(app.id);
    }
  };

  // Actions transitions
  const handleTransition = async (appId, actionPath, payload = {}) => {
    setErrorMsg('');
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
    }
  };

  // Format currency
  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
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

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="min-h-screen flex flex-col font-sans">
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
          <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 flex justify-between items-center">
            <div className="flex items-center gap-6">
              <div
                className="flex items-center gap-2 font-bold text-lg text-indigo-400 cursor-pointer"
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
                <svg className="w-5 h-5 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
                SmartFlow Dashboard
              </div>

              {hasPermission('applications:create') && (
                <div
                  onClick={handleNewAppClick}
                  className="text-indigo-400 hover:text-indigo-300 font-semibold text-xs py-1.5 px-3 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ml-4 animate-fade-in"
                >
                  <svg className="w-3.5 h-3.5 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  New Application
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
                  className="text-indigo-400 hover:text-indigo-300 font-semibold text-xs py-1.5 px-3 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ml-4 animate-fade-in"
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
                  className="text-indigo-400 hover:text-indigo-300 font-semibold text-xs py-1.5 px-3 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ml-4 animate-fade-in"
                >
                  <svg className="w-3.5 h-3.5 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  User Management
                </div>
              )}
              {user && (
                <div
                  onClick={() => {
                    setSelectedApp(null);
                    setCurrentView('audit-logs');
                  }}
                  className="text-indigo-400 hover:text-indigo-300 font-semibold text-xs py-1.5 px-3 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ml-4 animate-fade-in"
                >
                  <svg className="w-3.5 h-3.5 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  Audit Log
                </div>
              )}
            </div>

            <div className="flex items-center gap-4 relative">
              {showWelcome && (
                <span className={`text-sm font-medium text-slate-300 transition-opacity duration-500 ease-in-out ${welcomeVisible ? 'opacity-100' : 'opacity-0'}`}>
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
          <div className="min-h-[80vh] flex items-center justify-center animate-fade-in">
            <div className="glass-panel rounded-2xl shadow-2xl p-6 md:p-8 w-full max-w-md border border-white/5">
              <div className="text-center mb-8">
                <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-300 to-indigo-500 bg-clip-text text-transparent">SmartFlow</h1>
                <p className="text-slate-400 text-sm mt-2">Submission & Approval Portal</p>
              </div>
              <LoginForm onLogin={handleLogin} />
            </div>
          </div>
        )}

        {/* View 2: Dashboards */}
        {currentView === 'dashboard' && user && (
          <div className="space-y-8 animate-fade-in">

            {/* 1. APPLICANT DASHBOARD LAYOUT */}
            {hasPermission('applications:create') && (
              <div className="space-y-6">
                {user.role === 'superuser' && (
                  <h3 className="text-sm font-bold text-indigo-400 uppercase tracking-widest border-b border-white/5 pb-2">Applicant Dashboard View</h3>
                )}

                {/* Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4">
                  <div className="glass-panel rounded-xl p-4 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Total Applications</div>
                      <div className="text-2xl font-black text-white mt-1">{ownApps.length}</div>
                    </div>
                    {renderProgressCircle(ownApps.length, ownApps.length, 'stroke-indigo-500')}
                  </div>
                  <div className="glass-panel rounded-xl p-4 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider font-mono">DRAFT</div>
                      <div className="text-2xl font-black text-slate-400 mt-1">{getStatusCount('DRAFT', ownApps)}</div>
                    </div>
                    {renderProgressCircle(getStatusCount('DRAFT', ownApps), ownApps.length, 'stroke-slate-400')}
                  </div>
                  <div className="glass-panel rounded-xl p-4 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider font-mono">SUBMITTED</div>
                      <div className="text-2xl font-black text-blue-400 mt-1">{getStatusCount('SUBMITTED', ownApps)}</div>
                    </div>
                    {renderProgressCircle(getStatusCount('SUBMITTED', ownApps), ownApps.length, 'stroke-blue-400')}
                  </div>
                  <div className="glass-panel rounded-xl p-4 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider font-mono">UNDER REVIEW</div>
                      <div className="text-2xl font-black text-orange-400 mt-1">{getStatusCount('UNDER_REVIEW', ownApps)}</div>
                    </div>
                    {renderProgressCircle(getStatusCount('UNDER_REVIEW', ownApps), ownApps.length, 'stroke-orange-400')}
                  </div>
                  <div className="glass-panel rounded-xl p-4 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider font-mono">APPROVED</div>
                      <div className="text-2xl font-black text-emerald-400 mt-1">{getStatusCount('APPROVED', ownApps)}</div>
                    </div>
                    {renderProgressCircle(getStatusCount('APPROVED', ownApps), ownApps.length, 'stroke-emerald-400')}
                  </div>
                  <div className="glass-panel rounded-xl p-4 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider font-mono">REJECTED</div>
                      <div className="text-2xl font-black text-rose-400 mt-1">{getStatusCount('REJECTED', ownApps)}</div>
                    </div>
                    {renderProgressCircle(getStatusCount('REJECTED', ownApps), ownApps.length, 'stroke-rose-400')}
                  </div>
                  <div className="glass-panel rounded-xl p-4 flex items-center justify-between gap-4">
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
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-white/5 pb-2">Status Counts distribution</h3>
                    <div className="space-y-3">
                      {[
                        { label: 'DRAFT', count: getStatusCount('DRAFT', ownApps), color: 'bg-slate-400', textColor: 'text-slate-400' },
                        { label: 'SUBMITTED', count: getStatusCount('SUBMITTED', ownApps), color: 'bg-blue-400', textColor: 'text-blue-300' },
                        { label: 'UNDER REVIEW', count: getStatusCount('UNDER_REVIEW', ownApps), color: 'bg-orange-400', textColor: 'text-orange-300' },
                        { label: 'APPROVED', count: getStatusCount('APPROVED', ownApps), color: 'bg-emerald-400', textColor: 'text-emerald-300' },
                        { label: 'REJECTED', count: getStatusCount('REJECTED', ownApps), color: 'bg-rose-400', textColor: 'text-rose-300' },
                        { label: 'RETURNED', count: getStatusCount('RETURNED', ownApps), color: 'bg-purple-400', textColor: 'text-purple-300' }
                      ].map(bar => {
                        const widthPct = (bar.count / getMaxCount(ownApps)) * 100;
                        return (
                          <div key={bar.label} className="space-y-1">
                            <div className="flex justify-between text-xs font-medium">
                              <span className={bar.textColor}>{bar.label}</span>
                              <span className="text-slate-300">{bar.count} item(s)</span>
                            </div>
                            <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-white/5">
                              <div className={`${bar.color} h-full rounded-full transition-all duration-500`} style={{ width: `${widthPct}%` }}></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Amount Breakdown chart */}
                  <div className="glass-panel rounded-xl p-5 space-y-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-white/5 pb-2">Funding requested by Status</h3>
                    <div className="space-y-3">
                      {[
                        { label: 'DRAFT', amt: getStatusAmount('DRAFT', ownApps), color: 'border-slate-500/20 bg-slate-500/5', textColor: 'text-slate-400' },
                        { label: 'SUBMITTED', amt: getStatusAmount('SUBMITTED', ownApps), color: 'border-blue-500/20 bg-blue-500/5', textColor: 'text-blue-300' },
                        { label: 'UNDER REVIEW', amt: getStatusAmount('UNDER_REVIEW', ownApps), color: 'border-orange-500/20 bg-orange-500/5', textColor: 'text-orange-300' },
                        { label: 'APPROVED', amt: getStatusAmount('APPROVED', ownApps), color: 'border-emerald-500/20 bg-emerald-500/5', textColor: 'text-emerald-300' },
                        { label: 'REJECTED', amt: getStatusAmount('REJECTED', ownApps), color: 'border-rose-500/20 bg-rose-500/5', textColor: 'text-rose-300' },
                        { label: 'RETURNED', amt: getStatusAmount('RETURNED', ownApps), color: 'border-purple-500/20 bg-purple-500/5', textColor: 'text-purple-300' }
                      ].map(card => (
                        <div key={card.label} className={`flex justify-between items-center p-2 rounded-lg border ${card.color} text-xs`}>
                          <span className={`${card.textColor} font-semibold`}>{card.label}</span>
                          <span className="font-mono font-bold text-slate-100">{formatCurrency(card.amt)}</span>
                        </div>
                      ))}
                    </div>
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
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                  <div className="glass-panel rounded-xl p-4 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Queue Total</div>
                      <div className="text-2xl font-black text-white mt-1">{applications.length}</div>
                    </div>
                    {renderProgressCircle(applications.length, applications.length, 'stroke-indigo-500')}
                  </div>
                  <div className="glass-panel rounded-xl p-4 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider font-mono">SUBMITTED</div>
                      <div className="text-2xl font-black text-blue-400 mt-1">{getStatusCount('SUBMITTED')}</div>
                    </div>
                    {renderProgressCircle(getStatusCount('SUBMITTED'), applications.length, 'stroke-blue-400')}
                  </div>
                  <div className="glass-panel rounded-xl p-4 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider font-mono">UNDER REVIEW</div>
                      <div className="text-2xl font-black text-orange-400 mt-1">{getStatusCount('UNDER_REVIEW')}</div>
                    </div>
                    {renderProgressCircle(getStatusCount('UNDER_REVIEW'), applications.length, 'stroke-orange-400')}
                  </div>
                  <div className="glass-panel rounded-xl p-4 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider font-mono">APPROVED</div>
                      <div className="text-2xl font-black text-emerald-400 mt-1">{getStatusCount('APPROVED')}</div>
                    </div>
                    {renderProgressCircle(getStatusCount('APPROVED'), applications.length, 'stroke-emerald-400')}
                  </div>
                  <div className="glass-panel rounded-xl p-4 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider font-mono">REJECTED</div>
                      <div className="text-2xl font-black text-rose-400 mt-1">{getStatusCount('REJECTED')}</div>
                    </div>
                    {renderProgressCircle(getStatusCount('REJECTED'), applications.length, 'stroke-rose-400')}
                  </div>
                  <div className="glass-panel rounded-xl p-4 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider font-mono">RETURNED</div>
                      <div className="text-2xl font-black text-purple-400 mt-1">{getStatusCount('RETURNED')}</div>
                    </div>
                    {renderProgressCircle(getStatusCount('RETURNED'), applications.length, 'stroke-purple-400')}
                  </div>
                </div>

                {/* Analytics Graphs Section - Added below cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                  {/* Status counts distribution */}
                  <div className="glass-panel rounded-xl p-5 space-y-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-white/5 pb-2">Status Counts distribution</h3>
                    <div className="space-y-3">
                      {[
                        { label: 'SUBMITTED', count: getStatusCount('SUBMITTED'), color: 'bg-blue-400', textColor: 'text-blue-300' },
                        { label: 'UNDER REVIEW', count: getStatusCount('UNDER_REVIEW'), color: 'bg-orange-400', textColor: 'text-orange-300' },
                        { label: 'APPROVED', count: getStatusCount('APPROVED'), color: 'bg-emerald-400', textColor: 'text-emerald-300' },
                        { label: 'REJECTED', count: getStatusCount('REJECTED'), color: 'bg-rose-400', textColor: 'text-rose-300' },
                        { label: 'RETURNED', count: getStatusCount('RETURNED'), color: 'bg-purple-400', textColor: 'text-purple-300' }
                      ].map(bar => {
                        const widthPct = (bar.count / getMaxCount(applications)) * 100;
                        return (
                          <div key={bar.label} className="space-y-1">
                            <div className="flex justify-between text-xs font-medium">
                              <span className={bar.textColor}>{bar.label}</span>
                              <span className="text-slate-300">{bar.count} item(s)</span>
                            </div>
                            <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-white/5">
                              <div className={`${bar.color} h-full rounded-full transition-all duration-500`} style={{ width: `${widthPct}%` }}></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Amount Breakdown chart */}
                  <div className="glass-panel rounded-xl p-5 space-y-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-white/5 pb-2">Funding request breakdown</h3>
                    <div className="space-y-3">
                      {[
                        { label: 'SUBMITTED', amt: getStatusAmount('SUBMITTED'), color: 'border-blue-500/20 bg-blue-500/5', textColor: 'text-blue-300' },
                        { label: 'UNDER REVIEW', amt: getStatusAmount('UNDER_REVIEW'), color: 'border-orange-500/20 bg-orange-500/5', textColor: 'text-orange-300' },
                        { label: 'APPROVED', amt: getStatusAmount('APPROVED'), color: 'border-emerald-500/20 bg-emerald-500/5', textColor: 'text-emerald-300' },
                        { label: 'REJECTED', amt: getStatusAmount('REJECTED'), color: 'border-rose-500/20 bg-rose-500/5', textColor: 'text-rose-300' },
                        { label: 'RETURNED', amt: getStatusAmount('RETURNED'), color: 'border-purple-500/20 bg-purple-500/5', textColor: 'text-purple-300' }
                      ].map(card => (
                        <div key={card.label} className={`flex justify-between items-center p-2 rounded-lg border ${card.color} text-xs`}>
                          <span className={`${card.textColor} font-semibold`}>{card.label}</span>
                          <span className="font-mono font-bold text-slate-100">{formatCurrency(card.amt)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>

              </div>
            )}

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
                              <span className="truncate max-w-[200px]" title={app.title}>{app.title}</span>
                              {app.attachment_name && (
                                <svg className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" title={app.attachment_name}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.414a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                </svg>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-slate-300">{app.category}</td>
                          <td className="px-4 py-3.5 font-mono font-bold text-indigo-300">{formatCurrency(app.amount)}</td>
                          <td className="px-4 py-3.5">{renderStatusBadge(app.status)}</td>
                          <td className="px-4 py-3.5 text-slate-400">{new Date(app.created_at).toLocaleDateString()}</td>
                          <td className="px-4 py-3.5 text-right space-x-1" onClick={(e) => e.stopPropagation()}>
                            {(app.status === 'DRAFT' || app.status === 'RETURNED') ? (
                              <>
                                <button
                                  className="bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 rounded px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer"
                                  onClick={() => handleOpenEditForm(app)}
                                >
                                  Edit
                                </button>
                                <button
                                  className="bg-indigo-600 hover:bg-indigo-500 text-white rounded px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer"
                                  onClick={() => handleTransition(app.id, 'submit')}
                                >
                                  Submit
                                </button>
                                <button
                                  className="bg-rose-500/10 hover:bg-rose-600 border border-rose-500/20 text-rose-300 hover:text-white rounded px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer"
                                  onClick={() => handleDeleteApplication(app.id)}
                                >
                                  Delete
                                </button>
                              </>
                            ) : (
                              <button
                                className="bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/5 rounded px-3 py-1 text-[11px] font-semibold transition-colors cursor-pointer"
                                onClick={() => handleSelectApp(app.id)}
                              >
                                View
                              </button>
                            )}
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
                        <input
                          id="modal-category"
                          type="text"
                          className="w-full px-4 py-2.5 bg-slate-950 border border-white/10 rounded-lg text-slate-100 placeholder-slate-600 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all"
                          placeholder="e.g. Education, Finance, Operations"
                          value={category}
                          onChange={(e) => setCategory(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor="modal-amount" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Amount ($)</label>
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
                        rows="4"
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
                                setAttachmentData(reader.result);
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
                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs py-2.5 px-5 rounded-xl shadow-lg transition-all cursor-pointer"
                      >
                        {isEditing ? 'Save Changes' : 'Create Draft'}
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
                    onClick={() => { setReviewerFilter(f.id); setSelectedApp(null); }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="relative w-full md:max-w-sm">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </span>
                <input
                  type="text"
                  placeholder="Search by Title, Applicant, Category..."
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
            </div>

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
                              <span className="truncate max-w-[200px]" title={app.title}>{app.title}</span>
                              {app.attachment_name && (
                                <svg className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" title={app.attachment_name}>
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
              {renderPagination(queuePage, totalQueuePages, processedApps.length, setQueuePage)}
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
                  className="flex-1 md:flex-initial bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs py-2.5 px-4 rounded-xl shadow-md transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                  Export Excel
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
                        className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs py-2.5 px-5 rounded-xl shadow-lg transition-all cursor-pointer flex items-center justify-center gap-1.5"
                        onClick={() => handleTransition(selectedApp.id, 'start-review')}
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                        Start Evaluation Review
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
                          rows="3"
                          className="w-full px-4 py-2.5 bg-slate-950 border border-white/10 rounded-lg text-slate-100 placeholder-slate-600 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all resize-none"
                          placeholder="Provide feedback on your decision..."
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                        />
                      </div>

                      <div className="flex flex-wrap gap-3 pt-2 border-t border-white/5">
                        <button
                          onClick={async () => {
                            await handleTransition(selectedApp.id, 'approve', { comment });
                          }}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs py-2.5 px-5 rounded-xl shadow-md transition-all cursor-pointer"
                        >
                          Approve Application
                        </button>
                        <button
                          onClick={async () => {
                            if (!comment.trim()) {
                              setErrorMsg("Comment is required to return an application to the applicant.");
                              return;
                            }
                            await handleTransition(selectedApp.id, 'return', { comment });
                          }}
                          className="bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs py-2.5 px-5 rounded-xl shadow-md transition-all cursor-pointer"
                        >
                          Return Application
                        </button>
                        <button
                          onClick={async () => {
                            if (!comment.trim()) {
                              setErrorMsg("Comment is required to reject an application.");
                              return;
                            }
                            await handleTransition(selectedApp.id, 'reject', { comment });
                          }}
                          className="bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs py-2.5 px-5 rounded-xl shadow-md transition-all cursor-pointer"
                        >
                          Reject Application
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

      </main>
    </div>
  );
}

// Subcomponent: LoginForm
function LoginForm({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    await onLogin(email, password);
    setLoading(false);
  };

  const fillCredentials = (role) => {
    if (role === 'applicant') {
      setEmail('applicant@test.com');
      setPassword('password123');
    } else if (role === 'reviewer') {
      setEmail('reviewer@test.com');
      setPassword('password123');
    } else if (role === 'superuser') {
      setEmail('superuser@test.com');
      setPassword('password123');
    }
  };

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
        <input
          id="login-pass"
          type="password"
          className="w-full px-4 py-2.5 bg-slate-950 border border-white/10 rounded-lg text-slate-100 placeholder-slate-600 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>

      <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm py-2.5 px-4 rounded-xl shadow-lg transition-all cursor-pointer" disabled={loading}>
        {loading ? 'Signing in...' : 'Sign In'}
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
