import re
import unicodedata

from django.conf import settings
from django.db import models
from django.utils import timezone


class Product(models.Model):
    name = models.CharField(max_length=160)
    sku = models.CharField(max_length=60, unique=True, blank=True)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    average_unit_cost = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    stock_quantity = models.PositiveIntegerField(default=0)
    empty_stock_quantity = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        if not self.sku:
            normalized_name = unicodedata.normalize("NFKD", self.name)
            ascii_name = normalized_name.encode("ascii", "ignore").decode("ascii")
            name_part = re.sub(r"[^A-Za-z0-9]+", "-", ascii_name).strip("-").upper()
            name_part = name_part or "PRODUCT"
            base = f"{name_part}-{timezone.localdate():%Y%m%d}"
            candidate = base[:60]
            suffix_number = 2
            while Product.objects.filter(sku=candidate).exclude(pk=self.pk).exists():
                suffix = f"-{suffix_number:02d}"
                candidate = f"{base[:60 - len(suffix)]}{suffix}"
                suffix_number += 1
            self.sku = candidate
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class Customer(models.Model):
    name = models.CharField(max_length=160)
    phone = models.CharField(max_length=40, blank=True)
    email = models.EmailField(blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class InventoryMovement(models.Model):
    class Direction(models.TextChoices):
        IN = "in", "In"
        OUT = "out", "Out"

    class StockType(models.TextChoices):
        FILLED = "filled", "Filled"
        EMPTY = "empty", "Empty"

    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="movements")
    direction = models.CharField(max_length=3, choices=Direction.choices)
    stock_type = models.CharField(max_length=6, choices=StockType.choices, default=StockType.FILLED)
    quantity = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True
    )


class Sale(models.Model):
    class PaymentMethod(models.TextChoices):
        CASH = "cash", "Cash"
        BANK_TRANSFER = "bank_transfer", "Bank transfer"
        OTHER = "other", "Other"

    total = models.DecimalField(max_digits=12, decimal_places=2)
    customer = models.ForeignKey(
        Customer, on_delete=models.SET_NULL, null=True, blank=True, related_name="sales"
    )
    customer_name = models.CharField(max_length=160, blank=True)
    amount_paid = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    change_due = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    payment_method = models.CharField(
        max_length=20, choices=PaymentMethod.choices, default=PaymentMethod.CASH
    )
    payment_account = models.CharField(max_length=160, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True
    )


class SaleItem(models.Model):
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="sale_items")
    quantity = models.PositiveIntegerField()
    empty_returned = models.PositiveIntegerField(default=0)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)


class Purchase(models.Model):
    class PurchaseType(models.TextChoices):
        STOCK = "stock", "Stock purchase"
        REFILL = "refill", "Cylinder refill"

    purchase_type = models.CharField(
        max_length=10,
        choices=PurchaseType.choices,
        default=PurchaseType.STOCK,
    )
    total = models.DecimalField(max_digits=12, decimal_places=2)
    supplier = models.CharField(max_length=160, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True
    )


class PurchaseItem(models.Model):
    purchase = models.ForeignKey(Purchase, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="purchase_items")
    stock_type = models.CharField(
        max_length=6,
        choices=InventoryMovement.StockType.choices,
        default=InventoryMovement.StockType.FILLED,
    )
    quantity = models.PositiveIntegerField()
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2)


class DailyClosing(models.Model):
    report_date = models.DateField(unique=True)
    additional_cash_label = models.CharField(max_length=120, blank=True)
    additional_cash_amount = models.DecimalField(
        max_digits=12, decimal_places=2, default=0
    )
    actual_cash_count = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    crate_count = models.PositiveIntegerField(default=0)
    floor_cans_count = models.PositiveIntegerField(default=0)
    prepared_by_name = models.CharField(max_length=160, blank=True)
    checked_by_name = models.CharField(max_length=160, blank=True)
    notes = models.TextField(blank=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True
    )
    updated_at = models.DateTimeField(auto_now=True)


class DailyClosingDeposit(models.Model):
    closing = models.ForeignKey(
        DailyClosing, on_delete=models.CASCADE, related_name="deposits"
    )
    account_name = models.CharField(max_length=160)
    amount = models.DecimalField(max_digits=12, decimal_places=2)


class DailyClosingFloorStock(models.Model):
    closing = models.ForeignKey(
        DailyClosing, on_delete=models.CASCADE, related_name="floor_stocks"
    )
    label = models.CharField(max_length=120)
    quantity = models.PositiveIntegerField()


class DailyClosingStockCount(models.Model):
    closing = models.ForeignKey(
        DailyClosing, on_delete=models.CASCADE, related_name="stock_counts"
    )
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="daily_counts")
    filled_quantity = models.PositiveIntegerField(default=0)
    empty_quantity = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("closing", "product"), name="unique_daily_closing_product_count"
            )
        ]


class Expense(models.Model):
    description = models.CharField(max_length=200)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True
    )
