import type { OAuthIdentity } from "@/auth/oauth-session";

let mockUser: OAuthIdentity | null = null;
let loaded = true;

export const reloadAuth = vi.fn(async () => mockUser);
export const signOut = vi.fn(async () => {
  mockUser = null;
});

export function setMockOAuthUser(user: OAuthIdentity | null): void {
  mockUser = user;
}

export function setAuthLoaded(value: boolean): void {
  loaded = value;
}

export function oauthUserWithMemos(): OAuthIdentity {
  return {
    id: "user_123",
    displayName: "Steven Li",
    imageUrl: "https://img.example.com/a.png",
  };
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => children;

export function useAuth() {
  return {
    isLoaded: loaded,
    isSignedIn: mockUser !== null,
    user: mockUser,
    error: null,
    reload: reloadAuth,
    signOut,
  };
}
