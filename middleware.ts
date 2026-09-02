export const config = {
  matcher: '/(.*)',
};

export default function middleware(request: Request) {
  const method = request.method;

  if (method === 'TRACE' || method === 'TRACK') {
    return new Response(null, { status: 405 });
  }

  if (method === 'OPTIONS') {
    const origin = request.headers.get('origin');
    const acrh = request.headers.get('access-control-request-headers');
    if (!origin && !acrh) {
      return new Response(null, { status: 405 });
    }
  }
}
