import calendar
from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, DecimalField, ExpressionWrapper, F, Sum, Value
from django.db.models.functions import TruncDate
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import CanManageUsers
from accounts.models import User
from business.models import (
    Customer,
    DailyClosing,
    Expense,
    InventoryMovement,
    Product,
    Purchase,
    Sale,
    SaleItem,
)
from business.serializers import (
    CheckoutSerializer,
    CustomerSerializer,
    DailyClosingSerializer,
    ExpenseSerializer,
    InventoryMovementSerializer,
    ProductSerializer,
    PurchaseSerializer,
    RecentSaleSerializer,
    SaleSerializer,
)


class CanArchiveProducts(BasePermission):
    message = "Only Superadmin and Head users can archive products."

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in {"superadmin", "head"}


class ProductViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    queryset = Product.objects.order_by("name")
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if getattr(self, "action", None) in {"archive", "restore"}:
            return [CanArchiveProducts()]
        return [permission() for permission in self.permission_classes]

    def get_queryset(self):
        products = Product.objects.order_by("name")
        if getattr(self, "action", None) in {"archive", "restore"}:
            return products
        if self.request.query_params.get("include_archived") == "true":
            return products
        return products.filter(is_active=True)

    def update(self, request, *args, **kwargs):
        product = self.get_object()
        if not product.is_active:
            return Response(
                {"detail": "Restore this product before editing it."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().update(request, *args, **kwargs)

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        product = self.get_object()
        if product.is_active:
            product.is_active = False
            product.save(update_fields=["is_active", "updated_at"])
        return Response(ProductSerializer(product).data)

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        product = self.get_object()
        if not product.is_active:
            product.is_active = True
            product.save(update_fields=["is_active", "updated_at"])
        return Response(ProductSerializer(product).data)


class CustomerViewSet(viewsets.ModelViewSet):
    serializer_class = CustomerSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Customer.objects.annotate(
            total_paid=Coalesce(
                Sum("sales__amount_paid"),
                Value(Decimal("0.00")),
                output_field=DecimalField(max_digits=12, decimal_places=2),
            ),
            sales_count=Count("sales", distinct=True),
        ).order_by("name")


class InventoryMovementViewSet(
    mixins.CreateModelMixin, mixins.ListModelMixin, viewsets.GenericViewSet
):
    queryset = InventoryMovement.objects.select_related("product").order_by("-created_at")
    serializer_class = InventoryMovementSerializer
    permission_classes = [IsAuthenticated]


class SaleViewSet(viewsets.ModelViewSet):
    queryset = Sale.objects.order_by("-created_at")
    serializer_class = SaleSerializer
    permission_classes = [IsAuthenticated]


class PurchaseViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, viewsets.GenericViewSet):
    queryset = Purchase.objects.order_by("-created_at")
    serializer_class = PurchaseSerializer
    permission_classes = [IsAuthenticated]


class ExpenseViewSet(viewsets.ModelViewSet):
    queryset = Expense.objects.order_by("-created_at")
    serializer_class = ExpenseSerializer
    permission_classes = [IsAuthenticated]


class CheckoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = CheckoutSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        sale = serializer.save()
        return Response(SaleSerializer(sale).data, status=status.HTTP_201_CREATED)


class DashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.request.query_params.get("include_users") == "true":
            return [CanManageUsers()]
        return [permission() for permission in self.permission_classes]

    def get(self, request):
        today = timezone.localdate()
        start = today - timedelta(days=6)
        sales_by_day = (
            Sale.objects.filter(created_at__date__gte=start, created_at__date__lte=today)
            .annotate(day=TruncDate("created_at"))
            .values("day")
            .annotate(total=Sum("total"))
            .order_by("day")
        )
        sales_map = {row["day"].isoformat(): float(row["total"]) for row in sales_by_day}
        chart = [
            {
                "date": (start + timedelta(days=offset)).isoformat(),
                "sales": sales_map.get((start + timedelta(days=offset)).isoformat(), 0),
            }
            for offset in range(7)
        ]
        data = {
            "metrics": {
                "products": Product.objects.filter(is_active=True).count(),
                "low_stock": Product.objects.filter(
                    is_active=True, stock_quantity__lte=5
                ).count(),
                "sales_today": Sale.objects.filter(created_at__date=today).aggregate(
                    total=Sum("total")
                )["total"]
                or 0,
                "purchases": Purchase.objects.count(),
                "supplier_purchase_total": Purchase.objects.aggregate(
                    total=Sum("total")
                )["total"]
                or 0,
                "expenses": Expense.objects.aggregate(total=Sum("amount"))["total"] or 0,
            },
            "sales_chart": chart,
            "recent_sales": RecentSaleSerializer(
                Sale.objects.order_by("-created_at")[:5], many=True
            ).data,
        }
        if request.query_params.get("include_users") == "true":
            data["users"] = {
                "total": User.objects.count(),
                "staff": User.objects.filter(role=User.Role.STAFF).count(),
                "heads": User.objects.filter(role=User.Role.HEAD).count(),
            }
        return Response(data)


class PeriodicReportQuerySerializer(serializers.Serializer):
    period = serializers.ChoiceField(choices=("day", "week", "month"))
    date = serializers.DateField(input_formats=["%Y-%m-%d"])


class DailyClosingQuerySerializer(serializers.Serializer):
    date = serializers.DateField(input_formats=["%Y-%m-%d"])


class PeriodicReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        query = PeriodicReportQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        period = query.validated_data["period"]
        selected_date = query.validated_data["date"]

        if period == "day":
            start = end = selected_date
        elif period == "week":
            start = selected_date - timedelta(days=selected_date.weekday())
            end = start + timedelta(days=6)
        else:
            start = selected_date.replace(day=1)
            end = selected_date.replace(
                day=calendar.monthrange(selected_date.year, selected_date.month)[1]
            )

        sales = Sale.objects.filter(created_at__date__range=(start, end))
        purchases = Purchase.objects.filter(created_at__date__range=(start, end))
        sales_totals = sales.aggregate(total=Sum("total"))
        item_totals = SaleItem.objects.filter(sale__in=sales).aggregate(
            filled=Sum("quantity"),
            empty=Sum("empty_returned"),
        )
        purchase_totals = purchases.aggregate(total=Sum("total"))
        refill_purchase_total = purchases.filter(
            purchase_type=Purchase.PurchaseType.REFILL
        ).aggregate(total=Sum("total"))["total"]
        sale_items = SaleItem.objects.filter(sale__in=sales)
        unknown_costs = sale_items.filter(unit_cost__isnull=True).exists()
        profit_total = sale_items.aggregate(
            total=Sum(
                ExpressionWrapper(
                    (F("unit_price") - F("unit_cost")) * F("quantity"),
                    output_field=DecimalField(max_digits=18, decimal_places=2),
                )
            )
        )["total"]
        payment_summary = list(
            sales.values("payment_method", "payment_account")
            .annotate(sales=Count("id"), total=Sum("total"))
            .order_by("payment_method", "payment_account")
        )
        suppliers = list(
            purchases.values("supplier")
            .annotate(orders=Count("id"), total=Sum("total"))
            .order_by("supplier")
        )

        closing = None
        closing_totals = None
        daily_sales = []
        purchase_records = []
        if period == "day":
            closing = (
                DailyClosing.objects.filter(report_date=selected_date)
                .prefetch_related("deposits", "stock_counts__product")
                .first()
            )
            daily_sales = SaleSerializer(
                sales.select_related("customer").prefetch_related("items__product"),
                many=True,
            ).data
            purchase_records = PurchaseSerializer(
                purchases.prefetch_related("items__product"),
                many=True,
            ).data
            if closing:
                deposited = sum(
                    (deposit.amount for deposit in closing.deposits.all()),
                    start=Decimal("0.00"),
                )
                cash_sales = sales.filter(
                    payment_method=Sale.PaymentMethod.CASH
                ).aggregate(total=Sum("total"))["total"] or Decimal("0.00")
                expected_cash = cash_sales + closing.additional_cash_amount - deposited
                closing_totals = {
                    "deposits_total": format(deposited, ".2f"),
                    "cash_sales": format(cash_sales, ".2f"),
                    "expected_cash_on_hand": format(expected_cash, ".2f"),
                    "cash_difference": (
                        format(closing.actual_cash_count - expected_cash, ".2f")
                        if closing.actual_cash_count is not None
                        else None
                    ),
                }

        return Response(
            {
                "period": period,
                "start_date": start,
                "end_date": end,
                "sales_count": sales.count(),
                "sales_total": format(sales_totals["total"] or Decimal("0.00"), ".2f"),
                "filled_cylinders_sold": item_totals["filled"] or 0,
                "empty_cylinders_returned": item_totals["empty"] or 0,
                "profit_complete": not unknown_costs,
                "profit_total": (
                    format(profit_total or Decimal("0.00"), ".2f")
                    if not unknown_costs
                    else None
                ),
                "payment_summary": [
                    {
                        "method": row["payment_method"],
                        "account": row["payment_account"] or "Unspecified",
                        "sales": row["sales"],
                        "total": format(row["total"] or Decimal("0.00"), ".2f"),
                    }
                    for row in payment_summary
                ],
                "purchase_order_count": purchases.count(),
                "purchase_total": format(purchase_totals["total"] or Decimal("0.00"), ".2f"),
                "refill_purchase_total": format(refill_purchase_total or Decimal("0.00"), ".2f"),
                "suppliers": [
                    {
                        "supplier": supplier["supplier"] or "Unspecified",
                        "orders": supplier["orders"],
                        "total": format(supplier["total"], ".2f"),
                    }
                    for supplier in suppliers
                ],
                "daily_sales": daily_sales,
                "purchase_records": purchase_records,
                "daily_closing": DailyClosingSerializer(closing).data if closing else None,
                "closing_totals": closing_totals,
            }
        )


class DailyClosingView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        query = DailyClosingQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        report_date = query.validated_data["date"]
        closing = (
            DailyClosing.objects.filter(report_date=report_date)
            .prefetch_related("deposits", "stock_counts__product")
            .first()
        )
        if closing:
            return Response(DailyClosingSerializer(closing).data)
        return Response(
            {
                "report_date": report_date,
                "additional_cash_label": "",
                "additional_cash_amount": "0.00",
                "actual_cash_count": None,
                "crate_count": 0,
                "floor_cans_count": 0,
                "prepared_by_name": "",
                "checked_by_name": "",
                "notes": "",
                "deposits": [],
                "floor_stocks": [],
                "stock_counts": [],
            }
        )

    def put(self, request):
        query = DailyClosingQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        report_date = query.validated_data["date"]
        instance = DailyClosing.objects.filter(report_date=report_date).first()
        data = request.data.copy()
        data["report_date"] = report_date.isoformat()
        serializer = DailyClosingSerializer(instance, data=data)
        serializer.is_valid(raise_exception=True)
        closing = serializer.save(updated_by=request.user)
        return Response(DailyClosingSerializer(closing).data)
