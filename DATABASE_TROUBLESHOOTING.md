# Database Connection Troubleshooting Guide

## Error: "Can't reach database server at aws-1-ap-southeast-1.pooler.supabase.com:6543"

This error occurs when the application cannot connect to the Supabase database. Here are the solutions:

## Quick Fixes

### 1. Test Database Connection
Run the diagnostic script to identify the issue:
```bash
npm run test:db
```

### 2. Check Supabase Project Status
- Go to your Supabase dashboard: https://supabase.com/dashboard
- Ensure your project is **not paused** (free tier projects pause after inactivity)
- If paused, click "Resume" to restart the database

### 3. Verify Environment Variables
Check that your `.env` and `.env.local` files have correct connection strings:

```env
# Pooled connection (for production/Vercel)
DATABASE_URL="postgresql://postgres.xxx:password@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true"

# Direct connection (for migrations and local dev)
DIRECT_URL="postgresql://postgres.xxx:password@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres"
```

### 4. Update Connection Strings
If your Supabase project was recreated or credentials changed:

1. Go to Supabase Dashboard → Project Settings → Database
2. Copy the new connection strings:
   - **Connection Pooling** (port 6543) → `DATABASE_URL`
   - **Direct Connection** (port 5432) → `DIRECT_URL`
3. Update both `.env` and `.env.local` files
4. Restart your development server

### 5. Check Network/Firewall
- Ensure your network allows outbound connections to Supabase
- Check if corporate firewall blocks port 6543 or 5432
- Try using a different network (mobile hotspot) to test

## Solutions Implemented

### Automatic Retry Logic
The app now includes:
- **Connection retry** with exponential backoff (3 attempts)
- **Graceful degradation** - app continues even if database is temporarily unavailable
- **Health check endpoint** - `/api/health` to monitor database status

### Resilient Session Storage
- Custom session storage that handles connection failures
- Returns `undefined` instead of crashing when session can't be loaded
- Automatically retries failed operations

### Database Initialization
- Database connection is tested on server startup
- Non-blocking initialization - app starts even if DB is slow
- Detailed logging for debugging

## Monitoring

### Health Check Endpoint
Check database status:
```bash
curl https://your-app.vercel.app/api/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2026-01-24T...",
  "database": {
    "connected": true
  },
  "environment": {
    "nodeEnv": "production",
    "isVercel": true
  }
}
```

## Common Issues

### Issue: "Prisma session table does not exist"
**Solution:** Run migrations
```bash
npm run setup
```

### Issue: Connection works locally but fails on Vercel
**Solution:** 
1. Check Vercel environment variables
2. Ensure `DATABASE_URL` is set in Vercel project settings
3. Use pooled connection (port 6543) for Vercel

### Issue: "Connection timeout"
**Solution:**
1. Check Supabase project is not paused
2. Verify network connectivity
3. Try direct connection instead of pooled

## Production Deployment

### Vercel Environment Variables
Set these in Vercel Dashboard → Project Settings → Environment Variables:

```
DATABASE_URL=postgresql://postgres.xxx:password@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.xxx:password@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres
```

### Connection Pooling
- **Production/Vercel**: Use pooled connection (port 6543)
- **Local Development**: Use direct connection (port 5432) for better performance
- **Migrations**: Always use direct connection

## Advanced Debugging

### Enable Prisma Logging
In `app/db.server.ts`, change log level:
```typescript
log: ["query", "error", "warn", "info"]
```

### Check Prisma Connection
```bash
npx prisma db pull
```

### Test Raw Connection
```bash
psql "postgresql://postgres.xxx:password@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres"
```

## Support

If issues persist:
1. Check Supabase status: https://status.supabase.com/
2. Review Supabase logs in dashboard
3. Contact Supabase support if database is unreachable
4. Check Vercel logs for deployment issues

## Files Modified

- `app/db.server.ts` - Added retry logic and health checks
- `app/shopify.server.ts` - Resilient session storage
- `app/entry.server.tsx` - Database initialization on startup
- `app/routes/api.health.ts` - Health check endpoint
- `scripts/test-db-connection.js` - Connection diagnostic tool
