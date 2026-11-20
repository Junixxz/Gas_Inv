from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("business", "0005_sale_customer"),
    ]

    operations = [
        migrations.AddField(
            model_name="product",
            name="empty_stock_quantity",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="inventorymovement",
            name="stock_type",
            field=models.CharField(
                choices=[("filled", "Filled"), ("empty", "Empty")],
                default="filled",
                max_length=6,
            ),
        ),
        migrations.AddField(
            model_name="saleitem",
            name="empty_returned",
            field=models.PositiveIntegerField(default=0),
        ),
    ]
