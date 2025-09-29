import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

export const hashValue = async (value: string) => bcrypt.hash(value, SALT_ROUNDS);

export const verifyHash = async (value: string, hash: string) => bcrypt.compare(value, hash);

export const hashPassword = hashValue;

export const verifyPassword = verifyHash;
