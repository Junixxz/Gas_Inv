from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase


User = get_user_model()


class UserRoleAccessTests(APITestCase):
    def setUp(self):
        self.superadmin = User.objects.create_user(
            username="root", password="SafePassword!274", role=User.Role.SUPERADMIN
        )
        self.head = User.objects.create_user(
            username="head", password="SafePassword!274", role=User.Role.HEAD
        )
        self.staff = User.objects.create_user(
            username="staff", password="SafePassword!274", role=User.Role.STAFF
        )

    def test_staff_cannot_manage_users(self):
        self.client.force_authenticate(self.staff)

        self.assertEqual(self.client.get("/api/users/").status_code, 403)
        self.assertEqual(
            self.client.post(
                "/api/users/",
                {"username": "new-user", "password": "AnotherSafe!275", "role": "staff"},
            ).status_code,
            403,
        )

    def test_head_can_manage_users_but_cannot_create_superadmin(self):
        self.client.force_authenticate(self.head)

        response = self.client.get("/api/users/")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn(self.superadmin.username, [user["username"] for user in response.data])

        response = self.client.post(
            "/api/users/",
            {"username": "new-admin", "password": "AnotherSafe!275", "role": "superadmin"},
        )
        self.assertEqual(response.status_code, 400)

    def test_superadmin_can_see_all_users(self):
        self.client.force_authenticate(self.superadmin)

        response = self.client.get("/api/users/")

        self.assertEqual(response.status_code, 200)
        self.assertIn(self.superadmin.username, [user["username"] for user in response.data])

    def test_superadmin_can_create_users(self):
        self.client.force_authenticate(self.superadmin)

        response = self.client.post(
            "/api/users/",
            {"username": "new-staff", "role": "staff"},
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["role"], User.Role.STAFF)
        temporary_password = response.data["temporary_password"]
        new_user = User.objects.get(username="new-staff")
        self.assertTrue(new_user.must_change_password)
        self.assertTrue(new_user.check_password(temporary_password))
        self.assertGreaterEqual(len(temporary_password), 20)

    def test_head_can_view_but_cannot_modify_superadmin_accounts(self):
        self.client.force_authenticate(self.head)

        self.assertEqual(self.client.get(f"/api/users/{self.superadmin.id}/").status_code, 200)
        response = self.client.patch(
            f"/api/users/{self.superadmin.id}/",
            {"first_name": "Changed"},
        )

        self.assertEqual(response.status_code, 403)
        self.superadmin.refresh_from_db()
        self.assertEqual(self.superadmin.first_name, "")

    def test_superadmin_can_edit_member_and_disable_account(self):
        self.client.force_authenticate(self.superadmin)
        response = self.client.patch(
            f"/api/users/{self.staff.id}/",
            {"first_name": "New", "last_name": "Name", "role": "head", "is_active": False},
        )

        self.assertEqual(response.status_code, 200)
        self.staff.refresh_from_db()
        self.assertEqual(self.staff.first_name, "New")
        self.assertEqual(self.staff.last_name, "Name")
        self.assertEqual(self.staff.role, User.Role.HEAD)
        self.assertFalse(self.staff.is_active)

    def test_password_reset_sets_temporary_password_and_requires_change(self):
        self.client.force_authenticate(self.superadmin)
        self.staff.set_password("PreviousPassword!394")
        self.staff.must_change_password = False
        self.staff.save()

        response = self.client.post(f"/api/users/{self.staff.id}/reset-password/")

        self.assertEqual(response.status_code, 200)
        temporary_password = response.data["temporary_password"]
        self.staff.refresh_from_db()
        self.assertTrue(self.staff.check_password(temporary_password))
        self.assertFalse(self.staff.check_password("PreviousPassword!394"))
        self.assertTrue(self.staff.must_change_password)

    def test_superadmin_cannot_disable_self_or_change_own_role(self):
        self.client.force_authenticate(self.superadmin)

        disable_response = self.client.patch(
            f"/api/users/{self.superadmin.id}/",
            {"is_active": False},
        )
        demote_response = self.client.patch(
            f"/api/users/{self.superadmin.id}/",
            {"role": "head"},
        )

        self.assertEqual(disable_response.status_code, 400)
        self.assertEqual(demote_response.status_code, 400)
        self.superadmin.refresh_from_db()
        self.assertTrue(self.superadmin.is_active)
        self.assertEqual(self.superadmin.role, User.Role.SUPERADMIN)

    def test_temporary_password_change_is_required_and_clears_flag(self):
        self.client.force_authenticate(self.staff)
        self.assertTrue(self.staff.must_change_password)

        response = self.client.post(
            "/api/auth/change-password/",
            {
                "current_password": "SafePassword!274",
                "new_password": "FreshPassword!927",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["must_change_password"])
        self.staff.refresh_from_db()
        self.assertFalse(self.staff.must_change_password)
        self.assertTrue(self.staff.check_password("FreshPassword!927"))

    def test_wrong_temporary_password_does_not_change_account(self):
        self.client.force_authenticate(self.staff)

        response = self.client.post(
            "/api/auth/change-password/",
            {
                "current_password": "WrongPassword!274",
                "new_password": "FreshPassword!927",
            },
        )

        self.assertEqual(response.status_code, 400)
        self.staff.refresh_from_db()
        self.assertTrue(self.staff.must_change_password)
