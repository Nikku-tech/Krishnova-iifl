import os

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'iifl-secret-key-1298471928-secure-token'
    DB_FILE = 'database.db'
    RATE_LIMIT_LOGIN_MAX = 5
    RATE_LIMIT_LOGIN_WINDOW = 60 # seconds
