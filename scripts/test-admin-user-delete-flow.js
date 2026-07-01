/* eslint-disable no-console */
/**
 * Integration test: create disabled user with shop + dependencies, delete, confirm removed.
 */
const dbm = require("../db");
const { hashPassword } = require("../auth");
const {
  permanentlyDeleteUser,
  buildUsersListSql,
  normalizeAdminUserRow,
  parseAdminUsersQuery
} = require("../lib/admin-users");

async function userVisibleInAdminList(db, dbm, userId, email) {
  const params = parseAdminUsersQuery({ status: "all", q: email });
  const { whereSql, sqlParams, baseFrom, selectSql } = buildUsersListSql(params);
  const rows = await dbm.all(
    db,
    `${selectSql} ${baseFrom} ${whereSql} ORDER BY u.id DESC`,
    sqlParams
  );
  return rows.some((r) => Number(r.id) === Number(userId));
}

async function main() {
  const db = dbm.openDb();
  await dbm.migrate(db);

  const email = `delete-test-${Date.now()}@example.com`;
  const passHash = await hashPassword("testpass123");

  await dbm.run(db, "BEGIN");
  const shopIns = await dbm.run(
    db,
    "INSERT INTO shops (name, slug, location_text, address, phone, active) VALUES (?, ?, '', '', '', 1)",
    ["Delete Test Shop", `delete-test-${Date.now()}`]
  );
  const userIns = await dbm.run(
    db,
    "INSERT INTO users (email, password_hash, role, shop_id, active) VALUES (?, ?, 'shop', ?, 0)",
    [email, passHash, shopIns.lastID]
  );
  const mp = await dbm.get(db, "SELECT id FROM master_products LIMIT 1");
  if (mp) {
    await dbm.run(
      db,
      "INSERT INTO shop_listings (shop_id, master_product_id, capacity_ltr, price_amount, currency, available) VALUES (?, ?, 1, 10, 'OMR', 1)",
      [shopIns.lastID, mp.id]
    );
  }
  await dbm.run(
    db,
    `INSERT INTO business_applications (user_id, account_type, company_name, contact_name, phone, location_text, document_url, terms_signature, status)
     VALUES (?, 'shop', 'Co', 'Contact', '', '', '', '', 'approved')`,
    [userIns.lastID]
  );
  await dbm.run(db, "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now', '+1 day'))", [
    `tok-${Date.now()}`,
    userIns.lastID
  ]);
  await dbm.run(
    db,
    `INSERT INTO moderation_reports (reporter_user_id, report_type, target_type, message, status)
     VALUES (?, 'spam', 'shop', 'test report', 'open')`,
    [userIns.lastID]
  );
  await dbm.run(db, "COMMIT");

  console.log("created user", userIns.lastID, "shop", shopIns.lastID, "email", email);

  const visibleBefore = await userVisibleInAdminList(db, dbm, userIns.lastID, email);
  console.log("visible in admin list before delete:", visibleBefore);
  if (!visibleBefore) {
    console.error("FAIL: test user not visible before delete");
    process.exitCode = 1;
    await dbm.closeDb(db);
    return;
  }

  try {
    const result = await permanentlyDeleteUser(db, dbm, userIns.lastID);
    console.log("DELETE OK", result.shopResult?.shopDeleted ? "(shop removed)" : "");
  } catch (e) {
    console.error("DELETE FAILED:", e.message, e.status, e.code);
    process.exitCode = 1;
    await dbm.closeDb(db);
    return;
  }

  const userLeft = await dbm.get(db, "SELECT id FROM users WHERE id = ?", [userIns.lastID]);
  const shopLeft = await dbm.get(db, "SELECT id FROM shops WHERE id = ?", [shopIns.lastID]);
  const visibleAfter = await userVisibleInAdminList(db, dbm, userIns.lastID, email);

  console.log("user in db?", Boolean(userLeft), "shop in db?", Boolean(shopLeft));
  console.log("visible in admin list after delete:", visibleAfter);

  if (userLeft || shopLeft || visibleAfter) {
    console.error("FAIL: user or shop still present after delete");
    process.exitCode = 1;
  } else {
    console.log("PASS: user delete flow complete");
  }

  await dbm.closeDb(db);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
