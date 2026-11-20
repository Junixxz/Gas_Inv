from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from getpass import getpass


class Command(BaseCommand):
    help = "Create the first Gas Inventory Superadmin account."

    def handle(self, *args, **options):
        User = get_user_model()
        if User.objects.filter(role=User.Role.SUPERADMIN).exists():
            raise CommandError("A Superadmin account already exists.")

        username = input("Username: ").strip()
        email = input("Email: ").strip()
        password = getpass("Password: ")
        confirmation = getpass("Confirm password: ")
        if password != confirmation:
            raise CommandError("Passwords do not match.")
        user = User(
            username=username,
            email=email,
            role=User.Role.SUPERADMIN,
            must_change_password=True,
        )
        try:
            user.full_clean(exclude=["password"])
            validate_password(password, user)
        except ValidationError as exc:
            raise CommandError("; ".join(exc.messages)) from exc
        user.set_password(password)
        user.save()
        self.stdout.write(self.style.SUCCESS(f"Created Superadmin '{user.username}'."))
