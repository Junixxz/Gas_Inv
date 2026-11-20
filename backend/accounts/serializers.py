import secrets

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

User = get_user_model()


def generate_temporary_password():
    return secrets.token_urlsafe(18)


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "first_name",
            "last_name",
            "email",
            "role",
            "is_active",
            "must_change_password",
        )
        read_only_fields = ("id",)


class UserCreateSerializer(serializers.ModelSerializer):
    temporary_password = serializers.CharField(read_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "first_name",
            "last_name",
            "email",
            "role",
            "temporary_password",
        )
        read_only_fields = ("id",)

    def validate_role(self, value):
        request = self.context["request"]
        if value == User.Role.SUPERADMIN and request.user.role != User.Role.SUPERADMIN:
            raise serializers.ValidationError("Only a Superadmin can create another Superadmin.")
        return value

    def create(self, validated_data):
        user = User(**validated_data)
        temporary_password = generate_temporary_password()
        user.set_password(temporary_password)
        user.must_change_password = True
        user.save()
        user.temporary_password = temporary_password
        return user


class UserUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("first_name", "last_name", "email", "role", "is_active")

    def validate_role(self, value):
        request = self.context["request"]
        if value == User.Role.SUPERADMIN and request.user.role != User.Role.SUPERADMIN:
            raise serializers.ValidationError("Only a Superadmin can assign the Superadmin role.")
        if self.instance.pk == request.user.pk and value != self.instance.role:
            raise serializers.ValidationError("You cannot change your own role.")
        return value

    def validate(self, attrs):
        request = self.context["request"]
        user = self.instance
        if user.pk == request.user.pk and attrs.get("is_active") is False:
            raise serializers.ValidationError({"is_active": "You cannot disable your own account."})
        if (
            user.role == User.Role.SUPERADMIN
            and user.is_active
            and attrs.get("is_active") is False
            and User.objects.filter(role=User.Role.SUPERADMIN, is_active=True).count() <= 1
        ):
            raise serializers.ValidationError({"is_active": "The last active Superadmin cannot be disabled."})
        if (
            user.role == User.Role.SUPERADMIN
            and user.is_active
            and attrs.get("role", user.role) != User.Role.SUPERADMIN
            and User.objects.filter(role=User.Role.SUPERADMIN, is_active=True).count() <= 1
        ):
            raise serializers.ValidationError({"role": "The last active Superadmin cannot be demoted."})
        return attrs


class PasswordChangeSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True, trim_whitespace=False)
    new_password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate_current_password(self, value):
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError("The temporary password is incorrect.")
        return value

    def validate_new_password(self, value):
        user = self.context["request"].user
        if user.check_password(value):
            raise serializers.ValidationError("Choose a password different from your current one.")
        try:
            validate_password(value, user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages) from exc
        return value
