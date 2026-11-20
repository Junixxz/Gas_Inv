from django.contrib import admin
from django.urls import include, path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from accounts.views import CurrentUserView, PasswordChangeView
from business.views import CheckoutView, DashboardView


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/auth/me/", CurrentUserView.as_view(), name="current_user"),
    path("api/auth/change-password/", PasswordChangeView.as_view(), name="change_password"),
    path("api/users/", include("accounts.urls")),
    path("api/dashboard/", DashboardView.as_view(), name="dashboard"),
    path("api/checkout/", CheckoutView.as_view(), name="checkout"),
    path("api/", include("business.urls")),
]
