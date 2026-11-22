import os

import mysql.connector


def get_database_connection():
    connection_options = {
        "host": os.getenv("DB_HOST", "127.0.0.1"),
        "port": int(os.getenv("DB_PORT", "3306")),
        "user": os.getenv("DB_USER", "root"),
        "password": os.getenv("DB_PASSWORD", ""),
        "database": os.getenv("DB_NAME", "video_course_hosting"),
        "autocommit": True,
    }
    ssl_ca = os.getenv("DB_SSL_CA")
    if ssl_ca:
        connection_options.update(
            ssl_ca=ssl_ca,
            ssl_verify_cert=True,
            ssl_verify_identity=True,
        )
    return mysql.connector.connect(**connection_options)
