export const MANAGER_PASSWORD =
  process.env.MANAGER_REPLY_PASSWORD?.trim() || "JV";

export function isValidManagerPassword(password: unknown): boolean {
  return typeof password === "string" && password.trim() === MANAGER_PASSWORD;
}
