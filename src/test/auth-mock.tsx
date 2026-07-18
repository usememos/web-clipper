import type { OAuthUser } from "@/auth/oauth-session";

let mockUser: OAuthUser | null = null;
let loaded = true;

export const reloadAuth = vi.fn(async () => mockUser);
export const signOut = vi.fn(async () => {
  mockUser = null;
});

export function setMockOAuthUser(user: OAuthUser | null): void {
  mockUser = user;
}

export function setAuthLoaded(value: boolean): void {
  loaded = value;
}

export function oauthUserWithMemos(instanceUrl = "https://memos.example.com", accessToken = "tok123"): OAuthUser {
  return {
    id: "user_123",
    displayName: "Steven Li",
    imageUrl: "https://img.example.com/a.png",
    unsafeMetadata: { memos: { instanceUrl, accessToken } },
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
