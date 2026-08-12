// Boards: the public wall plus any number of private ones.
//
// A private board is an unguessable slug and a shared passphrase. The slug
// alone is not enough, so a link forwarded out of the group chat it was meant
// for does not get anybody in.
//
// Cookies are deliberately not in here (see access.ts). This module only ever
// takes a token as a string, which keeps it runnable under node --test with no
// Next.js request context.

// .ts extensions on purpose, same as manage.ts: node --test strips types but
// does not resolve extensionless specifiers.
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { sql } from "./db.ts";

export type Board = {
  id: number;
  slug: string;
  pass_salt: string | null;
  pass_hash: string | null;
  access_token: string;
};

/** The public wall. Every board that is not private is this one. */
export const PUBLIC_SLUG = "";

/**
 * Slugs get read aloud and typed off someone's screen, so the alphabet leaves
 * out the characters that are arguments: 0/o and 1/l. Exactly 32 characters
 * left, which divides 256, so a byte maps to one with no modulo bias.
 */
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
const SLUG_LEN = 10;

export function newSlug(): string {
  const bytes = randomBytes(SLUG_LEN);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

/** Shape check before a slug is ever used in a query or a cookie name. */
export function validSlug(slug: unknown): slug is string {
  if (typeof slug !== "string" || slug.length !== SLUG_LEN) return false;
  for (const ch of slug) if (!ALPHABET.includes(ch)) return false;
  return true;
}

function scrypt(word: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(word, salt, 64, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

// ponytail: scrypt out of node:crypto rather than bcrypt or argon2. One less
// dependency, and the thing it defends is a word shared with eight friends,
// not a password database. The unlock rate limit is doing at least as much
// work as the KDF is.
export async function hashPassphrase(word: string): Promise<{ salt: string; hash: string }> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(word, salt)).toString("hex");
  return { salt, hash };
}

export async function verifyPassphrase(board: Board, word: string): Promise<boolean> {
  if (!board.pass_salt || !board.pass_hash) return false;
  const got = await scrypt(word, board.pass_salt);
  const want = Buffer.from(board.pass_hash, "hex");
  // Lengths are ours, not the attacker's, but timingSafeEqual throws on a
  // mismatch, so guard it rather than let a corrupt row 500.
  return got.length === want.length && timingSafeEqual(got, want);
}

/** A board with no passphrase is open: the public wall, and nothing else so far. */
export function isOpen(board: Board): boolean {
  return !board.pass_hash;
}

export async function boardBySlug(slug: string): Promise<Board | null> {
  const rows = (await sql`
    SELECT id, slug, pass_salt, pass_hash, access_token::text AS access_token
    FROM boards WHERE slug = ${slug}
  `) as Board[];
  return rows[0] ?? null;
}

/**
 * Does this token open this board? Compared in the WHERE clause and as text,
 * so an arbitrary string off a cookie is a mismatch rather than a cast error,
 * the same way the per-row ownership secrets work.
 */
export function tokenOpens(board: Board, token: string | undefined): boolean {
  if (isOpen(board)) return true;
  if (!token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(board.access_token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function createBoard(passphrase: string): Promise<Board> {
  const { salt, hash } = await hashPassphrase(passphrase);
  const [row] = (await sql`
    INSERT INTO boards (slug, pass_salt, pass_hash)
    VALUES (${newSlug()}, ${salt}, ${hash})
    RETURNING id, slug, pass_salt, pass_hash, access_token::text AS access_token
  `) as Board[];
  return row;
}

/** Everyone holding a cookie for this board is logged out by the next request. */
export async function rotateToken(slug: string): Promise<boolean> {
  const rows = await sql`
    UPDATE boards SET access_token = gen_random_uuid()
    WHERE slug = ${slug} AND slug <> ${PUBLIC_SLUG}
    RETURNING id
  `;
  return rows.length === 1;
}

/** Replacing the word also rotates the token: the old word stops working now. */
export async function setPassphrase(slug: string, passphrase: string): Promise<boolean> {
  const { salt, hash } = await hashPassphrase(passphrase);
  const rows = await sql`
    UPDATE boards SET pass_salt = ${salt}, pass_hash = ${hash}, access_token = gen_random_uuid()
    WHERE slug = ${slug} AND slug <> ${PUBLIC_SLUG}
    RETURNING id
  `;
  return rows.length === 1;
}

export async function listBoards(): Promise<{ slug: string; created_at: string; notes: number }[]> {
  return (await sql`
    SELECT b.slug, b.created_at, count(n.id) FILTER (WHERE n.status = 'approved')::int AS notes
    FROM boards b LEFT JOIN nodes n ON n.board_id = b.id
    GROUP BY b.id ORDER BY b.id
  `) as { slug: string; created_at: string; notes: number }[];
}
