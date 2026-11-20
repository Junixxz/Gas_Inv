from django.contrib import admin

from business.models import Customer, Expense, InventoryMovement, Product, Purchase, Sale, SaleItem


admin.site.register([Product, Customer, InventoryMovement, Sale, SaleItem, Purchase, Expense])
