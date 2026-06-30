import datetime
from flask import Blueprint, request, jsonify, session
from database import get_db_connection, log_activity
from security import hash_password, sanitize_input

api_bp = Blueprint('api', __name__)

# Helper to check role authorization
def authorize(allowed_roles):
    role = session.get('role')
    if not role or role not in allowed_roles:
        return False
    return True

# --- SUPER ADMIN DASHBOARD ENDPOINT ---
@api_bp.route('/dashboard/superadmin', methods=['GET'])
def get_superadmin_dashboard():
    if not authorize(['super_admin']):
        return jsonify({"error": "Unauthorized"}), 403
        
    # Query parameters for sorting, filtering, searching, and pagination
    search = sanitize_input(request.args.get('search', '')).strip()
    sort_by = sanitize_input(request.args.get('sort_by', 'timestamp')).strip()
    sort_order = sanitize_input(request.args.get('sort_order', 'DESC')).strip()
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 10))
    offset = (page - 1) * limit
    
    # Validate sort parameters to prevent SQL injection
    allowed_sort_cols = ['id', 'user_id', 'action', 'module', 'timestamp', 'login_time', 'logout_time']
    if sort_by not in allowed_sort_cols:
        sort_by = 'timestamp'
    if sort_order.upper() not in ['ASC', 'DESC']:
        sort_order = 'DESC'

    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Base Metrics
    cursor.execute("SELECT COUNT(*) FROM users")
    total_users = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM users WHERE role = 'admin'")
    total_admins = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM users WHERE role = 'employee'")
    total_employees = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM users WHERE status = 'active'")
    active_users = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM users WHERE status IN ('suspended', 'inactive')")
    inactive_users = cursor.fetchone()[0]
    
    # Calculate today's logins
    today_str = datetime.date.today().isoformat()
    cursor.execute("SELECT COUNT(*) FROM login_history WHERE login_time LIKE ?", (f"{today_str}%",))
    todays_logins = cursor.fetchone()[0]
    
    # Calculate total activity logs
    cursor.execute("SELECT COUNT(*) FROM activity_logs")
    total_logs = cursor.fetchone()[0]
    
    # Online Users (logged in within last 15 minutes)
    fifteen_mins_ago = (datetime.datetime.now() - datetime.timedelta(minutes=15)).isoformat()
    cursor.execute("SELECT COUNT(*) FROM users WHERE last_login >= ?", (fifteen_mins_ago,))
    online_users = cursor.fetchone()[0]
    
    # Total Clients for Revenue & Reports
    cursor.execute("SELECT COUNT(*) FROM clients")
    total_clients = cursor.fetchone()[0]
    revenue = total_clients * 25000 # Simulated revenue based on client count
    
    # Latest Employees
    cursor.execute("SELECT id, full_name, created_at FROM users WHERE role = 'employee' ORDER BY created_at DESC LIMIT 3")
    latest_employees = [dict(row) for row in cursor.fetchall()]
    
    # Latest Admins
    cursor.execute("SELECT id, full_name, created_at FROM users WHERE role = 'admin' ORDER BY created_at DESC LIMIT 3")
    latest_admins = [dict(row) for row in cursor.fetchall()]
    
    # Database & System Info
    cursor.execute("SELECT sqlite_version()")
    sqlite_ver = cursor.fetchone()[0]
    
    import os
    db_size_kb = 0
    if os.path.exists('database.db'):
        db_size_kb = round(os.path.getsize('database.db') / 1024, 2)
        
    backup_size_kb = 0
    backup_time = "Never"
    if os.path.exists('project.zip'):
        backup_size_kb = round(os.path.getsize('project.zip') / 1024, 2)
        backup_time = datetime.datetime.fromtimestamp(os.path.getmtime('project.zip')).strftime("%Y-%m-%d %H:%M:%S")
        
    # Recent Logins
    cursor.execute("SELECT user_id, ip_address, login_time FROM login_history ORDER BY login_time DESC LIMIT 5")
    recent_logins = [dict(row) for row in cursor.fetchall()]
    
    # Recent Activities
    cursor.execute("SELECT user_id, action, timestamp, module FROM activity_logs ORDER BY timestamp DESC LIMIT 5")
    recent_activities = [dict(row) for row in cursor.fetchall()]
    
    # 2. Paginated & Filtered Activity Logs
    log_query = "SELECT * FROM activity_logs"
    log_params = []
    if search:
        log_query += " WHERE user_id LIKE ? OR action LIKE ? OR module LIKE ?"
        search_val = f"%{search}%"
        log_params.extend([search_val, search_val, search_val])
    
    log_query += f" ORDER BY {sort_by} {sort_order} LIMIT ? OFFSET ?"
    log_params.extend([limit, offset])
    
    cursor.execute(log_query, log_params)
    logs = [dict(row) for row in cursor.fetchall()]
    
    # Get total count for pagination
    count_query = "SELECT COUNT(*) FROM activity_logs"
    count_params = []
    if search:
        count_query += " WHERE user_id LIKE ? OR action LIKE ? OR module LIKE ?"
        count_params.extend([search_val, search_val, search_val])
    cursor.execute(count_query, count_params)
    total_logs_paginated = cursor.fetchone()[0]
    
    # 3. Recent Login History
    hist_query = "SELECT * FROM login_history"
    hist_params = []
    if search:
        hist_query += " WHERE user_id LIKE ? OR ip_address LIKE ? OR browser LIKE ?"
        hist_params.extend([f"%{search}%", f"%{search}%", f"%{search}%"])
    
    # Fix sort_by for history table if it was 'timestamp'
    hist_sort = 'login_time' if sort_by == 'timestamp' else sort_by
    if hist_sort not in ['id', 'user_id', 'ip_address', 'login_time', 'logout_time']:
        hist_sort = 'login_time'
        
    hist_query += f" ORDER BY {hist_sort} {sort_order} LIMIT ? OFFSET ?"
    hist_params.extend([limit, offset])
    
    cursor.execute(hist_query, hist_params)
    history = [dict(row) for row in cursor.fetchall()]
    
    conn.close()
    
    return jsonify({
        "metrics": {
            "totalUsers": total_users,
            "totalAdmins": total_admins,
            "totalEmployees": total_employees,
            "activeUsers": active_users,
            "inactiveUsers": inactive_users,
            "todaysLogins": todays_logins,
            "totalLogs": total_logs,
            "onlineUsers": online_users,
            "revenue": revenue,
            "totalClients": total_clients
        },
        "latestEmployees": latest_employees,
        "latestAdmins": latest_admins,
        "system": {
            "sqliteVersion": sqlite_ver,
            "dbSizeKb": db_size_kb,
            "backupSizeKb": backup_size_kb,
            "backupTime": backup_time
        },
        "recentLogins": recent_logins,
        "recentActivities": recent_activities,
        "logs": logs,
        "logs_pagination": {
            "page": page,
            "limit": limit,
            "total": total_logs_paginated,
            "pages": (total_logs_paginated + limit - 1) // limit
        },
        "history": history
    })

# --- ADMIN DASHBOARD ENDPOINT ---
@api_bp.route('/dashboard/admin', methods=['GET'])
def get_admin_dashboard():
    if not authorize(['admin']):
        return jsonify({"error": "Unauthorized"}), 403
        
    search = sanitize_input(request.args.get('search', '')).strip()
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 10))
    offset = (page - 1) * limit

    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Get admin's branch
    cursor.execute("SELECT branch FROM users WHERE id = ?", (user_id,))
    admin_row = cursor.fetchone()
    admin_branch = admin_row['branch'] if admin_row else 'jagatpura'
    
    # Metrics restricted to the admin's branch!
    cursor.execute("SELECT COUNT(*) FROM users WHERE role = 'employee' AND branch = ?", (admin_branch,))
    total_employees = cursor.fetchone()[0]
    
    cursor.execute('''
        SELECT COUNT(*) FROM clients 
        WHERE worker_id IN (SELECT id FROM users WHERE branch = ? AND role = 'employee')
    ''', (admin_branch,))
    total_assigned_users = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM projects")
    total_projects = cursor.fetchone()[0]
    
    cursor.execute('''
        SELECT COUNT(*) FROM tasks 
        WHERE status = 'pending' 
        AND assigned_to IN (SELECT id FROM users WHERE branch = ? AND role = 'employee')
    ''', (admin_branch,))
    pending_tasks = cursor.fetchone()[0]
    
    cursor.execute('''
        SELECT COUNT(*) FROM tasks 
        WHERE status = 'completed' 
        AND assigned_to IN (SELECT id FROM users WHERE branch = ? AND role = 'employee')
    ''', (admin_branch,))
    completed_tasks = cursor.fetchone()[0]
    
    # Active Projects
    cursor.execute("SELECT * FROM projects WHERE status = 'active'")
    projects = [dict(row) for row in cursor.fetchall()]
    
    # Tasks with search & pagination (restricted to admin's branch employees)
    task_query = '''
        SELECT * FROM tasks 
        WHERE assigned_to IN (SELECT id FROM users WHERE branch = ? AND role = 'employee')
    '''
    task_params = [admin_branch]
    
    if search:
        task_query += " AND (title LIKE ? OR description LIKE ? OR assigned_to LIKE ?)"
        search_val = f"%{search}%"
        task_params.extend([search_val, search_val, search_val])
        
    task_query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
    task_params.extend([limit, offset])
    
    cursor.execute(task_query, task_params)
    tasks = [dict(row) for row in cursor.fetchall()]
    
    conn.close()
    
    return jsonify({
        "metrics": {
            "totalEmployees": total_employees,
            "totalAssignedUsers": total_assigned_users,
            "assignedProjects": total_projects,
            "pendingTasks": pending_tasks,
            "completedTasks": completed_tasks
        },
        "projects": projects,
        "tasks": tasks
    })

# --- EMPLOYEE DASHBOARD ENDPOINT ---
@api_bp.route('/dashboard/employee', methods=['GET'])
def get_employee_dashboard():
    user_id = session.get('user_id')
    if not user_id or not authorize(['employee']):
        return jsonify({"error": "Unauthorized"}), 403
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Tasks
    cursor.execute("SELECT * FROM tasks WHERE assigned_to = ? ORDER BY created_at DESC", (user_id,))
    tasks = [dict(row) for row in cursor.fetchall()]
    
    # Attendance
    cursor.execute("SELECT * FROM attendance WHERE user_id = ? ORDER BY timestamp DESC LIMIT 10", (user_id,))
    attendance = [dict(row) for row in cursor.fetchall()]
    
    # Notifications
    cursor.execute("SELECT * FROM notifications WHERE user_id = ? ORDER BY timestamp DESC LIMIT 15", (user_id,))
    notifications = [dict(row) for row in cursor.fetchall()]
    
    conn.close()
    
    return jsonify({
        "tasks": tasks,
        "attendance": attendance,
        "notifications": notifications
    })

# --- USER CRUD ENDPOINTS ---
@api_bp.route('/employees', methods=['GET'])
def get_employees():
    role = session.get('role')
    user_id = session.get('user_id')
    if not role or role not in ['super_admin', 'admin']:
        return jsonify({"error": "Unauthorized"}), 403
        
    search = sanitize_input(request.args.get('search', '')).strip()
    role_filter = sanitize_input(request.args.get('role', '')).strip()
    status_filter = sanitize_input(request.args.get('status', '')).strip()
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = "SELECT id, full_name, email, phone, role, status, department, designation, created_at, last_login FROM users WHERE id != 'admin01'"
    params = []
    
    if role == 'admin':
        # Get admin's branch
        cursor.execute("SELECT branch FROM users WHERE id = ?", (user_id,))
        admin_row = cursor.fetchone()
        admin_branch = admin_row['branch'] if admin_row else 'jagatpura'
        query += " AND branch = ? AND role = 'employee'"
        params.append(admin_branch)
        
    if search:
        query += " AND (full_name LIKE ? OR id LIKE ? OR email LIKE ?)"
        search_val = f"%{search}%"
        params.extend([search_val, search_val, search_val])
        
    if role_filter and role != 'admin':
        query += " AND role = ?"
        params.append(role_filter)
        
    if status_filter:
        query += " AND status = ?"
        params.append(status_filter)
        
    cursor.execute(query, params)
    employees = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(employees)

@api_bp.route('/employees/<id>/update', methods=['POST'])
def update_employee(id):
    user_id = session.get('user_id')
    current_role = session.get('role')
    if not authorize(['super_admin', 'admin']):
        return jsonify({"error": "Unauthorized"}), 403
        
    data = request.get_json()
    name = sanitize_input(data.get('name', '')).strip()
    email = sanitize_input(data.get('email', '')).strip()
    phone = sanitize_input(data.get('phone', '')).strip()
    dept = sanitize_input(data.get('department', '')).strip()
    desig = sanitize_input(data.get('designation', '')).strip()
    role = sanitize_input(data.get('role', '')).strip()
    status = sanitize_input(data.get('status', '')).strip()
    
    if not name:
        return jsonify({"error": "Full Name is required"}), 400
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    now = datetime.datetime.now().isoformat()
    
    if current_role == 'super_admin':
        cursor.execute('''
            UPDATE users 
            SET full_name = ?, email = ?, phone = ?, department = ?, designation = ?, role = ?, status = ?, updated_at = ?
            WHERE id = ?
        ''', (name, email, phone, dept, desig, role, status, now, id))
    else:
        cursor.execute('''
            UPDATE users 
            SET full_name = ?, email = ?, phone = ?, department = ?, designation = ?, status = ?, updated_at = ?
            WHERE id = ?
        ''', (name, email, phone, dept, desig, status, now, id))
        
    conn.commit()
    conn.close()
    
    log_activity(user_id, f"Updated account details for {id}", "User Management")
    return jsonify({"success": True, "message": "Account updated successfully."})

@api_bp.route('/employees', methods=['POST'])
def add_employee():
    user_id = session.get('user_id')
    if not authorize(['super_admin', 'admin']):
        return jsonify({"error": "Unauthorized"}), 403
        
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid request"}), 400
        
    emp_id = sanitize_input(data.get('id', '')).strip().lower()
    password = data.get('password', '').strip()
    name = sanitize_input(data.get('name', '')).strip()
    phone = sanitize_input(data.get('phone', '')).strip()
    email = sanitize_input(data.get('email', '')).strip()
    
    if not emp_id or not password or not name or not phone:
        return jsonify({"error": "ID, Password, Name, and Phone are required"}), 400
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id FROM users WHERE id = ?", (emp_id,))
    if cursor.fetchone():
        conn.close()
        return jsonify({"error": "Account ID already exists"}), 400
        
    # Super Admin can create admins or employees. Admins can only create employees.
    emp_role = 'employee'
    branch = 'jagatpura'
    
    if session.get('role') == 'super_admin':
        if emp_id.startswith('admin') or 'admin' in email.lower():
            emp_role = 'admin'
        branch = sanitize_input(data.get('branch', 'jagatpura')).strip()
    else:
        cursor.execute("SELECT branch FROM users WHERE id = ?", (user_id,))
        admin_row = cursor.fetchone()
        branch = admin_row['branch'] if admin_row else 'jagatpura'
            
    now = datetime.datetime.now().isoformat()
    pwd_hash = hash_password(password)
    
    cursor.execute('''
        INSERT INTO users (id, full_name, email, phone, password_hash, role, status, branch, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (emp_id, name, email, phone, pwd_hash, emp_role, 'active', branch, now, now))
    
    conn.commit()
    conn.close()
    
    log_activity(user_id, f"Created account {emp_id} (Role: {emp_role})", "User Management")
    return jsonify({"success": True, "message": f"Account {name} created successfully."})

@api_bp.route('/employees/<id>', methods=['DELETE'])
def delete_employee(id):
    user_id = session.get('user_id')
    if not authorize(['super_admin', 'admin']):
        return jsonify({"error": "Unauthorized"}), 403
        
    if id == 'admin01':
        return jsonify({"error": "Super Admin account cannot be deleted!"}), 403
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id, role FROM users WHERE id = ?", (id,))
    target_user = cursor.fetchone()
    if not target_user:
        conn.close()
        return jsonify({"error": "User not found"}), 404
        
    if session.get('role') == 'admin' and target_user['role'] != 'employee':
        conn.close()
        return jsonify({"error": "Admins can only delete employees"}), 403
        
    cursor.execute("DELETE FROM users WHERE id = ?", (id,))
    cursor.execute("DELETE FROM clients WHERE worker_id = ?", (id,))
    cursor.execute("DELETE FROM tasks WHERE assigned_to = ?", (id,))
    cursor.execute("DELETE FROM attendance WHERE user_id = ?", (id,))
    cursor.execute("DELETE FROM notifications WHERE user_id = ?", (id,))
    
    conn.commit()
    conn.close()
    
    log_activity(user_id, f"Deleted account {id}", "User Management")
    return jsonify({"success": True})

# --- CLIENTS & REPORTS ---
@api_bp.route('/clients', methods=['POST'])
def save_client():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
        
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid request"}), 400
        
    name = sanitize_input(data.get('name', '')).strip()
    phone = sanitize_input(data.get('phone', 'N/A')).strip()
    email = sanitize_input(data.get('email', 'N/A')).strip()
    person_type = sanitize_input(data.get('personType', 'N/A')).strip()
    address = sanitize_input(data.get('address', 'N/A')).strip()
    
    if not name:
        return jsonify({"error": "Client Name is required"}), 400
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    now = datetime.datetime.now().strftime("%m/%d/%Y, %I:%M:%S %p")
    ts = int(datetime.datetime.now().timestamp() * 1000)
    
    cursor.execute('''
        INSERT INTO clients (worker_id, name, phone, email, person_type, address, date, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (user_id, name, phone, email, person_type, address, now, ts))
    
    conn.commit()
    conn.close()
    
    log_activity(user_id, f"Saved Client: {name}", "Client Management")
    return jsonify({"success": True})

@api_bp.route('/reports/<employee_id>', methods=['GET'])
def get_employee_report(employee_id):
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
        
    if session.get('role') == 'employee' and user_id != employee_id:
        return jsonify({"error": "Unauthorized"}), 403
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT name, phone, email, person_type as personType, address, date, timestamp 
        FROM clients WHERE worker_id = ? ORDER BY timestamp ASC
    ''', (employee_id,))
    
    clients = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    return jsonify(clients)

@api_bp.route('/reports/clear', methods=['POST'])
def clear_report():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
        
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM clients WHERE worker_id = ?", (user_id,))
    conn.commit()
    conn.close()
    
    log_activity(user_id, "Cleared Daily Report Data", "Client Management")
    return jsonify({"success": True})

# --- PROFILE AND INTERACTIVE ACTIONS ---
@api_bp.route('/profile/update', methods=['POST'])
def update_profile():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
        
    data = request.get_json()
    name = sanitize_input(data.get('name', '')).strip()
    email = sanitize_input(data.get('email', '')).strip()
    phone = sanitize_input(data.get('phone', '')).strip()
    
    if not name:
        return jsonify({"error": "Full Name is required"}), 400
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
        UPDATE users SET full_name = ?, email = ?, phone = ?, updated_at = ?
        WHERE id = ?
    ''', (name, email, phone, datetime.datetime.now().isoformat(), user_id))
    
    conn.commit()
    conn.close()
    
    log_activity(user_id, "Updated Profile Information", "Profile")
    return jsonify({"success": True, "message": "Profile updated successfully."})

@api_bp.route('/profile/password', methods=['POST'])
def change_password():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
        
    data = request.get_json()
    old_pass = data.get('oldPassword', '').strip()
    new_pass = data.get('newPassword', '').strip()
    
    if not old_pass or not new_pass:
        return jsonify({"error": "Both old and new passwords are required"}), 400
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT password_hash FROM users WHERE id = ?", (user_id,))
    user = cursor.fetchone()
    
    from security import verify_password
    if not user or not verify_password(old_pass, user['password_hash']):
        conn.close()
        return jsonify({"error": "Incorrect old password"}), 400
        
    new_hash = hash_password(new_pass)
    cursor.execute("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?", (new_hash, datetime.datetime.now().isoformat(), user_id))
    conn.commit()
    conn.close()
    
    log_activity(user_id, "Changed Password", "Profile")
    return jsonify({"success": True, "message": "Password changed successfully."})

@api_bp.route('/admin/reset-password', methods=['POST'])
def admin_reset_password():
    if not authorize(['super_admin']):
        return jsonify({"error": "Unauthorized"}), 403
        
    data = request.get_json()
    target_id = sanitize_input(data.get('id', '')).strip().lower()
    new_pass = data.get('newPassword', '').strip()
    
    if not target_id or not new_pass:
        return jsonify({"error": "Target user ID and new password are required"}), 400
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    new_hash = hash_password(new_pass)
    cursor.execute("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?", (new_hash, datetime.datetime.now().isoformat(), target_id))
    conn.commit()
    conn.close()
    
    log_activity(session.get('user_id'), f"Reset password for user: {target_id}", "User Management")
    return jsonify({"success": True, "message": f"Password for {target_id} has been reset."})

@api_bp.route('/admin/toggle-status', methods=['POST'])
def admin_toggle_status():
    if not authorize(['super_admin']):
        return jsonify({"error": "Unauthorized"}), 403
        
    data = request.get_json()
    target_id = sanitize_input(data.get('id', '')).strip().lower()
    
    if target_id == 'admin01':
        return jsonify({"error": "Super Admin account status cannot be changed!"}), 403
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT status FROM users WHERE id = ?", (target_id,))
    user = cursor.fetchone()
    if not user:
        conn.close()
        return jsonify({"error": "User not found"}), 404
        
    new_status = 'suspended' if user['status'] == 'active' else 'active'
    cursor.execute("UPDATE users SET status = ? WHERE id = ?", (new_status, target_id))
    conn.commit()
    conn.close()
    
    log_activity(session.get('user_id'), f"Toggled status of {target_id} to {new_status}", "User Management")
    return jsonify({"success": True, "status": new_status})

@api_bp.route('/admin/export', methods=['GET'])
def admin_export_database():
    if not authorize(['super_admin']):
        return jsonify({"error": "Unauthorized"}), 403
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id, full_name, email, phone, role, status, created_at FROM users")
    users = [dict(row) for row in cursor.fetchall()]
    
    cursor.execute("SELECT * FROM clients")
    clients = [dict(row) for row in cursor.fetchall()]
    
    cursor.execute("SELECT * FROM activity_logs")
    logs = [dict(row) for row in cursor.fetchall()]
    
    conn.close()
    
    log_activity(session.get('user_id'), "Exported Database Data", "Database Management")
    
    return jsonify({
        "exported_at": datetime.datetime.now().isoformat(),
        "users": users,
        "clients": clients,
        "activity_logs": logs
    })

# --- TASK & ATTENDANCE MANAGEMENT ---
@api_bp.route('/tasks', methods=['POST'])
def assign_task():
    user_id = session.get('user_id')
    if not authorize(['super_admin', 'admin']):
        return jsonify({"error": "Unauthorized"}), 403
        
    data = request.get_json()
    title = sanitize_input(data.get('title', '')).strip()
    desc = sanitize_input(data.get('description', '')).strip()
    assigned_to = sanitize_input(data.get('assignedTo', '')).strip().lower()
    
    if not title or not assigned_to:
        return jsonify({"error": "Task Title and Assignee are required"}), 400
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id FROM users WHERE id = ?", (assigned_to,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({"error": "Assignee does not exist"}), 404
        
    now = datetime.datetime.now().isoformat()
    cursor.execute('''
        INSERT INTO tasks (title, description, assigned_to, assigned_by, status, created_at)
        VALUES (?, ?, ?, ?, 'pending', ?)
    ''', (title, desc, assigned_to, user_id, now))
    
    # Create notification
    cursor.execute('''
        INSERT INTO notifications (user_id, message, timestamp)
        VALUES (?, ?, ?)
    ''', (assigned_to, f"New Task Assigned: {title}", now))
    
    conn.commit()
    conn.close()
    
    log_activity(user_id, f"Assigned Task: {title} to {assigned_to}", "Task Management")
    return jsonify({"success": True})

@api_bp.route('/tasks/<int:task_id>/status', methods=['POST'])
def update_task_status(task_id):
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
        
    data = request.get_json()
    status = sanitize_input(data.get('status', 'completed'))
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT assigned_to, title FROM tasks WHERE id = ?", (task_id,))
    task = cursor.fetchone()
    if not task:
        conn.close()
        return jsonify({"error": "Task not found"}), 404
        
    if task['assigned_to'] != user_id:
        conn.close()
        return jsonify({"error": "Unauthorized to modify this task"}), 403
        
    cursor.execute("UPDATE tasks SET status = ? WHERE id = ?", (status, task_id))
    conn.commit()
    conn.close()
    
    log_activity(user_id, f"Updated status of Task: {task['title']} to {status}", "Task Management")
    return jsonify({"success": True})

@api_bp.route('/notifications/read', methods=['POST'])
def mark_notifications_read():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
        
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE notifications SET is_read = 1 WHERE user_id = ?", (user_id,))
    conn.commit()
    conn.close()
    return jsonify({"success": True})

@api_bp.route('/attendance', methods=['POST'])
def submit_attendance():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    today = datetime.datetime.now().strftime("%Y-%m-%d")
    
    cursor.execute("SELECT id FROM attendance WHERE user_id = ? AND date = ?", (user_id, today))
    if cursor.fetchone():
        conn.close()
        return jsonify({"error": "Attendance already marked for today!"}), 400
        
    now = datetime.datetime.now().isoformat()
    cursor.execute('''
        INSERT INTO attendance (user_id, date, status, timestamp)
        VALUES (?, ?, 'present', ?)
    ''', (user_id, today, now))
    
    conn.commit()
    conn.close()
    
    log_activity(user_id, "Marked daily attendance", "Attendance")
    return jsonify({"success": True, "message": "Attendance marked successfully."})

# --- PROFILE PHOTO UPLOAD ---
@api_bp.route('/employees/<id>/photo', methods=['POST'])
def upload_employee_photo(id):
    if not authorize(['super_admin', 'admin']):
        return jsonify({"error": "Unauthorized"}), 403
        
    if 'photo' not in request.files:
        return jsonify({"error": "No file part"}), 400
        
    file = request.files['photo']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
        
    import os
    from werkzeug.utils import secure_filename
    
    UPLOAD_FOLDER = 'uploads'
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}
    
    if not os.path.exists(UPLOAD_FOLDER):
        os.makedirs(UPLOAD_FOLDER)
        
    def allowed_file(filename):
        return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS
        
    if file and allowed_file(file.filename):
        filename = secure_filename(f"{id}_{file.filename}")
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        file.save(filepath)
        
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET profile_image = ? WHERE id = ?", (f"/uploads/{filename}", id))
        conn.commit()
        conn.close()
        
        log_activity(session.get('user_id'), f"Uploaded profile photo for {id}", "User Management")
        return jsonify({"success": True, "photo_url": f"/uploads/{filename}"})
        
    return jsonify({"error": "File type not allowed"}), 400
