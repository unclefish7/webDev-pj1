const backend = await fetch(`http://127.0.0.1:${process.env.API_PORT || 3000}/api/health`);
const frontend = await fetch(`http://127.0.0.1:${process.env.FRONTEND_PORT || 5173}/`);
if (!backend.ok || !frontend.ok) process.exit(1);

