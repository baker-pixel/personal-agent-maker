export type PasswordRecoveryParams = {
  code: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  tokenHash: string | null;
  errorDesc: string | null;
  errorCode: string | null;
  isResetPath: boolean;
  hasRecoveryIntent: boolean;
};

export const PASSWORD_RESET_REDIRECT_URL =
  typeof window !== "undefined"
    ? `${window.location.origin}/reset-password`
    : "https://normyagent.com/reset-password";

const addParams = (sets: URLSearchParams[], raw: string) => {
  const value = raw.trim().replace(/^[?#]/, "");
  if (!value) return;
  sets.push(new URLSearchParams(value));
};

export const getPasswordRecoveryParams = (href = typeof window !== "undefined" ? window.location.href : "https://localhost/"): PasswordRecoveryParams => {
  const baseOrigin = typeof window !== "undefined" ? window.location.origin : "https://localhost";
  const url = new URL(href, baseOrigin);
  const params: URLSearchParams[] = [url.searchParams];
  const rawHash = url.hash.replace(/^#/, "");
  let hashPath = "";

  addParams(params, rawHash);

  if (rawHash.startsWith("/")) {
    const hashUrl = new URL(rawHash, baseOrigin);
    hashPath = hashUrl.pathname;
    params.push(hashUrl.searchParams);
    addParams(params, hashUrl.hash);
  } else if (rawHash.includes("?")) {
    addParams(params, rawHash.slice(rawHash.indexOf("?") + 1));
  }

  const read = (key: string) => {
    for (const set of params) {
      const value = set.get(key);
      if (value) return value;
    }
    return null;
  };

  const code = read("code");
  const accessToken = read("access_token");
  const refreshToken = read("refresh_token");
  const tokenHash = read("token_hash");
  const errorDesc = read("error_description");
  const errorCode = read("error_code") || read("error");
  const type = read("type");
  const isResetPath = url.pathname === "/reset-password" || hashPath === "/reset-password";

  return {
    code,
    accessToken,
    refreshToken,
    tokenHash,
    errorDesc,
    errorCode,
    isResetPath,
    hasRecoveryIntent:
      isResetPath ||
      type === "recovery" ||
      (Boolean(tokenHash) && type !== "signup") ||
      (Boolean(accessToken && refreshToken) && type !== "signup") ||
      // Only treat error params as recovery intent when already on the reset path —
      // OAuth callbacks (/auth/google/callback) also return error params on failure.
      (Boolean(errorDesc || errorCode) && isResetPath) ||
      Boolean(code && isResetPath),
  };
};

const STORAGE_KEY = "normy.passwordRecovery";
const STORAGE_TTL_MS = 30 * 60 * 1000; // 30 minutes — matches Supabase recovery link lifetime

type StoredRecovery = {
  savedAt: number;
  code: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  tokenHash: string | null;
  errorDesc: string | null;
  errorCode: string | null;
};

const hasRecoverableState = (params: PasswordRecoveryParams) =>
  Boolean(params.code || params.tokenHash || (params.accessToken && params.refreshToken) || params.errorDesc || params.errorCode);

const safeStorage = (): Storage | null => {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
};

export const savePasswordRecoveryParams = (params: PasswordRecoveryParams) => {
  const storage = safeStorage();
  if (!storage) return;
  if (!hasRecoverableState(params)) return;
  const payload: StoredRecovery = {
    savedAt: Date.now(),
    code: params.code,
    accessToken: params.accessToken,
    refreshToken: params.refreshToken,
    tokenHash: params.tokenHash,
    errorDesc: params.errorDesc,
    errorCode: params.errorCode,
  };
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota errors */
  }
};

export const loadStoredPasswordRecoveryParams = (): Partial<PasswordRecoveryParams> | null => {
  const storage = safeStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredRecovery;
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > STORAGE_TTL_MS) {
      storage.removeItem(STORAGE_KEY);
      return null;
    }
    return {
      code: parsed.code ?? null,
      accessToken: parsed.accessToken ?? null,
      refreshToken: parsed.refreshToken ?? null,
      tokenHash: parsed.tokenHash ?? null,
      errorDesc: parsed.errorDesc ?? null,
      errorCode: parsed.errorCode ?? null,
    };
  } catch {
    storage.removeItem(STORAGE_KEY);
    return null;
  }
};

export const clearStoredPasswordRecoveryParams = () => {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
};

export const hasStoredPasswordRecovery = () => loadStoredPasswordRecoveryParams() !== null;

export const preparePasswordRecoveryUrlForManualHandling = () => {
  if (typeof window === "undefined") return null;
  // OAuth callbacks (/auth/google/callback) also carry ?code= and ?error= params —
  // never treat those as password-recovery signals.
  if (window.location.pathname.startsWith("/auth/google/callback")) return null;
  const params = getPasswordRecoveryParams();
  if (!params.hasRecoveryIntent) return params;
  savePasswordRecoveryParams(params);
  window.history.replaceState({}, "", "/reset-password");
  return getPasswordRecoveryParams();
};

export const normalizePasswordRecoveryUrl = () => {
  const params = getPasswordRecoveryParams();
  if (params.hasRecoveryIntent) savePasswordRecoveryParams(params);
  if (!params.hasRecoveryIntent || window.location.pathname === "/reset-password") return params;
  const { search, hash } = window.location;
  window.history.replaceState({}, "", `/reset-password${search}${hash}`);
  return getPasswordRecoveryParams();
};