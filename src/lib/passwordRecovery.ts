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

const addParams = (sets: URLSearchParams[], raw: string) => {
  const value = raw.trim().replace(/^[?#]/, "");
  if (!value) return;
  sets.push(new URLSearchParams(value));
};

export const getPasswordRecoveryParams = (href = window.location.href): PasswordRecoveryParams => {
  const url = new URL(href, window.location.origin);
  const params: URLSearchParams[] = [url.searchParams];
  const rawHash = url.hash.replace(/^#/, "");
  let hashPath = "";

  addParams(params, rawHash);

  if (rawHash.startsWith("/")) {
    const hashUrl = new URL(rawHash, window.location.origin);
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
      Boolean(tokenHash) ||
      Boolean(accessToken && refreshToken) ||
      Boolean(errorDesc || errorCode) ||
      Boolean(code && isResetPath),
  };
};

export const normalizePasswordRecoveryUrl = () => {
  const params = getPasswordRecoveryParams();
  if (!params.hasRecoveryIntent || window.location.pathname === "/reset-password") return params;
  const { search, hash } = window.location;
  window.history.replaceState({}, "", `/reset-password${search}${hash}`);
  return getPasswordRecoveryParams();
};