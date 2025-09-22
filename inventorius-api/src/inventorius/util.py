import functools
from flask import request
from flask.helpers import make_response
from flask_login import LoginManager
from flask_principal import Principal, Permission, RoleNeed
import re
from string import ascii_letters

from inventorius.db import db

login_manager = LoginManager()
principals = Principal()

admin_permission = Permission(RoleNeed("admin"))


def getIntArgs(args, name, default):
    str_value = args.get(name, default)
    try:
        value = int(str_value)
    except ValueError:
        value = default
    return value


def get_body_type():
    if request.mimetype == 'application/json':
        return 'json'
    if request.mimetype in ('application/x-www-form-urlencoded',
                            'multipart/form-data'):
        return 'form'


def owned_code_get(id):
    existing = Sku.from_mongodb_doc(
        db.sku.find_one({'owned_codes': id}))
    return existing


def _collection_for_prefix(prefix):
    if prefix == "SKU":
        return db.sku
    if prefix == "BAT":
        return db.batch
    if prefix == "BIN":
        return db.bin
    raise Exception("unknown prefix", prefix)


def _next_available_code(prefix, start_from):
    collection = _collection_for_prefix(prefix)
    for offset in range(1_000_000):
        candidate = (start_from + offset) % 1_000_000
        candidate_id = f"{prefix}{candidate:06}"
        if not collection.find_one({"_id": candidate_id}):
            return candidate_id
    return f"{prefix}{start_from % 1_000_000:06}"


def admin_increment_code(prefix, code):
    code_number = int(re.sub('[^0-9]', '', code))
    next_unused = int(re.sub('[^0-9]', '', admin_get_next(prefix)))

    if code_number >= next_unused:
        next_code = _next_available_code(prefix, code_number + 1)
        db.admin.replace_one({"_id": prefix}, {"_id": prefix, "next": next_code}, upsert=True)


def admin_get_next(prefix):

    def max_code_value(collection, prefix=ascii_letters):
        cursor = collection.find()
        max_value = 0
        for doc in cursor:
            code_number = int(doc['_id'].strip(prefix))
            if code_number > max_value:
                max_value = code_number
        return max_value

    next_code_doc = db.admin.find_one({"_id": prefix})
    if not next_code_doc:
        if prefix == "SKU":
            max_value = max_code_value(db.sku, "SKU")
            db.admin.insert_one({"_id": "SKU",
                                 "next": _next_available_code("SKU", max_value + 1)})
        if prefix == "BAT":
            max_value = max_code_value(db.batch)
            db.admin.insert_one({"_id": "BAT",
                                 "next": _next_available_code("BAT", max_value + 1)})
        if prefix == "BIN":
            max_value = max_code_value(db.bin, "BIN")
            db.admin.insert_one({"_id": "BIN",
                                 "next": _next_available_code("BIN", max_value + 1)})
        next_code_doc = db.admin.find_one({"_id": prefix})

    if next_code_doc:
        return next_code_doc['next']
    else:
        raise Exception("bad prefix", prefix)


def check_code_list(codes):
    return any(re.search('\\s', code) or code == '' for code in codes)

def no_cache(view):
    @functools.wraps(view)
    def no_cache_(*args, **kwargs):
        resp = make_response(view(*args, **kwargs))
        resp.headers.add("Cache-Control", "no-cache")
        return resp
    return no_cache_