from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import CanManageUser, CanManageUsers
from accounts.serializers import (
    PasswordChangeSerializer,
    UserCreateSerializer,
    UserSerializer,
    UserUpdateSerializer,
    generate_temporary_password,
)

User = get_user_model()


class CurrentUserView(generics.RetrieveAPIView):
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return self.request.user


class PasswordChangeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = PasswordChangeSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = request.user
        user.set_password(serializer.validated_data["new_password"])
        user.must_change_password = False
        user.save(update_fields=["password", "must_change_password"])
        return Response(UserSerializer(user).data)


class UserListCreateView(generics.ListCreateAPIView):
    queryset = User.objects.order_by("username")
    permission_classes = [CanManageUsers]

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.request.user.role == User.Role.HEAD:
            return queryset.exclude(role=User.Role.SUPERADMIN)
        return queryset

    def get_serializer_class(self):
        if self.request.method == "POST":
            return UserCreateSerializer
        return UserSerializer


class UserDetailView(generics.RetrieveUpdateAPIView):
    queryset = User.objects.order_by("username")
    permission_classes = [CanManageUser]

    def get_serializer_class(self):
        if self.request.method in {"PUT", "PATCH"}:
            return UserUpdateSerializer
        return UserSerializer


class UserPasswordResetView(APIView):
    permission_classes = [CanManageUser]

    def post(self, request, pk):
        user = get_object_or_404(User, pk=pk)
        self.check_object_permissions(request, user)
        temporary_password = generate_temporary_password()
        user.set_password(temporary_password)
        user.must_change_password = True
        user.save(update_fields=["password", "must_change_password"])
        return Response({
            "detail": "Password reset. The user must change it at next sign-in.",
            "temporary_password": temporary_password,
        })
