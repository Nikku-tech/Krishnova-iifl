import sqlite3
import datetime
from config import Config
from security import hash_password

def get_db_connection():
    conn = sqlite3.connect(Config.DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Users Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            full_name TEXT NOT NULL,
            email TEXT,
            phone TEXT,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL, -- 'super_admin', 'admin', 'employee'
            status TEXT DEFAULT 'active', -- 'active', 'suspended', 'inactive'
            profile_image TEXT,
            department TEXT,
            designation TEXT,
            branch TEXT, -- 'jagatpura', 'vaishali', etc.
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            last_login TEXT
        )
    ''')
    
    # Login History Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS login_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            ip_address TEXT,
            browser TEXT,
            device TEXT,
            login_time TEXT NOT NULL,
            logout_time TEXT,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    ''')
    
    # Activity Logs / Audit Logs Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            action TEXT NOT NULL,
            module TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    ''')
    
    # Clients Table (original feature)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS clients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            worker_id TEXT NOT NULL,
            name TEXT NOT NULL,
            phone TEXT,
            email TEXT,
            person_type TEXT,
            address TEXT,
            date TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            FOREIGN KEY (worker_id) REFERENCES users (id) ON DELETE CASCADE
        )
    ''')

    # Projects Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            status TEXT DEFAULT 'active'
        )
    ''')

    # Tasks Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            assigned_to TEXT NOT NULL,
            assigned_by TEXT NOT NULL,
            status TEXT DEFAULT 'pending', -- 'pending', 'completed'
            created_at TEXT NOT NULL,
            FOREIGN KEY (assigned_to) REFERENCES users (id) ON DELETE CASCADE,
            FOREIGN KEY (assigned_by) REFERENCES users (id)
        )
    ''')

    # Attendance Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            date TEXT NOT NULL,
            status TEXT NOT NULL, -- 'present', 'absent'
            timestamp TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    ''')

    # Notifications Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            message TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            is_read INTEGER DEFAULT 0, -- 0 = unread, 1 = read
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    ''')
    
    conn.commit()
    
    # Seed Permanent Super Admin
    cursor.execute("SELECT id FROM users WHERE id = 'admin01'")
    if not cursor.fetchone():
        now = datetime.datetime.now().isoformat()
        sup_hash = hash_password("IIFL@123")
        cursor.execute('''
            INSERT INTO users (id, full_name, email, phone, password_hash, role, status, branch, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', ('admin01', 'Super Admin', 'admin@iiflhomeloans.com', '+91 99999 99999', sup_hash, 'super_admin', 'active', 'all', now, now))
        conn.commit()

    # Seed Default Admins
    default_admins = {
        "admin@lndigital.com": { "name": "LN Digital Admin", "phone": "+91 95555 55555", "email": "admin@lndigital.com", "password": "Admin@123", "branch": "jagatpura" },
        "admin_jagatpura": { "name": "Jagatpura Admin", "phone": "+91 98888 88888", "email": "jagatpura.admin@iiflhomeloans.com", "password": "IIFL@123", "branch": "jagatpura" },
        "admin_vaishali": { "name": "Vaishali Admin", "phone": "+91 97777 77777", "email": "vaishali.admin@iiflhomeloans.com", "password": "IIFL@123", "branch": "vaishali" }
    }
    for admin_id, admin in default_admins.items():
        cursor.execute("SELECT id FROM users WHERE id = ?", (admin_id,))
        if not cursor.fetchone():
            now = datetime.datetime.now().isoformat()
            admin_hash = hash_password(admin["password"])
            cursor.execute('''
                INSERT INTO users (id, full_name, email, phone, password_hash, role, status, branch, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (admin_id, admin["name"], admin["email"], admin["phone"], admin_hash, 'admin', 'active', admin["branch"], now, now))
            conn.commit()

    # Seed Default Employees
    default_employees = {
        "praveen": { "name": "Praveen Kumar Rav", "phone": "+91 78773 46116", "email": "praveen.rav@iiflhomeloans.com", "branch": "jagatpura" },
        "pramod": { "name": "Pramod Sharma", "phone": "+91 78508 51926", "email": "pramod.kumarsharma@iiflhomeloans.com", "branch": "jagatpura" },
        "dev": { "name": "Dev", "phone": "+91 9024720221", "email": "dev.charaya@iiflhomeloans.com", "branch": "vaishali" },
        "hemant": { "name": "Hemant Katara", "phone": "+91 89499 71494", "email": "hemant.katara@iiflhomeloans.com", "branch": "jagatpura" },
        "baljeet": { "name": "Baljeet Singh", "phone": "+91 89553 81502", "email": "baljeet.singh@iiflhomeloans.com", "branch": "vaishali" },
        "lucky": { "name": "Lucky Tank", "phone": "+91 9214619840", "email": "lucky.tank@iiflhomeloans.com", "branch": "jagatpura" },
        "adhiraj": { "name": "Adhiraj Panwar", "phone": "+91 94131 73003", "email": "adhirajsingh.panwar@iiflhomeloans.com", "branch": "vaishali" }
    }
    
    for emp_id, emp in default_employees.items():
        cursor.execute("SELECT id FROM users WHERE id = ?", (emp_id,))
        if not cursor.fetchone():
            now = datetime.datetime.now().isoformat()
            emp_hash = hash_password("IIFL@123")
            cursor.execute('''
                INSERT INTO users (id, full_name, email, phone, password_hash, role, status, branch, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (emp_id, emp["name"], emp["email"], emp["phone"], emp_hash, 'employee', 'active', emp["branch"], now, now))
            conn.commit()

    # Seed Default Projects
    cursor.execute("SELECT COUNT(*) FROM projects")
    if cursor.fetchone()[0] == 0:
        cursor.execute("INSERT INTO projects (name, description, status) VALUES (?, ?, ?)", ("Jagatpura Sales Drive", "Increase home loan penetration in Jagatpura", "active"))
        cursor.execute("INSERT INTO projects (name, description, status) VALUES (?, ?, ?)", ("Vaishali Builder Meet", "Connect with local builders in Vaishali", "active"))
        conn.commit()

    # Seed Default Tasks
    cursor.execute("SELECT COUNT(*) FROM tasks")
    if cursor.fetchone()[0] == 0:
        now = datetime.datetime.now().isoformat()
        cursor.execute("INSERT INTO tasks (title, description, assigned_to, assigned_by, status, created_at) VALUES (?, ?, ?, ?, ?, ?)", 
                       ("Contact Jagatpura Builders", "Reach out to top 5 builders in Jagatpura", "praveen", "admin_jagatpura", "pending", now))
        cursor.execute("INSERT INTO tasks (title, description, assigned_to, assigned_by, status, created_at) VALUES (?, ?, ?, ?, ?, ?)", 
                       ("Follow up on Vaishali Leads", "Call the pending home loan applicants", "dev", "admin_vaishali", "completed", now))
        conn.commit()
            
    conn.close()

def log_activity(user_id, action, module):
    conn = get_db_connection()
    cursor = conn.cursor()
    now = datetime.datetime.now().isoformat()
    cursor.execute('''
        INSERT INTO activity_logs (user_id, action, module, timestamp)
        VALUES (?, ?, ?, ?)
    ''', (user_id, action, module, now))
    conn.commit()
    conn.close()
