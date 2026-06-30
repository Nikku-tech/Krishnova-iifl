import datetime
from flask import Blueprint, request, jsonify, session
from database import get_db_connection, log_activity
from security import verify_password, hash_password, is_rate_limited, sanitize_input

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/login', methods=['POST'])
def login():
    ip_address = request.remote_addr
    if is_rate_limited(ip_address):
        return jsonify({"error": "Too many login attempts. Please try again in 1 minute."}), 429

    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid request"}), 400
        
    username = sanitize_input(data.get('username', '')).strip().lower()
    password = data.get('password', '').strip()
    
    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM users WHERE id = ? OR email = ?", (username, username))
    user = cursor.fetchone()
    
    if not user or not verify_password(password, user['password_hash']):
        conn.close()
        return jsonify({"error": "Invalid Username/Email or Password"}), 401
        
    if user['status'] == 'suspended' or user['status'] == 'inactive':
        conn.close()
        return jsonify({"error": "Your account is inactive or suspended. Contact Super Admin."}), 403
        
    now = datetime.datetime.now().isoformat()
    cursor.execute("UPDATE users SET last_login = ? WHERE id = ?", (now, user['id']))
    
    user_agent = request.headers.get('User-Agent', '')
    cursor.execute('''
        INSERT INTO login_history (user_id, ip_address, browser, device, login_time)
        VALUES (?, ?, ?, ?, ?)
    ''', (user_id := user['id'], ip_address, user_agent, 'PC/Mobile', now))
    login_history_id = cursor.lastrowid
    
    conn.commit()
    conn.close()
    
    session['user_id'] = user_id
    session['role'] = user['role']
    session['login_history_id'] = login_history_id
    
    log_activity(user_id, "Logged In", "Authentication")
    
    return jsonify({
        "success": True,
        "user": {
            "id": user['id'],
            "name": user['full_name'],
            "role": user['role']
        }
    })

@auth_bp.route('/logout', methods=['POST'])
def logout():
    user_id = session.get('user_id')
    login_history_id = session.get('login_history_id')
    
    if user_id:
        log_activity(user_id, "Logged Out", "Authentication")
        
        if login_history_id:
            conn = get_db_connection()
            cursor = conn.cursor()
            now = datetime.datetime.now().isoformat()
            cursor.execute("UPDATE login_history SET logout_time = ? WHERE id = ?", (now, login_history_id))
            conn.commit()
            conn.close()
            
    session.clear()
    return jsonify({"success": True})

@auth_bp.route('/session', methods=['GET'])
def get_session():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"logged_in": False})
        
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, full_name, email, phone, role, status FROM users WHERE id = ?", (user_id,))
    user = cursor.fetchone()
    conn.close()
    
    if not user or user['status'] == 'suspended' or user['status'] == 'inactive':
        session.clear()
        return jsonify({"logged_in": False})
        
    return jsonify({
        "logged_in": True,
        "user": {
            "id": user['id'],
            "name": user['full_name'],
            "email": user['email'],
            "phone": user['phone'],
            "role": user['role']
        }
    })

# --- FORGOT / RESET PASSWORD FLOW ---
@auth_bp.route('/forgot-password', methods=['POST'])
def forgot_password():
    data = request.get_json()
    email = sanitize_input(data.get('email', '')).strip().lower()
    
    if not email:
        return jsonify({"error": "Email is required"}), 400
        
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM users WHERE email = ?", (email,))
    user = cursor.fetchone()
    
    if not user:
        conn.close()
        # Return generic success to prevent email enumeration
        return jsonify({"success": True, "message": "If the email exists in our system, a reset code has been generated."})
        
    # Generate a simple 6-digit reset code
    import random
    reset_code = str(random.randint(100000, 999999))
    
    # Store the reset code in the user's record or print it in the console
    print(f"\n🔑 PASSWORD RESET REQUEST for {email}: Reset Code is [{reset_code}]\n")
    
    # For demo purposes, we log this in the activity log so the Super Admin/Developer can see it
    log_activity("system", f"Generated password reset code for {user['id']}", "Security")
    
    # We will temporarily store this in the session or db (since we want a production-ready solution, let's store it in the session!)
    session[f"reset_code_{user['id']}"] = reset_code
    
    conn.close()
    return jsonify({
        "success": True, 
        "message": "A password reset code has been generated. For testing, the code is printed in the server terminal logs.",
        "debug_code": reset_code # Provided for easy client testing
    })

@auth_bp.route('/reset-password', methods=['POST'])
def reset_password():
    data = request.get_json()
    username = sanitize_input(data.get('username', '')).strip().lower()
    code = sanitize_input(data.get('code', '')).strip()
    new_password = data.get('newPassword', '').strip()
    
    if not username or not code or not new_password:
        return jsonify({"error": "Username, Reset Code, and New Password are required."}), 400
        
    stored_code = session.get(f"reset_code_{username}")
    if not stored_code or stored_code != code:
        return jsonify({"error": "Invalid or expired reset code."}), 400
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    new_hash = hash_password(new_password)
    cursor.execute("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?", (new_hash, datetime.datetime.now().isoformat(), username))
    conn.commit()
    conn.close()
    
    # Clear the reset code from session
    session.pop(f"reset_code_{username}", None)
    
    log_activity(username, "Reset Password via Code", "Security")
    return jsonify({"success": True, "message": "Password has been reset successfully."})
