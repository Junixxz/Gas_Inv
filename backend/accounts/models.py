from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    class Role(models.TextChoices):
        SUPERADMIN = "superadmin", "Superadmin"
        STAFF = "staff", "Staff"
        HEAD = "head", "Head"

    role = models.CharField(max_length=20, choices=Role.choices, default=Role.STAFF)
    must_change_password = models.BooleanField(default=True)

    def save(self, *args, **kwargs):
        self.is_staff = self.role == self.Role.SUPERADMIN
        self.is_superuser = self.role == self.Role.SUPERADMIN
        super().save(*args, **kwargs)
