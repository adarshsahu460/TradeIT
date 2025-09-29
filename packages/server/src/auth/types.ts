export interface AuthenticatedUser {
  id: string;
  email: string;
}

declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    interface Request {
      user?: AuthenticatedUser;
      refreshToken?: string;
    }
  }
}
