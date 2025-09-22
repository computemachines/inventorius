from flask import url_for


def operation(rel, method, href, expects_a=None):
    ret = {
        "rel": rel,
        "method": method,
        "href": href,
    }
    if expects_a:
        ret["Expects-a"] = expects_a
    return ret


GET = "GET"
POST = "POST"
PATCH = "PATCH"
PUT = "PUT"
DELETE = "DELETE"
OPTION = "OPTION"
HEAD = "HEAD"


def logout():
    return operation("logout", POST, url_for("user.logout_post"))


def user_delete(id):
    return operation("delete", DELETE, url_for("user.user_delete", id=id))


def batch_create():
    return operation("create", POST, url_for("batch.batches_post"), "Batch patch")


def batch_update(id):
    return operation("update", PATCH, url_for("batch.batch_patch", id=id), "Batch patch")


def batch_delete(id):
    return operation("delete", DELETE, url_for("batch.batch_delete", id=id))


def batch_bins(id):
    return operation("bins", GET, url_for("batch.batch_bins_get", id=id))

def bin_create():
    return operation("create", POST, url_for("bin.bins_post"), "Bin patch")

def bin_update(id):
    return operation("update", PATCH, url_for("bin.bin_patch", id=id), "Bin patch")

def bin_delete(id):
    return operation("delete", DELETE, url_for("bin.bin_delete", id=id))

def sku_create():
    return operation("create", POST, url_for("sku.skus_post"), "Sku patch")

def sku_update(id):
    return operation("update", PATCH, url_for("sku.sku_patch", id=id), "Sku patch")

def sku_delete(id):
    return operation("delete", DELETE, url_for("sku.sku_delete", id=id))

def sku_bins(id):
    return operation("bins", GET, url_for("sku.sku_bins_get", id=id))


def mixture_create():
    return operation("create", POST, url_for("mixture.mixtures_post"), "Mixture patch")


def mixture_draw(mix_id):
    return operation("draw", POST, url_for("mixture.mixture_draw", mix_id=mix_id), "Mixture draw")


def mixture_split(mix_id):
    return operation("split", POST, url_for("mixture.mixture_split", mix_id=mix_id), "Mixture split")


def mixture_append_audit(mix_id):
    return operation(
        "append-audit",
        POST,
        url_for("mixture.mixture_append_audit", mix_id=mix_id),
        "Mixture audit entry",
    )


def step_template_create():
    return operation(
        "create",
        POST,
        url_for("step_template.step_templates_post"),
        "Step template definition",
    )


def step_template_update(template_id):
    return operation(
        "update",
        PATCH,
        url_for("step_template.step_template_patch", template_id=template_id),
        "Step template definition",
    )


def step_template_delete(template_id):
    return operation(
        "delete",
        DELETE,
        url_for("step_template.step_template_delete", template_id=template_id),
    )


def step_instance_create():
    return operation(
        "create",
        POST,
        url_for("step_instance.step_instances_post"),
        "Step instance definition",
    )


def step_instance_update(instance_id):
    return operation(
        "update",
        PATCH,
        url_for("step_instance.step_instance_patch", instance_id=instance_id),
        "Step instance patch",
    )


def step_instance_delete(instance_id):
    return operation(
        "delete",
        DELETE,
        url_for("step_instance.step_instance_delete", instance_id=instance_id),
    )
