import {
  computeMigrationChecksum,
  type MigrationDb,
  type VersionedMigration,
} from "./runner";

export const STAFF_RATING_COLUMN_DDL =
  "ALTER TABLE staff ADD COLUMN rating TINYINT NULL AFTER phone";

export interface StaffRatingColumnRow {
  columnName: string;
  columnType: string;
  isNullable: string;
  columnDefault: string | null;
}

const STAFF_RATING_CHECKSUM_SOURCE = [
  "0004",
  "add_staff_rating",
  STAFF_RATING_COLUMN_DDL,
].join("\n");

export function getStaffRatingVerificationErrors(rows: StaffRatingColumnRow[]) {
  const rating = rows.find((row) => row.columnName === "rating");
  const errors: string[] = [];

  if (!rating) {
    return ["Missing staff.rating column"];
  }
  if (!/^tinyint(?:\(\d+\))?$/.test(rating.columnType.toLowerCase())) {
    errors.push(`staff.rating must be TINYINT, got ${rating.columnType}`);
  }
  if (rating.isNullable !== "YES") {
    errors.push(`staff.rating must be nullable, got ${rating.isNullable}`);
  }
  if (rating.columnDefault !== null && String(rating.columnDefault).toLowerCase() !== "null") {
    errors.push(`staff.rating must default to NULL, got ${rating.columnDefault}`);
  }

  return errors;
}

export function verifyStaffRatingRows(rows: StaffRatingColumnRow[]) {
  const errors = getStaffRatingVerificationErrors(rows);
  if (errors.length > 0) {
    throw new Error(`staff rating migration verification failed: ${errors.join("; ")}`);
  }
}

async function getStaffRatingColumnRows(db: MigrationDb): Promise<StaffRatingColumnRow[]> {
  const [rows] = await db.query(
    `SELECT column_name AS columnName,
            column_type AS columnType,
            is_nullable AS isNullable,
            column_default AS columnDefault
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'staff'
       AND column_name = 'rating'`
  );

  return Array.isArray(rows) ? rows as StaffRatingColumnRow[] : [];
}

export async function verifyStaffRatingColumn(db: MigrationDb) {
  verifyStaffRatingRows(await getStaffRatingColumnRows(db));
}

export const addStaffRatingMigration: VersionedMigration = {
  version: "0004",
  name: "add_staff_rating",
  checksum: computeMigrationChecksum(STAFF_RATING_CHECKSUM_SOURCE),
  up: async (db) => {
    const rows = await getStaffRatingColumnRows(db);
    if (!rows.some((row) => row.columnName === "rating")) {
      await db.query(STAFF_RATING_COLUMN_DDL);
    }
  },
  verify: verifyStaffRatingColumn,
};
