from decimal import Decimal

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from business.models import (
    Customer,
    DailyClosing,
    DailyClosingDeposit,
    DailyClosingStockCount,
    Expense,
    InventoryMovement,
    Product,
    Purchase,
    Sale,
    SaleItem,
)


User = get_user_model()


class InventoryMovementTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="staff", role=User.Role.STAFF)
        self.product = Product.objects.create(
            name="LPG 11kg", sku="LPG-11", unit_price="800.00", stock_quantity=3
        )
        self.client.force_authenticate(self.user)

    def test_movement_updates_stock_and_prevents_negative_inventory(self):
        rejected = self.client.post(
            "/api/inventory-movements/",
            {"product": self.product.id, "direction": "out", "quantity": 4},
        )
        self.assertEqual(rejected.status_code, 400)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 3)

        accepted = self.client.post(
            "/api/inventory-movements/",
            {"product": self.product.id, "direction": "in", "quantity": 2},
        )
        self.assertEqual(accepted.status_code, 201)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 5)

    def test_empty_cylinder_movement_updates_separate_count(self):
        rejected = self.client.post(
            "/api/inventory-movements/",
            {
                "product": self.product.id,
                "direction": "out",
                "stock_type": "empty",
                "quantity": 1,
            },
        )
        self.assertEqual(rejected.status_code, 400)

        response = self.client.post(
            "/api/inventory-movements/",
            {
                "product": self.product.id,
                "direction": "in",
                "stock_type": "empty",
                "quantity": 3,
            },
        )

        self.assertEqual(response.status_code, 201)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 3)
        self.assertEqual(self.product.empty_stock_quantity, 3)

    def test_product_sku_is_generated_and_empty_stock_starts_at_zero(self):
        response = self.client.post(
            "/api/products/",
            {
                "name": "Butane 210ml",
                "unit_price": "125.00",
                "stock_quantity": 4,
                "empty_stock_quantity": 6,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["empty_stock_quantity"], 0)
        expected_prefix = f"BUTANE-210ML-{timezone.localdate():%Y%m%d}"
        self.assertTrue(response.data["sku"].startswith(expected_prefix))

    def test_duplicate_product_names_get_unique_sku_suffixes(self):
        first = self.client.post(
            "/api/products/",
            {"name": "Butane 210ml", "unit_price": "125.00", "stock_quantity": 4},
            format="json",
        )
        second = self.client.post(
            "/api/products/",
            {"name": "Butane 210ml", "unit_price": "125.00", "stock_quantity": 4},
            format="json",
        )

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)
        self.assertNotEqual(first.data["sku"], second.data["sku"])


class DashboardTests(APITestCase):
    def test_dashboard_returns_seven_sales_days(self):
        user = User.objects.create_user(username="staff", role=User.Role.STAFF)
        self.client.force_authenticate(user)

        response = self.client.get("/api/dashboard/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["sales_chart"]), 7)
        self.assertIn("low_stock", response.data["metrics"])

    def test_dashboard_totals_all_supplier_purchases_separately_from_expenses(self):
        user = User.objects.create_user(username="owner", role=User.Role.HEAD)
        self.client.force_authenticate(user)
        Purchase.objects.create(
            supplier="Refill Supplier",
            purchase_type=Purchase.PurchaseType.REFILL,
            total="400.00",
        )
        Purchase.objects.create(
            supplier="Stock Supplier",
            purchase_type=Purchase.PurchaseType.STOCK,
            total="500.00",
        )
        Expense.objects.create(description="Shop rent", amount="100.00")

        response = self.client.get("/api/dashboard/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["metrics"]["supplier_purchase_total"], Decimal("900.00"))
        self.assertEqual(response.data["metrics"]["expenses"], Decimal("100.00"))


class PeriodicReportTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="reporter", role=User.Role.STAFF)
        self.product = Product.objects.create(
            name="LPG 11kg", sku="LPG-11", unit_price="800.00", stock_quantity=3
        )
        self.client.force_authenticate(self.user)

    def test_day_report_summarizes_sales_and_supplier_orders(self):
        sale = Sale.objects.create(total="1600.00", created_by=self.user)
        SaleItem.objects.create(
            sale=sale,
            product=self.product,
            quantity=2,
            empty_returned=1,
            unit_price="800.00",
            unit_cost="600.00",
        )
        Purchase.objects.create(
            supplier="Local Supplier",
            total="1250.00",
            created_by=self.user,
        )
        closing = DailyClosing.objects.create(
            report_date=timezone.localdate(),
            actual_cash_count="1500.00",
            additional_cash_amount="100.00",
        )
        DailyClosingDeposit.objects.create(
            closing=closing,
            account_name="Main bank",
            amount="200.00",
        )

        response = self.client.get(
            "/api/reports/periodic/",
            {"period": "day", "date": timezone.localdate().isoformat()},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["sales_count"], 1)
        self.assertEqual(response.data["sales_total"], "1600.00")
        self.assertEqual(response.data["filled_cylinders_sold"], 2)
        self.assertEqual(response.data["empty_cylinders_returned"], 1)
        self.assertTrue(response.data["profit_complete"])
        self.assertEqual(response.data["profit_total"], "400.00")
        self.assertEqual(response.data["purchase_order_count"], 1)
        self.assertEqual(response.data["purchase_total"], "1250.00")
        self.assertEqual(
            response.data["suppliers"],
            [{"supplier": "Local Supplier", "orders": 1, "total": "1250.00"}],
        )
        self.assertEqual(response.data["payment_summary"][0]["method"], "cash")
        self.assertEqual(response.data["daily_sales"][0]["items"][0]["sku"], "LPG-11")
        self.assertEqual(response.data["purchase_records"][0]["supplier"], "Local Supplier")
        self.assertEqual(response.data["closing_totals"]["expected_cash_on_hand"], "1500.00")
        self.assertEqual(response.data["closing_totals"]["cash_difference"], "0.00")

    def test_report_rejects_invalid_period(self):
        response = self.client.get(
            "/api/reports/periodic/",
            {"period": "year", "date": timezone.localdate().isoformat()},
        )

        self.assertEqual(response.status_code, 400)

    def test_report_separates_refill_purchase_cost_from_expenses(self):
        Purchase.objects.create(
            supplier="Refill Supplier",
            purchase_type=Purchase.PurchaseType.REFILL,
            total="400.00",
        )

        response = self.client.get(
            "/api/reports/periodic/",
            {"period": "day", "date": timezone.localdate().isoformat()},
        )

        self.assertEqual(response.data["purchase_total"], "400.00")
        self.assertEqual(response.data["refill_purchase_total"], "400.00")
        self.assertEqual(Expense.objects.count(), 0)

    def test_week_and_month_reports_cover_the_full_period(self):
        week = self.client.get(
            "/api/reports/periodic/",
            {"period": "week", "date": "2026-03-11"},
        )
        month = self.client.get(
            "/api/reports/periodic/",
            {"period": "month", "date": "2026-03-11"},
        )

        self.assertEqual(
            (week.data["start_date"].isoformat(), week.data["end_date"].isoformat()),
            ("2026-03-09", "2026-03-15"),
        )
        self.assertEqual(
            (month.data["start_date"].isoformat(), month.data["end_date"].isoformat()),
            ("2026-03-01", "2026-03-31"),
        )


class PointOfSaleTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="cashier", role=User.Role.STAFF)
        self.product = Product.objects.create(
            name="LPG 11kg", sku="LPG-11", unit_price="800.00", stock_quantity=3
        )
        self.client.force_authenticate(self.user)

    def test_checkout_creates_sale_and_decrements_inventory(self):
        response = self.client.post(
            "/api/checkout/",
            {
                "items": [{"product": self.product.id, "quantity": 2}],
                "customer_name": "Alex Customer",
                "amount_paid": "2000.00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["total"], "1600.00")
        self.assertEqual(response.data["customer_name"], "Alex Customer")
        self.assertEqual(response.data["amount_paid"], "2000.00")
        self.assertEqual(response.data["change_due"], "400.00")
        sale = Sale.objects.get()
        self.assertEqual(sale.customer_name, "Alex Customer")
        self.assertEqual(sale.customer.name, "Alex Customer")
        self.assertEqual(sale.amount_paid, Decimal("2000.00"))
        self.assertEqual(sale.change_due, Decimal("400.00"))
        self.assertEqual(response.data["items"][0]["product_name"], "LPG 11kg")
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 1)
        self.assertEqual(Sale.objects.count(), 1)
        self.assertEqual(SaleItem.objects.count(), 1)
        self.assertEqual(InventoryMovement.objects.count(), 1)

    def test_checkout_records_payment_method_and_cost_snapshot(self):
        self.product.average_unit_cost = Decimal("600.00")
        self.product.save()
        response = self.client.post(
            "/api/checkout/",
            {
                "items": [{"product": self.product.id, "quantity": 1}],
                "customer_name": "Alex Customer",
                "amount_paid": "800.00",
                "payment_method": "bank_transfer",
                "payment_account": "Planta Bank",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["payment_method"], "bank_transfer")
        self.assertEqual(response.data["payment_account"], "Planta Bank")
        self.assertEqual(response.data["items"][0]["unit_cost"], "600.00")

    def test_bank_transfer_must_match_sale_total(self):
        response = self.client.post(
            "/api/checkout/",
            {
                "items": [{"product": self.product.id, "quantity": 1}],
                "customer_name": "Alex Customer",
                "amount_paid": "1000.00",
                "payment_method": "bank_transfer",
                "payment_account": "Planta Bank",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(Sale.objects.count(), 0)

    def test_checkout_records_empty_cylinders_without_changing_price(self):
        response = self.client.post(
            "/api/checkout/",
            {
                "items": [
                    {"product": self.product.id, "quantity": 2, "empty_returned": 1}
                ],
                "customer_name": "Alex Customer",
                "amount_paid": "1600.00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["total"], "1600.00")
        self.assertEqual(response.data["items"][0]["empty_returned"], 1)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 1)
        self.assertEqual(self.product.empty_stock_quantity, 1)
        self.assertEqual(InventoryMovement.objects.count(), 2)
        empty_movement = InventoryMovement.objects.get(stock_type="empty")
        self.assertEqual(empty_movement.direction, InventoryMovement.Direction.IN)
        self.assertEqual(empty_movement.quantity, 1)

    def test_checkout_rejects_more_empty_cylinders_than_products_sold(self):
        response = self.client.post(
            "/api/checkout/",
            {
                "items": [
                    {"product": self.product.id, "quantity": 1, "empty_returned": 2}
                ],
                "customer_name": "Alex Customer",
                "amount_paid": "800.00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(Sale.objects.count(), 0)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 3)
        self.assertEqual(self.product.empty_stock_quantity, 0)
        self.assertEqual(InventoryMovement.objects.count(), 0)

    def test_checkout_reuses_customer_and_tracks_total_paid(self):
        Customer.objects.create(name="Alex Customer")

        response = self.client.post(
            "/api/checkout/",
            {
                "items": [{"product": self.product.id, "quantity": 1}],
                "customer_name": "alex customer",
                "amount_paid": "1000.00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(Customer.objects.count(), 1)
        self.assertEqual(response.data["customer_name"], "Alex Customer")
        customer = self.client.get("/api/customers/").data[0]
        self.assertEqual(customer["sales_count"], 1)
        self.assertEqual(customer["total_paid"], "1000.00")

    def test_checkout_rejects_insufficient_stock_without_partial_sale(self):
        response = self.client.post(
            "/api/checkout/",
            {
                "items": [{"product": self.product.id, "quantity": 4}],
                "customer_name": "Alex Customer",
                "amount_paid": "4000.00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 3)

    def test_checkout_rejects_payment_below_total_without_changing_stock(self):
        response = self.client.post(
            "/api/checkout/",
            {
                "items": [{"product": self.product.id, "quantity": 2}],
                "customer_name": "Alex Customer",
                "amount_paid": "1000.00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(Sale.objects.count(), 0)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 3)
        self.assertEqual(Sale.objects.count(), 0)
        self.assertEqual(InventoryMovement.objects.count(), 0)

    def test_checkout_rejects_payment_below_total_without_sale(self):
        response = self.client.post(
            "/api/checkout/",
            {
                "items": [{"product": self.product.id, "quantity": 2}],
                "customer_name": "Alex Customer",
                "amount_paid": "1000.00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(Sale.objects.count(), 0)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 3)


class CustomerApiTests(APITestCase):
    def test_customer_can_be_created_and_listed(self):
        user = User.objects.create_user(username="staff", role=User.Role.STAFF)
        self.client.force_authenticate(user)

        created = self.client.post(
            "/api/customers/",
            {"name": "Sample Customer", "phone": "09170000000", "email": "customer@example.com"},
            format="json",
        )

        self.assertEqual(created.status_code, 201)
        self.assertEqual(Customer.objects.count(), 1)
        self.assertEqual(self.client.get("/api/customers/").data[0]["name"], "Sample Customer")

    def test_purchase_supplier_is_returned(self):
        user = User.objects.create_user(username="buyer", role=User.Role.STAFF)
        product = Product.objects.create(
            name="LPG 11kg",
            sku="LPG-11",
            unit_price="800.00",
            average_unit_cost="500.00",
            stock_quantity=3,
        )
        self.client.force_authenticate(user)

        response = self.client.post(
            "/api/purchases/",
            {
                "supplier": "Local Supplier",
                "items": [
                    {
                        "product": product.id,
                        "stock_type": "filled",
                        "quantity": 2,
                        "unit_cost": "625.00",
                    }
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(Purchase.objects.get().supplier, "Local Supplier")
        self.assertEqual(response.data["total"], "1250.00")
        product.refresh_from_db()
        self.assertEqual(product.stock_quantity, 5)
        self.assertEqual(product.average_unit_cost, Decimal("550.00"))


class DailyClosingTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="closer", role=User.Role.HEAD)
        self.product = Product.objects.create(
            name="LPG 11kg", sku="LPG-11", unit_price="800.00", stock_quantity=3
        )
        self.client.force_authenticate(self.user)
        self.report_date = timezone.localdate()

    def test_daily_closing_saves_deposits_and_stock_counts(self):
        response = self.client.put(
            f"/api/reports/daily-closing/?date={self.report_date.isoformat()}",
            {
                "additional_cash_label": "Cash .50",
                "additional_cash_amount": "2520.00",
                "actual_cash_count": "100.00",
                "crate_count": 12,
                "floor_cans_count": 24,
                "prepared_by_name": "Prepared",
                "checked_by_name": "Checked",
                "notes": "",
                "deposits": [{"account_name": "99GAS", "amount": "50.00"}],
                "floor_stocks": [{"label": "LJ crates", "quantity": 1250}],
                "stock_counts": [
                    {"product": self.product.id, "filled_quantity": 2, "empty_quantity": 1}
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(DailyClosing.objects.count(), 1)
        self.assertEqual(DailyClosingDeposit.objects.get().account_name, "99GAS")
        self.assertEqual(response.data["floor_stocks"][0]["label"], "LJ crates")
        self.assertEqual(DailyClosingStockCount.objects.get().filled_quantity, 2)


class ProductArchiveTests(APITestCase):
    def setUp(self):
        self.product = Product.objects.create(
            name="LPG 11kg", sku="LPG-11", unit_price="800.00", stock_quantity=3
        )

    def test_head_can_archive_and_restore_without_deleting_product(self):
        head = User.objects.create_user(username="head", role=User.Role.HEAD)
        self.client.force_authenticate(head)

        archived = self.client.post(f"/api/products/{self.product.id}/archive/")

        self.assertEqual(archived.status_code, 200)
        self.assertFalse(archived.data["is_active"])
        self.assertEqual(self.client.get("/api/products/").data, [])
        self.assertFalse(
            self.client.get("/api/products/?include_archived=true").data[0]["is_active"]
        )
        self.assertEqual(Product.objects.count(), 1)

        restored = self.client.post(f"/api/products/{self.product.id}/restore/")

        self.assertEqual(restored.status_code, 200)
        self.assertTrue(restored.data["is_active"])

    def test_staff_cannot_archive_product(self):
        staff = User.objects.create_user(username="staff", role=User.Role.STAFF)
        self.client.force_authenticate(staff)

        response = self.client.post(f"/api/products/{self.product.id}/archive/")

        self.assertEqual(response.status_code, 403)
        self.product.refresh_from_db()
        self.assertTrue(self.product.is_active)

    def test_superadmin_can_archive_product(self):
        superadmin = User.objects.create_user(
            username="root", role=User.Role.SUPERADMIN
        )
        self.client.force_authenticate(superadmin)

        response = self.client.post(f"/api/products/{self.product.id}/archive/")

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["is_active"])

    def test_staff_cannot_permanently_delete_a_product(self):
        staff = User.objects.create_user(username="staff", role=User.Role.STAFF)
        self.client.force_authenticate(staff)

        response = self.client.delete(f"/api/products/{self.product.id}/")

        self.assertEqual(response.status_code, 405)
        self.assertTrue(Product.objects.filter(pk=self.product.pk).exists())

    def test_archived_product_cannot_be_sold_or_purchased(self):
        head = User.objects.create_user(username="head", role=User.Role.HEAD)
        self.client.force_authenticate(head)
        self.client.post(f"/api/products/{self.product.id}/archive/")

        sale = self.client.post(
            "/api/checkout/",
            {
                "items": [{"product": self.product.id, "quantity": 1}],
                "customer_name": "Archived product test",
                "amount_paid": "800.00",
            },
            format="json",
        )
        purchase = self.client.post(
            "/api/purchases/",
            {
                "supplier": "Supplier",
                "items": [
                    {"product": self.product.id, "quantity": 1, "unit_cost": "500.00"}
                ],
            },
            format="json",
        )

        self.assertEqual(sale.status_code, 400)
        self.assertEqual(purchase.status_code, 400)

    def test_archived_product_cannot_record_stock_movement(self):
        head = User.objects.create_user(username="movement-head", role=User.Role.HEAD)
        self.client.force_authenticate(head)
        self.client.post(f"/api/products/{self.product.id}/archive/")

        response = self.client.post(
            "/api/inventory-movements/",
            {
                "product": self.product.id,
                "stock_type": "filled",
                "direction": "in",
                "quantity": 1,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)

    def test_archived_product_cannot_have_average_cost_updated(self):
        head = User.objects.create_user(username="cost-head", role=User.Role.HEAD)
        self.client.force_authenticate(head)
        self.client.post(f"/api/products/{self.product.id}/archive/")

        response = self.client.patch(
            f"/api/products/{self.product.id}/",
            {"average_unit_cost": "600.00"},
            format="json",
        )

        self.assertEqual(response.status_code, 404)


class CylinderRefillTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="buyer", role=User.Role.STAFF)
        self.product = Product.objects.create(
            name="LPG 11kg",
            sku="LPG-11",
            unit_price="800.00",
            average_unit_cost="500.00",
            stock_quantity=3,
            empty_stock_quantity=4,
        )
        self.client.force_authenticate(self.user)

    def test_refill_converts_empty_stock_to_filled_at_weighted_average_cost(self):
        response = self.client.post(
            "/api/purchases/",
            {
                "supplier": "Refill Supplier",
                "purchase_type": "refill",
                "items": [
                    {
                        "product": self.product.id,
                        "quantity": 2,
                        "unit_cost": "200.00",
                    }
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["purchase_type"], "refill")
        self.assertEqual(response.data["total"], "400.00")
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 5)
        self.assertEqual(self.product.empty_stock_quantity, 2)
        self.assertEqual(self.product.average_unit_cost, Decimal("380.00"))
        self.assertEqual(Expense.objects.count(), 0)
        self.assertEqual(
            InventoryMovement.objects.filter(direction="out", stock_type="empty").get().quantity,
            2,
        )
        self.assertEqual(
            InventoryMovement.objects.filter(direction="in", stock_type="filled").get().quantity,
            2,
        )

    def test_refill_is_rejected_when_empty_stock_is_insufficient(self):
        self.product.empty_stock_quantity = 1
        self.product.save()

        response = self.client.post(
            "/api/purchases/",
            {
                "supplier": "Refill Supplier",
                "purchase_type": "refill",
                "items": [
                    {
                        "product": self.product.id,
                        "quantity": 2,
                        "unit_cost": "200.00",
                    }
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(Purchase.objects.count(), 0)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 3)
        self.assertEqual(self.product.empty_stock_quantity, 1)
