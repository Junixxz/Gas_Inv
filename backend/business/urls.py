from rest_framework.routers import DefaultRouter
from django.urls import path

from business.views import (
    CustomerViewSet,
    DailyClosingView,
    ExpenseViewSet,
    InventoryMovementViewSet,
    PeriodicReportView,
    ProductViewSet,
    PurchaseViewSet,
    SaleViewSet,
)

router = DefaultRouter()
router.register("customers", CustomerViewSet, basename="customer")
router.register("products", ProductViewSet)
router.register("inventory-movements", InventoryMovementViewSet)
router.register("sales", SaleViewSet)
router.register("purchases", PurchaseViewSet)
router.register("expenses", ExpenseViewSet)

urlpatterns = [
    path("reports/periodic/", PeriodicReportView.as_view(), name="periodic-report"),
    path("reports/daily-closing/", DailyClosingView.as_view(), name="daily-closing"),
] + router.urls
