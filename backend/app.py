import hashlib
import os
import secrets
import smtplib
import ssl
import uuid
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from functools import wraps
from urllib.parse import urlencode

import bcrypt
import jwt
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from mysql.connector import IntegrityError
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from werkzeug.utils import secure_filename

from db import get_database_connection

load_dotenv()

app = Flask(__name__)
frontend_origins = [
    origin.strip().rstrip("/")
    for origin in os.getenv("FRONTEND_URL", "http://localhost:5173").split(",")
    if origin.strip()
]
CORS(app, origins=frontend_origins)
app.config["MAX_CONTENT_LENGTH"] = 500 * 1024 * 1024

configured_upload_root = os.getenv("UPLOAD_ROOT")
default_upload_root = os.path.join(os.path.dirname(__file__), "uploads")
UPLOAD_ROOT = os.path.abspath(configured_upload_root or default_upload_root)
THUMBNAIL_DIR = os.path.join(UPLOAD_ROOT, "thumbnails")
VIDEO_DIR = os.path.join(UPLOAD_ROOT, "videos")
CERTIFICATE_DIR = os.path.join(UPLOAD_ROOT, "certificates")
for directory in (THUMBNAIL_DIR, VIDEO_DIR, CERTIFICATE_DIR):
    try:
        os.makedirs(directory, exist_ok=True)
    except PermissionError:
        UPLOAD_ROOT = os.path.abspath(default_upload_root)
        THUMBNAIL_DIR = os.path.join(UPLOAD_ROOT, "thumbnails")
        VIDEO_DIR = os.path.join(UPLOAD_ROOT, "videos")
        CERTIFICATE_DIR = os.path.join(UPLOAD_ROOT, "certificates")
        for fallback_directory in (THUMBNAIL_DIR, VIDEO_DIR, CERTIFICATE_DIR):
            os.makedirs(fallback_directory, exist_ok=True)
        break

JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET or JWT_SECRET == "replace-with-a-long-random-secret":
    raise RuntimeError("Set a unique JWT_SECRET in backend/.env before starting Flask.")
JWT_EXPIRY_HOURS = 12
VIDEO_EXTENSIONS = {"mp4", "webm", "mov", "ogg"}
IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}
MAX_FILE_SIZE = 500 * 1024 * 1024


def db():
    return get_database_connection()


def fetch_all(sql, params=None):
    connection = db()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(sql, params or ())
        return cursor.fetchall()
    finally:
        cursor.close()
        connection.close()


def fetch_one(sql, params=None):
    connection = db()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(sql, params or ())
        return cursor.fetchone()
    finally:
        cursor.close()
        connection.close()


def execute(sql, params=None, last_id=False):
    connection = db()
    cursor = connection.cursor()
    try:
        cursor.execute(sql, params or ())
        result = cursor.lastrowid if last_id else cursor.rowcount
        connection.commit()
        return result
    except Exception:
        connection.rollback()
        raise
    finally:
        cursor.close()
        connection.close()


def create_token(user):
    payload = {
        "sub": str(user["id"]),
        "role": user["role"],
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def password_reset_smtp_settings():
    host = os.getenv("SMTP_HOST", "").strip()
    from_email = os.getenv("SMTP_FROM_EMAIL", "").strip()
    username = os.getenv("SMTP_USERNAME", "").strip()
    password = os.getenv("SMTP_PASSWORD", "")
    tls_value = os.getenv("SMTP_USE_TLS", "true").strip().lower()
    if not host or not from_email or bool(username) != bool(password):
        return None
    if tls_value not in {"true", "false", "1", "0", "yes", "no"}:
        return None
    try:
        port = int(os.getenv("SMTP_PORT", "587"))
    except ValueError:
        return None
    if not 1 <= port <= 65535:
        return None
    return {
        "host": host,
        "port": port,
        "from_email": from_email,
        "username": username,
        "password": password,
        "use_tls": tls_value in {"true", "1", "yes"},
    }


def send_password_reset_email(to_email, reset_url, settings):
    message = EmailMessage()
    message["Subject"] = "Reset your CourseHub password"
    message["From"] = settings["from_email"]
    message["To"] = to_email
    message.set_content(
        "We received a request to reset your CourseHub password.\n\n"
        f"Use this link within 30 minutes to choose a new password:\n{reset_url}\n\n"
        "If you did not request this, you can ignore this email."
    )
    with smtplib.SMTP(settings["host"], settings["port"], timeout=15) as server:
        server.ehlo()
        if settings["use_tls"]:
            server.starttls(context=ssl.create_default_context())
            server.ehlo()
        if settings["username"]:
            server.login(settings["username"], settings["password"])
        server.send_message(message)


def auth_required(roles=None, optional=False):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            authorization = request.headers.get("Authorization", "")
            if not authorization.startswith("Bearer "):
                if optional:
                    request.current_user = None
                    return func(*args, **kwargs)
                return jsonify({"error": "Authentication required"}), 401
            try:
                payload = jwt.decode(
                    authorization.split(" ", 1)[1],
                    JWT_SECRET,
                    algorithms=["HS256"],
                )
                user = fetch_one(
                    "SELECT id, name, email, role, is_active FROM users WHERE id=%s",
                    (payload["sub"],),
                )
                if not user or not user["is_active"]:
                    return jsonify({"error": "Account unavailable"}), 401
                if roles and user["role"] not in roles:
                    return jsonify({"error": "Permission denied"}), 403
                request.current_user = user
            except jwt.PyJWTError:
                return jsonify({"error": "Invalid or expired token"}), 401
            return func(*args, **kwargs)
        return wrapper
    return decorator


def allowed_file(file, allowed_extensions):
    return "." in file.filename and file.filename.rsplit(".", 1)[1].lower() in allowed_extensions


def valid_image_content(file):
    try:
        from PIL import Image

        file.stream.seek(0)
        with Image.open(file.stream) as image:
            image.verify()
        file.stream.seek(0)
        return True
    except Exception:
        file.stream.seek(0)
        return False


def valid_video_content(file):
    file.stream.seek(0)
    header = file.stream.read(32)
    file.stream.seek(0)
    extension = file.filename.rsplit(".", 1)[1].lower()
    if extension == "webm":
        return header.startswith(b"\x1a\x45\xdf\xa3")
    if extension == "ogg":
        return header.startswith(b"OggS")
    if extension in ("mp4", "mov"):
        return b"ftyp" in header
    return False


def valid_upload_mime(file, extensions):
    extension = file.filename.rsplit(".", 1)[1].lower()
    allowed = {
        "jpg": {"image/jpeg"},
        "jpeg": {"image/jpeg"},
        "png": {"image/png"},
        "webp": {"image/webp"},
        "mp4": {"video/mp4"},
        "mov": {"video/quicktime"},
        "webm": {"video/webm"},
        "ogg": {"video/ogg", "audio/ogg"},
    }
    return extension in extensions and file.mimetype in allowed.get(extension, set())


def can_manage_course(course, user):
    return user["role"] == "admin" or course["tutor_id"] == user["id"]


def resolve_domain_id(data, category, existing_domain_id=None):
    domain_id = data.get("domain_id")
    domain_name = (data.get("domain") or "").strip()
    if domain_id not in (None, ""):
        try:
            domain_id = int(domain_id)
        except (TypeError, ValueError):
            return None
        domain = fetch_one("SELECT id FROM domains WHERE id=%s", (domain_id,))
    elif domain_name:
        domain = fetch_one("SELECT id FROM domains WHERE name=%s", (domain_name,))
    elif existing_domain_id is not None:
        return existing_domain_id
    else:
        category_domains = {
            "development": "Technology",
            "web development": "Technology",
            "programming": "Technology",
            "business": "Commerce",
            "commerce": "Commerce",
            "design": "Design",
            "marketing": "Marketing",
        }
        domain_name = category_domains.get(category.casefold(), "General")
        domain = fetch_one("SELECT id FROM domains WHERE name=%s", (domain_name,))
    return domain["id"] if domain else None


def course_for_module(module_id):
    return fetch_one("""
        SELECT c.*
        FROM course_modules cm
        JOIN courses c ON c.id=cm.course_id
        WHERE cm.id=%s
    """, (module_id,))


def course_for_lesson(lesson_id):
    return fetch_one("""
        SELECT c.*
        FROM lessons l
        JOIN course_modules cm ON cm.id=l.module_id
        JOIN courses c ON c.id=cm.course_id
        WHERE l.id=%s
    """, (lesson_id,))


@app.get("/api/health")
def health():
    return jsonify({"status": "healthy", "service": "video-course-hosting-api"})


@app.get("/api/database/health")
def database_health():
    try:
        connection = db()
        cursor = connection.cursor()
        cursor.execute("SELECT 1")
        cursor.fetchone()
        cursor.close()
        connection.close()
        return jsonify({"status": "connected", "database": os.getenv("DB_NAME")})
    except Exception as error:
        app.logger.error("MySQL connection failed: %s", error)
        return jsonify({"status": "disconnected", "error": "Database connection failed"}), 503


@app.get("/api/stats")
def platform_stats():
    return jsonify({
        "students": fetch_one("SELECT COUNT(*) AS count FROM users WHERE role='student'")["count"],
        "courses": fetch_one("SELECT COUNT(*) AS count FROM courses WHERE status='approved'")["count"],
        "average_rating": fetch_one("SELECT COALESCE(AVG(rating),0) AS rating FROM reviews")["rating"],
    })


@app.get("/api/categories")
def list_categories():
    return jsonify(fetch_all("SELECT id,name FROM categories ORDER BY name"))


@app.get("/api/domains")
def list_domains():
    return jsonify(fetch_all("""
        SELECT d.id,d.name,d.sort_order,
               (SELECT COUNT(*) FROM courses c WHERE c.domain_id=d.id AND c.status='approved') AS course_count
        FROM domains d ORDER BY d.sort_order,d.name
    """))


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    role = data.get("role", "student")
    if role not in ("student", "tutor"):
        return jsonify({"error": "Role must be student or tutor"}), 400
    if len(name) < 2 or "@" not in email or len(password) < 8 or len(password.encode("utf-8")) > 72:
        return jsonify({"error": "Enter a valid name, email, and password of at least 8 characters"}), 400
    if fetch_one("SELECT id FROM users WHERE email=%s", (email,)):
        return jsonify({"error": "An account with this email already exists"}), 409
    password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    try:
        user_id = execute(
            "INSERT INTO users (name,email,password_hash,role) VALUES (%s,%s,%s,%s)",
            (name, email, password_hash, role),
            last_id=True,
        )
    except IntegrityError:
        return jsonify({"error": "An account with this email already exists"}), 409
    user = fetch_one("SELECT id,name,email,role FROM users WHERE id=%s", (user_id,))
    return jsonify({"token": create_token(user), "user": user}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    if not email or not password or len(password.encode("utf-8")) > 72:
        return jsonify({"error": "Invalid email or password"}), 401
    user = fetch_one("SELECT * FROM users WHERE email=%s", (email,))
    if not user or not bcrypt.checkpw(password.encode("utf-8"), user["password_hash"].encode("utf-8")):
        return jsonify({"error": "Invalid email or password"}), 401
    if not user["is_active"]:
        return jsonify({"error": "This account has been deactivated"}), 403
    public_user = {key: user[key] for key in ("id", "name", "email", "role")}
    return jsonify({"token": create_token(public_user), "user": public_user})


@app.post("/api/auth/forgot-password")
def forgot_password():
    data = request.get_json(silent=True) or {}
    email = data.get("email")
    if not isinstance(email, str):
        return jsonify({"error": "Enter a valid email address"}), 400
    email = email.strip().lower()
    if not email or len(email) > 255 or "@" not in email or any(character.isspace() for character in email):
        return jsonify({"error": "Enter a valid email address"}), 400

    smtp_settings = password_reset_smtp_settings()
    if not smtp_settings:
        return jsonify({"error": "Password reset email is not configured. Please contact the site administrator."}), 503

    generic_message = "If an account exists for that email address, a password reset link will be sent shortly."
    user = fetch_one(
        "SELECT id,email FROM users WHERE email=%s AND is_active=TRUE",
        (email,),
    )
    if not user:
        return jsonify({"message": generic_message}), 202

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    existing_request = fetch_one(
        "SELECT requested_at FROM password_reset_tokens WHERE user_id=%s",
        (user["id"],),
    )
    if existing_request and existing_request["requested_at"] > now - timedelta(seconds=60):
        return jsonify({"message": generic_message}), 202

    reset_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(reset_token.encode("utf-8")).hexdigest()
    expires_at = now + timedelta(minutes=30)
    execute(
        """
        INSERT INTO password_reset_tokens (user_id,token_hash,expires_at,requested_at)
        VALUES (%s,%s,%s,%s)
        ON DUPLICATE KEY UPDATE
            token_hash=VALUES(token_hash),
            expires_at=VALUES(expires_at),
            requested_at=VALUES(requested_at)
        """,
        (user["id"], token_hash, expires_at, now),
    )
    reset_url = f"{frontend_origins[0]}/reset-password?{urlencode({'token': reset_token})}"
    try:
        send_password_reset_email(user["email"], reset_url, smtp_settings)
    except Exception:
        app.logger.exception("Password reset email delivery failed")
        try:
            execute("DELETE FROM password_reset_tokens WHERE token_hash=%s", (token_hash,))
        except Exception:
            app.logger.exception("Could not remove an undelivered password reset token")
    return jsonify({"message": generic_message}), 202


@app.post("/api/auth/reset-password")
def reset_password():
    data = request.get_json(silent=True) or {}
    reset_token = data.get("token")
    password = data.get("password")
    if not isinstance(reset_token, str) or not reset_token or len(reset_token) > 256 or not isinstance(password, str):
        return jsonify({"error": "Invalid or expired reset link"}), 400
    if len(password) < 8 or len(password.encode("utf-8")) > 72:
        return jsonify({"error": "Password must be at least 8 characters and no more than 72 bytes"}), 400

    token_hash = hashlib.sha256(reset_token.encode("utf-8")).hexdigest()
    password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    connection = db()
    cursor = connection.cursor(dictionary=True)
    try:
        connection.start_transaction()
        cursor.execute(
            """
            SELECT prt.user_id
            FROM password_reset_tokens prt
            JOIN users ON users.id=prt.user_id
            WHERE prt.token_hash=%s
              AND prt.expires_at > UTC_TIMESTAMP()
              AND users.is_active=TRUE
            FOR UPDATE
            """,
            (token_hash,),
        )
        reset_record = cursor.fetchone()
        if not reset_record:
            connection.rollback()
            return jsonify({"error": "This reset link is invalid or has expired"}), 400
        cursor.execute(
            "UPDATE users SET password_hash=%s WHERE id=%s",
            (password_hash, reset_record["user_id"]),
        )
        cursor.execute(
            "DELETE FROM password_reset_tokens WHERE token_hash=%s",
            (token_hash,),
        )
        connection.commit()
        return jsonify({"message": "Password updated successfully"})
    except Exception:
        connection.rollback()
        raise
    finally:
        cursor.close()
        connection.close()


@app.get("/api/auth/me")
@auth_required()
def me():
    return jsonify(request.current_user)


@app.get("/api/profile")
@auth_required()
def get_profile():
    user = fetch_one(
        "SELECT id,name,email,role,created_at FROM users WHERE id=%s",
        (request.current_user["id"],),
    )
    return jsonify(user)


@app.put("/api/profile")
@auth_required()
def update_profile():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    if len(name) < 2 or "@" not in email or any(character.isspace() for character in email):
        return jsonify({"error": "Enter a valid name and email address"}), 400
    password = data.get("new_password") or ""
    connection = db()
    cursor = connection.cursor(dictionary=True)
    cursor.execute("SELECT password_hash FROM users WHERE id=%s", (request.current_user["id"],))
    user = cursor.fetchone()
    cursor.close()
    connection.close()
    params = [name, email]
    sql = "UPDATE users SET name=%s,email=%s"
    if password:
        current_password = data.get("current_password") or ""
        if len(password) < 8 or len(password.encode("utf-8")) > 72:
            return jsonify({"error": "New password must be 8 to 72 bytes"}), 400
        if len(current_password.encode("utf-8")) > 72:
            return jsonify({"error": "Current password is incorrect"}), 400
        if not current_password or not bcrypt.checkpw(
            current_password.encode("utf-8"),
            user["password_hash"].encode("utf-8"),
        ):
            return jsonify({"error": "Current password is incorrect"}), 400
        sql += ",password_hash=%s"
        params.append(bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8"))
    sql += " WHERE id=%s"
    params.append(request.current_user["id"])
    try:
        execute(sql, tuple(params))
    except IntegrityError:
        return jsonify({"error": "That email address is already in use"}), 409
    updated = fetch_one(
        "SELECT id,name,email,role,created_at FROM users WHERE id=%s",
        (request.current_user["id"],),
    )
    return jsonify(updated)


@app.post("/api/contact")
def submit_contact_message():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    subject = (data.get("subject") or "").strip()
    message = (data.get("message") or "").strip()
    if (
        len(name) < 2
        or "@" not in email
        or len(subject) < 3
        or len(message) < 10
        or len(name) > 120
        or len(email) > 255
        or len(subject) > 180
    ):
        return jsonify({"error": "Complete each field with valid information"}), 400
    message_id = execute(
        "INSERT INTO contact_messages (name,email,subject,message) VALUES (%s,%s,%s,%s)",
        (name, email, subject, message),
        last_id=True,
    )
    return jsonify({"id": message_id, "message": "Your message has been received"}), 201


@app.get("/api/admin/contact-messages")
@auth_required("admin")
def admin_contact_messages():
    return jsonify(fetch_all(
        "SELECT id,name,email,subject,message,created_at FROM contact_messages ORDER BY created_at DESC"
    ))


@app.get("/api/courses")
def courses():
    search = (request.args.get("search") or "").strip()
    category = (request.args.get("category") or "").strip()
    domain = (request.args.get("domain") or "").strip()
    domain_id = request.args.get("domain_id")
    status = request.args.get("status")
    sql = """
        SELECT c.id,c.title,c.description,c.thumbnail_url,cat.name AS category,
               c.domain_id,d.name AS domain,c.price,
               c.course_level AS level,c.status,c.created_at,
               COALESCE(NULLIF(c.display_instructor,''),u.name) AS tutor_name,
               (SELECT COUNT(*) FROM enrollments e WHERE e.course_id=c.id) AS students
        FROM courses c JOIN users u ON u.id=c.tutor_id
        JOIN categories cat ON cat.id=c.category_id
        JOIN domains d ON d.id=c.domain_id
        WHERE 1=1
    """
    params = []
    if status:
        sql += " AND c.status=%s"
        params.append(status)
    else:
        sql += " AND c.status='approved'"
    if search:
        pattern = f"%{search}%"
        sql += """ AND (
            c.title LIKE %s OR c.description LIKE %s
            OR COALESCE(NULLIF(c.display_instructor,''),u.name) LIKE %s
            OR cat.name LIKE %s OR d.name LIKE %s
        )"""
        params.extend((pattern, pattern, pattern, pattern, pattern))
    if category:
        sql += " AND cat.name=%s"
        params.append(category)
    if domain_id:
        try:
            domain_id = int(domain_id)
        except (TypeError, ValueError):
            return jsonify({"error": "Domain ID must be a whole number"}), 400
        sql += " AND c.domain_id=%s"
        params.append(domain_id)
    if domain:
        sql += " AND d.name=%s"
        params.append(domain)
    sql += " ORDER BY c.created_at DESC"
    return jsonify(fetch_all(sql, tuple(params)))


@app.get("/api/courses/<int:course_id>")
@auth_required(optional=True)
def course_detail(course_id):
    course = fetch_one("""
        SELECT c.*,d.name AS domain,COALESCE(NULLIF(c.display_instructor,''),u.name) AS tutor_name
        FROM courses c JOIN users u ON u.id=c.tutor_id
        JOIN domains d ON d.id=c.domain_id
        WHERE c.id=%s
    """, (course_id,))
    if not course:
        return jsonify({"error": "Course not found"}), 404
    user = request.current_user
    if course["status"] != "approved" and not (
        user and (user["role"] == "admin" or course["tutor_id"] == user["id"])
    ):
        return jsonify({"error": "Course not found"}), 404
    modules = fetch_all("""
        SELECT * FROM course_modules WHERE course_id=%s ORDER BY sort_order, id
    """, (course_id,))
    user = request.current_user
    enrollment = fetch_one(
        "SELECT id FROM enrollments WHERE student_id=%s AND course_id=%s",
        (user["id"], course_id),
    ) if user and user["role"] == "student" else None
    is_enrolled = bool(enrollment)
    can_watch = bool(user and (
        user["role"] == "admin"
        or (user["role"] == "tutor" and course["tutor_id"] == user["id"])
        or is_enrolled
    ))
    for module in modules:
        module["lessons"] = fetch_all("""
            SELECT id,title,
                   CASE WHEN %s=1 THEN video_url ELSE NULL END AS video_url,
                   duration_seconds,sort_order
            FROM lessons WHERE module_id=%s ORDER BY sort_order,id
        """, (int(can_watch), module["id"]))
    reviews = fetch_all("""
        SELECT r.rating,r.comment,r.created_at,u.name AS student_name
        FROM reviews r JOIN users u ON u.id=r.student_id
        WHERE r.course_id=%s ORDER BY r.created_at DESC
    """, (course_id,))
    course["modules"] = modules
    course["reviews"] = reviews
    course["is_enrolled"] = is_enrolled
    if not can_watch:
        course["youtube_video_id"] = None
    return jsonify(course)


@app.post("/api/courses")
@auth_required(("tutor", "admin"))
def create_course():
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    description = (data.get("description") or "").strip()
    category = (data.get("category") or "Development").strip()
    category_row = fetch_one("SELECT id FROM categories WHERE name=%s", (category,))
    if not category_row:
        return jsonify({"error": "Choose a valid course category"}), 400
    domain_id = resolve_domain_id(data, category)
    if not domain_id:
        return jsonify({"error": "Choose a valid course domain"}), 400
    try:
        price = float(data.get("price", 0))
    except (TypeError, ValueError):
        return jsonify({"error": "Course price must be a non-negative number"}), 400
    if price < 0 or price > 99999999.99:
        return jsonify({"error": "Course price is outside the supported range"}), 400
    if len(title) < 3 or len(title) > 180 or len(description) > 60000:
        return jsonify({"error": "Enter a course title (3-180 characters) and a description under 60,000 characters"}), 400
    course_id = execute(
        "INSERT INTO courses (tutor_id,title,description,category,category_id,domain_id,price,status) VALUES (%s,%s,%s,%s,%s,%s,%s,'pending')",
        (request.current_user["id"], title, description, category, category_row["id"], domain_id, price),
        last_id=True,
    )
    return jsonify({"id": course_id, "title": title, "domain_id": domain_id, "status": "pending"}), 201


@app.put("/api/courses/<int:course_id>")
@auth_required(("tutor", "admin"))
def update_course(course_id):
    course = fetch_one("SELECT * FROM courses WHERE id=%s", (course_id,))
    if not course:
        return jsonify({"error": "Course not found"}), 404
    if request.current_user["role"] != "admin" and course["tutor_id"] != request.current_user["id"]:
        return jsonify({"error": "Permission denied"}), 403
    data = request.get_json(silent=True) or {}
    category = (data.get("category") or course["category"]).strip()
    category_row = fetch_one("SELECT id FROM categories WHERE name=%s", (category,))
    if not category_row:
        return jsonify({"error": "Choose a valid course category"}), 400
    domain_id = resolve_domain_id(data, category, course["domain_id"])
    if not domain_id:
        return jsonify({"error": "Choose a valid course domain"}), 400
    try:
        price = float(data.get("price", course["price"]))
    except (TypeError, ValueError):
        return jsonify({"error": "Course price must be a non-negative number"}), 400
    if price < 0 or price > 99999999.99:
        return jsonify({"error": "Course price is outside the supported range"}), 400
    execute(
        "UPDATE courses SET title=%s,description=%s,category=%s,category_id=%s,domain_id=%s,price=%s,updated_at=CURRENT_TIMESTAMP WHERE id=%s",
        ((data.get("title") or course["title"]).strip(), data.get("description", course["description"]), category, category_row["id"], domain_id, price, course_id),
    )
    return jsonify({"message": "Course updated"})


@app.delete("/api/courses/<int:course_id>")
@auth_required(("tutor", "admin"))
def delete_course(course_id):
    course = fetch_one("SELECT * FROM courses WHERE id=%s", (course_id,))
    if not course:
        return jsonify({"error": "Course not found"}), 404
    if request.current_user["role"] != "admin" and course["tutor_id"] != request.current_user["id"]:
        return jsonify({"error": "Permission denied"}), 403
    execute("DELETE FROM courses WHERE id=%s", (course_id,))
    return jsonify({"message": "Course deleted"})


@app.post("/api/courses/<int:course_id>/thumbnail")
@auth_required(("tutor", "admin"))
def upload_thumbnail(course_id):
    course = fetch_one("SELECT * FROM courses WHERE id=%s", (course_id,))
    if not course:
        return jsonify({"error": "Course not found"}), 404
    if not can_manage_course(course, request.current_user):
        return jsonify({"error": "Permission denied"}), 403
    file = request.files.get("file")
    if not file or not allowed_file(file, IMAGE_EXTENSIONS) or not valid_upload_mime(file, IMAGE_EXTENSIONS):
        return jsonify({"error": "Upload a JPG, PNG, or WebP image"}), 400
    file.stream.seek(0, os.SEEK_END)
    size = file.stream.tell()
    file.stream.seek(0)
    if size > MAX_FILE_SIZE:
        return jsonify({"error": "Thumbnail exceeds the 500 MB upload limit"}), 413
    if not valid_image_content(file):
        return jsonify({"error": "The uploaded image is invalid"}), 400
    filename = f"{uuid.uuid4().hex}_{secure_filename(file.filename)}"
    file.save(os.path.join(THUMBNAIL_DIR, filename))
    url = f"/api/uploads/thumbnails/{filename}"
    execute("UPDATE courses SET thumbnail_url=%s WHERE id=%s", (url, course_id))
    return jsonify({"thumbnail_url": url}), 201


@app.post("/api/courses/<int:course_id>/modules")
@auth_required(("tutor", "admin"))
def create_module(course_id):
    course = fetch_one("SELECT * FROM courses WHERE id=%s", (course_id,))
    if not course:
        return jsonify({"error": "Course not found"}), 404
    if not can_manage_course(course, request.current_user):
        return jsonify({"error": "Permission denied"}), 403
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    if len(title) < 2 or len(title) > 180:
        return jsonify({"error": "Module title is required"}), 400
    module_id = execute(
        "INSERT INTO course_modules (course_id,title,sort_order) VALUES (%s,%s,%s)",
        (course_id, title, int(data.get("sort_order", 0))),
        last_id=True,
    )
    return jsonify({"id": module_id, "title": title}), 201


@app.delete("/api/modules/<int:module_id>")
@auth_required(("tutor", "admin"))
def delete_module(module_id):
    course = course_for_module(module_id)
    if not course:
        return jsonify({"error": "Module not found"}), 404
    if not can_manage_course(course, request.current_user):
        return jsonify({"error": "Permission denied"}), 403
    execute("DELETE FROM course_modules WHERE id=%s", (module_id,))
    return jsonify({"message": "Module deleted"})


@app.post("/api/modules/<int:module_id>/lessons")
@auth_required(("tutor", "admin"))
def create_lesson(module_id):
    course = course_for_module(module_id)
    if not course:
        return jsonify({"error": "Module not found"}), 404
    if not can_manage_course(course, request.current_user):
        return jsonify({"error": "Permission denied"}), 403
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    if len(title) < 2 or len(title) > 180:
        return jsonify({"error": "Lesson title is required"}), 400
    lesson_id = execute(
        "INSERT INTO lessons (module_id,title,sort_order) VALUES (%s,%s,%s)",
        (module_id, title, int(data.get("sort_order", 0))),
        last_id=True,
    )
    return jsonify({"id": lesson_id, "title": title}), 201


@app.put("/api/lessons/<int:lesson_id>")
@auth_required(("tutor", "admin"))
def update_lesson(lesson_id):
    course = course_for_lesson(lesson_id)
    if not course:
        return jsonify({"error": "Lesson not found"}), 404
    if not can_manage_course(course, request.current_user):
        return jsonify({"error": "Permission denied"}), 403
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    if len(title) < 2 or len(title) > 180:
        return jsonify({"error": "Lesson title must be 2 to 180 characters"}), 400
    execute("UPDATE lessons SET title=%s WHERE id=%s", (title, lesson_id))
    return jsonify({"id": lesson_id, "title": title})


@app.post("/api/lessons/<int:lesson_id>/video")
@auth_required(("tutor", "admin"))
def upload_video(lesson_id):
    course = course_for_lesson(lesson_id)
    if not course:
        return jsonify({"error": "Lesson not found"}), 404
    if not can_manage_course(course, request.current_user):
        return jsonify({"error": "Permission denied"}), 403
    file = request.files.get("file")
    if not file or not allowed_file(file, VIDEO_EXTENSIONS) or not valid_upload_mime(file, VIDEO_EXTENSIONS):
        return jsonify({"error": "Upload an MP4, WebM, MOV, or OGG video"}), 400
    file.stream.seek(0, os.SEEK_END)
    size = file.stream.tell()
    file.stream.seek(0)
    if size > MAX_FILE_SIZE:
        return jsonify({"error": "Video exceeds the 500 MB upload limit"}), 413
    if not valid_video_content(file):
        return jsonify({"error": "The uploaded video content is invalid"}), 400
    filename = f"{uuid.uuid4().hex}_{secure_filename(file.filename)}"
    file.save(os.path.join(VIDEO_DIR, filename))
    url = f"/api/uploads/videos/{filename}"
    execute("UPDATE lessons SET video_url=%s WHERE id=%s", (url, lesson_id))
    return jsonify({"video_url": url}), 201


@app.delete("/api/lessons/<int:lesson_id>")
@auth_required(("tutor", "admin"))
def delete_lesson(lesson_id):
    course = course_for_lesson(lesson_id)
    if not course:
        return jsonify({"error": "Lesson not found"}), 404
    if not can_manage_course(course, request.current_user):
        return jsonify({"error": "Permission denied"}), 403
    execute("DELETE FROM lessons WHERE id=%s", (lesson_id,))
    return jsonify({"message": "Lesson deleted"})


@app.get("/api/uploads/<path:filename>")
def uploaded_file(filename):
    return send_from_directory(UPLOAD_ROOT, filename)


@app.post("/api/courses/<int:course_id>/enroll")
@auth_required(("student", "admin"))
def enroll(course_id):
    course = fetch_one("SELECT id,status FROM courses WHERE id=%s", (course_id,))
    if not course:
        return jsonify({"error": "Course not found"}), 404
    if course["status"] != "approved":
        return jsonify({"error": "This course is not available for enrollment"}), 400
    student_id = request.current_user["id"]
    existing = fetch_one(
        "SELECT id FROM enrollments WHERE student_id=%s AND course_id=%s",
        (student_id, course_id),
    )
    if existing:
        return jsonify({"message": "Already enrolled", "enrollment_id": existing["id"]}), 200
    enrollment_id = execute(
        "INSERT INTO enrollments (student_id,course_id) VALUES (%s,%s)",
        (student_id, course_id),
        last_id=True,
    )
    return jsonify({"message": "Enrollment successful", "enrollment_id": enrollment_id}), 201


@app.get("/api/my-courses")
@auth_required(("student", "admin"))
def my_courses():
    rows = fetch_all("""
        SELECT c.id,c.title,c.description,c.thumbnail_url,c.category,c.domain_id,d.name AS domain,c.course_level AS level,
               e.id AS enrollment_id,COALESCE(NULLIF(c.display_instructor,''),u.name) AS tutor_name,
               (SELECT COUNT(*) FROM course_modules cm JOIN lessons l ON l.module_id=cm.id WHERE cm.course_id=c.id) AS total_lessons,
               (SELECT COUNT(*) FROM lesson_progress lp JOIN lessons l ON l.id=lp.lesson_id JOIN course_modules cm ON cm.id=l.module_id
                WHERE lp.enrollment_id=e.id AND lp.is_completed=1 AND cm.course_id=c.id) AS completed_lessons
        FROM enrollments e
        JOIN courses c ON c.id=e.course_id
        JOIN users u ON u.id=c.tutor_id
        JOIN domains d ON d.id=c.domain_id
        WHERE e.student_id=%s ORDER BY e.enrolled_at DESC
    """, (request.current_user["id"],))
    for row in rows:
        row["progress"] = round((row["completed_lessons"] / row["total_lessons"] * 100) if row["total_lessons"] else 0)
    return jsonify(rows)


@app.get("/api/courses/<int:course_id>/progress")
@auth_required(("student", "admin"))
def course_progress(course_id):
    enrollment = fetch_one(
        "SELECT id FROM enrollments WHERE student_id=%s AND course_id=%s",
        (request.current_user["id"], course_id),
    )
    if not enrollment:
        return jsonify({"error": "You are not enrolled in this course"}), 403
    lessons = fetch_all("""
        SELECT l.id,l.title,cm.title AS module_title,l.video_url,
               COALESCE(lp.last_position_seconds,0) AS last_position_seconds,
               COALESCE(lp.is_completed,0) AS is_completed
        FROM course_modules cm
        JOIN lessons l ON l.module_id=cm.id
        LEFT JOIN lesson_progress lp ON lp.lesson_id=l.id AND lp.enrollment_id=%s
        WHERE cm.course_id=%s ORDER BY cm.sort_order,l.sort_order,l.id
    """, (enrollment["id"], course_id))
    total = len(lessons)
    completed = sum(bool(lesson["is_completed"]) for lesson in lessons)
    progress = round(completed / total * 100) if total else 0
    return jsonify({"enrollment_id": enrollment["id"], "progress": progress, "lessons": lessons})


@app.put("/api/lessons/<int:lesson_id>/progress")
@auth_required(("student", "admin"))
def update_progress(lesson_id):
    data = request.get_json(silent=True) or {}
    lesson = fetch_one("""
        SELECT cm.course_id,l.id,l.duration_seconds FROM lessons l
        JOIN course_modules cm ON cm.id=l.module_id WHERE l.id=%s
    """, (lesson_id,))
    if not lesson:
        return jsonify({"error": "Lesson not found"}), 404
    enrollment = fetch_one(
        "SELECT id FROM enrollments WHERE student_id=%s AND course_id=%s",
        (request.current_user["id"], lesson["course_id"]),
    )
    if not enrollment:
        return jsonify({"error": "You are not enrolled in this course"}), 403
    try:
        position = int(data.get("position", 0))
    except (TypeError, ValueError):
        return jsonify({"error": "Playback position must be a non-negative whole number"}), 400
    if position < 0 or (lesson["duration_seconds"] and position > lesson["duration_seconds"]):
        return jsonify({"error": "Playback position is outside this lesson"}), 400
    completed = data.get("completed", False)
    if not isinstance(completed, bool):
        return jsonify({"error": "Lesson completion must be true or false"}), 400
    execute("""
        INSERT INTO lesson_progress (enrollment_id,lesson_id,last_position_seconds,is_completed,completed_at)
        VALUES (%s,%s,%s,%s,%s)
        ON DUPLICATE KEY UPDATE last_position_seconds=VALUES(last_position_seconds),
                                is_completed=VALUES(is_completed),
                                completed_at=IF(VALUES(is_completed)=1,CURRENT_TIMESTAMP,completed_at)
    """, (enrollment["id"], lesson_id, position, completed, datetime.now(timezone.utc) if completed else None))

    progress = course_progress_payload(enrollment["id"], lesson["course_id"])
    if progress["progress"] == 100 and progress["total_lessons"] > 0:
        generate_certificate(enrollment["id"])
    return jsonify(progress)


def course_progress_payload(enrollment_id, course_id):
    rows = fetch_all("""
        SELECT l.id,COALESCE(lp.is_completed,0) AS is_completed
        FROM course_modules cm JOIN lessons l ON l.module_id=cm.id
        LEFT JOIN lesson_progress lp ON lp.lesson_id=l.id AND lp.enrollment_id=%s
        WHERE cm.course_id=%s
    """, (enrollment_id, course_id))
    total = len(rows)
    completed = sum(bool(row["is_completed"]) for row in rows)
    return {"progress": round(completed / total * 100) if total else 0, "total_lessons": total}


def generate_certificate(enrollment_id):
    existing = fetch_one("SELECT id FROM certificates WHERE enrollment_id=%s", (enrollment_id,))
    if existing:
        return existing["id"]
    enrollment = fetch_one("""
        SELECT e.id,u.name,c.title,t.name AS tutor_name
        FROM enrollments e JOIN users u ON u.id=e.student_id
        JOIN courses c ON c.id=e.course_id
        JOIN users t ON t.id=c.tutor_id
        WHERE e.id=%s
    """, (enrollment_id,))
    code = uuid.uuid4().hex.upper()
    filename = f"certificate_{code}.pdf"
    path = os.path.join(CERTIFICATE_DIR, filename)
    pdf = canvas.Canvas(path, pagesize=letter)
    pdf.setFillColorRGB(0.06, 0.12, 0.22)
    pdf.rect(0, 0, 612, 792, fill=1, stroke=0)
    pdf.setFillColorRGB(1, 1, 1)
    pdf.setFont("Helvetica-Bold", 24)
    pdf.drawCentredString(306, 650, "CERTIFICATE OF COMPLETION")
    pdf.setFont("Helvetica", 14)
    pdf.drawCentredString(306, 570, "This certificate is awarded to")
    pdf.setFont("Helvetica-Bold", 30)
    pdf.drawCentredString(306, 510, enrollment["name"])
    pdf.setFont("Helvetica", 14)
    pdf.drawCentredString(306, 440, "for successfully completing")
    pdf.setFont("Helvetica-Bold", 22)
    pdf.drawCentredString(306, 390, enrollment["title"])
    pdf.setFont("Helvetica", 12)
    pdf.drawCentredString(306, 280, f"Completed on {datetime.now().strftime('%B %d, %Y')}")
    pdf.drawCentredString(306, 250, f"Instructor: {enrollment['tutor_name']}  |  CourseHub")
    pdf.drawCentredString(306, 220, f"Certificate ID: {code}")
    pdf.save()
    url = f"/api/uploads/certificates/{filename}"
    return execute(
        "INSERT INTO certificates (enrollment_id,certificate_code,pdf_url) VALUES (%s,%s,%s)",
        (enrollment_id, code, url),
        last_id=True,
    )


@app.get("/api/certificates")
@auth_required(("student", "admin"))
def certificates():
    rows = fetch_all("""
        SELECT cert.id,cert.certificate_code,cert.pdf_url,cert.issued_at,
               c.title AS course_name,u.name AS student_name
        FROM certificates cert
        JOIN enrollments e ON e.id=cert.enrollment_id
        JOIN courses c ON c.id=e.course_id JOIN users u ON u.id=e.student_id
        WHERE e.student_id=%s ORDER BY cert.issued_at DESC
    """, (request.current_user["id"],))
    return jsonify(rows)


@app.get("/api/tutor/courses")
@auth_required(("tutor", "admin"))
def tutor_courses():
    return jsonify(fetch_all("""
        SELECT c.*,d.name AS domain,
               (SELECT COUNT(*) FROM enrollments e WHERE e.course_id=c.id) AS students,
               COALESCE((SELECT AVG(r.rating) FROM reviews r WHERE r.course_id=c.id),0) AS average_rating,
               (SELECT COUNT(*) FROM reviews r WHERE r.course_id=c.id) AS review_count
        FROM courses c JOIN domains d ON d.id=c.domain_id
        WHERE c.tutor_id=%s ORDER BY c.created_at DESC
    """, (request.current_user["id"],)))


@app.get("/api/tutor/courses/<int:course_id>/students")
@auth_required(("tutor", "admin"))
def tutor_students(course_id):
    course = fetch_one("SELECT * FROM courses WHERE id=%s", (course_id,))
    if not course:
        return jsonify({"error": "Course not found"}), 404
    if request.current_user["role"] != "admin" and course["tutor_id"] != request.current_user["id"]:
        return jsonify({"error": "Permission denied"}), 403
    return jsonify(fetch_all("""
        SELECT u.id,u.name,u.email,e.enrolled_at,
               (SELECT COUNT(*) FROM lesson_progress lp WHERE lp.enrollment_id=e.id AND lp.is_completed=1) AS completed,
               (SELECT COUNT(*) FROM lessons l JOIN course_modules cm ON cm.id=l.module_id WHERE cm.course_id=e.course_id) AS total_lessons
        FROM enrollments e JOIN users u ON u.id=e.student_id
        WHERE e.course_id=%s ORDER BY e.enrolled_at DESC
    """, (course_id,)))


@app.get("/api/admin/stats")
@auth_required("admin")
def admin_stats():
    def count(sql):
        return fetch_one(sql)["count"]
    return jsonify({
        "students": count("SELECT COUNT(*) AS count FROM users WHERE role='student'"),
        "tutors": count("SELECT COUNT(*) AS count FROM users WHERE role='tutor'"),
        "courses": count("SELECT COUNT(*) AS count FROM courses"),
        "enrollments": count("SELECT COUNT(*) AS count FROM enrollments"),
    })


@app.get("/api/admin/users")
@auth_required("admin")
def admin_users():
    return jsonify(fetch_all("SELECT id,name,email,role,is_active,created_at FROM users ORDER BY created_at DESC"))


@app.patch("/api/admin/users/<int:user_id>")
@auth_required("admin")
def admin_update_user(user_id):
    data = request.get_json(silent=True) or {}
    if user_id == request.current_user["id"] and not bool(data.get("is_active", True)):
        return jsonify({"error": "You cannot deactivate your own administrator account"}), 400
    if not fetch_one("SELECT id FROM users WHERE id=%s", (user_id,)):
        return jsonify({"error": "User not found"}), 404
    execute("UPDATE users SET is_active=%s WHERE id=%s", (bool(data.get("is_active", True)), user_id))
    return jsonify({"message": "User updated"})


@app.get("/api/admin/courses")
@auth_required("admin")
def admin_courses():
    return jsonify(fetch_all("""
        SELECT c.*,d.name AS domain,COALESCE(NULLIF(c.display_instructor,''),u.name) AS tutor_name FROM courses c
        JOIN users u ON u.id=c.tutor_id JOIN domains d ON d.id=c.domain_id
        ORDER BY c.created_at DESC
    """))


@app.patch("/api/admin/courses/<int:course_id>")
@auth_required("admin")
def admin_course_status(course_id):
    data = request.get_json(silent=True) or {}
    status = data.get("status")
    if status not in ("draft", "pending", "approved", "rejected"):
        return jsonify({"error": "Invalid course status"}), 400
    execute("UPDATE courses SET status=%s WHERE id=%s", (status, course_id))
    return jsonify({"message": "Course status updated"})


@app.post("/api/courses/<int:course_id>/reviews")
@auth_required("student")
def review_course(course_id):
    data = request.get_json(silent=True) or {}
    try:
        rating = int(data.get("rating", 0))
    except (TypeError, ValueError):
        return jsonify({"error": "Rating must be a whole number between 1 and 5"}), 400
    if rating < 1 or rating > 5:
        return jsonify({"error": "Rating must be between 1 and 5"}), 400
    if not fetch_one("SELECT id FROM courses WHERE id=%s AND status='approved'", (course_id,)):
        return jsonify({"error": "Course not found"}), 404
    if not fetch_one(
        "SELECT id FROM enrollments WHERE course_id=%s AND student_id=%s",
        (course_id, request.current_user["id"]),
    ):
        return jsonify({"error": "Enroll in this course before reviewing it"}), 403
    execute("""
        INSERT INTO reviews (course_id,student_id,rating,comment)
        VALUES (%s,%s,%s,%s)
        ON DUPLICATE KEY UPDATE rating=VALUES(rating),comment=VALUES(comment)
    """, (course_id, request.current_user["id"], rating, (data.get("comment") or "").strip()))
    return jsonify({"message": "Review submitted"})


@app.errorhandler(404)
def not_found(error):
    return jsonify({"error": "Not found"}), 404


@app.errorhandler(413)
def file_too_large(error):
    return jsonify({"error": "File is too large"}), 413


@app.errorhandler(500)
def internal_error(error):
    app.logger.exception("Unhandled server error")
    return jsonify({"error": "Internal server error"}), 500


if __name__ == "__main__":
    app.run(
        host=os.getenv("FLASK_HOST", "127.0.0.1"),
        port=int(os.getenv("FLASK_PORT", "5000")),
        debug=os.getenv("FLASK_DEBUG", "true").lower() == "true",
    )
