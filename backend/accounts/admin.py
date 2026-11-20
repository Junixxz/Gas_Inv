from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from accounts.models import User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    fieldsets = DjangoUserAdmin.fieldsets + (
        ("Gas Inventory access", {"fields": ("role", "must_change_password")}),
    )
    add_fieldsets = DjangoUserAdmin.add_fieldsets + (
        ("Gas Inventory access", {"fields": ("role", "must_change_password")}),
    )
    list_display = ("username", "email", "role", "must_change_password", "is_active")
