"""Permission catalogue and default role grants (spec section 13)."""

MODULES: dict[str, list[str]] = {
    "dashboard": ["view"],
    "users": ["view", "create", "edit", "delete"],
    "roles": ["view", "edit"],
    "departments": ["view", "create", "edit", "delete"],
    "employees": ["view", "create", "edit", "delete", "export"],
    "attendance": ["view", "edit", "export"],
    "leave": ["view", "approve"],
    "tasks": ["view", "create", "edit", "delete"],
    "documents": ["view", "create", "edit", "delete", "download"],
    "audit": ["view"],
}

ALL = [f"{m}:{a}" for m, actions in MODULES.items() for a in actions]


def _mod(*modules: str, actions: tuple[str, ...] | None = None) -> list[str]:
    out = []
    for m in modules:
        for a in MODULES[m]:
            if actions is None or a in actions:
                out.append(f"{m}:{a}")
    return out


_BASE = ["dashboard:view", "tasks:create", "documents:view", "documents:download", "departments:view"]
_MANAGER = _BASE + _mod("employees", actions=("view",)) + _mod("tasks") + ["documents:create", "attendance:view", "leave:view", "leave:approve"]

DEFAULT_ROLES: dict[str, tuple[str, list[str]]] = {
    "Super Administrator": ("Full access to every module and setting", ALL),
    "Managing Director": ("Company-wide visibility and approvals", [p for p in ALL if p not in ("roles:edit",)]),
    "Director": ("Company-wide visibility and approvals", [p for p in ALL if not p.startswith(("roles:", "users:delete"))]),
    "Department Manager": ("Manages a department's people and tasks", _MANAGER),
    "Tender Manager": ("Owns tender pipeline (Phase 2)", _MANAGER),
    "Project Manager": ("Owns project execution (Phase 3)", _MANAGER),
    "HR Manager": ("Employees, attendance and leave", _BASE + _mod("employees", "departments", "attendance", "leave", "tasks") + ["documents:create", "documents:edit"]),
    "Finance Manager": ("Finance and accounts (Phase 4)", _BASE + ["employees:view", "documents:create"]),
    "Procurement Manager": ("Vendors and purchasing (Phase 3)", _BASE + ["employees:view", "documents:create"]),
    "Site Engineer": ("Site execution and reporting", _BASE + ["documents:create"]),
    "Employee": ("Standard staff access", _BASE),
    "External Vendor": ("Restricted external access", ["dashboard:view"]),
}
