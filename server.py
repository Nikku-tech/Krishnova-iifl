import os
from flask import Flask, send_from_directory
from config import Config
from database import init_db
from routes_auth import auth_bp
from routes_api import api_bp

app = Flask(__name__, static_folder='.')
app.config.from_object(Config)

# Register Blueprints
app.register_blueprint(auth_bp, url_prefix='/api/auth')
app.register_blueprint(api_bp, url_prefix='/api')

# --- STATIC ROUTING ---
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/script.js')
def serve_script():
    return send_from_directory('.', 'script.js')

@app.route('/style.css')
def serve_style():
    return send_from_directory('.', 'style.css')

@app.route('/logo.png')
def serve_logo():
    return send_from_directory('.', 'logo.png')

@app.route('/project.zip')
def serve_zip():
    return send_from_directory('.', 'project.zip', as_attachment=True)

@app.route('/uploads/<filename>')
def serve_upload(filename):
    return send_from_directory('uploads', filename)

# Initialize Database on startup
init_db()

if __name__ == '__main__':
    # Listen on all interfaces on port 8000
    app.run(host='0.0.0.0', port=8000, debug=True)
