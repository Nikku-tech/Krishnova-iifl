import os
import time
import hashlib
import re

def hash_password(password, salt=None):
    if salt is None:
        salt = os.urandom(16)
    else:
        salt = bytes.fromhex(salt)
    key = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 100000)
    return salt.hex() + '$' + key.hex()

def verify_password(password, stored_hash):
    try:
        salt_hex, key_hex = stored_hash.split('$')
        salt = bytes.fromhex(salt_hex)
        key = bytes.fromhex(key_hex)
        new_key = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 100000)
        return new_key == key
    except Exception:
        return False

# In-memory rate limiting for login attempts
login_attempts = {}

def is_rate_limited(ip_address, max_attempts=5, window=60):
    now = time.time()
    if ip_address not in login_attempts:
        login_attempts[ip_address] = []
    
    # Filter out attempts outside the time window
    login_attempts[ip_address] = [t for t in login_attempts[ip_address] if now - t < window]
    
    if len(login_attempts[ip_address]) >= max_attempts:
        return True
        
    login_attempts[ip_address].append(now)
    return False

def sanitize_input(text):
    if not isinstance(text, str):
        return text
    # Strip HTML tags to prevent XSS
    return re.sub(r'<[^>]*>', '', text)
