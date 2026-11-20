from rest_framework.permissions import BasePermission


class CanManageUsers(BasePermission):
    message = "Only Superadmin and Head users can manage users."

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in {"superadmin", "head"}


class CanManageUser(CanManageUsers):
    message = "Head users cannot modify Superadmin accounts."

    def has_object_permission(self, request, view, obj):
        return (
            request.method in {"GET", "HEAD", "OPTIONS"}
            or request.user.role == "superadmin"
            or obj.role != "superadmin"
        )
