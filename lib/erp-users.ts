import { getMssqlPool, sql } from "@/lib/mssql"
import { prisma } from "@/lib/prisma"

/**
 * Employee identity sourced from the MSSQL ERP `Users` table.
 *
 * Employees are NOT stored in the Prisma/MySQL database anymore — the ERP is the
 * single source of truth. Passwords are encrypted with EncryptByPassPhrase using
 * the passphrase in MSSQL_USER_PASSWORD_PASSPHRASE and verified in-DB via
 * DecryptByPassPhrase (see `authenticateErpUser`). New employees are created /
 * reset through the `dbo.sp_users` stored procedure.
 */

export type ErpRole = "admin" | "staff"

export interface ErpEmployeePermissions {
  canAddProducts: boolean
  canEditProducts: boolean
  canDeleteProducts: boolean
  canViewProducts: boolean
  canViewOrders: boolean
  canUpdateOrders: boolean
  canDeleteOrders: boolean
  canViewPricesInDashboard: boolean
  canViewPricesOnWebsite: boolean
  canManageDiscountCodes: boolean
  canManageOffers: boolean
}

/**
 * Unified employee object. Kept shape-compatible with the previous Prisma
 * `Employee` model (id/fullName/email/username/role/isActive + permission flags)
 * so existing route guards and the dashboard keep working, plus the ERP-specific
 * identifiers (repId/branchId/cashId/cashName).
 */
export interface ErpEmployee extends ErpEmployeePermissions {
  id: string
  fullName: string
  email: string
  username: string
  phone: string | null
  role: ErpRole
  isActive: boolean
  repId: number | null
  branchId: number | null
  cashId: number | null
  cashName: string | null
  // Compatibility fields some callers read:
  tokenVersion: number
  createdAt: string | null
  updatedAt: string | null
}

const ALL_TRUE: ErpEmployeePermissions = {
  canAddProducts: true,
  canEditProducts: true,
  canDeleteProducts: true,
  canViewProducts: true,
  canViewOrders: true,
  canUpdateOrders: true,
  canDeleteOrders: true,
  canViewPricesInDashboard: true,
  canViewPricesOnWebsite: true,
  canManageDiscountCodes: true,
  canManageOffers: true,
}

/**
 * Default permission set for non-admin staff. The ERP `Users` table has no
 * per-permission columns, so we derive a sensible operational set: staff can
 * browse products, see prices and place/update orders, but cannot delete or
 * manage discount codes / offers. Admins bypass all of these.
 */
const STAFF_PERMISSIONS: ErpEmployeePermissions = {
  canAddProducts: false,
  canEditProducts: false,
  canDeleteProducts: false,
  canViewProducts: true,
  canViewOrders: true,
  canUpdateOrders: true,
  canDeleteOrders: false,
  canViewPricesInDashboard: true,
  canViewPricesOnWebsite: true,
  canManageDiscountCodes: false,
  canManageOffers: false,
}

function getPassphrase(): string {
  const pp = process.env.MSSQL_USER_PASSWORD_PASSPHRASE
  if (!pp) throw new Error("MSSQL_USER_PASSWORD_PASSPHRASE is not set")
  return pp
}

/** Derive role from ERP user. Only User_Name='ADMIN' is admin; everyone else is staff. */
export function deriveRole(userName: string | null | undefined, _groupId?: number | null): ErpRole {
  if ((userName || "").trim().toUpperCase() === "ADMIN") return "admin"
  return "staff"
}

/** Build the unified employee object from a raw `Users` row + optional MySQL permissions. */
function buildEmployee(row: any, mysqlPerms?: ErpEmployeePermissions | null): ErpEmployee {
  const role = deriveRole(row.User_Name, row.Group_ID)
  // Admins always get all permissions. Staff get MySQL-stored perms if available,
  // otherwise fall back to STAFF_PERMISSIONS defaults.
  const perms = role === "admin" ? ALL_TRUE : (mysqlPerms ?? STAFF_PERMISSIONS)
  return {
    id: String(row.ID),
    fullName: row.User_Name || "",
    email: row.User_Email || "",
    username: row.User_Name || "",
    phone: row.Emp_Tel || null,
    role,
    isActive: row.Active === true || row.Active === 1,
    repId: row.RepID ?? null,
    branchId: row.BranchID ?? null,
    cashId: row.CashID ?? null,
    cashName: row.CashName ?? null,
    tokenVersion: 0,
    createdAt: row.AddedDate ? new Date(row.AddedDate).toISOString() : null,
    updatedAt: row.LastUpdate ? new Date(row.LastUpdate).toISOString() : null,
    ...perms,
  }
}

const USER_SELECT_COLUMNS = `
  U.ID, U.User_Name, U.User_Email, U.Emp_Tel, U.RepID, U.BranchID, U.CashID,
  U.Active, U.Group_ID, U.AddedDate, U.LastUpdate, C.CashName
`

/**
 * Verify employee credentials against the MSSQL ERP. Returns the employee on
 * success or null on failure (unknown user, wrong password, or inactive).
 * Passwords created with an older passphrase decrypt to NULL and therefore fail
 * — those users must be reset with the current passphrase.
 */
// Passphrases tried in order when authenticating. Old ERP users use the primary
// passphrase; users created via the admin panel (sp_users) use the secondary.
const AUTH_PASSPHRASES = [
  getPassphrase,                       // ashrafwadeeisgood#122 — real ERP users
  () => "WebsiteEmployeeKey2026",      // sp_users-created accounts
]

export async function authenticateErpUser(
  username: string,
  password: string
): Promise<ErpEmployee | null> {
  const pool = await getMssqlPool()

  for (const getPhrase of AUTH_PASSPHRASES) {
    let phrase: string
    try { phrase = getPhrase() } catch { continue }

    const result = await pool
      .request()
      .input("user_name", sql.NVarChar, username)
      .input("user_pass", sql.NVarChar, password)
      .input("passphrase", sql.NVarChar, phrase)
      .query(`
        SELECT ${USER_SELECT_COLUMNS}
        FROM Users U
        LEFT JOIN Cashes C ON U.CashID = C.ID
        WHERE U.Active = 1
          AND U.User_Name = @user_name
          AND BINARY_CHECKSUM(
                CAST(DecryptByPassPhrase(@passphrase, U.User_Pass) AS NVARCHAR(100))
              ) = BINARY_CHECKSUM(@user_pass)
      `)

    if (result.recordset.length) return buildEmployee(result.recordset[0])
  }

  return null
}

/** Fetch a single employee by ERP `Users.ID`. */
export async function getErpUserById(id: string | number): Promise<ErpEmployee | null> {
  const numericId = typeof id === "number" ? id : parseInt(String(id), 10)
  if (Number.isNaN(numericId)) return null

  const pool = await getMssqlPool()
  const result = await pool
    .request()
    .input("id", sql.Int, numericId)
    .query(`
      SELECT ${USER_SELECT_COLUMNS}
      FROM Users U
      LEFT JOIN Cashes C ON U.CashID = C.ID
      WHERE U.ID = @id
    `)

  if (!result.recordset.length) return null

  const mysqlPerms = await prisma.employeePermissions.findUnique({
    where: { employeeId: String(numericId) },
  }).catch(() => null)

  return buildEmployee(result.recordset[0], mysqlPerms)
}

/** List all employees (for the admin employee-management screen). */
export async function listErpUsers(): Promise<ErpEmployee[]> {
  const pool = await getMssqlPool()
  const result = await pool.request().query(`
    SELECT ${USER_SELECT_COLUMNS}
    FROM Users U
    LEFT JOIN Cashes C ON U.CashID = C.ID
    ORDER BY U.ID DESC
  `)

  const ids = result.recordset.map((r: any) => String(r.ID))
  const allPerms = await prisma.employeePermissions.findMany({
    where: { employeeId: { in: ids } },
  }).catch(() => [])
  const permsMap = Object.fromEntries(allPerms.map((p) => [p.employeeId, p]))

  return result.recordset.map((row: any) => buildEmployee(row, permsMap[String(row.ID)] ?? null))
}

export interface CreateErpUserInput {
  userName: string
  password: string
  cashId: number
  branchId: number
  repId: number
  email?: string
  address?: string
  tel?: string
  notes?: string
  active?: boolean
}

/**
 * Create (or upsert) an ERP user via `dbo.sp_users` (@Action = 0). The proc
 * encrypts the password with the passphrase and returns the new/affected ID.
 */
export async function createErpUser(input: CreateErpUserInput): Promise<number> {
  const pool = await getMssqlPool()
  const result = await pool
    .request()
    .input("Action", sql.Int, 0)
    .input("ENC_Ph", sql.NVarChar, "WebsiteEmployeeKey2026")
    .input("User_Name", sql.NVarChar, input.userName)
    .input("User_Pass", sql.NVarChar, input.password)
    .input("Emp_Address", sql.NVarChar, input.address ?? "")
    .input("Emp_Tel", sql.NVarChar, input.tel ?? "")
    .input("Emp_Notes", sql.NVarChar, input.notes ?? "")
    .input("CashID", sql.Int, input.cashId)
    .input("BranchID", sql.Int, input.branchId)
    .input("User_Email", sql.NVarChar, input.email ?? "")
    .input("Active", sql.Bit, input.active === false ? 0 : 1)
    .input("RepID", sql.Int, input.repId)
    .execute("dbo.sp_users")

  // sp_users returns the affected ID as a single-column recordset.
  const row = result.recordset?.[0]
  const id = row ? Number(Object.values(row)[0]) : NaN
  return Number.isNaN(id) ? -1 : id
}

/** Deactivate a Users row (soft-delete: Active = 0). */
export async function deleteErpUser(id: number): Promise<void> {
  const pool = await getMssqlPool()
  await pool
    .request()
    .input("ID", sql.Int, id)
    .query("DELETE FROM Users WHERE ID = @ID")
}

export interface UpdateErpUserInput {
  userName?: string
  password?: string
  cashId?: number
  branchId?: number
  repId?: number
  email?: string
  address?: string
  tel?: string
  notes?: string
  active?: boolean
}

/** Update a Users row. Only provided fields are changed. Password is re-encrypted if supplied. */
export async function updateErpUser(id: number, input: UpdateErpUserInput): Promise<void> {
  const pool = await getMssqlPool()
  const req = pool.request().input("ID", sql.Int, id)
  const sets: string[] = []

  if (input.userName !== undefined) { req.input("User_Name", sql.NVarChar, input.userName); sets.push("User_Name = @User_Name") }
  if (input.password !== undefined) {
    req.input("ENC_Ph", sql.NVarChar, getPassphrase())
    req.input("User_Pass", sql.NVarChar, input.password)
    sets.push("User_Pass = EncryptByPassPhrase(@ENC_Ph, @User_Pass)")
  }
  if (input.cashId !== undefined) { req.input("CashID", sql.Int, input.cashId); sets.push("CashID = @CashID") }
  if (input.branchId !== undefined) { req.input("BranchID", sql.Int, input.branchId); sets.push("BranchID = @BranchID") }
  if (input.repId !== undefined) { req.input("RepID", sql.Int, input.repId); sets.push("RepID = @RepID") }
  if (input.email !== undefined) { req.input("User_Email", sql.NVarChar, input.email); sets.push("User_Email = @User_Email") }
  if (input.address !== undefined) { req.input("Emp_Address", sql.NVarChar, input.address); sets.push("Emp_Address = @Emp_Address") }
  if (input.tel !== undefined) { req.input("Emp_Tel", sql.NVarChar, input.tel); sets.push("Emp_Tel = @Emp_Tel") }
  if (input.notes !== undefined) { req.input("Emp_Notes", sql.NVarChar, input.notes); sets.push("Emp_Notes = @Emp_Notes") }
  if (input.active !== undefined) { req.input("Active", sql.Bit, input.active ? 1 : 0); sets.push("Active = @Active") }

  if (sets.length === 0) return
  await req.query(`UPDATE Users SET ${sets.join(", ")} WHERE ID = @ID`)
}

// ── ERP lookups for the employee form (read-only) ───────────────────────────
export interface ErpLookupOption {
  id: number
  name: string
}
export interface ErpLookups {
  cashes: ErpLookupOption[]
  reps: ErpLookupOption[]
  branches: ErpLookupOption[]
}

/**
 * Read-only lookups powering the employee form dropdowns:
 *  - cashes:   Cashes (ID, CashName)
 *  - reps:     Emps where IsRep = 1 (ID, Emp_name)
 *  - branches: distinct Stores.Branch_ID with a representative store name —
 *              this is what Users/Booking.BranchID actually reference (NOT the
 *              Branches table). One row per Branch_ID.
 * No writes or DDL — pure SELECTs.
 */
export async function getErpLookups(): Promise<ErpLookups> {
  const pool = await getMssqlPool()

  const [cashRes, repRes, branchRes] = await Promise.all([
    pool.request().query(`SELECT ID, CashName FROM Cashes ORDER BY ID`),
    pool.request().query(
      `SELECT ID, Emp_name FROM Emps WHERE IsRep = 1 AND (Emp_IsDisabled = 0 OR Emp_IsDisabled IS NULL) ORDER BY Emp_name`
    ),
    // One option per Branch_ID; MIN(Store_name) gives a stable representative name.
    pool.request().query(`
      SELECT Branch_ID AS ID, MIN(Store_name) AS name
      FROM Stores
      WHERE Branch_ID IS NOT NULL
      GROUP BY Branch_ID
      ORDER BY Branch_ID
    `),
  ])

  return {
    cashes: cashRes.recordset.map((r: any) => ({ id: r.ID, name: r.CashName || `Cash ${r.ID}` })),
    reps: repRes.recordset.map((r: any) => ({ id: r.ID, name: r.Emp_name || `Rep ${r.ID}` })),
    branches: branchRes.recordset.map((r: any) => ({ id: r.ID, name: r.name || `Branch ${r.ID}` })),
  }
}

/** Save per-employee permissions to MySQL (upsert). Admins are skipped — they always have all permissions. */
export async function saveEmployeePermissions(
  employeeId: string,
  perms: Partial<ErpEmployeePermissions>
): Promise<void> {
  await prisma.employeePermissions.upsert({
    where: { employeeId },
    create: { employeeId, ...perms } as any,
    update: perms as any,
  })
}
