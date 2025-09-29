import { encode, decode } from "@msgpack/msgpack";

export const encodeMessage = <T>(message: T) => {
  const buffer = encode(message);
  return Buffer.from(buffer);
};

export const decodeMessage = <T>(payload: Buffer): T => {
  return decode(payload) as T;
};
