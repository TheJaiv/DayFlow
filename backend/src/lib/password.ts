import bcrypt from "bcryptjs";

// bcryptjs (pure JS) rather than bcrypt (native) so that `npm install` never
// needs a compiler toolchain -- matters on Apple Silicon and on slim CI images.
const COST = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// Burn roughly the same time as a real comparison when the account does not
// exist, so response timing does not reveal which emails are registered.
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", COST);

export async function fakeVerify(): Promise<void> {
  await bcrypt.compare("dummy-password-for-timing", DUMMY_HASH);
}
