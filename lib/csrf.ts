const normalizeHostHeader = (value: string) =>
  value.split(",")[0]?.trim().toLowerCase() ?? "";

export const hasValidOrigin = (request: Request): boolean => {
  const origin = request.headers.get("origin");
  const hostHeader = request.headers.get("x-forwarded-host") ?? request.headers.get("host");

  if (!origin || !hostHeader) {
    return false;
  }

  const requestHost = normalizeHostHeader(hostHeader);
  if (!requestHost) {
    return false;
  }

  try {
    const originUrl = new URL(origin);
    const originHost = originUrl.host.toLowerCase();
    if (originHost === requestHost) {
      return true;
    }

    const defaultPort =
      originUrl.protocol === "https:" ? "443" : originUrl.protocol === "http:" ? "80" : "";
    return (
      defaultPort.length > 0 &&
      requestHost === `${originUrl.hostname.toLowerCase()}:${defaultPort}`
    );
  } catch {
    return false;
  }
};
