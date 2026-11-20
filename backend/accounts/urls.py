from django.urls import path

from accounts.views import UserDetailView, UserListCreateView, UserPasswordResetView


urlpatterns = [
    path("", UserListCreateView.as_view(), name="user-list-create"),
    path("<int:pk>/", UserDetailView.as_view(), name="user-detail"),
    path("<int:pk>/reset-password/", UserPasswordResetView.as_view(), name="user-reset-password"),
]
