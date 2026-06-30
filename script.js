// JS: App ka Logic connected to Flask/SQLite backend with Triple-Role Dashboards

// --- DOM ELEMENT CACHING ---
const loginContainer = document.getElementById('loginContainer');
const adminContainer = document.getElementById('adminContainer'); // Super Admin Panel
const adminDashboardContainer = document.getElementById('adminDashboardContainer'); // Admin Panel
const mainAppContainer = document.getElementById('mainAppContainer'); // Employee Panel
const notification = document.getElementById('notification');

// Login Screen Elements
const loginIdInput = document.getElementById('loginId');
const loginPasswordInput = document.getElementById('loginPassword');
const loginPassToggle = document.getElementById('togglePassword');

// Super Admin / Admin Onboarding Elements
const newEmployeeIdInput = document.getElementById('newEmployeeId');
const newEmployeePassInput = document.getElementById('newEmployeePass');
const newEmployeeNameInput = document.getElementById('newEmployeeName');
const newEmployeePhoneInput = document.getElementById('newEmployeePhone');
const newEmployeeEmailInput = document.getElementById('newEmployeeEmail');
const newEmployeeBranchInput = document.getElementById('newEmployeeBranch');
const newEmployeeAddressInput = document.getElementById('newEmployeeAddress');
const newEmployeeMapLinkInput = document.getElementById('newEmployeeMapLink');
const totalEmployeesCount = document.getElementById('totalEmployeesCount');
const employeeListContainer = document.getElementById('employeeListContainer');

// Main App Elements
const welcomeMessage = document.getElementById('welcomeMessage');
const clientNameInput = document.getElementById('clientName');
const clientPhoneInput = document.getElementById('clientPhone');
const clientEmailInput = document.getElementById('clientEmail');
const clientPersonTypeInput = document.getElementById('clientPersonType');
const clientAddressInput = document.getElementById('clientAddress');

// --- GLOBAL STATE & CONSTANTS ---
const allScreens = [loginContainer, adminContainer, adminDashboardContainer, mainAppContainer];
const companyDetails = {
    company: "IIFL Home Finance",
    website: "www.iiflhomeloans.com",
    location: "Near Akshay Patra Chauraha, Pavilion Building, 3rd Floor, Jagatpura\nMaps: https://maps.app.goo.gl/SaiqvDvCTUy7irig6?g_st=ac"
};

const branchDetails = {
    "jagatpura": {
        address: "Near Akshay Patra Chauraha Pavellion Building 3rd Floor Jagatpura",
        mapLink: "https://maps.app.goo.gl/SaiqvDvCTUy7irig6?g_st=ac"
    },
    "vaishali": {
        address: "Vaishali Nagar Vinayak Heights 4th Floor Vaishali nagar",
        mapLink: "https://maps.app.goo.gl/ZW7Nhi8THnrDYt2v8?g_st=ac"
    }
};

let currentWorker = null;
let notificationTimeout;

// Dashboard States for Search, Pagination, and Sorting
let saLogsState = { page: 1, limit: 10, search: '', sortBy: 'timestamp', sortOrder: 'DESC', totalPages: 1 };
let adTasksState = { page: 1, limit: 10, search: '', totalPages: 1 };
let searchDebounceTimeout;

// --- ENTERPRISE LOADING BAR & FETCH WRAPPER ---
async function fetchWithLoading(url, options = {}) {
    const bar = document.getElementById('loadingBar');
    if (bar) {
        bar.style.opacity = '1';
        bar.style.width = '30%';
    }
    try {
        if (bar) bar.style.width = '60%';
        const response = await fetch(url, options);
        if (bar) {
            bar.style.width = '100%';
            setTimeout(() => {
                bar.style.opacity = '0';
                setTimeout(() => { bar.style.width = '0%'; }, 200);
            }, 200);
        }
        return response;
    } catch (error) {
        if (bar) {
            bar.style.width = '100%';
            bar.style.backgroundColor = '#dc3545'; // red on error
            setTimeout(() => {
                bar.style.opacity = '0';
                setTimeout(() => { 
                    bar.style.width = '0%'; 
                    bar.style.backgroundColor = '#f05a28'; 
                }, 200);
            }, 500);
        }
        throw error;
    }
}

// Check for logged-in user on page load (session check)
window.onload = async function() {
    try {
        const response = await fetchWithLoading('/api/auth/session');
        const data = await response.json();
        
        if (data.logged_in) {
            currentWorker = data.user;
            routeUserToDashboard();
        } else {
            showScreen(loginContainer);
        }
    } catch (error) {
        console.error("Session check error:", error);
        showScreen(loginContainer);
    }
};

// Add Enter key support for quick login
loginPasswordInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') handleLogin();
});

// --- CORE UI & NOTIFICATION FUNCTIONS ---

function showNotification(message, type = 'error') {
    clearTimeout(notificationTimeout);
    notification.textContent = message;
    notification.className = `notification ${type} show`;
    notificationTimeout = setTimeout(() => {
        notification.classList.remove('show');
    }, 3500);
}

// Show specific screen
function showScreen(screenToShow) {
    allScreens.forEach(screen => {
        if (screen) screen.style.display = 'none';
    });
    if (screenToShow) screenToShow.style.display = 'block';
}

function togglePasswordVisibility() {
    const isPassword = loginPasswordInput.type === 'password';
    loginPasswordInput.type = isPassword ? 'text' : 'password';
    loginPassToggle.innerText = isPassword ? 'Hide' : 'Show';
}

// --- FORGOT & RESET PASSWORD MODAL LOGIC ---

function openForgotModal() {
    document.getElementById('forgotModal').style.display = 'flex';
    document.getElementById('forgot-step-1').style.display = 'block';
    document.getElementById('forgot-step-2').style.display = 'none';
    document.getElementById('forgotEmail').value = '';
}

function closeForgotModal() {
    document.getElementById('forgotModal').style.display = 'none';
}

async function sendForgotCode() {
    const email = document.getElementById('forgotEmail').value.trim();
    if (!email) return showNotification("Please enter your Email ID.", 'error');

    try {
        const response = await fetchWithLoading('/api/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await response.json();
        if (response.ok && data.success) {
            showNotification(data.message, 'success');
            
            // Advance to step 2
            document.getElementById('forgot-step-1').style.display = 'none';
            document.getElementById('forgot-step-2').style.display = 'block';
            document.getElementById('forgotUsername').value = '';
            document.getElementById('forgotCode').value = '';
            document.getElementById('forgotNewPassword').value = '';
            
            if (data.debug_code) {
                console.log(`[DEBUG] Forgot Password Code is: ${data.debug_code}`);
            }
        } else {
            showNotification(data.error || "Failed to generate reset code.", 'error');
        }
    } catch (error) {
        console.error("Forgot password error:", error);
    }
}

async function submitResetPassword() {
    const username = document.getElementById('forgotUsername').value.trim().toLowerCase();
    const code = document.getElementById('forgotCode').value.trim();
    const newPassword = document.getElementById('forgotNewPassword').value.trim();

    if (!username || !code || !newPassword) {
        return showNotification("All fields are required.", 'error');
    }

    try {
        const response = await fetchWithLoading('/api/auth/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, code, newPassword })
        });
        const data = await response.json();
        if (response.ok && data.success) {
            showNotification(data.message, 'success');
            closeForgotModal();
        } else {
            showNotification(data.error || "Failed to reset password.", 'error');
        }
    } catch (error) {
        console.error("Reset password error:", error);
    }
}

// --- AUTHENTICATION & ROUTING ---

function routeUserToDashboard() {
    if (!currentWorker) return;
    
    if (currentWorker.role === 'super_admin') {
        showScreen(adminContainer);
        loadSuperAdminDashboard();
    } else if (currentWorker.role === 'admin') {
        showScreen(adminDashboardContainer);
        loadAdminDashboard();
    } else {
        welcomeMessage.innerText = "Welcome, " + currentWorker.name;
        showScreen(mainAppContainer);
        loadEmployeeDashboard();
    }
}

async function handleLogin() {
    const username = loginIdInput.value.trim();
    const password = loginPasswordInput.value.trim();

    if (!username || !password) {
        return showNotification("Please fill in both Email/Username and Password.", 'error');
    }

    try {
        const response = await fetchWithLoading('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            currentWorker = data.user;
            showNotification(`Welcome back, ${currentWorker.name}!`, 'success');
            routeUserToDashboard();
            
            // Clear inputs
            loginIdInput.value = '';
            loginPasswordInput.value = '';
        } else {
            showNotification(data.error || "Invalid Credentials.", 'error');
        }
    } catch (error) {
        console.error("Login error:", error);
        showNotification("Connection error. Please try again.", 'error');
    }
}

async function handleLogout() {
    try {
        await fetchWithLoading('/api/auth/logout', { method: 'POST' });
    } catch (error) {
        console.error("Logout error:", error);
    }
    
    currentWorker = null;
    
    // Clear all input fields
    document.querySelectorAll('input').forEach(input => input.value = '');
    document.querySelectorAll('select').forEach(select => select.value = '');

    showScreen(loginContainer);
    showNotification("You have been logged out successfully.", 'info');
}

// --- SUPER ADMIN DASHBOARD LOGIC (With Search, Sort, Pagination, Export) ---

function switchSuperAdminTab(tabName) {
    const tabs = ['overview', 'manage', 'logs', 'settings'];
    tabs.forEach(t => {
        const tabDiv = document.getElementById(`sa-tab-${t}`);
        if (tabDiv) tabDiv.style.display = t === tabName ? 'block' : 'none';
    });

    const saContainer = document.getElementById('adminContainer');
    const buttons = saContainer.querySelectorAll('div[style*="display: flex; gap: 5px;"] button');
    buttons.forEach((btn, index) => {
        if (tabs[index] === tabName) {
            btn.style.backgroundColor = '#181b5b';
        } else {
            btn.style.backgroundColor = '#6c757d';
        }
    });
}

async function loadSuperAdminDashboard() {
    try {
        const url = `/api/dashboard/superadmin?page=${saLogsState.page}&limit=${saLogsState.limit}&search=${encodeURIComponent(saLogsState.search)}&sort_by=${saLogsState.sortBy}&sort_order=${saLogsState.sortOrder}`;
        const response = await fetchWithLoading(url);
        if (!response.ok) throw new Error("Failed to load");
        const data = await response.json();
        
        // Update pagination total
        saLogsState.totalPages = data.logs_pagination.pages || 1;
        
        // Render Clickable Metrics Cards (Enterprise Super Admin Layout)
        const metricsContainer = document.getElementById('sa-metrics');
        metricsContainer.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                <div class="agent-item" style="background-color: #f8fafc; border-left: 4px solid #181b5b; cursor: pointer; margin: 0;" onclick="clickSaCard('all')" title="Click to view all accounts">
                    <strong>Total Users</strong>
                    <span style="font-size: 16px; font-weight: bold; color: #181b5b;">${data.metrics.totalUsers}</span>
                </div>
                <div class="agent-item" style="background-color: #f8fafc; border-left: 4px solid #7e22ce; cursor: pointer; margin: 0;" onclick="clickSaCard('admin')" title="Click to view Admins">
                    <strong>Total Admins</strong>
                    <span style="font-size: 16px; font-weight: bold; color: #7e22ce;">${data.metrics.totalAdmins}</span>
                </div>
                <div class="agent-item" style="background-color: #f8fafc; border-left: 4px solid #f05a28; cursor: pointer; margin: 0;" onclick="clickSaCard('employee')" title="Click to view Employees">
                    <strong>Total Employees</strong>
                    <span style="font-size: 16px; font-weight: bold; color: #f05a28;">${data.metrics.totalEmployees}</span>
                </div>
                <div class="agent-item" style="background-color: #f8fafc; border-left: 4px solid #28a745; cursor: pointer; margin: 0;" onclick="clickSaCard('active')" title="Click to view active accounts">
                    <strong>Active Users</strong>
                    <span style="font-size: 16px; font-weight: bold; color: #28a745;">${data.metrics.activeUsers}</span>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px;">
                <div class="agent-item" style="background-color: #f8fafc; border-left: 4px solid #007bff; cursor: pointer; margin: 0;" onclick="clickSaCard('today_logins')" title="Click to view logins">
                    <strong>Today's Logins</strong>
                    <span style="font-size: 16px; font-weight: bold; color: #007bff;">${data.metrics.todaysLogins}</span>
                </div>
                <div class="agent-item" style="background-color: #f8fafc; border-left: 4px solid #17a2b8; cursor: pointer; margin: 0;" title="Users active in the last 15 minutes">
                    <strong>Online Users</strong>
                    <span style="font-size: 16px; font-weight: bold; color: #17a2b8;">${data.metrics.onlineUsers}</span>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px;">
                <div class="agent-item" style="background-color: #f8fafc; border-left: 4px solid #eab308; margin: 0;" title="Calculated from client count">
                    <strong>Revenue (Est.)</strong>
                    <span style="font-size: 16px; font-weight: bold; color: #eab308;">₹${data.metrics.revenue.toLocaleString()}</span>
                </div>
                <div class="agent-item" style="background-color: #f8fafc; border-left: 4px solid #ec4899; margin: 0;" title="Total client reports generated">
                    <strong>Reports Card</strong>
                    <span style="font-size: 16px; font-weight: bold; color: #ec4899;">${data.metrics.totalClients} Saved</span>
                </div>
            </div>
        `;
        
        // Render Charts & Enterprise Details
        const chartsContainer = document.getElementById('sa-charts');
        chartsContainer.innerHTML = `
            <div style="border-top: 1px solid #eee; padding-top: 15px; margin-top: 15px;">
                <p style="font-weight: bold; font-size: 13px; color: #181b5b; margin: 0 0 8px 0;">User Distribution</p>
                <div id="sa-distribution-chart" style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 15px;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="width: 70px; font-size: 11px; color: #555;">Admins:</span>
                        <div style="flex-grow: 1; background-color: #e5e7eb; height: 8px; border-radius: 4px; overflow: hidden;">
                            <div style="background-color: #7e22ce; width: ${(data.metrics.totalAdmins / (data.metrics.totalUsers || 1)) * 100}%; height: 100%;"></div>
                        </div>
                        <span style="font-size: 11px; font-weight: bold; color: #333;">${data.metrics.totalAdmins}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="width: 70px; font-size: 11px; color: #555;">Employees:</span>
                        <div style="flex-grow: 1; background-color: #e5e7eb; height: 8px; border-radius: 4px; overflow: hidden;">
                            <div style="background-color: #f05a28; width: ${(data.metrics.totalEmployees / (data.metrics.totalUsers || 1)) * 100}%; height: 100%;"></div>
                        </div>
                        <span style="font-size: 11px; font-weight: bold; color: #333;">${data.metrics.totalEmployees}</span>
                    </div>
                </div>
            </div>

            <!-- Quick Actions -->
            <div style="border-top: 1px solid #eee; padding-top: 15px; margin-top: 15px;">
                <p style="font-weight: bold; font-size: 13px; color: #181b5b; margin: 0 0 8px 0;">Quick Actions</p>
                <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                    <button class="btn-download-small" style="margin: 0; font-size: 11px; padding: 6px 8px;" onclick="switchSuperAdminTab('manage')">Onboard User</button>
                    <button class="btn-download-small" style="margin: 0; font-size: 11px; padding: 6px 8px;" onclick="switchSuperAdminTab('settings')">Reset Password</button>
                    <button class="btn-download-small" style="margin: 0; font-size: 11px; padding: 6px 8px; background-color: #17a2b8; color: white;" onclick="adminExportDatabase()">Backup DB</button>
                </div>
            </div>

            <!-- System Health & DB Status -->
            <div style="border-top: 1px solid #eee; padding-top: 15px; margin-top: 15px;">
                <p style="font-weight: bold; font-size: 13px; color: #181b5b; margin: 0 0 8px 0;">System & Database Status</p>
                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; font-size: 11px; display: flex; flex-direction: column; gap: 6px;">
                    <div><strong>System Health:</strong> <span style="color: #28a745; font-weight: bold;">Healthy (100% Online)</span></div>
                    <div><strong>Database Status:</strong> SQLite v${data.system.sqliteVersion} (${data.system.dbSizeKb} KB)</div>
                    <div><strong>Backup Status:</strong> Size: ${data.system.backupSizeKb} KB | Last: ${data.system.backupTime}</div>
                </div>
            </div>

            <!-- Latest Employees & Admins -->
            <div style="border-top: 1px solid #eee; padding-top: 15px; margin-top: 15px;">
                <p style="font-weight: bold; font-size: 13px; color: #181b5b; margin: 0 0 8px 0;">Latest Accounts</p>
                <div style="display: flex; flex-direction: column; gap: 6px;">
                    ${data.latestEmployees.map(emp => `
                        <div style="display: flex; justify-content: space-between; font-size: 11px; background: #fafafa; padding: 4px 8px; border-radius: 4px;">
                            <span>👤 <strong>${emp.full_name}</strong> (Employee)</span>
                            <span style="color: #64748b;">${new Date(emp.created_at).toLocaleDateString()}</span>
                        </div>
                    `).join('')}
                    ${data.latestAdmins.map(adm => `
                        <div style="display: flex; justify-content: space-between; font-size: 11px; background: #fafafa; padding: 4px 8px; border-radius: 4px;">
                            <span>🛡️ <strong>${adm.full_name}</strong> (Admin)</span>
                            <span style="color: #64748b;">${new Date(adm.created_at).toLocaleDateString()}</span>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Recent Logins -->
            <div style="border-top: 1px solid #eee; padding-top: 15px; margin-top: 15px;">
                <p style="font-weight: bold; font-size: 13px; color: #181b5b; margin: 0 0 8px 0;">Recent Logins</p>
                <div style="display: flex; flex-direction: column; gap: 6px;">
                    ${data.recentLogins.map(login => `
                        <div style="font-size: 11px; background: #fafafa; padding: 4px 8px; border-radius: 4px; border-left: 3px solid #007bff;">
                            <strong>${login.user_id}</strong> logged in from ${login.ip_address || '127.0.0.1'}
                            <div style="color: #64748b; font-size: 10px;">${new Date(login.login_time).toLocaleString()}</div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Recent Activity Timeline -->
            <div style="border-top: 1px solid #eee; padding-top: 15px; margin-top: 15px;">
                <p style="font-weight: bold; font-size: 13px; color: #181b5b; margin: 0 0 8px 0;">Recent Activity Timeline</p>
                <div style="display: flex; flex-direction: column; gap: 6px;">
                    ${data.recentActivities.map(act => `
                        <div style="font-size: 11px; background: #fafafa; padding: 4px 8px; border-radius: 4px; border-left: 3px solid #f05a28;">
                            <strong>${act.user_id}</strong>: ${act.action} <span style="color: #0284c7;">(${act.module})</span>
                            <div style="color: #64748b; font-size: 10px;">${new Date(act.timestamp).toLocaleString()}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        
        // Render Logs & History tab dynamically with Search and Sort controls
        renderLogsTabControls(data.logs, data.history);

        // Load onboarding account list
        renderEmployeeList();
        
    } catch (error) {
        console.error("Error loading Super Admin dashboard:", error);
    }
}

// Handler for Clickable Dashboard Cards
function clickSaCard(type) {
    if (type === 'today_logins' || type === 'activity_logs') {
        switchSuperAdminTab('logs');
        return;
    }

    switchSuperAdminTab('manage');
    const roleFilter = document.getElementById('saEmpRoleFilter');
    const statusFilter = document.getElementById('saEmpStatusFilter');
    
    if (!roleFilter || !statusFilter) return;
    
    if (type === 'all') {
        roleFilter.value = '';
        statusFilter.value = '';
    } else if (type === 'admin') {
        roleFilter.value = 'admin';
        statusFilter.value = '';
    } else if (type === 'employee') {
        roleFilter.value = 'employee';
        statusFilter.value = '';
    } else if (type === 'active') {
        roleFilter.value = '';
        statusFilter.value = 'active';
    } else if (type === 'suspended') {
        roleFilter.value = '';
        statusFilter.value = 'suspended';
    }
    renderEmployeeList();
}

function renderLogsTabControls(logs, history) {
    const logsTab = document.getElementById('sa-tab-logs');
    if (!logsTab) return;
    
    logsTab.innerHTML = `
        <div style="display: flex; gap: 8px; margin-bottom: 15px;">
            <input type="text" id="saLogsSearch" placeholder="Search logs/history..." value="${saLogsState.search}" style="flex-grow: 1; padding: 8px; border: 1px solid #ccc; border-radius: 6px; font-size: 12px;" oninput="handleSaLogsSearch(this.value)">
            <select id="saLogsSort" style="padding: 8px; border: 1px solid #ccc; border-radius: 6px; font-size: 12px;" onchange="handleSaLogsSort(this.value)">
                <option value="timestamp" ${saLogsState.sortBy === 'timestamp' ? 'selected' : ''}>Sort: Time</option>
                <option value="user_id" ${saLogsState.sortBy === 'user_id' ? 'selected' : ''}>Sort: User</option>
                <option value="action" ${saLogsState.sortBy === 'action' ? 'selected' : ''}>Sort: Action</option>
            </select>
            <button class="btn-download-small" style="padding: 0 10px; font-size: 11px; margin: 0;" onclick="exportLogsToCSV()">Export</button>
        </div>
        
        <p style="text-align: center; color: #f05a28; font-weight: bold; margin-bottom: 10px;">Recent Activity Logs</p>
        <div id="sa-logs-container" style="max-height: 180px; overflow-y: auto; border: 1px solid #eee; padding: 8px; border-radius: 6px; font-size: 11px; margin-bottom: 15px; background-color: #fafafa;">
            ${logs.length === 0 ? '<p style="text-align: center; color: #888; margin: 10px 0;">No logs available.</p>' : logs.map(log => `
                <div style="border-bottom: 1px solid #f1f5f9; padding: 4px 0;">
                    <span style="color: #64748b;">[${new Date(log.timestamp).toLocaleString()}]</span>
                    <strong>${log.user_id}</strong>: ${log.action} <span style="color: #0284c7;">(${log.module})</span>
                </div>
            `).join('')}
        </div>

        <p style="text-align: center; color: #f05a28; font-weight: bold; margin-bottom: 10px;">Login History</p>
        <div id="sa-history-container" style="max-height: 180px; overflow-y: auto; border: 1px solid #eee; padding: 8px; border-radius: 6px; font-size: 11px; margin-bottom: 15px; background-color: #fafafa;">
            ${history.length === 0 ? '<p style="text-align: center; color: #888; margin: 10px 0;">No history available.</p>' : history.map(hist => `
                <div style="border-bottom: 1px solid #f1f5f9; padding: 4px 0;">
                    <span style="color: #64748b;">[${new Date(hist.login_time).toLocaleString()}]</span>
                    <strong>${hist.user_id}</strong> (IP: ${hist.ip_address || 'N/A'})
                </div>
            `).join('')}
        </div>

        <!-- Pagination controls -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px;">
            <button class="btn" style="padding: 6px 12px; font-size: 11px; margin: 0; width: auto; background-color: #6c757d;" onclick="changeSaLogsPage(-1)" ${saLogsState.page <= 1 ? 'disabled' : ''}>Prev</button>
            <span style="font-size: 11px; color: #555;">Page ${saLogsState.page} of ${saLogsState.totalPages}</span>
            <button class="btn" style="padding: 6px 12px; font-size: 11px; margin: 0; width: auto; background-color: #6c757d;" onclick="changeSaLogsPage(1)" ${saLogsState.page >= saLogsState.totalPages ? 'disabled' : ''}>Next</button>
        </div>
    `;
}

function handleSaLogsSearch(val) {
    clearTimeout(searchDebounceTimeout);
    searchDebounceTimeout = setTimeout(() => {
        saLogsState.search = val;
        saLogsState.page = 1;
        loadSuperAdminDashboard();
    }, 3000);
}

function handleSaLogsSort(val) {
    saLogsState.sortBy = val;
    saLogsState.page = 1;
    loadSuperAdminDashboard();
}

function changeSaLogsPage(direction) {
    saLogsState.page += direction;
    loadSuperAdminDashboard();
}

async function exportLogsToCSV() {
    try {
        const response = await fetchWithLoading(`/api/dashboard/superadmin?limit=1000`);
        const data = await response.json();
        
        let csvContent = "data:text/csv;charset=utf-8,Timestamp,User ID,Action,Module\n";
        data.logs.forEach(log => {
            csvContent += `"${log.timestamp}","${log.user_id}","${log.action}","${log.module}"\n`;
        });
        
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "activity_logs.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showNotification("Logs exported successfully.", "success");
    } catch (e) {
        showNotification("Failed to export logs.", "error");
    }
}

// Fetch and render accounts list with Role/Status filters
async function renderEmployeeList() {
    if (!employeeListContainer) return;
    employeeListContainer.innerHTML = '<p style="text-align: center; color: #888;">Loading accounts...</p>';
    
    const searchVal = document.getElementById('saEmpSearch') ? document.getElementById('saEmpSearch').value.trim() : '';
    const roleVal = document.getElementById('saEmpRoleFilter') ? document.getElementById('saEmpRoleFilter').value : '';
    const statusVal = document.getElementById('saEmpStatusFilter') ? document.getElementById('saEmpStatusFilter').value : '';
    
    try {
        const response = await fetchWithLoading(`/api/employees?search=${encodeURIComponent(searchVal)}&role=${roleVal}&status=${statusVal}`);
        const employees = await response.json();
        employeeListContainer.innerHTML = '';
        
        if (employees.length === 0) {
            if(totalEmployeesCount) totalEmployeesCount.innerText = '0';
            employeeListContainer.innerHTML = '<p style="text-align: center; color: #888;">No accounts found.</p>';
            return;
        }

        employees.forEach(emp => {
            const item = document.createElement('div');
            item.className = 'agent-item';
            const statusColor = emp.status === 'active' ? '#28a745' : '#dc3545';
            
            // Photo fallback
            const photoUrl = emp.profile_image || 'logo.png';
            
            item.innerHTML = `
                <div style="flex-grow: 1; text-align: left; display: flex; align-items: center; gap: 10px;">
                    <img src="${photoUrl}" alt="Profile" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 1px solid #181b5b;">
                    <div>
                        <strong style="cursor: pointer; color: #181b5b;" onclick="viewEmployeeDetails('${emp.id}', '${emp.full_name}', '${emp.email || ''}', '${emp.phone || ''}', '${emp.department || ''}', '${emp.designation || ''}', '${emp.status}', '${emp.created_at || ''}', '${emp.last_login || ''}', '${photoUrl}')" title="Click to view full profile">${emp.full_name} (ID: ${emp.id})</strong>
                        <span>Phone: ${emp.phone} | Role: <span style="text-transform: capitalize; font-weight: bold;">${emp.role}</span></span>
                        <span>Dept: ${emp.department || 'N/A'} | Desig: ${emp.designation || 'N/A'}</span>
                        <span style="color: ${statusColor}; font-weight: bold;">Status: ${emp.status}</span>
                    </div>
                </div>
                <div class="btn-action-group" style="display: flex; flex-direction: column; gap: 4px; min-width: 80px;">
                    <button class="btn-download-small" onclick="openEditUserModal('${emp.id}', '${emp.full_name}', '${emp.email || ''}', '${emp.phone || ''}', '${emp.department || ''}', '${emp.designation || ''}', '${emp.role}', '${emp.status}')" style="font-size: 11px; padding: 4px 6px; background-color: #007bff; color: white; border: none; border-radius: 4px;">Edit</button>
                    <button class="btn-download-small" onclick="downloadEmployeeReport('${emp.id}')" style="font-size: 11px; padding: 4px 6px;">Report</button>
                    <button class="btn-delete-small" onclick="deleteEmployee('${emp.id}')" style="font-size: 11px; padding: 4px 6px;">Delete</button>
                </div>
            `;
            employeeListContainer.appendChild(item);
        });
        
        if(totalEmployeesCount) totalEmployeesCount.innerText = employees.length;
    } catch (error) {
        console.error("Error rendering employee list:", error);
    }
}

function handleSaEmpFilter() {
    renderEmployeeList();
}

// Edit Account Modal Flow
function openEditUserModal(id, name, email, phone, dept, desig, role, status) {
    document.getElementById('editUserModal').style.display = 'flex';
    document.getElementById('editUserId').value = id;
    document.getElementById('editUserName').value = name;
    document.getElementById('editUserEmail').value = email;
    document.getElementById('editUserPhone').value = phone;
    document.getElementById('editUserDept').value = dept;
    document.getElementById('editUserDesig').value = desig;
    document.getElementById('editUserRole').value = role || 'employee';
    document.getElementById('editUserStatus').value = status || 'active';
    document.getElementById('editUserPhoto').value = '';
    
    // Hide role editing from non-super admins
    const roleGroup = document.getElementById('editUserRoleGroup');
    if (roleGroup) {
        roleGroup.style.display = (currentWorker && currentWorker.role === 'super_admin') ? 'block' : 'none';
    }
}

function closeEditUserModal() {
    document.getElementById('editUserModal').style.display = 'none';
}

async function saveEditedUser() {
    const id = document.getElementById('editUserId').value;
    const name = document.getElementById('editUserName').value.trim();
    const email = document.getElementById('editUserEmail').value.trim();
    const phone = document.getElementById('editUserPhone').value.trim();
    const dept = document.getElementById('editUserDept').value.trim();
    const desig = document.getElementById('editUserDesig').value.trim();
    const role = document.getElementById('editUserRole').value;
    const status = document.getElementById('editUserStatus').value;
    const photoInput = document.getElementById('editUserPhoto');
    
    if (!name) return showNotification("Full Name is required.", 'error');
    
    try {
        // 1. Upload photo if selected
        if (photoInput && photoInput.files.length > 0) {
            const formData = new FormData();
            formData.append('photo', photoInput.files[0]);
            const uploadResp = await fetchWithLoading(`/api/employees/${id}/photo`, {
                method: 'POST',
                body: formData
            });
            if (!uploadResp.ok) {
                const errData = await uploadResp.json();
                showNotification(errData.error || "Failed to upload photo.", 'error');
            }
        }
        
        // 2. Save other details
        const response = await fetchWithLoading(`/api/employees/${id}/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, phone, department: dept, designation: desig, role, status })
        });
        const data = await response.json();
        if (response.ok && data.success) {
            showNotification(data.message, 'success');
            closeEditUserModal();
            routeUserToDashboard();
        } else {
            showNotification(data.error || "Failed to update account.", 'error');
        }
    } catch (error) {
        console.error("Edit save error:", error);
    }
}

// Employee Details View Flow
function viewEmployeeDetails(id, name, email, phone, dept, desig, status, joining, lastLogin, photoUrl) {
    document.getElementById('employeeDetailsModal').style.display = 'flex';
    document.getElementById('detailName').innerText = name;
    document.getElementById('detailId').innerText = id;
    document.getElementById('detailEmail').innerText = email;
    document.getElementById('detailPhone').innerText = phone;
    document.getElementById('detailDept').innerText = dept || 'N/A';
    document.getElementById('detailDesig').innerText = desig || 'N/A';
    document.getElementById('detailStatus').innerText = status;
    document.getElementById('detailJoining').innerText = joining ? new Date(joining).toLocaleDateString() : 'N/A';
    document.getElementById('detailLastLogin').innerText = lastLogin ? new Date(lastLogin).toLocaleString() : 'N/A';
    document.getElementById('detailProfileImg').src = photoUrl || 'logo.png';
}

function closeEmployeeDetailsModal() {
    document.getElementById('employeeDetailsModal').style.display = 'none';
}

async function addNewEmployee() {
    const id = newEmployeeIdInput.value.trim().toLowerCase();
    const pass = newEmployeePassInput.value.trim();
    const name = newEmployeeNameInput.value.trim();
    const phone = newEmployeePhoneInput.value.trim();
    const email = newEmployeeEmailInput.value.trim();

    if (!id || !pass || !name || !phone) {
        return showNotification("ID, Password, Name, and Phone are required.", 'error');
    }

    try {
        const response = await fetchWithLoading('/api/employees', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, password: pass, name, phone, email })
        });
        const data = await response.json();
        
        if (response.ok && data.success) {
            showNotification(data.message, 'success');
            loadSuperAdminDashboard();
            [newEmployeeIdInput, newEmployeePassInput, newEmployeeNameInput, newEmployeePhoneInput, newEmployeeEmailInput, newEmployeeBranchInput, newEmployeeAddressInput, newEmployeeMapLinkInput].forEach(input => {
                if (input) input.value = '';
            });
        } else {
            showNotification(data.error || "Failed to onboard account.", 'error');
        }
    } catch (error) {
        console.error("Onboarding error:", error);
    }
}

async function deleteEmployee(id) {
    if (id === 'admin01') {
        return showNotification("Super Admin account cannot be deleted!", 'error');
    }
    if (confirm(`Are you sure you want to delete account: ${id}?`)) {
        try {
            const response = await fetchWithLoading(`/api/employees/${id}`, { method: 'DELETE' });
            const data = await response.json();
            if (response.ok && data.success) {
                showNotification("Account deleted successfully.", 'success');
                routeUserToDashboard();
            } else {
                showNotification(data.error || "Failed to delete account.", 'error');
            }
        } catch (error) {
            console.error("Delete error:", error);
        }
    }
}

async function adminResetPassword() {
    const id = document.getElementById('resetPassUserId').value.trim().toLowerCase();
    const newPassword = document.getElementById('resetPassNewPwd').value.trim();

    if (!id || !newPassword) {
        return showNotification("Both User ID and New Password are required.", 'error');
    }

    try {
        const response = await fetchWithLoading('/api/admin/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, newPassword })
        });
        const data = await response.json();
        if (response.ok && data.success) {
            showNotification(data.message, 'success');
            document.getElementById('resetPassUserId').value = '';
            document.getElementById('resetPassNewPwd').value = '';
        } else {
            showNotification(data.error || "Failed to reset password.", 'error');
        }
    } catch (error) {
        console.error("Reset pass error:", error);
    }
}

async function adminToggleStatus() {
    const id = document.getElementById('toggleStatusUserId').value.trim().toLowerCase();
    if (!id) return showNotification("User ID is required.", 'error');

    try {
        const response = await fetchWithLoading('/api/admin/toggle-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        const data = await response.json();
        if (response.ok && data.success) {
            showNotification(`Account status updated to: ${data.status}`, 'success');
            loadSuperAdminDashboard();
            document.getElementById('toggleStatusUserId').value = '';
        } else {
            showNotification(data.error || "Failed to update account status.", 'error');
        }
    } catch (error) {
        console.error("Toggle status error:", error);
    }
}

async function adminExportDatabase() {
    try {
        const response = await fetchWithLoading('/api/admin/export');
        if (!response.ok) throw new Error("Failed to export");
        const data = await response.json();
        
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `iifl_backup_${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.removeChild(downloadAnchor);
        showNotification("Database data exported successfully.", 'success');
    } catch (error) {
        console.error("Export error:", error);
        showNotification("Failed to export database.", 'error');
    }
}

function handleBranchSelection() {
    const selectedBranch = newEmployeeBranchInput.value;
    if (selectedBranch && branchDetails[selectedBranch]) {
        newEmployeeAddressInput.value = branchDetails[selectedBranch].address;
        newEmployeeMapLinkInput.value = branchDetails[selectedBranch].mapLink;
    } else {
        newEmployeeAddressInput.value = '';
        newEmployeeMapLinkInput.value = '';
    }
}

// --- ADMIN DASHBOARD LOGIC (With Search, Sort, Pagination) ---

function switchAdminTab(tabName) {
    const tabs = ['overview', 'manage', 'tasks'];
    tabs.forEach(t => {
        const tabDiv = document.getElementById(`ad-tab-${t}`);
        if (tabDiv) tabDiv.style.display = t === tabName ? 'block' : 'none';
    });

    const adContainer = document.getElementById('adminDashboardContainer');
    const buttons = adContainer.querySelectorAll('div[style*="display: flex; gap: 5px;"] button');
    buttons.forEach((btn, index) => {
        if (tabs[index] === tabName) {
            btn.style.backgroundColor = '#181b5b';
        } else {
            btn.style.backgroundColor = '#6c757d';
        }
    });
}

async function loadAdminDashboard() {
    try {
        const url = `/api/dashboard/admin?page=${adTasksState.page}&limit=${adTasksState.limit}&search=${encodeURIComponent(adTasksState.search)}`;
        const response = await fetchWithLoading(url);
        if (!response.ok) throw new Error("Failed to load");
        const data = await response.json();
        
        // Render Clickable Metrics Cards
        const metricsContainer = document.getElementById('ad-metrics');
        metricsContainer.innerHTML = `
            <div class="agent-item" style="background-color: #f8fafc; border-left: 4px solid #181b5b; cursor: pointer;" onclick="switchAdminTab('manage')" title="Click to view employees">
                <strong>Total Employees: ${data.metrics.totalEmployees}</strong>
            </div>
            <div class="agent-item" style="background-color: #f8fafc; border-left: 4px solid #28a745; cursor: pointer;" onclick="switchAdminTab('manage')" title="Click to view employee reports">
                <strong>Total Saved Clients: ${data.metrics.totalAssignedUsers}</strong>
            </div>
            <div class="agent-item" style="background-color: #f8fafc; border-left: 4px solid #ffc107; cursor: pointer;" onclick="switchAdminTab('tasks')" title="Click to view tasks">
                <strong>Pending Tasks: ${data.metrics.pendingTasks}</strong>
            </div>
        `;
        
        // Render projects
        const projectsList = document.getElementById('ad-projects-list');
        if (data.projects.length === 0) {
            projectsList.innerHTML = '<p style="text-align: center; color: #888;">No projects active.</p>';
        } else {
            projectsList.innerHTML = data.projects.map(proj => `
                <div class="agent-item">
                    <div>
                        <strong>${proj.name}</strong>
                        <span>${proj.description || 'No description'}</span>
                    </div>
                </div>
            `).join('');
        }

        // Render tasks tab dynamically with search controls
        renderAdminTasksControls(data.tasks);

        // Render employee list
        renderAdminEmployeeList();

    } catch (error) {
        console.error("Error loading Admin dashboard:", error);
    }
}

function renderAdminTasksControls(tasks) {
    const tasksTab = document.getElementById('ad-tab-tasks');
    if (!tasksTab) return;
    
    let searchVal = adTasksState.search;
    
    tasksTab.innerHTML = `
        <p style="text-align: center; color: #007bff; font-weight: bold; margin-bottom: 15px;">Assign New Task</p>
        <div class="form-group">
            <label for="taskAssignee">Assign To (Employee ID)</label>
            <input type="text" id="taskAssignee" placeholder="Enter Employee ID">
        </div>
        <div class="form-group">
            <label for="taskTitle">Task Title</label>
            <input type="text" id="taskTitle" placeholder="e.g. Visit Jagatpura Builder">
        </div>
        <div class="form-group">
            <label for="taskDesc">Task Description</label>
            <input type="text" id="taskDesc" placeholder="Enter Description Details">
        </div>
        <button class="btn" style="background-color: #2563eb;" onclick="assignNewTask()">Assign Task</button>
        
        <hr style="border: 0; border-top: 1px solid #eee; margin: 25px 0 15px 0;">
        
        <div style="display: flex; gap: 8px; margin-bottom: 15px; align-items: center;">
            <h3 style="color: #333; font-size: 16px; margin: 0; flex-grow: 1;">Recent Tasks</h3>
            <input type="text" id="adTasksSearch" placeholder="Search tasks..." value="${searchVal}" style="padding: 6px 10px; border: 1px solid #ccc; border-radius: 6px; font-size: 12px; max-width: 200px;" oninput="handleAdTasksSearch(this.value)">
        </div>
        
        <div id="adTasksListContainer" class="agent-list">
            ${tasks.length === 0 ? '<p style="text-align: center; color: #888;">No tasks found.</p>' : tasks.map(task => `
                <div class="agent-item">
                    <div>
                        <strong>${task.title} (To: ${task.assigned_to})</strong>
                        <span>${task.description || 'No description'}</span>
                        <span style="font-weight: bold; color: ${task.status === 'completed' ? '#28a745' : '#ffc107'};">Status: ${task.status}</span>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function handleAdTasksSearch(val) {
    clearTimeout(searchDebounceTimeout);
    searchDebounceTimeout = setTimeout(() => {
        adTasksState.search = val;
        loadAdminDashboard();
    }, 3000);
}

async function renderAdminEmployeeList() {
    const listContainer = document.getElementById('adEmployeeListContainer');
    if (!listContainer) return;
    listContainer.innerHTML = '<p style="text-align: center; color: #888;">Loading employees...</p>';
    
    try {
        const response = await fetchWithLoading('/api/employees');
        const employees = await response.json();
        listContainer.innerHTML = '';
        
        if (employees.length === 0) {
            document.getElementById('adTotalEmployeesCount').innerText = '0';
            listContainer.innerHTML = '<p style="text-align: center; color: #888;">No employees found.</p>';
            return;
        }

        employees.forEach(emp => {
            const item = document.createElement('div');
            item.className = 'agent-item';
            const photoUrl = emp.profile_image || 'logo.png';
            
            item.innerHTML = `
                <div style="flex-grow: 1; text-align: left; display: flex; align-items: center; gap: 10px;">
                    <img src="${photoUrl}" alt="Profile" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 1px solid #181b5b;">
                    <div>
                        <strong style="cursor: pointer; color: #181b5b;" onclick="viewEmployeeDetails('${emp.id}', '${emp.full_name}', '${emp.email || ''}', '${emp.phone || ''}', '${emp.department || ''}', '${emp.designation || ''}', '${emp.status}', '${emp.created_at || ''}', '${emp.last_login || ''}', '${photoUrl}')" title="Click to view full profile">${emp.full_name} (ID: ${emp.id})</strong>
                        <span>Phone: ${emp.phone}</span>
                    </div>
                </div>
                <div class="btn-action-group" style="display: flex; flex-direction: column; gap: 4px; min-width: 80px;">
                    <button class="btn-download-small" onclick="openEditUserModal('${emp.id}', '${emp.full_name}', '${emp.email || ''}', '${emp.phone || ''}', '${emp.department || ''}', '${emp.designation || ''}', '${emp.role}', '${emp.status}')" style="font-size: 11px; padding: 4px 6px; background-color: #007bff; color: white; border: none; border-radius: 4px;">Edit</button>
                    <button class="btn-download-small" onclick="downloadEmployeeReport('${emp.id}')" style="font-size: 11px; padding: 4px 6px;">Report</button>
                    <button class="btn-delete-small" onclick="deleteEmployee('${emp.id}')" style="font-size: 11px; padding: 4px 6px;">Delete</button>
                </div>
            `;
            listContainer.appendChild(item);
        });
        
        document.getElementById('adTotalEmployeesCount').innerText = employees.length;
    } catch (error) {
        console.error("Admin employee list error:", error);
    }
}

async function adminAddEmployee() {
    const id = document.getElementById('adNewEmpId').value.trim().toLowerCase();
    const pass = document.getElementById('adNewEmpPass').value.trim();
    const name = document.getElementById('adNewEmpName').value.trim();
    const phone = document.getElementById('adNewEmpPhone').value.trim();
    const email = document.getElementById('adNewEmpEmail').value.trim();

    if (!id || !pass || !name || !phone) {
        return showNotification("ID, Password, Name, and Phone are required.", 'error');
    }

    try {
        const response = await fetchWithLoading('/api/employees', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, password: pass, name, phone, email })
        });
        const data = await response.json();
        if (response.ok && data.success) {
            showNotification(data.message, 'success');
            loadAdminDashboard();
            ['adNewEmpId', 'adNewEmpPass', 'adNewEmpName', 'adNewEmpPhone', 'adNewEmpEmail'].forEach(id => {
                document.getElementById(id).value = '';
            });
        } else {
            showNotification(data.error || "Failed to onboard employee.", 'error');
        }
    } catch (error) {
        console.error("Admin onboarding error:", error);
    }
}

async function assignNewTask() {
    const assignedTo = document.getElementById('taskAssignee').value.trim().toLowerCase();
    const title = document.getElementById('taskTitle').value.trim();
    const description = document.getElementById('taskDesc').value.trim();

    if (!assignedTo || !title) {
        return showNotification("Assignee ID and Task Title are required.", 'error');
    }

    try {
        const response = await fetchWithLoading('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assignedTo, title, description })
        });
        const data = await response.json();
        if (response.ok && data.success) {
            showNotification("Task assigned successfully.", 'success');
            loadAdminDashboard();
            document.getElementById('taskAssignee').value = '';
            document.getElementById('taskTitle').value = '';
            document.getElementById('taskDesc').value = '';
        } else {
            showNotification(data.error || "Failed to assign task.", 'error');
        }
    } catch (error) {
        console.error("Task assignment error:", error);
    }
}

// --- EMPLOYEE DASHBOARD LOGIC ---

function switchEmployeeTab(tabName) {
    const tabs = ['messages', 'tasks', 'profile'];
    tabs.forEach(t => {
        const tabDiv = document.getElementById(`emp-tab-${t}`);
        if (tabDiv) tabDiv.style.display = t === tabName ? 'block' : 'none';
    });

    const empContainer = document.getElementById('mainAppContainer');
    const buttons = empContainer.querySelectorAll('div[style*="display: flex; gap: 5px;"] button');
    buttons.forEach((btn, index) => {
        if (tabs[index] === tabName) {
            btn.style.backgroundColor = '#181b5b';
        } else {
            btn.style.backgroundColor = '#6c757d';
        }
    });
}

async function loadEmployeeDashboard() {
    try {
        const response = await fetchWithLoading('/api/dashboard/employee');
        if (!response.ok) throw new Error("Failed to load");
        const data = await response.json();
        
        // Render tasks
        const tasksContainer = document.getElementById('empTasksListContainer');
        if (data.tasks.length === 0) {
            tasksContainer.innerHTML = '<p style="text-align: center; color: #888;">No tasks assigned.</p>';
        } else {
            tasksContainer.innerHTML = data.tasks.map(task => `
                <div class="agent-item">
                    <div style="flex-grow: 1;">
                        <strong>${task.title}</strong>
                        <span>${task.description || 'No description'}</span>
                        <span style="font-weight: bold; color: ${task.status === 'completed' ? '#28a745' : '#ffc107'};">Status: ${task.status}</span>
                    </div>
                    ${task.status === 'pending' ? `
                        <button class="btn-download-small" onclick="completeTask(${task.id})" style="background-color: #28a745; color: white; border: none; padding: 6px 8px;">Done</button>
                    ` : ''}
                </div>
            `).join('');
        }
        
        // Render notifications
        const notifContainer = document.getElementById('empNotificationsContainer');
        if (data.notifications.length === 0) {
            notifContainer.innerHTML = '<p style="text-align: center; color: #888;">No notifications.</p>';
        } else {
            notifContainer.innerHTML = data.notifications.map(n => `
                <div style="border-bottom: 1px solid #f1f5f9; padding: 4px 0; font-weight: ${n.is_read ? 'normal' : 'bold'};">
                    <span style="color: #64748b;">[${new Date(n.timestamp).toLocaleString()}]</span> ${n.message}
                </div>
            `).join('');
            
            // Mark as read
            fetchWithLoading('/api/notifications/read', { method: 'POST' });
        }

        // Check attendance status
        const attendanceBtn = document.getElementById('attendanceBtn');
        const todayStr = new Date().toISOString().split('T')[0];
        const markedToday = data.attendance.some(a => a.date === todayStr);
        if (markedToday) {
            attendanceBtn.innerText = "Attendance Marked (Present)";
            attendanceBtn.disabled = true;
            attendanceBtn.style.backgroundColor = '#6c757d';
        } else {
            attendanceBtn.innerText = "Mark Present Today";
            attendanceBtn.disabled = false;
            attendanceBtn.style.backgroundColor = '#28a745';
        }

        // Pre-fill profile info
        document.getElementById('empProfileName').value = currentWorker.name || '';
        document.getElementById('empProfileEmail').value = currentWorker.email || '';
        document.getElementById('empProfilePhone').value = currentWorker.phone || '';

    } catch (error) {
        console.error("Error loading employee dashboard:", error);
    }
}

async function completeTask(taskId) {
    try {
        const response = await fetchWithLoading(`/api/tasks/${taskId}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'completed' })
        });
        if (response.ok) {
            showNotification("Task marked as completed!", 'success');
            loadEmployeeDashboard();
        }
    } catch (error) {
        console.error("Task update error:", error);
    }
}

async function markAttendance() {
    try {
        const response = await fetchWithLoading('/api/attendance', { method: 'POST' });
        const data = await response.json();
        if (response.ok) {
            showNotification(data.message, 'success');
            loadEmployeeDashboard();
        } else {
            showNotification(data.error || "Failed to mark attendance.", 'error');
        }
    } catch (error) {
        console.error("Attendance error:", error);
    }
}

async function updateUserProfile() {
    const name = document.getElementById('empProfileName').value.trim();
    const email = document.getElementById('empProfileEmail').value.trim();
    const phone = document.getElementById('empProfilePhone').value.trim();

    if (!name) return showNotification("Full Name is required.", 'error');

    try {
        const response = await fetchWithLoading('/api/profile/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, phone })
        });
        const data = await response.json();
        if (response.ok && data.success) {
            showNotification(data.message, 'success');
            currentWorker.name = name;
            currentWorker.email = email;
            currentWorker.phone = phone;
            welcomeMessage.innerText = "Welcome, " + currentWorker.name;
        } else {
            showNotification(data.error || "Failed to update profile.", 'error');
        }
    } catch (error) {
        console.error("Profile update error:", error);
    }
}

async function changeUserPassword() {
    const oldPassword = document.getElementById('empOldPassword').value.trim();
    const newPassword = document.getElementById('empNewPassword').value.trim();

    if (!oldPassword || !newPassword) {
        return showNotification("Both current and new passwords are required.", 'error');
    }

    try {
        const response = await fetchWithLoading('/api/profile/password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oldPassword, newPassword })
        });
        const data = await response.json();
        if (response.ok && data.success) {
            showNotification(data.message, 'success');
            document.getElementById('empOldPassword').value = '';
            document.getElementById('empNewPassword').value = '';
        } else {
            showNotification(data.error || "Failed to change password.", 'error');
        }
    } catch (error) {
        console.error("Password change error:", error);
    }
}

// --- CLIENT SAVING & MESSAGES ---

async function saveClientData(name, phone, email, personType, address) {
    if (!currentWorker) return;
    
    try {
        await fetchWithLoading('/api/clients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, phone, email, personType, address })
        });
    } catch (error) {
        console.error("Error saving client data:", error);
    }
}

function generateMessage(clientName) {
    return `Dear ${clientName},\n\n` +
           `It was great connecting with you today. Thank you for your time.\n\n` +
           `Regards,\n` +
           `${currentWorker.name}\n` +
           `${companyDetails.company}\n` +
           `Office: ${currentWorker.officeAddress || companyDetails.location}`;
}

function sendWhatsApp() {
    const name = clientNameInput.value.trim();
    const phone = clientPhoneInput.value.trim();
    const personType = clientPersonTypeInput.value;
    const address = clientAddressInput.value.trim();
    const email = clientEmailInput.value.trim();

    if (!name || !phone) {
        return showNotification("Please enter both Client Name and WhatsApp Number.", 'error');
    }

    saveClientData(name, phone, email, personType, address);

    // Show language modal
    document.getElementById('languageModal').style.display = 'flex';
}

window.confirmSendWhatsApp = function(language) {
    const name = clientNameInput.value.trim();
    let phone = clientPhoneInput.value.trim();
    
    phone = phone.replace(/\D/g, '');
    if (phone.length === 10) {
        phone = '91' + phone;
    }

    let message = "";
    if (language === 'english') {
        message = generateMessage(name);
    } else {
        message = `नमस्ते ${name},\n\n` +
                  `आज आपसे मिलकर बहुत अच्छा लगा। अपना बहुमूल्य समय देने के लिए धन्यवाद।\n\n` +
                  `सादर,\n` +
                  `${currentWorker.name}\n` +
                  `${companyDetails.company}\n` +
                  `कार्यालय: ${currentWorker.officeAddress || companyDetails.location}`;
    }

    document.getElementById('languageModal').style.display = 'none';

    const whatsappUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
};

window.closeLanguageModal = function() {
    document.getElementById('languageModal').style.display = 'none';
};

function sendEmail() {
    const name = clientNameInput.value.trim();
    const phone = clientPhoneInput.value.trim();
    const email = clientEmailInput.value.trim();
    const personType = clientPersonTypeInput.value;
    const address = clientAddressInput.value.trim();

    if (!name || !email) {
        return showNotification("Please enter both Client Name and Email ID.", 'error');
    }

    const subject = `Great connecting with you today! - ${companyDetails.company}`;
    const message = generateMessage(name);

    saveClientData(name, phone, email, personType, address);

    const mailtoUrl = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
    window.location.href = mailtoUrl;
}

// --- INTERACTIVE REPORT VIEWER & PDF/EXCEL EXPORT ---
function openReportViewer(clients, id) {
    const reportWindow = window.open('', '_blank');
    let rows = clients.map(c => `
        <tr>
            <td style="border: 1px solid #ddd; padding: 8px;">${c.date}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">${c.name}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">${c.phone}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">${c.email}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">${c.personType || 'N/A'}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">${c.address || 'N/A'}</td>
        </tr>
    `).join('');
    
    reportWindow.document.write(`
        <html>
        <head>
            <title>Report - ${id}</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
                .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #181b5b; padding-bottom: 10px; margin-bottom: 20px; }
                .btn-group { display: flex; gap: 10px; }
                .btn { padding: 8px 16px; font-size: 12px; font-weight: bold; border-radius: 6px; cursor: pointer; border: none; }
                .btn-pdf { background-color: #181b5b; color: white; }
                .btn-csv { background-color: #f05a28; color: white; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th { background-color: #f1f5f9; color: #181b5b; padding: 12px 10px; text-align: left; border-bottom: 2px solid #cbd5e1; }
                @media print {
                    .no-print { display: none; }
                }
            </style>
        </head>
        <body>
            <div class="header no-print">
                <h2 style="color: #181b5b; margin: 0;">IIFL Report Hub</h2>
                <div class="btn-group">
                    <button class="btn btn-pdf" onclick="window.print()">Export PDF</button>
                    <button class="btn btn-csv" onclick="downloadCSV()">Export Excel/CSV</button>
                </div>
            </div>
            
            <h2 style="color: #181b5b;">IIFL Home Finance - Client Visit Report</h2>
            <p><strong>Account ID:</strong> ${id}</p>
            <p><strong>Date Generated:</strong> ${new Date().toLocaleDateString()}</p>
            
            <table>
                <thead>
                    <tr>
                        <th>Date & Time</th>
                        <th>Client Name</th>
                        <th>Phone Number</th>
                        <th>Email ID</th>
                        <th>Person Type</th>
                        <th>Meeting Location</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
            
            <script>
                function downloadCSV() {
                    const clients = ${JSON.stringify(clients)};
                    let csvContent = "data:text/csv;charset=utf-8,Date & Time,Client Name,Phone Number,Email ID,Person Type,Meeting Location\\n";
                    clients.forEach(client => {
                        let row = \`"\${client.date}","\${client.name}","\${client.phone}","\${client.email}","\${client.personType || 'N/A'}","\${client.address || 'N/A'}"\`;
                        csvContent += row + "\\n";
                    });
                    const encodedUri = encodeURI(csvContent);
                    const link = document.createElement("a");
                    link.setAttribute("href", encodedUri);
                    link.setAttribute("download", "${id}_report.csv");
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                }
            </script>
        </body>
        </html>
    `);
    reportWindow.document.close();
}

async function downloadReport() {
    if (!currentWorker) return;
    
    try {
        const response = await fetchWithLoading(`/api/reports/${currentWorker.id}`);
        if (!response.ok) throw new Error("Failed to fetch");
        
        const clients = await response.json();
        if (clients.length === 0) {
            return showNotification("No client data found for today.", 'info');
        }
        
        openReportViewer(clients, currentWorker.id);
    } catch (error) {
        console.error("Report download error:", error);
        showNotification("Failed to download report.", 'error');
    }
}

async function downloadEmployeeReport(employeeId) {
    try {
        const response = await fetchWithLoading(`/api/reports/${employeeId}`);
        if (!response.ok) {
            const errData = await response.json();
            return showNotification(errData.error || "Error fetching report.", 'error');
        }
        
        const clients = await response.json();
        if (clients.length === 0) {
            return showNotification("No client data found for this employee.", 'info');
        }
        
        openReportViewer(clients, employeeId);
    } catch (error) {
        console.error("Report download error:", error);
        showNotification("Connection error.", 'error');
    }
}

async function clearReportData() {
    if (confirm("Are you sure you want to clear your daily report data?")) {
        try {
            const response = await fetchWithLoading('/api/reports/clear', { method: 'POST' });
            if (response.ok) {
                showNotification("Daily report data cleared.", 'success');
            }
        } catch (error) {
            console.error("Clear report error:", error);
        }
    }
}

// --- GLOBAL WINDOW BINDINGS ---
window.togglePasswordVisibility = togglePasswordVisibility;
window.handleLogin = handleLogin;
window.handleLogout = handleLogout;
window.openForgotModal = openForgotModal;
window.closeForgotModal = closeForgotModal;
window.sendForgotCode = sendForgotCode;
window.submitResetPassword = submitResetPassword;
window.switchSuperAdminTab = switchSuperAdminTab;
window.switchAdminTab = switchAdminTab;
window.switchEmployeeTab = switchEmployeeTab;
window.adminResetPassword = adminResetPassword;
window.adminToggleStatus = adminToggleStatus;
window.adminExportDatabase = adminExportDatabase;
window.adminAddEmployee = adminAddEmployee;
window.assignNewTask = assignNewTask;
window.completeTask = completeTask;
window.markAttendance = markAttendance;
window.updateUserProfile = updateUserProfile;
window.changeUserPassword = changeUserPassword;
window.addNewEmployee = addNewEmployee;
window.deleteEmployee = deleteEmployee;
window.downloadEmployeeReport = downloadEmployeeReport;
window.handleBranchSelection = handleBranchSelection;
window.sendWhatsApp = sendWhatsApp;
window.sendEmail = sendEmail;
window.downloadReport = downloadReport;
window.clearReportData = clearReportData;
window.handleSaLogsSearch = handleSaLogsSearch;
window.handleSaLogsSort = handleSaLogsSort;
window.changeSaLogsPage = changeSaLogsPage;
window.exportLogsToCSV = exportLogsToCSV;
window.handleAdTasksSearch = handleAdTasksSearch;
window.clickSaCard = clickSaCard;
window.handleSaEmpFilter = handleSaEmpFilter;
window.openEditUserModal = openEditUserModal;
window.closeEditUserModal = closeEditUserModal;
window.saveEditedUser = saveEditedUser;
window.viewEmployeeDetails = viewEmployeeDetails;
window.closeEmployeeDetailsModal = closeEmployeeDetailsModal;
