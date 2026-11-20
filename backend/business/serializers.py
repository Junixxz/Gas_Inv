from decimal import Decimal

from rest_framework import serializers
from django.db import transaction
from django.db.models import F

from business.models import (
    Customer,
    DailyClosing,
    DailyClosingDeposit,
    DailyClosingFloorStock,
    DailyClosingStockCount,
    Expense,
    InventoryMovement,
    Product,
    Purchase,
    PurchaseItem,
    Sale,
    SaleItem,
)


class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = (
            "id",
            "name",
            "sku",
            "unit_price",
            "average_unit_cost",
            "stock_quantity",
            "empty_stock_quantity",
            "is_active",
            "updated_at",
        )
        read_only_fields = ("id", "sku", "empty_stock_quantity", "is_active", "updated_at")


class CustomerSerializer(serializers.ModelSerializer):
    total_paid = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True
    )
    sales_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Customer
        fields = (
            "id",
            "name",
            "phone",
            "email",
            "notes",
            "total_paid",
            "sales_count",
            "created_at",
        )
        read_only_fields = ("id", "created_at")


class InventoryMovementSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.filter(is_active=True)
    )
    stock_type = serializers.ChoiceField(
        choices=InventoryMovement.StockType.choices,
        default=InventoryMovement.StockType.FILLED,
    )

    class Meta:
        model = InventoryMovement
        fields = (
            "id",
            "product",
            "product_name",
            "direction",
            "stock_type",
            "quantity",
            "created_at",
            "created_by",
        )
        read_only_fields = ("id", "created_at", "created_by")
        extra_kwargs = {"quantity": {"min_value": 1}}

    @transaction.atomic
    def create(self, validated_data):
        product = Product.objects.select_for_update().get(pk=validated_data["product"].pk)
        quantity = validated_data["quantity"]
        stock_field = (
            "empty_stock_quantity"
            if validated_data["stock_type"] == InventoryMovement.StockType.EMPTY
            else "stock_quantity"
        )
        if validated_data["direction"] == InventoryMovement.Direction.OUT:
            if getattr(product, stock_field) < quantity:
                raise serializers.ValidationError(
                    {"quantity": f"Cannot remove more {validated_data['stock_type']} stock than is available."}
                )
            Product.objects.filter(pk=product.pk).update(**{stock_field: F(stock_field) - quantity})
        else:
            updates = {stock_field: F(stock_field) + quantity}
            if stock_field == "stock_quantity":
                updates["average_unit_cost"] = None
            Product.objects.filter(pk=product.pk).update(**updates)
        validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)


class SaleSerializer(serializers.ModelSerializer):
    items = serializers.SerializerMethodField()

    class Meta:
        model = Sale
        fields = (
            "id",
            "total",
            "customer",
            "customer_name",
            "amount_paid",
            "change_due",
            "payment_method",
            "payment_account",
            "created_at",
            "created_by",
            "items",
        )
        read_only_fields = (
            "id",
            "customer",
            "customer_name",
            "amount_paid",
            "change_due",
            "created_at",
            "created_by",
        )
        extra_kwargs = {"total": {"min_value": Decimal("0.01")}}

    def get_items(self, sale):
        return SaleItemSerializer(sale.items.select_related("product"), many=True).data

    def create(self, validated_data):
        return Sale.objects.create(created_by=self.context["request"].user, **validated_data)


class PurchaseItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    sku = serializers.CharField(source="product.sku", read_only=True)
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.filter(is_active=True))
    stock_type = serializers.ChoiceField(
        choices=InventoryMovement.StockType.choices,
        default=InventoryMovement.StockType.FILLED,
    )
    quantity = serializers.IntegerField(min_value=1)
    unit_cost = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0.00")
    )

    class Meta:
        model = PurchaseItem
        fields = (
            "id",
            "product",
            "product_name",
            "sku",
            "stock_type",
            "quantity",
            "unit_cost",
        )
        read_only_fields = ("id",)


class PurchaseSerializer(serializers.ModelSerializer):
    items = PurchaseItemSerializer(many=True, write_only=True)
    lines = serializers.SerializerMethodField()

    class Meta:
        model = Purchase
        fields = (
            "id",
            "supplier",
            "purchase_type",
            "total",
            "items",
            "lines",
            "created_at",
            "created_by",
        )
        read_only_fields = ("id", "total", "lines", "created_at", "created_by")

    def get_lines(self, purchase):
        return PurchaseItemSerializer(purchase.items.select_related("product"), many=True).data

    def validate_items(self, items):
        if not items:
            raise serializers.ValidationError("Add at least one product to the purchase.")
        products_and_types = [
            (line["product"].pk, line["stock_type"]) for line in items
        ]
        if len(products_and_types) != len(set(products_and_types)):
            raise serializers.ValidationError("Each product and stock type can appear only once.")
        return items

    def validate(self, attrs):
        if attrs.get("purchase_type") == Purchase.PurchaseType.REFILL and any(
            item["stock_type"] != InventoryMovement.StockType.FILLED
            for item in attrs.get("items", [])
        ):
            raise serializers.ValidationError(
                {"items": "Cylinder refill items must add filled stock."}
            )
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        lines = validated_data.pop("items")
        purchase_type = validated_data.get("purchase_type", Purchase.PurchaseType.STOCK)
        total = sum(
            (line["unit_cost"] * line["quantity"] for line in lines),
            start=Decimal("0.00"),
        )
        purchase = Purchase.objects.create(
            created_by=self.context["request"].user,
            total=total,
            **validated_data,
        )
        for line in lines:
            line_data = dict(line)
            product = Product.objects.select_for_update().get(pk=line_data.pop("product").pk)
            stock_type = line["stock_type"]
            quantity = line["quantity"]
            unit_cost = line["unit_cost"]
            PurchaseItem.objects.create(
                purchase=purchase,
                product=product,
                **line_data,
            )

            if stock_type == InventoryMovement.StockType.FILLED:
                if (
                    purchase_type == Purchase.PurchaseType.REFILL
                    and product.empty_stock_quantity < quantity
                ):
                    raise serializers.ValidationError(
                        {"items": f"Not enough empty cylinders to refill {product.name}."}
                    )
                new_quantity = product.stock_quantity + quantity
                average_cost = product.average_unit_cost
                if product.stock_quantity == 0:
                    average_cost = unit_cost
                elif average_cost is not None:
                    average_cost = (
                        (average_cost * product.stock_quantity + unit_cost * quantity)
                        / new_quantity
                    ).quantize(Decimal("0.01"))
                updates = {"stock_quantity": F("stock_quantity") + quantity}
                if purchase_type == Purchase.PurchaseType.REFILL:
                    updates["empty_stock_quantity"] = F("empty_stock_quantity") - quantity
                updates["average_unit_cost"] = average_cost
                Product.objects.filter(pk=product.pk).update(**updates)
            else:
                Product.objects.filter(pk=product.pk).update(
                    empty_stock_quantity=F("empty_stock_quantity") + quantity
                )
            if purchase_type == Purchase.PurchaseType.REFILL:
                InventoryMovement.objects.create(
                    product=product,
                    direction=InventoryMovement.Direction.OUT,
                    stock_type=InventoryMovement.StockType.EMPTY,
                    quantity=quantity,
                    created_by=self.context["request"].user,
                )
            InventoryMovement.objects.create(
                product=product,
                direction=InventoryMovement.Direction.IN,
                stock_type=stock_type,
                quantity=quantity,
                created_by=self.context["request"].user,
            )
        return purchase


class DailyClosingDepositSerializer(serializers.ModelSerializer):
    class Meta:
        model = DailyClosingDeposit
        fields = ("id", "account_name", "amount")
        read_only_fields = ("id",)
        extra_kwargs = {
            "account_name": {"allow_blank": False},
            "amount": {"min_value": Decimal("0.01")},
        }


class DailyClosingStockCountSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    sku = serializers.CharField(source="product.sku", read_only=True)
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())

    class Meta:
        model = DailyClosingStockCount
        fields = ("id", "product", "product_name", "sku", "filled_quantity", "empty_quantity")
        read_only_fields = ("id",)


class DailyClosingFloorStockSerializer(serializers.ModelSerializer):
    class Meta:
        model = DailyClosingFloorStock
        fields = ("id", "label", "quantity")
        read_only_fields = ("id",)
        extra_kwargs = {"label": {"allow_blank": False}}


class DailyClosingSerializer(serializers.ModelSerializer):
    deposits = DailyClosingDepositSerializer(many=True, required=False)
    floor_stocks = DailyClosingFloorStockSerializer(many=True, required=False)
    stock_counts = DailyClosingStockCountSerializer(many=True, required=False)

    class Meta:
        model = DailyClosing
        fields = (
            "report_date",
            "additional_cash_label",
            "additional_cash_amount",
            "actual_cash_count",
            "crate_count",
            "floor_cans_count",
            "prepared_by_name",
            "checked_by_name",
            "notes",
            "deposits",
            "floor_stocks",
            "stock_counts",
        )
        extra_kwargs = {
            "additional_cash_amount": {"min_value": Decimal("0.00")},
            "actual_cash_count": {"min_value": Decimal("0.00"), "required": False},
        }

    def validate_stock_counts(self, stock_counts):
        product_ids = [count["product"].pk for count in stock_counts]
        if len(product_ids) != len(set(product_ids)):
            raise serializers.ValidationError("Each product can only be counted once per day.")
        return stock_counts

    def validate_floor_stocks(self, floor_stocks):
        labels = [stock["label"].strip().casefold() for stock in floor_stocks]
        if len(labels) != len(set(labels)):
            raise serializers.ValidationError("Floor stock labels must be unique for the day.")
        for stock in floor_stocks:
            stock["label"] = stock["label"].strip()
        return floor_stocks

    @transaction.atomic
    def create(self, validated_data):
        deposits = validated_data.pop("deposits", [])
        floor_stocks = validated_data.pop("floor_stocks", [])
        stock_counts = validated_data.pop("stock_counts", [])
        closing = DailyClosing.objects.create(**validated_data)
        self._save_details(closing, deposits, floor_stocks, stock_counts)
        return closing

    @transaction.atomic
    def update(self, instance, validated_data):
        deposits = validated_data.pop("deposits", [])
        floor_stocks = validated_data.pop("floor_stocks", [])
        stock_counts = validated_data.pop("stock_counts", [])
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        instance.deposits.all().delete()
        instance.floor_stocks.all().delete()
        instance.stock_counts.all().delete()
        self._save_details(instance, deposits, floor_stocks, stock_counts)
        return instance

    @staticmethod
    def _save_details(closing, deposits, floor_stocks, stock_counts):
        DailyClosingDeposit.objects.bulk_create(
            [DailyClosingDeposit(closing=closing, **deposit) for deposit in deposits]
        )
        DailyClosingFloorStock.objects.bulk_create(
            [DailyClosingFloorStock(closing=closing, **stock) for stock in floor_stocks]
        )
        DailyClosingStockCount.objects.bulk_create(
            [DailyClosingStockCount(closing=closing, **count) for count in stock_counts]
        )


class ExpenseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Expense
        fields = ("id", "description", "amount", "created_at", "created_by")
        read_only_fields = ("id", "created_at", "created_by")
        extra_kwargs = {"amount": {"min_value": Decimal("0.01")}}

    def create(self, validated_data):
        return Expense.objects.create(created_by=self.context["request"].user, **validated_data)


class RecentSaleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Sale
        fields = ("id", "total", "created_at")


class SaleItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    sku = serializers.CharField(source="product.sku", read_only=True)

    class Meta:
        model = SaleItem
        fields = (
            "id",
            "product",
            "product_name",
            "sku",
            "quantity",
            "empty_returned",
            "unit_price",
            "unit_cost",
        )


class CheckoutLineSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.filter(is_active=True))
    quantity = serializers.IntegerField(min_value=1)
    empty_returned = serializers.IntegerField(min_value=0, default=0)

    def validate(self, attrs):
        if attrs["empty_returned"] > attrs["quantity"]:
            raise serializers.ValidationError(
                {"empty_returned": "Returned empty cylinders cannot exceed the quantity purchased."}
            )
        return attrs


class CheckoutSerializer(serializers.Serializer):
    items = CheckoutLineSerializer(many=True, allow_empty=False)
    customer_name = serializers.CharField(max_length=160, trim_whitespace=True)
    payment_method = serializers.ChoiceField(
        choices=Sale.PaymentMethod.choices, default=Sale.PaymentMethod.CASH
    )
    payment_account = serializers.CharField(max_length=160, allow_blank=True, required=False)
    amount_paid = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.01"),
    )

    def validate_items(self, items):
        product_ids = [line["product"].pk for line in items]
        if len(product_ids) != len(set(product_ids)):
            raise serializers.ValidationError("Each product can only appear once in the cart.")
        return items

    @transaction.atomic
    def create(self, validated_data):
        lines = validated_data["items"]
        product_ids = [line["product"].pk for line in lines]
        products = {
            product.pk: product
            for product in Product.objects.select_for_update()
            .filter(pk__in=product_ids)
            .order_by("pk")
        }
        for line in lines:
            product = products.get(line["product"].pk)
            if product is None:
                raise serializers.ValidationError({"items": "A cart product is no longer available."})
            if product.stock_quantity < line["quantity"]:
                raise serializers.ValidationError(
                    {"items": f"Not enough stock for {product.name}."}
                )

        total = sum(
            (products[line["product"].pk].unit_price * line["quantity"] for line in lines),
            start=Decimal("0.00"),
        )
        amount_paid = validated_data["amount_paid"]
        if amount_paid < total:
            raise serializers.ValidationError(
                {"amount_paid": f"Payment must be at least {total:.2f}."}
            )
        if (
            validated_data["payment_method"] == Sale.PaymentMethod.BANK_TRANSFER
            and amount_paid != total
        ):
            raise serializers.ValidationError(
                {"amount_paid": "Bank transfer amount must match the sale total."}
            )
        customer_name = validated_data["customer_name"]
        customer = Customer.objects.filter(name__iexact=customer_name).first()
        if customer is None:
            customer = Customer.objects.create(name=customer_name)
        sale = Sale.objects.create(
            total=total,
            customer=customer,
            customer_name=customer.name,
            amount_paid=amount_paid,
            change_due=amount_paid - total,
            payment_method=validated_data["payment_method"],
            payment_account=validated_data.get("payment_account", "").strip(),
            created_by=self.context["request"].user,
        )
        for line in lines:
            product = products[line["product"].pk]
            quantity = line["quantity"]
            SaleItem.objects.create(
                sale=sale,
                product=product,
                quantity=quantity,
                empty_returned=line["empty_returned"],
                unit_price=product.unit_price,
                unit_cost=product.average_unit_cost,
            )
            Product.objects.filter(pk=product.pk).update(
                stock_quantity=F("stock_quantity") - quantity
            )
            InventoryMovement.objects.create(
                product=product,
                direction=InventoryMovement.Direction.OUT,
                stock_type=InventoryMovement.StockType.FILLED,
                quantity=quantity,
                created_by=self.context["request"].user,
            )
            if line["empty_returned"]:
                Product.objects.filter(pk=product.pk).update(
                    empty_stock_quantity=F("empty_stock_quantity") + line["empty_returned"]
                )
                InventoryMovement.objects.create(
                    product=product,
                    direction=InventoryMovement.Direction.IN,
                    stock_type=InventoryMovement.StockType.EMPTY,
                    quantity=line["empty_returned"],
                    created_by=self.context["request"].user,
                )
        return sale
