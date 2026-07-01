/* eslint-disable no-console */
const dbm = require("../db");
const {
  countAdminUsers,
  fetchUserDeleteTarget,
  assertCanDeleteUser,
  permanentlyDeleteUser,
  permanentlyDeleteUsers,
  validateAdminUpdateUserBody,
  validateAdminCreateUserBody
} = require("../lib/admin-users");

async function main() {
  const db = dbm.openDb();
  const adminCount = await countAdminUsers(db, dbm);
  console.log("admin count:", adminCount);

  const validation = validateAdminUpdateUserBody({
    name: "Test",
    email: "test@example.com",
    role: "customer",
    status: "active",
    phone: "+96812345678"
  });
  console.log("validate update with phone:", validation.ok, validation.data.phone);

  const dupEmail = validateAdminCreateUserBody({
    name: "X",
    email: "admin@local.test",
    password: "password1",
    confirmPassword: "password1",
    role: "customer"
  });
  console.log("create validation (existing email format ok):", dupEmail.ok);

  const disabled = await fetchUserDeleteTarget(db, dbm, 4);
  if (disabled) {
    console.log("user #4:", disabled.email, "active=", disabled.active);
    try {
      assertCanDeleteUser({ id: 999 }, disabled, adminCount);
      console.log("assertCanDeleteUser passed for non-self");
    } catch (e) {
      console.log("assertCanDeleteUser failed:", e.message);
    }
  }

  const fakeAdmin = { id: 1, role: "admin" };
  if (adminCount <= 1) {
    try {
      assertCanDeleteUser(fakeAdmin, { id: 1, role: "admin" }, adminCount);
      console.log("ERROR: should block last admin self-delete");
    } catch (e) {
      console.log("last admin self-delete blocked:", e.message);
    }
  }

  await dbm.closeDb(db);
  console.log("ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
